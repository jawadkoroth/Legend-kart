import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { MarketingEvent } from '@/lib/marketing/types';
import { MetaProvider } from '@/lib/marketing/providers/meta';
import { GoogleProvider } from '@/lib/marketing/providers/google';
import { ConsoleProvider } from '@/lib/marketing/providers/console';
import { MarketingProvider } from '@/lib/marketing/providers/base';
import { validateMarketingEvent } from '@/lib/marketing/validation';
import { getFeatureFlags } from '@/lib/marketing/flags';

const PROVIDER_CLASSES: Record<string, any> = {
  meta: MetaProvider,
  google: GoogleProvider,
  console: ConsoleProvider,
};

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: providers, error } = await supabase
      .from('marketing_providers')
      .select('id, enabled, config, version');

    if (error) {
      return apiError(500, 'Failed to fetch provider configurations');
    }

    const activeProviders = (providers || [])
      .filter((p) => p.enabled)
      .map((p) => ({
        id: p.id,
        config: p.config,
        version: p.version,
      }));

    return NextResponse.json({ success: true, providers: activeProviders });
  } catch (err) {
    return apiError(500, 'Internal server error');
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let eventId = '';

  try {
    const event = (await req.json()) as MarketingEvent;
    eventId = event.eventId;

    if (!event.eventId || !event.eventName) {
      return apiError(400, 'Missing eventId or eventName');
    }

    const supabase = createAdminClient();

    // 1. Run event validation
    const valResult = validateMarketingEvent(event);
    if (!valResult.valid) {
      // Persist as quarantined in DLQ
      await supabase.from('marketing_events').insert({
        event_id: event.eventId,
        schema_version: event.schemaVersion,
        event_version: event.eventVersion || '1.0.0',
        provider_mapping_version: event.providerMappingVersion || '1.0.0',
        event_name: event.eventName,
        ts_client: event.timestamp,
        ts_server: new Date().toISOString(),
        anonymous_id: event.anonymousId,
        user_id: event.userId || null,
        session_id: event.sessionId,
        correlation_id: event.correlationId || null,
        context: event.context,
        properties: event.properties,
        source: event.source || 'client',
        in_dlq: true,
        validation_errors: valResult.errors,
        provider_status: { validation: 'failed' },
        provider_errors: { validation: valResult.errors.join(', ') },
      });

      return apiSuccess({
        eventId,
        processed: false,
        inDlq: true,
        validationErrors: valResult.errors,
      });
    }

    // 2. Fetch feature flags
    const flags = await getFeatureFlags();

    // 3. Persist valid event to DB
    const { error: insertError } = await supabase.from('marketing_events').insert({
      event_id: event.eventId,
      schema_version: event.schemaVersion,
      event_version: event.eventVersion || '1.0.0',
      provider_mapping_version: event.providerMappingVersion || '1.0.0',
      event_name: event.eventName,
      ts_client: event.timestamp,
      ts_server: new Date().toISOString(),
      anonymous_id: event.anonymousId,
      user_id: event.userId || null,
      session_id: event.sessionId,
      correlation_id: event.correlationId || null,
      context: event.context,
      properties: event.properties,
      source: event.source || 'client',
      in_dlq: false,
      validation_errors: [],
      provider_status: {},
      provider_errors: {},
    });

    if (insertError) {
      console.error('[MARKETING_EVENTS_API] DB Insert Error:', insertError);
      return apiError(500, 'Failed to persist event');
    }

    // 3b. Trigger matching workflows in the automation engine (non-blocking)
    try {
      const { triggerWorkflows } = await import('@/lib/workflow/engine');
      void triggerWorkflows(event.eventName, event, supabase).catch(err => {
        console.error('[MARKETING_EVENTS_API] Workflows trigger unhandled error:', err);
      });
    } catch (err) {
      console.error('[MARKETING_EVENTS_API] Workflows engine trigger import/start error:', err);
    }

    // 4. Fetch enabled providers
    const { data: dbProviders } = await supabase
      .from('marketing_providers')
      .select('id, enabled, config, version')
      .eq('enabled', true);

    const providerStatus: Record<string, string> = {};
    const providerErrors: Record<string, string> = {};
    let dispatchFailure = false;

    if (dbProviders && dbProviders.length > 0) {
      await Promise.all(
        dbProviders.map(async (dbProv) => {
          // Check Feature Flags
          const flagKey = `marketing.${dbProv.id}`;
          if (flags[flagKey] === false) {
            providerStatus[dbProv.id] = 'ignored';
            providerErrors[dbProv.id] = 'Feature flag disabled';
            return;
          }

          const ProviderClass = PROVIDER_CLASSES[dbProv.id];
          if (!ProviderClass) {
            providerStatus[dbProv.id] = 'ignored';
            return;
          }

          const providerInstance = new ProviderClass() as MarketingProvider;
          
          // Check Capabilities
          const caps = providerInstance.capabilities;
          if (event.eventName === 'page_viewed' && !caps.supportsPageViews) {
            providerStatus[dbProv.id] = 'ignored';
            providerErrors[dbProv.id] = 'Page view tracking not supported';
            return;
          }
          if (
            (event.eventName === 'payment_success' || event.eventName === 'order_paid') &&
            !caps.supportsPurchases
          ) {
            providerStatus[dbProv.id] = 'ignored';
            providerErrors[dbProv.id] = 'Purchase tracking not supported';
            return;
          }

          try {
            await providerInstance.initialize(dbProv.config);
            
            if (event.eventName === 'page_viewed') {
              const { url, path, title, referrer } = event.context.page;
              await providerInstance.page(url, path, title, referrer);
            }
            await providerInstance.track(event);

            providerStatus[dbProv.id] = 'sent';
            
            await supabase
              .from('marketing_providers')
              .update({
                status: 'connected',
                last_event_sent: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dbProv.id);
          } catch (err: any) {
            const errMsg = err instanceof Error ? err.message : String(err);
            providerStatus[dbProv.id] = 'failed';
            providerErrors[dbProv.id] = errMsg;
            dispatchFailure = true;

            await supabase
              .from('marketing_providers')
              .update({
                status: 'error',
                last_error: errMsg,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dbProv.id);
          }
        })
      );
    }

    const duration = Date.now() - startTime;

    // 5. Update the persisted event record. Mark in DLQ if any provider dispatch failed.
    await supabase
      .from('marketing_events')
      .update({
        duration,
        provider_status: providerStatus,
        provider_errors: providerErrors,
        in_dlq: dispatchFailure, // Quarantine in DLQ if delivery failed
      })
      .eq('event_id', eventId);

    return apiSuccess({
      eventId,
      processed: !dispatchFailure,
      inDlq: dispatchFailure,
      duration,
    });
  } catch (err: any) {
    console.error('[MARKETING_EVENTS_API] POST Error:', err);
    return apiError(500, 'Internal server error');
  }
}
