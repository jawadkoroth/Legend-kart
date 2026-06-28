import { createAdminClient } from '@/lib/supabase/admin';
import { ChannelType, MessageStatus, SendResult } from './types';
import { ResendEmailProvider } from './providers/resend';
import { FirebasePushProvider } from './providers/firebase';
import { WhatsAppProvider } from './providers/whatsapp';
import { decrypt } from './crypto';

// Dynamic providers registry
const PROVIDERS = {
  email: { klass: ResendEmailProvider, providerId: 'resend' },
  push: { klass: FirebasePushProvider, providerId: 'firebase' },
  whatsapp: { klass: WhatsAppProvider, providerId: 'whatsapp' },
  sms: { klass: ResendEmailProvider, providerId: 'mock-sms' }, // SMS fallback / placeholder
};

export interface SendCommunicationParams {
  customerId?: string | null;
  contactValue?: string; // fallback if customerId not resolved
  channel: ChannelType;
  templateId?: string;
  templateName?: string;
  subject?: string; // override title
  body?: string; // override body if no template
  variables?: Record<string, string>;
  campaignId?: string;
  metadata?: Record<string, any>;
  transactional?: boolean; // bypass marketing opt-ins
}

/**
 * Main entrance endpoint to send any communication down the provider layers.
 */
