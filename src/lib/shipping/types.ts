export interface ShipmentRequest {
  order_number: string;
  customer: { name: string; phone: string; email?: string };
  address: { line1: string; line2?: string; city: string; state: string; pincode: string };
  product: { name: string; quantity: number; weight_grams: number };
  payment: { method: 'cod' | 'prepaid'; cod_amount_paise?: number };
}

export interface ShipmentResponse {
  success: boolean;
  tracking_id?: string;
  label_url?: string;
  error?: string;
  raw_response?: unknown;
}

export interface TrackingResponse {
  status: string;
  location?: string;
  timestamp?: string;
  raw?: unknown;
}

export interface ShippingProvider {
  name: string;
  createShipment(req: ShipmentRequest): Promise<ShipmentResponse>;
  trackShipment(tracking_id: string): Promise<TrackingResponse>;
  cancelShipment(tracking_id: string): Promise<{ success: boolean }>;
}
