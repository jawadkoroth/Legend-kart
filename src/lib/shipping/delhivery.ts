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
  ConnectionTestResult,
} from './types';
import { mapDelhiveryStatus } from './state';
import { logEvent } from '@/lib/log';

export class DelhiveryProvider implements ShippingProvider {
  readonly providerName = 'delhivery' as const;

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly webhookSecret: string | null;
  private readonly pickupName: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.api_key ?? '';
    this.apiUrl = config.api_url ?? 'https://track.delhivery.com/api';
    this.webhookSecret = config.webhook_secret ?? null;
    this.pickupName = config.pickup_name ?? '';
  }

  private authHeader(): Record<string, string> {
    return { Authorization: `Token ${this.apiKey}` };
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResponse> {
    const payload = {
      shipments: [{
        name: req.customer.name,
        add: req.address.line1,
        add2: req.address.line2 ?? '',
        address_type: 'home',
        city: req.address.city,
        state: req.address.state,
        pin: req.address.pincode,
        phone: req.customer.phone,
        order: req.order_number,
        payment_mode: req.payment.method === 'cod' ? 'COD' : 'Prepaid',
        cod_amount: req.payment.method === 'cod'
          ? ((req.payment.cod_amount_paise ?? 0) / 100).toString()
          : '0',
        weight: req.product.weight_grams,
        shipment_width: 30,
        shipment_height: 5,
        shipment_length: 35,
        product_desc: req.product.name,
        quantity: req.product.quantity,
      }],
      pickup_location: { name: this.pickupName },
    };

    try {
      const t0 = Date.now();
      const response = await fetch(`${this.apiUrl}/cmu/create.json`, {
        method: 'POST',
        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify(payload), format: 'json' }),
      });
      const latencyMs = Date.now() - t0;
      const data = await response.json() as Record<string, unknown>;

      logEvent('shipping.delhivery.create_shipment', {
        order_number: req.order_number,
        status_code: response.status,
        latency_ms: latencyMs,
        success: !!data.success,
      }, { source: 'api' });

      if (data.success) {
        const pkgs = data.packages as Array<{ waybill?: string }> | undefined;
        const waybill = pkgs?.[0]?.waybill ?? (data.waybill as string | undefined);
        return {
          success: true,
          tracking_id: waybill,
          label_url: waybill ? `${this.apiUrl}/p/packing_slip?wbns=${waybill}` : undefined,
          raw_response: data,
        };
      }

      logEvent('shipping.delhivery.create_shipment_failed', {
        order_number: req.order_number,
        error: data.rmk ?? data.error ?? 'unknown',
      }, { source: 'api', severity: 'error' });

      return {
        success: false,
        error: (data.rmk ?? data.error ?? 'Shipment creation failed') as string,
        raw_response: data,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      logEvent('shipping.delhivery.create_shipment_failed', {
        order_number: req.order_number,
        error: msg,
      }, { source: 'api', severity: 'error' });
      return { success: false, error: msg, raw_response: err };
    }
  }

  async trackShipment(tracking_id: string): Promise<TrackingResponse> {
    try {
      const response = await fetch(
        `${this.apiUrl}/v1/packages/json/?waybill=${tracking_id}`,
        { headers: this.authHeader() },
      );
      const data = await response.json() as Record<string, unknown>;
      const shipmentData = (data['ShipmentData'] as Array<{ Shipment?: { Status?: { Status?: string; Instructions?: string; StatusDateTime?: string } } }> | undefined)?.[0];
      const rawStatus = shipmentData?.Shipment?.Status?.Status ?? 'unknown';
      return {
        status: rawStatus,
        location: shipmentData?.Shipment?.Status?.Instructions,
        timestamp: shipmentData?.Shipment?.Status?.StatusDateTime,
        raw: data,
      };
    } catch (err) {
      return { status: 'error', raw: err };
    }
  }

  async cancelShipment(tracking_id: string): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.apiUrl}/p/edit`, {
        method: 'POST',
        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ waybill: tracking_id, cancellation: true }),
      });
      const data = await response.json() as Record<string, unknown>;
      return { success: !!data.status };
    } catch {
      return { success: false };
    }
  }

  async generateLabel(tracking_id: string): Promise<LabelResponse> {
    const url = `${this.apiUrl}/p/packing_slip?wbns=${tracking_id}`;
    return { url };
  }

  async checkServiceability(pincode: string): Promise<ServiceabilityResponse> {
    try {
      const response = await fetch(
        `${this.apiUrl}/c/api/pin-codes/json/?filter_codes=${pincode}`,
        { headers: this.authHeader() },
      );
      const data = await response.json() as Record<string, unknown>;
      const deliveryData = data['delivery_codes'] as Array<{ postal_code?: { cod?: string; pre_paid?: string } }> | undefined;
      const entry = deliveryData?.[0]?.postal_code;
      return {
        serviceable: !!entry,
        cod_available: entry?.cod === 'Y',
        raw: data,
      };
    } catch {
      return { serviceable: false, cod_available: false };
    }
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): boolean {
    if (!this.webhookSecret) {
      return true;
    }
    const signature = headers['x-delhivery-signature'] ?? headers['x-webhook-signature'];
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  parseWebhook(body: unknown): NormalisedShipmentEvent | null {
    try {
      const payload = body as Record<string, unknown>;
      const waybill =
        (payload['waybill'] as string | undefined) ??
        (payload['tracking_id'] as string | undefined);
      if (!waybill) return null;

      const rawStatus =
        (payload['status'] as string | undefined) ??
        (payload['Status'] as string | undefined) ??
        '';
      const canonical = mapDelhiveryStatus(rawStatus);
      if (!canonical) return null;

      const eventType = (payload['event_type'] as string | undefined) ?? rawStatus;
      const timestamp = (payload['timestamp'] as string | undefined) ?? new Date().toISOString();

      const externalEventId = crypto
        .createHash('sha256')
        .update(`${waybill}:${eventType}:${timestamp}`)
        .digest('hex');

      return {
        tracking_id: waybill,
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

    // 1. Auth check — lightweight pincode serviceability call
    try {
      const testPin = '110001'; // Delhi HQ pincode — always serviceable
      const res = await fetch(
        `${this.apiUrl}/c/api/pin-codes/json/?filter_codes=${testPin}`,
        { headers: this.authHeader() },
      );
      authLatency = Date.now() - t0;

      if (res.status === 401 || res.status === 403) {
        errors.push('API key invalid or expired — check Delhivery dashboard');
      } else if (res.ok) {
        authOk = true;
        apiOk = true;
        const data = await res.json() as Record<string, unknown>;
        if (!data?.delivery_codes || !Array.isArray(data.delivery_codes)) {
          warnings.push('Unexpected API response format — verify API endpoint URL');
        }
      } else {
        errors.push(`API returned ${res.status} — verify endpoint URL`);
      }
    } catch (err) {
      authLatency = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
        errors.push('Cannot reach Delhivery API — check network/firewall');
      } else {
        errors.push(`Auth check failed: ${msg}`);
      }
    }

    // 2. Pickup location check — verify pickup name is set
    if (!this.pickupName || this.pickupName.trim().length === 0) {
      errors.push('Pickup location name not configured');
      pickupOk = false;
    } else {
      pickupOk = true; // We can't validate via API without creating a shipment, but name is present
    }

    logEvent('shipping.delhivery.connection_test', {
      success: authOk && apiOk && pickupOk,
      auth_ok: authOk,
      api_ok: apiOk,
      pickup_ok: pickupOk,
      latency_ms: authLatency,
      error_count: errors.length,
    }, { source: 'system', severity: errors.length > 0 ? 'warn' : 'info' });

    return {
      success: authOk && apiOk && pickupOk,
      provider: 'delhivery',
      checks: {
        auth: { ok: authOk, latency_ms: authLatency, message: authOk ? 'API key valid' : errors.find(e => e.includes('API key')) },
        api: { ok: apiOk, message: apiOk ? 'Endpoint reachable' : errors.find(e => e.includes('reach') || e.includes('endpoint')) },
        pickup: { ok: pickupOk, message: pickupOk ? `Pickup name: ${this.pickupName}` : 'Pickup name not configured' },
      },
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }
}
