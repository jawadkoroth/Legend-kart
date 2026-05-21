/**
 * NOIR — Shiprocket provider adapter.
 *
 * Auth model: JWT session token obtained via /auth/login.
 * Tokens expire after 24h. refreshAuth() obtains a new token
 * and the registry persists it back to shipping_providers.token.
 *
 * All methods emit logEvent() calls for operational observability.
 */

import crypto from 'crypto';
import {
  ShippingProvider,
  ShipmentRequest,
  ShipmentResponse,
  TrackingResponse,
  ServiceabilityResponse,
  LabelResponse,
  NormalisedShipmentEvent,
  ProviderConfig,
  TokenRefreshResult,
  ConnectionTestResult,
} from './types';
import { logEvent } from '@/lib/log';

/* ─── Shiprocket status → canonical ──────────────────────────────── */
export function mapShiprocketStatus(rawStatus: string): import('./state').CanonicalShipmentStatus | null {
  const s = rawStatus?.toUpperCase?.() ?? '';
  if (['DELIVERED'].includes(s)) return 'delivered';
  if (['OUT FOR DELIVERY', 'OFD'].includes(s)) return 'out_for_delivery';
  if (['IN TRANSIT', 'PICKED UP AND IN TRANSIT'].includes(s)) return 'in_transit';
  if (['PICKUP SCHEDULED', 'PICKUP GENERATED', 'PICKED UP'].includes(s)) return 'picked_up';
  if (['SHIPMENT CREATED', 'AWB ASSIGNED', 'LABEL GENERATED'].includes(s)) return 'shipment_created';
  if (['RTO INITIATED', 'RTO IN TRANSIT', 'RTO DELIVERED', 'RETURNED'].includes(s)) return 'returned';
  if (['CANCELED', 'CANCELLED'].includes(s)) return 'cancelled';
  if (['FAILED DELIVERY', 'UNDELIVERED'].includes(s)) return 'failed';
  return null;
}

export class ShiprocketProvider implements ShippingProvider {
  readonly providerName = 'shiprocket' as const;

