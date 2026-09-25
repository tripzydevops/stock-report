"""
Automated GitHub Repository Creator and Initial Push for MarketPulse
Uses local Git Credential Manager OAuth token for tripzydevops.
"""
import subprocess
import httpx
import sys

def get_github_token():
    p = subprocess.Popen(
        ['git', 'credential', 'fill'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    out, err = p.communicate('protocol=https\nhost=github.com\n\n')
    for line in out.splitlines():
        if line.startswith('password='):
            return line.replace('password=', '').strip()
    return None

def create_and_push():
    token = get_github_token()
    if not token:
        print("❌ Could not retrieve GitHub token from Git Credential Manager.")
        sys.exit(1)
        
    print("🔑 Retrieved GitHub OAuth token for tripzydevops.")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MarketPulse-Setup"
    }
    
    repo_name = "market-pulse"
    print(f"📦 Creating new GitHub repository: tripzydevops/{repo_name}...")
    
    payload = {
        "name": repo_name,
        "description": "MarketPulse - Autonomous Market Intelligence & Trade Discovery Platform (BIST 100 & US)",
        "private": False, # Public repo for free unlimited GitHub Actions minutes
        "has_issues": True,
        "has_projects": True,
        "has_wiki": True
    }
    
    r = httpx.post("https://api.github.com/user/repos", headers=headers, json=payload)
    
    if r.status_code == 201:
        print(f"🎉 Successfully created repository: {r.json().get('html_url')}")
    elif r.status_code == 422:
        print(f"ℹ️ Repository {repo_name} already exists on GitHub.")
    else:
        print(f"⚠️ GitHub API returned status {r.status_code}: {r.text}")
        
    # Configure git remote
    remote_url = f"https://github.com/tripzydevops/{repo_name}.git"
    print(f"🔗 Setting remote origin to {remote_url}...")
    
    subprocess.run(["git", "remote", "remove", "origin"], check=False)
    subprocess.run(["git", "remote", "add", "origin", remote_url], check=True)
    
    # Push to GitHub
    print("🚀 Pushing master branch to GitHub...")
    push_res = subprocess.run(["git", "push", "-u", "origin", "master"], capture_output=True, text=True)
    
    print("STDOUT:", push_res.stdout)
    print("STDERR:", push_res.stderr)
    
    if push_res.returncode == 0:
        print(f"\n✅ REPOSITORY IS LIVE AT: https://github.com/tripzydevops/{repo_name}")
    else:
        print("❌ Push failed:", push_res.stderr)

if __name__ == "__main__":
    create_and_push()