export async function sendCommunication(params: SendCommunicationParams): Promise<SendResult> {
  const supabase = createAdminClient();
  const startTime = Date.now();
  const transactional = params.transactional ?? true;

  // 1. Resolve customer context & preferences
  let customer: any = null;
  let resolvedContactValue = params.contactValue || '';

  if (params.customerId) {
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('*, preferences:communication_preferences(*)')
      .eq('id', params.customerId)
      .maybeSingle();

    if (profile) {
      customer = profile;
      if (!resolvedContactValue) {
        if (params.channel === 'email') resolvedContactValue = profile.email || '';
        else if (params.channel === 'whatsapp' || params.channel === 'sms') resolvedContactValue = profile.phone || '';
      }
    }
  }

  if (!resolvedContactValue && params.channel !== 'push') {
    return {
      providerMessageId: '',
      status: 'failed',
      error: `Could not resolve contact value for channel ${params.channel}`
    };
  }

  // 2. Validate Communication Preferences & Opt-Ins
  if (customer && !transactional) {
    const prefs = customer.preferences?.[0] || customer.preferences;
    if (prefs) {
      if (params.channel === 'email' && !prefs.email_opt_in) {
        return { providerMessageId: '', status: 'failed', error: 'Customer opted out of email communication' };
      }
      if (params.channel === 'whatsapp' && !prefs.whatsapp_opt_in) {
        return { providerMessageId: '', status: 'failed', error: 'Customer opted out of WhatsApp communication' };
      }
      if (params.channel === 'push' && !prefs.push_opt_in) {
        return { providerMessageId: '', status: 'failed', error: 'Customer opted out of Push communication' };
      }
      if (params.channel === 'sms' && !prefs.sms_opt_in) {
        return { providerMessageId: '', status: 'failed', error: 'Customer opted out of SMS communication' };
      }
      if (prefs.transactional_only) {
        return { providerMessageId: '', status: 'failed', error: 'Customer only accepts transactional communications' };
      }
    }
  }

  // 3. Load Channel and Provider Details
  const providerDef = PROVIDERS[params.channel];
  if (!providerDef) {
    return { providerMessageId: '', status: 'failed', error: `Unsupported channel: ${params.channel}` };
  }

  const { data: dbChannel } = await supabase
    .from('communication_channels')
    .select('*')
    .eq('id', params.channel)
    .single();

  const enabled = dbChannel ? dbChannel.enabled : true;
  if (!enabled) {
    return { providerMessageId: '', status: 'failed', error: `Channel ${params.channel} is disabled` };
  }

  // 4. Resolve Template & Interpolate Variables
  let subject = params.subject || '';
  let body = params.body || '';
  let templateIdResolved = params.templateId || null;

  if (params.templateId || params.templateName) {
    let query = supabase.from('communication_templates').select('*');
    if (params.templateId) query = query.eq('id', params.templateId);
    else query = query.eq('name', params.templateName);

    const { data: template } = await query.maybeSingle();

    if (template) {
      templateIdResolved = template.id;
      subject = template.subject || subject;
      body = template.body || body;
    }
  }

  // Variables mapping (e.g. customer_name, order_number, tracking_number, coupon_code)
  const templateVars = {
    customer_name: customer?.name || 'Customer',
    order_number: params.variables?.order_number || '',
    tracking_number: params.variables?.tracking_number || '',
    coupon_code: params.variables?.coupon_code || '',
    product_name: params.variables?.product_name || '',
    delivery_date: params.variables?.delivery_date || '',
    ...params.variables
  };

  subject = interpolate(subject, templateVars);
  body = interpolate(body, templateVars);

  // 5. Initialize Provider & Decrypt Credentials
  const provider = new providerDef.klass();
  let providerConfig: any = {};

  const { data: dbConfig } = await supabase
    .from('communication_provider_configs')
    .select('*')
    .eq('provider_id', providerDef.providerId)
    .maybeSingle();

  if (dbConfig) {
    try {
      const secretRaw = decrypt(dbConfig.encrypted_secret);
      providerConfig = secretRaw ? JSON.parse(secretRaw) : {};
    } catch (e) {
      console.error('[COMM_ENGINE] Failed to parse decrypted credentials. Falling back to sandbox.');
    }
    providerConfig = { ...providerConfig, ...dbConfig.public_config };
  }

  await provider.connect(providerConfig);

  // 6. Write message to database (ledger created status)
  const { data: dbMessage, error: insertErr } = await supabase
    .from('communication_messages')
    .insert({
      customer_id: customer?.id || null,
      contact_value: resolvedContactValue || 'push-device',
      channel: params.channel,
      provider: providerDef.providerId,
      campaign_id: params.campaignId || null,
      template_id: templateIdResolved,
      subject: subject || null,
      body: body,
      status: 'created'
    })
    .select('*')
    .single();

  if (insertErr || !dbMessage) {
    return { providerMessageId: '', status: 'failed', error: `Database insert failed: ${insertErr?.message}` };
  }

  // Log "created" event
  await logCommEvent(dbMessage.id, 'created', { initiated_at: new Date().toISOString() });

  // 7. Dispatch Message
  await logCommEvent(dbMessage.id, 'queued');
  await supabase
    .from('communication_messages')
    .update({ status: 'queued' })
    .eq('id', dbMessage.id);

  const sendResponse = await provider.send({
    to: resolvedContactValue || 'push-device',
    subject,
    body,
    variables: templateVars,
    metadata: params.metadata
  });

  const durationMs = Date.now() - startTime;

  // 8. Update message delivery outcome
  const updatePayload = {
    status: sendResponse.status,
    provider_response: sendResponse.rawResponse || {},
    error_message: sendResponse.error || null,
    duration_ms: durationMs,
    updated_at: new Date().toISOString()
  };

  await supabase
    .from('communication_messages')
    .update(updatePayload)
    .eq('id', dbMessage.id);

  await logCommEvent(dbMessage.id, sendResponse.status, {
    error: sendResponse.error,
    duration_ms: durationMs
  });

  // Log delivery attempt details
  await supabase
    .from('communication_delivery_logs')
    .insert({
      message_id: dbMessage.id,
      status: sendResponse.status,
      error: sendResponse.error || null,
      response_payload: sendResponse.rawResponse || {}
    });

  // 9. Update Inbox Conversations Thread
  if (customer) {
    await supabase
      .from('communication_conversations')
      .upsert({
        customer_id: customer.id,
        last_message_at: new Date().toISOString(),
        unread_count: 0 // sending admin message resets unread counts
      }, { onConflict: 'customer_id' });
  }

  return sendResponse;
}

/**
 * Variable interpolator helper
 */
export function interpolate(text: string, variables: Record<string, string>): string {
  if (!text) return '';
  let result = text;
  for (const [key, val] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), val || '');
  }
  return result;
}

/**
 * Event logger helper
 */
async function logCommEvent(messageId: string, eventName: MessageStatus | 'retry', metadata: any = {}) {
  const supabase = createAdminClient();
  // Safe cast event name to supported database column checks
  const allowedEvents = ['created', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'retry'];
  if (!allowedEvents.includes(eventName)) return;

  await supabase
    .from('communication_events')
    .insert({
      message_id: messageId,
      event_name: eventName,
      metadata
    });
}
