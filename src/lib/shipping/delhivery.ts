import { ShippingProvider, ShipmentRequest, ShipmentResponse, TrackingResponse } from './types';

export class DelhiveryProvider implements ShippingProvider {
  name = 'delhivery';
  private apiKey: string;
  private apiUrl: string;
  private pickupLocation: string;

  constructor(config: { api_key: string; api_url?: string; pickup_location: string }) {
    this.apiKey = config.api_key;
    this.apiUrl = config.api_url || 'https://track.delhivery.com/api';
    this.pickupLocation = config.pickup_location;
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResponse> {
    const payload = {
      shipments: [{
        name: req.customer.name,
        add: req.address.line1,
        add2: req.address.line2 || '',
        address_type: 'home',
        city: req.address.city,
        state: req.address.state,
        pin: req.address.pincode,
        phone: req.customer.phone,
        order: req.order_number,
        payment_mode: req.payment.method === 'cod' ? 'COD' : 'Prepaid',
        cod_amount: req.payment.method === 'cod'
          ? (req.payment.cod_amount_paise! / 100).toString()
          : '0',
        weight: req.product.weight_grams,
        shipment_width: 30,
        shipment_height: 5,
        shipment_length: 35,
        product_desc: req.product.name,
        quantity: req.product.quantity,
      }],
      pickup_location: { name: this.pickupLocation },
    };

    try {
      const response = await fetch(`${this.apiUrl}/cmu/create.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: JSON.stringify(payload), format: 'json' }),
      });

      const data = await response.json();

      if (data.success) {
        const waybill = data.packages?.[0]?.waybill || data.waybill;
        return {
          success: true,
          tracking_id: waybill,
          label_url: `${this.apiUrl}/p/packing_slip?wbns=${waybill}`,
          raw_response: data,
        };
      }

      return {
        success: false,
        error: data.rmk || data.error || 'Shipment creation failed',
        raw_response: data,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
        raw_response: err,
      };
    }
  }

  async trackShipment(tracking_id: string): Promise<TrackingResponse> {
    const response = await fetch(
      `${this.apiUrl}/v1/packages/json/?waybill=${tracking_id}`,
      { headers: { 'Authorization': `Token ${this.apiKey}` } }
    );
    const data = await response.json();
    return { status: 'ok', raw: data };
  }

  async cancelShipment(tracking_id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.apiUrl}/p/edit`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ waybill: tracking_id, cancellation: true }),
    });
    const data = await response.json();
    return { success: !!data.status };
  }
}
