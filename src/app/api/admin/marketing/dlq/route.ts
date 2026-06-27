import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { generateUUID } from '@/lib/marketing/identity';

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    // Auth check
    const { data: { session } } = await supabase.auth.getSession();
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    
    if (authErr || (!user && !session?.user)) {
      return apiError(401, 'Unauthorized');
    }

    const { data: dlqEvents, error } = await supabase
      .from('marketing_events')
      .select('*')
      .eq('in_dlq', true)
      .order('ts_server', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[MARKETING_DLQ_API] Fetch failed:', error);
      return apiError(500, 'Failed to fetch DLQ events');
    }

    return NextResponse.json({ success: true, events: dlqEvents || [] });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    // Auth check
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    if (authErr || !user) {
      return apiError(401, 'Unauthorized');
    }

    const body = await req.json();
    const { action, eventIds } = body;

    if (!action || !eventIds || !Array.isArray(eventIds)) {
      return apiError(400, 'Missing action or eventIds');
    }

    if (action === 'replay') {
      const { data: eventsToReplay } = await supabase
        .from('marketing_events')
        .select('*')
        .in('event_id', eventIds);

      if (!eventsToReplay || eventsToReplay.length === 0) {
        return apiError(404, 'No events found to replay');
      }

      const origin = req.nextUrl.origin;
      const results = [];

      for (const oldEvent of eventsToReplay) {
        // Clone event with fresh properties
        const clonedEvent = {
          eventId: generateUUID(), // New ID to prevent unique key violation
          schemaVersion: oldEvent.schema_version,
          eventVersion: oldEvent.event_version,
          providerMappingVersion: oldEvent.provider_mapping_version,
          eventName: oldEvent.event_name,
          timestamp: new Date().toISOString(), // Fresh timestamp
          sessionId: oldEvent.session_id,
          anonymousId: oldEvent.anonymous_id,
          userId: oldEvent.user_id,
          properties: oldEvent.properties,
          correlationId: oldEvent.correlation_id,
          context: oldEvent.context,
          source: oldEvent.source,
        };

        // Post back through standard ingestion endpoint
        const res = await fetch(`${origin}/api/marketing/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clonedEvent),
        });

        if (res.ok) {
          const outcome = await res.json();
          results.push({ oldId: oldEvent.event_id, newId: clonedEvent.eventId, success: outcome.success });
          
          // Clear DLQ status for the replayed event in database
          await supabase
            .from('marketing_events')
            .update({ in_dlq: false, updated_at: new Date().toISOString() })
            .eq('event_id', oldEvent.event_id);
        } else {
          results.push({ oldId: oldEvent.event_id, success: false, error: res.statusText });
        }
      }

      return apiSuccess({ replayed: true, results });
    }

    return apiError(400, `Invalid action: ${action}`);
  } catch (err: any) {
    console.error('[MARKETING_DLQ_API] POST Error:', err);
    return apiError(500, err.message || 'Internal server error');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    // Auth check
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    if (authErr || !user) {
      return apiError(401, 'Unauthorized');
    }

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids')?.split(',') || [];

    if (ids.length === 0) {
      return apiError(400, 'Missing event IDs in query params');
    }

    const { error } = await supabase
      .from('marketing_events')
      .delete()
      .in('event_id', ids);

    if (error) {
      console.error('[MARKETING_DLQ_API] Delete failed:', error);
      return apiError(500, 'Failed to delete events');
    }

    return apiSuccess({ deleted: true });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
