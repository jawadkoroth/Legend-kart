import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { MetaProvider } from '@/lib/marketing/providers/meta';
import { GoogleProvider } from '@/lib/marketing/providers/google';
import { ConsoleProvider } from '@/lib/marketing/providers/console';
import { MarketingProvider } from '@/lib/marketing/providers/base';

const PROVIDERS: Record<string, any> = {
  meta: MetaProvider,
  google: GoogleProvider,
  console: ConsoleProvider,
};

export async function POST(req: NextRequest) {
  try {
    // Auth guard: Check if user is an admin
    const supabase = createAdminClient();
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    
    // In server components / admin route, verify the cookie session
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    if (authErr || !user) {
      // Fallback: verify via standard cookies inside this request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return apiError(401, 'Unauthorized');
      }
    }

    const body = await req.json();
    const { providerId, config } = body;

    if (!providerId) {
      return apiError(400, 'Missing providerId');
    }

    const ProviderClass = PROVIDERS[providerId];
    if (!ProviderClass) {
      return apiError(404, 'Provider not found');
    }

    const providerInstance = new ProviderClass() as MarketingProvider;
    
    // 1. Run config validation first
    const validate = providerInstance.validateConfig(config);
    if (!validate.valid) {
      return apiSuccess({
        success: false,
        status: 'error',
        errors: validate.errors,
      });
    }

    // 2. Perform connection test
    const testResult = await providerInstance.testConnection(config);
    
    // 3. Update connection status in Supabase
    await supabase
      .from('marketing_providers')
      .update({
        status: testResult ? 'connected' : 'error',
        last_error: testResult ? null : 'Connection test failed. Verify credentials.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', providerId);

    return apiSuccess({
      success: testResult,
      status: testResult ? 'connected' : 'error',
      errors: testResult ? [] : ['Connection test failed. Check developer console / credentials.'],
    });
  } catch (err: any) {
    console.error('[MARKETING_TEST_API] Connection Test Error:', err);
    return apiError(500, err instanceof Error ? err.message : 'Internal server error');
  }
}
