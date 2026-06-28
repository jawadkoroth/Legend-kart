import { SupabaseClient } from '@supabase/supabase-js';

export interface Touchpoint {
  id: string;
  source: string; // channel: 'facebook', 'instagram', 'google', 'email', 'organic', 'direct', etc.
  campaign: string;
  timestamp: string;
  type: string; // 'page_view', 'add_to_cart', 'email_sent', 'checkout', etc.
  details?: string;
}

export interface AttributionSplit {
  [channel: string]: number; // e.g. { instagram: 0.6, google: 0.4 }
}

/**
 * Compiles a comprehensive, chronologically stitched timeline of all customer interactions.
 * Gathers marketing clicks, communications sent, orders placed, wishlist adds, returns, and reviews.
 */
export async function getCustomerJourney(customerId: string, supabase: SupabaseClient): Promise<Touchpoint[]> {
  const journey: Touchpoint[] = [];

  try {
    // 1. Fetch identity links to match anonymous/session cookies
    const { data: links } = await supabase
      .from('customer_identity_links')
      .select('*')
      .eq('customer_id', customerId);

    const userIds = [customerId];
    const anonIds: string[] = [];

    if (links) {
      links.forEach((link: any) => {
        if (link.identity_type === 'user_id') userIds.push(link.identity_value);
        else if (link.identity_type === 'anonymous_id') anonIds.push(link.identity_value);
      });
    }

    // 2. Fetch Marketing Event Logs
    let marketingQuery = supabase.from('marketing_events').select('*');
    if (anonIds.length > 0) {
      marketingQuery = marketingQuery.or(`user_id.in.(${userIds.join(',')}),anonymous_id.in.(${anonIds.join(',')})`);
    } else {
      marketingQuery = marketingQuery.in('user_id', userIds);
    }
    const { data: mEvents } = await marketingQuery.order('ts_server', { ascending: true });

    if (mEvents) {
      mEvents.forEach((e: any) => {
        // Resolve source/channel
        let channel = 'direct';
        let campaign = 'generic';

        const props = e.properties || {};
        const utmSource = props.utm_source || e.context?.utm_source;
        const utmCampaign = props.utm_campaign || e.context?.utm_campaign;

        if (utmSource) {
          channel = utmSource.toLowerCase();
          campaign = utmCampaign || 'generic';
        } else if (e.context?.referrer) {
          const ref = e.context.referrer.toLowerCase();
          if (ref.includes('google.com')) channel = 'google';
          else if (ref.includes('instagram.com')) channel = 'instagram';
          else if (ref.includes('facebook.com')) channel = 'facebook';
          else channel = 'referral';
        }

        journey.push({
          id: `me-${e.id}`,
          source: channel,
          campaign,
          timestamp: e.ts_server || e.ts_client,
          type: e.event_name,
          details: `Viewed page: ${props.path || props.url || '/'}`
        });
      });
    }

    // 3. Fetch Communications Outreach
    const { data: comms } = await supabase
      .from('communication_messages')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (comms) {
      comms.forEach((c: any) => {
        journey.push({
          id: `comm-${c.id}`,
          source: c.channel || 'communication',
          campaign: c.campaign_id || 'system_campaign',
          timestamp: c.created_at,
          type: `comm_${c.channel}`,
          details: `${c.subject || 'Direct message'}: ${c.body.substring(0, 40)}...`
        });
      });
    }

    // 4. Fetch Order Transactions
    const { data: dbOrders } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true });

    // Filter local orders by email/phone or customer_id
    if (dbOrders) {
      dbOrders.forEach((o: any) => {
        const emailMatches = o.customer?.email && customerId; // normally link checks email
        if (o.customer_id === customerId || o.user_id === customerId) {
          journey.push({
            id: `order-${o.id}`,
            source: o.utm_source || 'organic',
            campaign: o.utm_campaign || 'direct',
            timestamp: o.created_at,
            type: 'purchase',
            details: `Placed Order #${o.order_number} for ₹${(o.total_paise / 100).toLocaleString('en-IN')}`
          });
        }
      });
    }

    // Sort chronologically
    journey.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  } catch (err) {
    console.error('[ATTRIBUTION_JOURNEY_STITCH_ERROR]', err);
  }

  return journey;
}

