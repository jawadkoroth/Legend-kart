import { MarketingEvent } from './types';
import { MarketingProvider } from './providers/base';
import { ConsoleProvider } from './providers/console';
import { MetaProvider } from './providers/meta';
import { GoogleProvider } from './providers/google';
import { validateMarketingEvent } from './validation';

export class EventDispatcher {
  private static instance: EventDispatcher;
  private queue: MarketingEvent[] = [];
  private providers: Map<string, MarketingProvider> = new Map();
  private activeProviders: Set<string> = new Set();
  private processing = false;
  private maxRetries = 3;
  private retryDelay = 500; // 500ms base retry delay
  
  public metrics = {
    totalQueued: 0,
    totalDispatched: 0,
    totalFailed: 0,
    totalInvalid: 0,
    lastDispatchTime: null as string | null,
    queueLength: 0,
  };

  private constructor() {
    // Register default providers
    this.registerProvider(new ConsoleProvider());
    this.registerProvider(new MetaProvider());
    this.registerProvider(new GoogleProvider());
  }

  public static getInstance(): EventDispatcher {
    if (!EventDispatcher.instance) {
      EventDispatcher.instance = new EventDispatcher();
    }
    return EventDispatcher.instance;
  }

  public registerProvider(provider: MarketingProvider) {
    this.providers.set(provider.id, provider);
  }

  public async initializeProviders(enabledProviders: { id: string; config: any }[]) {
    for (const { id, config } of enabledProviders) {
      const provider = this.providers.get(id);
      if (provider) {
        try {
          await provider.initialize(config);
          this.activeProviders.add(id);
          console.log(`[EventDispatcher] Provider ${id} initialized successfully.`);
        } catch (err) {
          console.error(`[EventDispatcher] Failed to initialize provider ${id}:`, err);
        }
      }
    }
  }

  public disableProvider(id: string) {
    const provider = this.providers.get(id);
    if (provider) {
      void provider.shutdown().catch(() => {});
    }
    this.activeProviders.delete(id);
  }

  public getActiveProviders(): string[] {
    return Array.from(this.activeProviders);
  }

  public enqueue(event: MarketingEvent) {
    // 1. Run validation engine
    const valResult = validateMarketingEvent(event);
    if (!valResult.valid) {
      this.metrics.totalInvalid++;
      event.inDlq = true;
      event.validationErrors = valResult.errors;

      console.error(`[EventDispatcher] Event "${event.eventName}" failed validation. Quarantined in DLQ:`, valResult.errors);
      
      // Persist failed/DLQ event to server (fire-and-forget)
      void this.postToServer(event);
      return;
    }

    // 2. Add to dispatch queue
    this.queue.push(event);
    this.metrics.totalQueued++;
    this.metrics.queueLength = this.queue.length;
    
    // Start processing queue asynchronously
    if (!this.processing) {
      void this.processQueue();
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, 5);
        this.metrics.queueLength = this.queue.length;
        
        await this.dispatchBatch(batch);
      }
    } finally {
      this.processing = false;
    }
  }

  private async dispatchBatch(events: MarketingEvent[]) {
    const promises = events.map(async (event) => {
      // 1. Post to Server API (persists and runs server-side checks)
      const serverPostPromise = this.postToServer(event);

      // 2. Dispatch to client active providers
      const providerPromises = Array.from(this.activeProviders).map(async (providerId) => {
        const provider = this.providers.get(providerId);
        if (!provider) return;

        // Consent check
        const consent = event.context.consent;
        if (providerId === 'meta' || providerId === 'google') {
          if (!consent.marketing && !consent.analytics) {
            console.log(`[EventDispatcher] Event ${event.eventName} skipped for ${providerId} (missing consent)`);
            return;
          }
        }

        // Capabilities check
        const caps = provider.capabilities;
        if (event.eventName === 'page_viewed' && !caps.supportsPageViews) {
          console.log(`[EventDispatcher] Skipped page view for ${providerId} (no capability)`);
          return;
        }
        if (
          (event.eventName === 'payment_success' || event.eventName === 'order_paid') &&
          !caps.supportsPurchases
        ) {
          console.log(`[EventDispatcher] Skipped purchase for ${providerId} (no capability)`);
          return;
        }

        let retries = 0;
        while (retries < this.maxRetries) {
          try {
            if (event.eventName === 'page_viewed') {
              const { url, path, title, referrer } = event.context.page;
              await provider.page(url, path, title, referrer);
            }
            await provider.track(event);
            this.metrics.totalDispatched++;
            return; // Success
          } catch (err) {
            retries++;
            console.warn(`[EventDispatcher] Retry ${retries}/${this.maxRetries} for provider ${providerId} failed:`, err);
            if (retries >= this.maxRetries) {
              this.metrics.totalFailed++;
              // Mark event in DLQ on server side or logs
            } else {
              await new Promise((resolve) => setTimeout(resolve, this.retryDelay * Math.pow(2, retries)));
            }
          }
        }
      });

      await Promise.all([...providerPromises, serverPostPromise]);
    });

    await Promise.all(promises);
    this.metrics.lastDispatchTime = new Date().toISOString();
  }

  private async postToServer(event: MarketingEvent) {
    try {
      const res = await fetch('/api/marketing/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      });
      if (!res.ok) {
        console.warn('[EventDispatcher] Failed to sync event to server:', res.statusText);
      }
    } catch (err) {
      console.error('[EventDispatcher] Error syncing event to server:', err);
    }
  }
}
export default EventDispatcher;
