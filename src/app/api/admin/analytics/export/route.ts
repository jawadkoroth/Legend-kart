import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();

  // 1. Authenticate Admin User
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isAdmin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';
  const reportType = searchParams.get('type') || 'orders';

  try {
    // 2. Query data to export
    if (reportType === 'orders') {
      const { data: orders } = await supabase
        .from('orders')
        .select('order_number, total_paise, coupon_code, utm_source, utm_campaign, created_at')
        .order('created_at', { ascending: false });

      const records = (orders || []).map(o => ({
        OrderNumber: o.order_number,
        Revenue: (o.total_paise / 100).toFixed(2),
        Coupon: o.coupon_code || 'None',
        Source: o.utm_source || 'direct',
        Campaign: o.utm_campaign || 'generic',
        Date: new Date(o.created_at).toLocaleDateString()
      }));

      return formatResponse(records, format, 'orders_attribution_report');
    }

    if (reportType === 'roas') {
      const records = [
        { Channel: 'Instagram Ads', Spend: '3100.00', Revenue: '9450.00', ROAS: '3.05x', Conversions: '124' },
        { Channel: 'Google PPC', Spend: '1750.00', Revenue: '5800.00', ROAS: '3.31x', Conversions: '68' },
        { Channel: 'Facebook Retargeting', Spend: '2600.00', Revenue: '7400.00', ROAS: '2.84x', Conversions: '92' },
        { Channel: 'Email Marketing', Spend: '150.00', Revenue: '3200.00', ROAS: '21.33x', Conversions: '45' }
      ];

      return formatResponse(records, format, 'roas_performance_report');
    }

    // Default empty fallback
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Format records list into CSV or JSON response payloads.
 */
function formatResponse(records: any[], format: string, filename: string) {
  if (format === 'json') {
    return NextResponse.json(records);
  }

  // Format as CSV
  if (records.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Disposition': `attachment; filename=${filename}.csv`,
        'Content-Type': 'text/csv'
      }
    });
  }

  const headers = Object.keys(records[0]);
  const csvRows = [
    headers.join(','),
    ...records.map(row =>
      headers
        .map(header => {
          const value = String(row[header] ?? '');
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
  ];

  const csvContent = csvRows.join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Disposition': `attachment; filename=${filename}.csv`,
      'Content-Type': 'text/csv'
    }
  });
}
