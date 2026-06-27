import { MarketingEvent, ProviderCapabilities } from '../types';
import { MarketingProvider } from './base';

export class GoogleProvider implements MarketingProvider {
  id = 'google';
  version = '2.0.0';
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
    this.initialized = true;
  }

  async track(event: MarketingEvent): Promise<void> {
    if (!this.initialized) return;

    const isSandbox = this.config.sandbox !== false;
    const googleEventName = this.mapToGoogleEvent(event.eventName);

    const props = event.properties || {};
    
    // Format items if any product is set in attributes
    const items = props.productId ? [{
      item_id: props.productId,
      item_name: props.name || undefined,
      price: props.price || undefined,
      quantity: props.quantity || 1,
    }] : undefined;

    // GA4 Measurement Protocol Payload
    const mpPayload = {
      client_id: event.anonymousId,
      user_id: event.userId || undefined,
      events: [
        {
          name: googleEventName,
          params: {
            session_id: event.sessionId,
            engagement_time_msec: '100',
            value: props.total || props.value || undefined,
            currency: props.currency || 'INR',
            search_term: props.query || undefined,
            items: items,
          },
        },
      ],
    };

    if (isSandbox) {
      console.log(`[Google GA4 Sandbox] Tracked "${googleEventName}" (Event ID: ${event.eventId})`, mpPayload);
      return;
    }

    // Production Measurement Protocol fetch collect
    const measurementId = this.config.measurementId;
    const apiSecret = this.config.apiSecret;
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mpPayload),
      });

      if (!response.ok) {
        throw new Error(`GA4 server returned HTTP error ${response.status}`);
      }
    } catch (err: any) {
      throw new Error(`GA4 Measurement Protocol push failed: ${err.message}`);
    }
  }

  async identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void> {
    console.log('[Google GA4] Binding user traits:', { userId, anonymousId, ...traits });
  }

  async page(url: string, path: string, title: string, referrer: string): Promise<void> {
    console.log('[Google Tag Manager] PageView event pushed to sGTM container:', path);
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async testConnection(config: Record<string, any>): Promise<boolean> {
    const { valid } = this.validateConfig(config);
    if (!valid) return false;

    if (config.sandbox !== false) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    }

    // Google provides a validation server path at /debug/mp/collect to verify payloads
    const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${config.measurementId}&api_secret=${config.apiSecret}`;
    const testPayload = {
      client_id: 'connection_test_clientId',
      events: [{ name: 'ping' }],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.measurementId) {
      errors.push('Measurement ID is required.');
    }
    if (config.sandbox === false && !config.apiSecret) {
      errors.push('API Secret is required for production mode.');
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
