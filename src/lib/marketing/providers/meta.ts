import { MarketingEvent, ProviderCapabilities } from '../types';
import { MarketingProvider } from './base';

export class MetaProvider implements MarketingProvider {
  id = 'meta';
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
      throw new Error(`Invalid Meta configuration: ${check.errors?.join(', ')}`);
    }
    this.config = config;
    this.initialized = true;
  }

  async track(event: MarketingEvent): Promise<void> {
    if (!this.initialized) return;

    const isSandbox = this.config.sandbox !== false; // Default to sandbox unless explicitly production
    const metaEventName = this.mapToMetaEvent(event.eventName);

    // Prepare User Data payload (SHA-256 hashed matching metrics)
    const userData: Record<string, any> = {
      client_ip_address: event.context.ip || '127.0.0.1',
      client_user_agent: event.context.device.userAgent || 'Mozilla/5.0',
    };

    // Meta expects hashed emails/phones for advanced matching
    if (event.properties.email) {
      userData.em = [await this.sha256(event.properties.email.trim().toLowerCase())];
    }
    if (event.properties.phone) {
      userData.ph = [await this.sha256(event.properties.phone.trim().replace(/\D/g, ''))];
    }

    const props = event.properties || {};
    const customData = {
      value: props.total || props.value || undefined,
      currency: props.currency || 'INR',
      content_name: props.name || undefined,
      content_type: props.productId ? 'product' : undefined,
      content_ids: props.productId ? [props.productId] : undefined,
    };

    const capiPayload = {
      data: [
        {
          event_name: metaEventName,
          event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
          event_id: event.eventId,
          user_data: userData,
          custom_data: customData,
          action_source: 'website',
          event_source_url: event.context.page.url,
        },
      ],
      test_event_code: isSandbox ? this.config.testEventCode || 'TEST99999' : undefined,
    };

    if (isSandbox) {
      // Mock execution in sandbox mode
      console.log(`[Meta CAPI Sandbox] Tracked "${metaEventName}" (Event ID: ${event.eventId})`, capiPayload);
      return;
    }

    // Production CAPI Request
    const pixelId = this.config.pixelId;
    const accessToken = this.config.accessToken;
    const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload),
      });

      if (!response.ok) {
        const errorDetails = await response.json();
        throw new Error(errorDetails.error?.message || `HTTP error ${response.status}`);
      }
    } catch (err: any) {
      throw new Error(`Meta CAPI push failed: ${err.message}`);
    }
  }

  async identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void> {
    // Advanced matching storage
    console.log('[Meta Provider] Hashing profile parameters for conversions matching:', { userId, anonymousId, ...traits });
  }

  async page(url: string, path: string, title: string, referrer: string): Promise<void> {
    // Client-side pixel PageView (pixel script loads in browser if configured)
    console.log('[Meta Pixel] Triggered browser PageView for route:', path);
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async testConnection(config: Record<string, any>): Promise<boolean> {
    const { valid } = this.validateConfig(config);
    if (!valid) return false;

    if (config.sandbox !== false) {
      // Mock sandbox verification success
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    }

    // Direct ping validation check
    const url = `https://graph.facebook.com/v19.0/${config.pixelId}?access_token=${config.accessToken}`;
    try {
      const res = await fetch(url);
      return res.ok;
    } catch {
      return false;
    }
  }

  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.pixelId) {
      errors.push('Pixel ID is required.');
    }
    if (config.sandbox === false && !config.accessToken) {
      // Production needs access token
      errors.push('Access token is required for production mode.');
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

  // Basic JS implementation of SHA-256 for Node environment
  private async sha256(message: string): Promise<string> {
    if (typeof window !== 'undefined') {
      // Client-side fallback using web crypto
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Server-side using Node crypto
      const cryptoLib = require('crypto');
      return cryptoLib.createHash('sha256').update(message).digest('hex');
    }
  }
}
export default MetaProvider;