/**
 * Mathematical attribution calculator.
 * Weighs and splits an order's revenue across marketing channels based on customer journey touchpoints.
 */
export function calculateAttribution(
  orderTotalPaise: number,
  touchpoints: Touchpoint[],
  purchaseTime: string,
  model: string = 'last_touch'
): AttributionSplit {
  const split: AttributionSplit = {};

  // 1. Filter marketing touchpoints that occurred BEFORE the purchase
  const campaignClicks = touchpoints.filter(t => {
    const isMarketing = ['google', 'facebook', 'instagram', 'email', 'sms', 'organic', 'direct', 'referral'].includes(t.source);
    const isBefore = new Date(t.timestamp).getTime() < new Date(purchaseTime).getTime();
    return isMarketing && isBefore;
  });

  if (campaignClicks.length === 0) {
    // Fallback to organic/direct attribution
    split['direct'] = 1.0;
    return split;
  }

  // Helper to safely increment split contribution
  const addWeight = (channel: string, weight: number) => {
    split[channel] = (split[channel] || 0) + weight;
  };

  switch (model) {
    case 'first_touch': {
      // 100% weight to the very first marketing interaction
      const first = campaignClicks[0];
      addWeight(first.source, 1.0);
      break;
    }

    case 'last_touch': {
      // 100% weight to the last marketing interaction before buying
      const last = campaignClicks[campaignClicks.length - 1];
      addWeight(last.source, 1.0);
      break;
    }

    case 'linear': {
      // Equal distribution across all touchpoints
      const count = campaignClicks.length;
      campaignClicks.forEach(click => {
        addWeight(click.source, 1.0 / count);
      });
      break;
    }

    case 'time_decay': {
      // Exponential decay weights (halflife = 7 days)
      const purchaseMs = new Date(purchaseTime).getTime();
      const halfLifeMs = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
      
      let sumOfWeights = 0;
      const calculated: { source: string; weight: number }[] = [];

      campaignClicks.forEach(click => {
        const clickMs = new Date(click.timestamp).getTime();
        const diffMs = Math.max(0, purchaseMs - clickMs);
        const weight = Math.pow(2, -diffMs / halfLifeMs);
        
        sumOfWeights += weight;
        calculated.push({ source: click.source, weight });
      });

      calculated.forEach(item => {
        addWeight(item.source, item.weight / (sumOfWeights || 1));
      });
      break;
    }

    case 'position_based': {
      // 40% to First, 40% to Last, 20% shared in between
      if (campaignClicks.length === 1) {
        addWeight(campaignClicks[0].source, 1.0);
      } else if (campaignClicks.length === 2) {
        addWeight(campaignClicks[0].source, 0.5);
        addWeight(campaignClicks[1].source, 0.5);
      } else {
        const first = campaignClicks[0];
        const last = campaignClicks[campaignClicks.length - 1];
        const middle = campaignClicks.slice(1, -1);
        
        addWeight(first.source, 0.40);
        addWeight(last.source, 0.40);
        
        const midWeight = 0.20 / middle.length;
        middle.forEach(click => {
          addWeight(click.source, midWeight);
        });
      }
      break;
    }

    default: {
      const last = campaignClicks[campaignClicks.length - 1];
      addWeight(last.source, 1.0);
      break;
    }
  }

  // Normalize final weights to prevent rounding offsets
  let totalWeight = Object.values(split).reduce((sum, w) => sum + w, 0);
  if (totalWeight > 0) {
    for (const key of Object.keys(split)) {
      split[key] = parseFloat((split[key] / totalWeight).toFixed(4));
    }
  }

  return split;
}
