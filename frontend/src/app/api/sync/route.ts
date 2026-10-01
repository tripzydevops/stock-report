import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({ action: 'refresh' }));
    const action = body.action || 'refresh';

    // If requested to trigger a full cloud crawler via GitHub Actions workflow dispatch
    if (action === 'cloud_crawl') {
      const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO || 'tripzydevops/stock-report';
      const workflowId = 'market_pulse_cron.yml';

      if (!githubToken) {
        return NextResponse.json({
          success: true,
          dispatched: false,
          message: 'Instant database refresh completed. (To enable on-demand GitHub Actions crawler runs from Vercel, set GITHUB_PAT in project environment variables).'
        });
      }

      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          success: false,
          dispatched: false,
          message: `GitHub Actions dispatch returned ${res.status}: ${errText}`
        });
      }

      return NextResponse.json({
        success: true,
        dispatched: true,
        message: 'Cloud Sync dispatched! GitHub Actions crawler is updating live prices.'
      });
    }

    return NextResponse.json({
      success: true,
      dispatched: false,
      message: 'Instant data refresh ready.'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
