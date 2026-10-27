import subprocess
import httpx

p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
out, _ = p.communicate('protocol=https\nhost=github.com\n\n')
token = [l for l in out.splitlines() if l.startswith('password=')][0].replace('password=', '').strip()

r = httpx.get(
    'https://api.github.com/repos/tripzydevops/stock-report/actions/runs',
    headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github.v3+json'}
)
runs = r.json().get('workflow_runs', [])
for run in runs[:3]:
    print(f"Run ID: {run.get('id')}")
    print(f"Status: {run.get('status')}")
    print(f"Conclusion: {run.get('conclusion')}")
    print(f"URL: {run.get('html_url')}")
    print("-" * 50)
