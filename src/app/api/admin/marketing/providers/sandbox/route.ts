import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { MetaProvider } from '@/lib/marketing/providers/meta';
import { GoogleProvider } from '@/lib/marketing/providers/google';
import { ConsoleProvider } from '@/lib/marketing/providers/console';
import { validateMarketingEvent } from '@/lib/marketing/validation';
import { MarketingProvider } from '@/lib/marketing/providers/base';

const PROVIDERS: Record<string, any> = {
  meta: MetaProvider,
  google: GoogleProvider,
  console: ConsoleProvider,
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    // Auth check
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    if (authErr || !user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return apiError(401, 'Unauthorized');
      }
    }

    const body = await req.json();
    const { providerId, config, eventPayload } = body;

    if (!providerId || !eventPayload) {
      return apiError(400, 'Missing providerId or eventPayload');
    }

    const ProviderClass = PROVIDERS[providerId];
    if (!ProviderClass) {
      return apiError(404, 'Provider not found');
    }

    const providerInstance = new ProviderClass() as MarketingProvider;

    // 1. Validate the simulated event
    const valResult = validateMarketingEvent(eventPayload);
    
    // 2. Validate configuration
    const configResult = providerInstance.validateConfig(config);

    // 3. Map payloads
    let mappedPayload: any = {};
    let mockResponse: any = {};

    if (valResult.valid && configResult.valid) {
      // Simulate mappings based on provider id
      if (providerId === 'meta') {
        const props = eventPayload.properties || {};
        mappedPayload = {
          event_name: eventPayload.eventName === 'page_viewed' ? 'PageView' : 'ViewContent',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventPayload.eventId,
          user_data: {
            client_ip_address: '127.0.0.1',
            client_user_agent: 'Mock Agent',
          },
          custom_data: {
            value: props.total || props.value || undefined,
            currency: props.currency || 'INR',
          },
          action_source: 'website',
        };
        mockResponse = {
          events_received: 1,
          fb_trace_id: `FB-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          message: 'Mock payload successfully validated by conversions API.',
        };
      } else if (providerId === 'google') {
        const props = eventPayload.properties || {};
        mappedPayload = {
          client_id: eventPayload.anonymousId,
          user_id: eventPayload.userId || undefined,
          events: [{
            name: eventPayload.eventName === 'page_viewed' ? 'page_view' : 'view_item',
            params: {
              engagement_time_msec: '100',
              session_id: eventPayload.sessionId,
              ...props,
            }
          }]
        };
        mockResponse = {
          status: 'success',
          validationMessages: [],
          description: 'Measurement protocol validation server: request is valid.',
        };
      } else {
        mappedPayload = eventPayload;
        mockResponse = { status: 'logged' };
      }
    }

    return apiSuccess({
      eventValid: valResult.valid,
      eventErrors: valResult.errors,
      configValid: configResult.valid,
      configErrors: configResult.errors || [],
      mappedPayload,
      mockResponse,
    });
  } catch (err: any) {
    console.error('[MARKETING_SANDBOX_API] Sandbox Error:', err);
    return apiError(500, err.message || 'Internal server error');
  }
}
