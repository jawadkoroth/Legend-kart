import { createAdminClient } from '../supabase/admin';

let flagsCache: Record<string, boolean> = {};
let lastFetched = 0;
const CACHE_TTL = 2000; // 2 seconds caching in memory

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (now - lastFetched < CACHE_TTL) {
    return flagsCache;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('marketing_feature_flags')
      .select('key, enabled');

    if (!error && data) {
      const parsed: Record<string, boolean> = {};
      data.forEach((f) => {
        parsed[f.key] = !!f.enabled;
      });
      flagsCache = parsed;
      lastFetched = now;
    }
  } catch (err) {
    console.error('[FeatureFlags] Failed to fetch feature flags:', err);
  }

  return flagsCache;
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  // Default to true if not found in table to prevent blocking features during bootstrap
  return flags[key] !== false;
}
export default getFeatureFlags;
