import { MarketingEvent, ProviderCapabilities } from '../types';
import { MarketingProvider } from './base';

export class MetaProvider implements MarketingProvider {
  id = 'meta';
  version = '1.0.0';
  private initialized = false;
  private config: Record<string, any> = {};

  capabilities: ProviderCapabilities = {
    supportsPageViews: true,
    supportsPurchases: true,
    supportsBatchDispatch: true,
    supportsRealtime: true,
    supportsIdentify: true,
    supportsOfflineQueue: true,
    supportsTestConnection: true,
    supportsReplay: true,
    supportsConsent: true,
  };

  async initialize(config: Record<string, any>): Promise<void> {
    const check = this.validateConfig(config);
    if (!check.valid) {
      throw new Error(`Invalid Meta configuration: ${check.errors?.join(', ')}`);
    }
    this.config = config;
    console.log('[Marketing-Meta] Initialized Meta Provider with pixelId:', config.pixelId);
    this.initialized = true;
  }

  async track(event: MarketingEvent): Promise<void> {
    if (!this.initialized) return;
    
    const metaEvent = this.mapToMetaEvent(event.eventName);
    console.log(`[Marketing-Meta] CAPI Track: Emitted standard Meta event "${metaEvent}" from PANTHER event "${event.eventName}"`, {
      eventId: event.eventId,
      correlationId: event.correlationId,
      pixelId: this.config.pixelId,
      properties: event.properties,
      customData: {
        value: event.properties.total || event.properties.value || undefined,
        currency: event.properties.currency || 'INR',
        content_name: event.properties.name || undefined,
        content_type: event.properties.category ? 'product' : undefined,
      }
    });
  }

  async identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void> {
    if (!this.initialized) return;
    console.log('[Marketing-Meta] Identify: Stashed user identifiers for Advanced Matching:', { userId, anonymousId, ...traits });
  }

  async page(url: string, path: string, title: string, referrer: string): Promise<void> {
    if (!this.initialized) return;
    console.log('[Marketing-Meta] Page view tracked on pixel:', { path, title });
  }

  async shutdown(): Promise<void> {
    console.log('[Marketing-Meta] Shutdown');
    this.initialized = false;
  }

  async testConnection(config: Record<string, any>): Promise<boolean> {
    const { valid } = this.validateConfig(config);
    if (!valid) return false;
    
    // Simulate test API ping to Graph API
    await new Promise((resolve) => setTimeout(resolve, 800));
    return config.pixelId !== '000000'; // Fail for specific dummy value
  }

  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.pixelId) {
      errors.push('Pixel ID is required.');
    } else if (!/^\d+$/.test(config.pixelId)) {
      errors.push('Pixel ID must be a numeric string.');
    }
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private mapToMetaEvent(name: string): string {
    const mapping: Record<string, string> = {
      page_viewed: 'PageView',
      product_viewed: 'ViewContent',
      search_submitted: 'Search',
      product_added_to_cart: 'AddToCart',
      wishlist_added: 'AddToWishlist',
      checkout_started: 'InitiateCheckout',
      payment_started: 'AddPaymentInfo',
      payment_success: 'Purchase',
      order_paid: 'Purchase',
      registration_completed: 'CompleteRegistration',
    };
    return mapping[name] || name;
  }
}
export default MetaProvider;
