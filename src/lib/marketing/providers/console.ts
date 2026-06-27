import { MarketingEvent, ProviderCapabilities } from '../types';
import { MarketingProvider } from './base';

export class ConsoleProvider implements MarketingProvider {
  id = 'console';
  version = '1.0.0';
  private initialized = false;

  capabilities: ProviderCapabilities = {
    supportsPageViews: true,
    supportsPurchases: true,
    supportsBatchDispatch: false,
    supportsRealtime: true,
    supportsIdentify: true,
    supportsOfflineQueue: false,
    supportsTestConnection: true,
    supportsReplay: true,
    supportsConsent: false,
  };

  async initialize(config: Record<string, any>): Promise<void> {
    console.log('[Marketing-Console] Initialized with config:', config);
    this.initialized = true;
  }

  async track(event: MarketingEvent): Promise<void> {
    console.log(`[Marketing-Console] Track: ${event.eventName}`, {
      eventId: event.eventId,
      userId: event.userId,
      anonymousId: event.anonymousId,
      correlationId: event.correlationId,
      properties: event.properties,
      context: {
        page: event.context.page.path,
        device: event.context.device.type,
      },
    });
  }

  async identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void> {
    console.log('[Marketing-Console] Identify:', { userId, anonymousId, traits });
  }

  async page(url: string, path: string, title: string, referrer: string): Promise<void> {
    console.log('[Marketing-Console] Page View:', { url, path, title, referrer });
  }

  async shutdown(): Promise<void> {
    console.log('[Marketing-Console] Shutdown');
    this.initialized = false;
  }

  async testConnection(config: Record<string, any>): Promise<boolean> {
    return true;
  }

  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] } {
    return { valid: true };
  }
}
export default ConsoleProvider;
