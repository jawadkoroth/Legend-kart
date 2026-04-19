import { DelhiveryProvider } from './delhivery';
import { ShippingProvider } from './types';

export type { ShippingProvider, ShipmentRequest, ShipmentResponse, TrackingResponse } from './types';

/**
 * Factory function: instantiate the correct shipping provider.
 * Only Delhivery is implemented for MVP.
 * Adding a new provider = one file + one case statement.
 */
export function getShippingProvider(
  provider: string,
  config: Record<string, string>
): ShippingProvider {
  switch (provider) {
    case 'delhivery':
      return new DelhiveryProvider(config as { api_key: string; api_url?: string; pickup_location: string });
    // Future:
    // case 'shiprocket': return new ShiprocketProvider(config);
    // case 'ekart': return new EkartProvider(config);
    default:
      throw new Error(`Unknown shipping provider: ${provider}`);
  }
}
