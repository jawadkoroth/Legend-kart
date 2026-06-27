import { MarketingEvent, ProviderCapabilities } from '../types';
import { MarketingProvider } from './base';

export class GoogleProvider implements MarketingProvider {
  id = 'google';
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
      throw new Error(`Invalid Google configuration: ${check.errors?.join(', ')}`);
    }
    this.config = config;
    console.log('[Marketing-Google] Initialized Google Provider with measurementId:', config.measurementId);
    this.initialized = true;
  }

  async track(event: MarketingEvent): Promise<void> {
    if (!this.initialized) return;
    
    const googleEvent = this.mapToGoogleEvent(event.eventName);
    console.log(`[Marketing-Google] GA4 Measurement Protocol: Emitted event "${googleEvent}" from PANTHER event "${event.eventName}"`, {
      eventId: event.eventId,
      correlationId: event.correlationId,
      measurementId: this.config.measurementId,
      properties: event.properties,
      items: event.properties.items || undefined,
    });
  }

  async identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void> {
    if (!this.initialized) return;
    console.log('[Marketing-Google] Set User Properties & User ID:', { userId, anonymousId, ...traits });
  }

  async page(url: string, path: string, title: string, referrer: string): Promise<void> {
    if (!this.initialized) return;
    console.log('[Marketing-Google] Page view tracked on sGTM:', { url, path, title });
  }

  async shutdown(): Promise<void> {
    console.log('[Marketing-Google] Shutdown');
    this.initialized = false;
  }

  async testConnection(config: Record<string, any>): Promise<boolean> {
    const { valid } = this.validateConfig(config);
    if (!valid) return false;
    
    // Simulate test API ping to Measurement Protocol Validation Server
    await new Promise((resolve) => setTimeout(resolve, 800));
    return config.measurementId !== 'G-000000'; // Fail for specific dummy value
  }

  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.measurementId) {
      errors.push('Measurement ID is required.');
    } else if (!/^G-[A-Z0-9]+$/i.test(config.measurementId)) {
      errors.push('Measurement ID must be in format "G-XXXXXX".');
    }
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private mapToGoogleEvent(name: string): string {
    const mapping: Record<string, string> = {
      page_viewed: 'page_view',
      product_viewed: 'view_item',
      collection_viewed: 'view_item_list',
      search_submitted: 'search',
      product_added_to_cart: 'add_to_cart',
      product_removed_from_cart: 'remove_from_cart',
      wishlist_added: 'add_to_wishlist',
      checkout_started: 'begin_checkout',
      payment_started: 'add_payment_info',
      payment_success: 'purchase',
      order_paid: 'purchase',
      login: 'login',
      registration_completed: 'sign_up',
    };
    return mapping[name] || name;
  }
}
export default GoogleProvider;
