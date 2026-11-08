import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabaseServer';

const supabase = getAdminSupabase();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('report_type') || 'marketpulse_daily';

    const { data, error } = await supabase
      .from('report_files')
      .select('*')
      .eq('report_type', reportType)
      .eq('is_latest', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: `No report found for type '${reportType}'` }, { status: 404 });
    }

    // Generate short-lived signed URL (60 minutes)
    const { data: signedData } = await supabase.storage
      .from('marketpulse-reports')
      .createSignedUrl(data.storage_path, 3600);

    return NextResponse.json({
      ...data,
      download_url: signedData?.signedUrl || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
