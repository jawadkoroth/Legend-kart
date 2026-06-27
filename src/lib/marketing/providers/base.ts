import { MarketingEvent, ProviderCapabilities } from '../types';

export interface MarketingProvider {
  id: string;
  version: string;
  capabilities: ProviderCapabilities;
  initialize(config: Record<string, any>): Promise<void>;
  track(event: MarketingEvent): Promise<void>;
  identify(userId: string | null, anonymousId: string, traits?: Record<string, any>): Promise<void>;
  page(url: string, path: string, title: string, referrer: string): Promise<void>;
  shutdown(): Promise<void>;
  testConnection(config: Record<string, any>): Promise<boolean>;
  validateConfig(config: Record<string, any>): { valid: boolean; errors?: string[] };
}
