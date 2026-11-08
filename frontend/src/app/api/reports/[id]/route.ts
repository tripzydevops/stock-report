import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabaseServer';

const supabase = getAdminSupabase();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('report_files')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: `Report '${id}' not found` }, { status: 404 });
    }

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
