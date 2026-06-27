export type MarketingEventName =
  | 'page_viewed'
  | 'collection_viewed'
  | 'product_viewed'
  | 'search_submitted'
  | 'product_added_to_cart'
  | 'product_removed_from_cart'
  | 'wishlist_added'
  | 'wishlist_removed'
  | 'checkout_started'
  | 'payment_started'
  | 'payment_success'
  | 'order_created'
  | 'order_paid'
  | 'order_delivered'
  | 'login'
  | 'logout'
  | 'registration_completed'
  | 'profile_updated'
  | 'review_submitted'
  | 'coupon_applied'
  | 'coupon_removed'
  | 'return_requested'
  | 'exchange_requested';

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  version: string;
  timestamp?: string;
}

export interface UTMContext {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
}

export interface ClickIds {
  gclid?: string | null;
  fbclid?: string | null;
}

export interface PageContext {
  url: string;
  path: string;
  referrer: string;
  title: string;
  utm?: UTMContext;
  clickIds?: ClickIds;
}

export interface DeviceContext {
  type: 'desktop' | 'tablet' | 'mobile';
  os?: string;
  browser?: string;
  userAgent?: string;
}

export interface GeoContext {
  country?: string;
  region?: string;
  city?: string;
}

export interface EventContext {
  page: PageContext;
  device: DeviceContext;
  consent: ConsentState;
  ip?: string;
  geo?: GeoContext;
}

export interface MarketingEvent {
  eventId: string; // UUID v4 dedup key
  schemaVersion: string; // e.g. "1.0.0"
  eventVersion: string; // e.g. "1.0.0"
  providerMappingVersion: string; // e.g. "1.0.0"
  eventName: MarketingEventName;
  timestamp: string; // ISO string
  sessionId: string;
  anonymousId: string;
  userId: string | null;
  properties: Record<string, any>;
  context: EventContext;
  source: 'client' | 'server';
  correlationId?: string; // Correlation ID linking user journey
  inDlq?: boolean;
  validationErrors?: string[];
}

export interface ProviderCapabilities {
  supportsPageViews: boolean;
  supportsPurchases: boolean;
  supportsBatchDispatch: boolean;
  supportsRealtime: boolean;
  supportsIdentify: boolean;
  supportsOfflineQueue: boolean;
  supportsTestConnection: boolean;
  supportsReplay: boolean;
  supportsConsent: boolean;
}

export interface ProviderConfig {
  id: string;
  enabled: boolean;
  config: Record<string, any>;
  version: string;
  status: 'connected' | 'disconnected' | 'error';
  last_event_sent?: string;
  last_error?: string;
  capabilities?: ProviderCapabilities;
}