  private readonly baseUrl: string;
  private readonly authEmail: string | null;
  private readonly authPasswordEncrypted: string | null;
  private readonly webhookSecret: string | null;
  private readonly pickupName: string;
  private token: string | null;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.api_url ?? 'https://apiv2.shiprocket.in/v1/external';
    this.authEmail = config.auth_email ?? null;
    this.authPasswordEncrypted = config.auth_password_encrypted ?? null;
    this.webhookSecret = config.webhook_secret ?? null;
    this.pickupName = config.pickup_name ?? '';
    this.token = config.token ?? null;
  }

  private authHeader(): Record<string, string> {
    if (!this.token) throw new Error('Shiprocket: no token — call refreshAuth() first');
    return { Authorization: `Bearer ${this.token}` };
  }

  async refreshAuth(): Promise<TokenRefreshResult> {
    if (!this.authEmail || !this.authPasswordEncrypted) {
      throw new Error('Shiprocket: auth credentials not configured');
    }
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.authEmail, password: this.authPasswordEncrypted }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!data.token) throw new Error(`Shiprocket login failed: ${JSON.stringify(data)}`);
    const token = data.token as string;
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    this.token = token;
    logEvent('shipping.shiprocket.token_refreshed', { expires_at: expiresAt }, { source: 'system' });
    return { token, expires_at: expiresAt };
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResponse> {
    try {
      const t0 = Date.now();
      const payload = {
        order_id: req.order_number,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: this.pickupName,
        billing_customer_name: req.customer.name,
        billing_last_name: '',
        billing_address: req.address.line1,
        billing_address_2: req.address.line2 ?? '',
        billing_city: req.address.city,
        billing_pincode: req.address.pincode,
        billing_state: req.address.state,
        billing_country: 'India',
        billing_email: req.customer.email ?? '',
        billing_phone: req.customer.phone,
        shipping_is_billing: 1,
        order_items: [{
          name: req.product.name,
          sku: req.order_number,
          units: req.product.quantity,
          selling_price: (req.payment.cod_amount_paise ?? 0) / 100,
          discount: 0,
          tax: 0,
          hsn: '',
        }],
        payment_method: req.payment.method === 'cod' ? 'COD' : 'Prepaid',
        sub_total: (req.payment.cod_amount_paise ?? 0) / 100,
        length: 15, breadth: 12, height: 5,
        weight: req.product.weight_grams / 1000,
      };

      const res = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
        method: 'POST',
        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const latencyMs = Date.now() - t0;
      const data = await res.json() as Record<string, unknown>;

      logEvent('shipping.shiprocket.create_shipment', {
        order_number: req.order_number, status_code: res.status, latency_ms: latencyMs,
      }, { source: 'api' });

      if (res.ok && data.shipment_id) {
        const awb = (data.payload as Record<string, unknown>)?.awb_code as string | undefined;
        return { success: true, tracking_id: awb, raw_response: data };
      }
      logEvent('shipping.shiprocket.create_failed', { order_number: req.order_number, error: data.message }, { source: 'api', severity: 'error' });
      return { success: false, error: (data.message as string) ?? 'Shipment creation failed', raw_response: data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      logEvent('shipping.shiprocket.create_failed', { order_number: req.order_number, error: msg }, { source: 'api', severity: 'error' });
      return { success: false, error: msg };
    }
  }

  async trackShipment(tracking_id: string): Promise<TrackingResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/courier/track/awb/${tracking_id}`, { headers: this.authHeader() });
      const data = await res.json() as Record<string, unknown>;
      const trackData = (data['tracking_data'] as Record<string, unknown> | undefined);
      const shipmentData = trackData?.['shipment_track'] as Array<Record<string, unknown>> | undefined;
      const latest = shipmentData?.[0];
      return {
        status: (latest?.['current_status'] as string) ?? 'unknown',
        location: (latest?.['location'] as string) ?? undefined,
        timestamp: (latest?.['updated_at'] as string) ?? undefined,
        raw: data,
      };
    } catch (err) {
      return { status: 'error', raw: err };
    }
  }

  async cancelShipment(tracking_id: string): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/orders/cancel`, {
        method: 'POST',
        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ awbs: [tracking_id] }),
      });
      return { success: res.ok };
    } catch {
      return { success: false };
    }
  }

  async generateLabel(tracking_id: string): Promise<LabelResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/courier/generate/label`, {
        method: 'POST',
        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: [tracking_id] }),
      });
      const data = await res.json() as Record<string, unknown>;
      const url = (data['label_url'] as string) ?? '';
      return { url, raw: data };
    } catch {
      return { url: '' };
    }
  }

  async checkServiceability(pincode: string): Promise<ServiceabilityResponse> {
    try {
      const res = await fetch(
        `${this.baseUrl}/courier/serviceability/?pickup_postcode=${this.pickupPincode}&delivery_postcode=${pincode}&cod=1&weight=0.5`,
        { headers: this.authHeader() },
      );
      const data = await res.json() as Record<string, unknown>;
      const available = (data['data'] as Record<string, unknown> | undefined)?.['available_courier_companies'];
      const couriers = Array.isArray(available) ? available : [];
      return {
        serviceable: couriers.length > 0,
        cod_available: couriers.some((c: Record<string, unknown>) => c['cod'] === 1),
        raw: data,
      };
    } catch {
      return { serviceable: false, cod_available: false };
    }
  }

  private get pickupPincode(): string {
    return '';
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): boolean {
    if (!this.webhookSecret) return true;
    const sig = headers['x-shiprocket-signature'];
    const sigStr = Array.isArray(sig) ? sig[0] : sig;
    if (!sigStr) return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sigStr), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  parseWebhook(body: unknown): NormalisedShipmentEvent | null {
    try {
      const payload = body as Record<string, unknown>;
      const awb =
        (payload['awb'] as string | undefined) ??
        (payload['awb_code'] as string | undefined) ??
        (payload['tracking_id'] as string | undefined);
      if (!awb) return null;

      const rawStatus =
        (payload['current_status'] as string | undefined) ??
        (payload['status'] as string | undefined) ?? '';

      const canonical = mapShiprocketStatus(rawStatus);
      if (!canonical) return null;

      const eventType = (payload['event'] as string | undefined) ?? rawStatus;
      const timestamp = (payload['timestamp'] as string | undefined) ?? new Date().toISOString();

      const externalEventId = crypto
        .createHash('sha256')
        .update(`${awb}:${eventType}:${timestamp}`)
        .digest('hex');

      return {
        tracking_id: awb,
        canonical_status: canonical,
        provider_event_type: eventType,
        provider_event_at: timestamp,
        external_event_id: externalEventId,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let authOk = false;
    let apiOk = false;
    let pickupOk = false;
    let authLatency = 0;

    // 1. Check credentials configured
    if (!this.authEmail || !this.authPasswordEncrypted) {
      errors.push('Shiprocket credentials not configured — set email and password');
    }

    // 2. Try to refresh/auth and get a valid token
    if (!errors.length) {
      try {
        const refreshResult = await this.refreshAuth();
        authLatency = Date.now() - t0;
        authOk = true;
        this.token = refreshResult.token;
        logEvent('shipping.shiprocket.connection_test_auth_ok', {
          token_expires: refreshResult.expires_at,
          latency_ms: authLatency,
        }, { source: 'system' });
      } catch (err) {
        authLatency = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('login failed') || msg.includes('401')) {
          errors.push('Login failed — check email/password in settings');
        } else if (msg.includes('fetch') || msg.includes('network')) {
          errors.push('Cannot reach Shiprocket API — check network/firewall');
        } else {
          errors.push(`Auth failed: ${msg}`);
        }
      }
    }

    // 3. Test API with token — try to fetch courier companies list
    if (authOk && this.token) {
      try {
        const res = await fetch(`${this.baseUrl}/courier/courier-companies`, {
          headers: this.authHeader(),
        });
        if (res.ok) {
          apiOk = true;
        } else if (res.status === 401) {
          errors.push('Token rejected — may have expired');
        } else {
          errors.push(`API returned ${res.status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`API check failed: ${msg}`);
      }
    }

    // 4. Pickup location check
    if (!this.pickupName || this.pickupName.trim().length === 0) {
      errors.push('Pickup location name not configured');
      pickupOk = false;
    } else {
      pickupOk = true;
    }

    logEvent('shipping.shiprocket.connection_test', {
      success: authOk && apiOk && pickupOk,
      auth_ok: authOk,
      api_ok: apiOk,
      pickup_ok: pickupOk,
      latency_ms: authLatency,
      error_count: errors.length,
    }, { source: 'system', severity: errors.length > 0 ? 'warn' : 'info' });

    return {
      success: authOk && apiOk && pickupOk,
      provider: 'shiprocket',
      checks: {
        auth: { ok: authOk, latency_ms: authLatency, message: authOk ? 'JWT token valid' : errors.find(e => e.includes('email') || e.includes('password')) },
        api: { ok: apiOk, message: apiOk ? 'API accessible' : errors.find(e => e.includes('Token') || e.includes('API')) },
        pickup: { ok: pickupOk, message: pickupOk ? `Pickup name: ${this.pickupName}` : 'Pickup name not configured' },
      },
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }
}
