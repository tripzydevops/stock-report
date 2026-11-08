import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabaseServer';

const supabase = getAdminSupabase();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('report_type') || 'marketpulse_daily';
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    let query = supabase
      .from('report_files')
      .select('*')
      .eq('report_type', reportType);

    if (fromDate) {
      query = query.gte('trading_date', fromDate);
    }
    if (toDate) {
      query = query.lte('trading_date', toDate);
    }

    query = query
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reportsWithUrls = await Promise.all(
      (data || []).map(async (item) => {
        const { data: signedData } = await supabase.storage
          .from('marketpulse-reports')
          .createSignedUrl(item.storage_path, 3600);

        return {
          ...item,
          download_url: signedData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json(reportsWithUrls);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
