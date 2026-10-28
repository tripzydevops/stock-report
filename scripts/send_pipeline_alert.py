"""
MarketPulse Automated Pipeline Failure Alert Notifier.
Dispatches critical pipeline failure notifications to Discord, Slack, or Telegram webhooks.
"""

import os
import sys
import argparse
import json
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

try:
    import httpx
except ImportError:
    httpx = None


def send_discord_alert(webhook_url: str, title: str, description: str, run_url: str) -> bool:
    if not httpx:
        return False
    payload = {
        "username": "MarketPulse Ops Alert",
        "avatar_url": "https://img.icons8.com/color/96/warning-shield.png",
        "embeds": [
            {
                "title": f"🚨 {title}",
                "description": description,
                "url": run_url,
                "color": 15158332,  # Crimson red
                "fields": [
                    {"name": "Triggered At (UTC)", "value": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "inline": True},
                    {"name": "GitHub Actions Run", "value": f"[View Failure Run Logs]({run_url})", "inline": True},
                ],
                "footer": {"text": "Tripzy MarketPulse Automated Monitoring"}
            }
        ]
    }
    try:
        res = httpx.post(webhook_url, json=payload, timeout=10.0)
        return res.status_code in [200, 204]
    except Exception as e:
        print(f"⚠️ Discord alert dispatch error: {e}")
        return False


def send_slack_alert(webhook_url: str, title: str, description: str, run_url: str) -> bool:
    if not httpx:
        return False
    payload = {
        "text": f"🚨 *{title}*\n{description}\n🔗 <{run_url}|View GitHub Actions Run Logs>",
    }
    try:
        res = httpx.post(webhook_url, json=payload, timeout=10.0)
        return res.status_code == 200
    except Exception as e:
        print(f"⚠️ Slack alert dispatch error: {e}")
        return False


def send_telegram_alert(bot_token: str, chat_id: str, title: str, description: str, run_url: str) -> bool:
    if not httpx:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    text = (
        f"🚨 <b>{title}</b>\n\n"
        f"{description}\n\n"
        f"🔗 <a href='{run_url}'>View GitHub Actions Run Logs</a>"
    )
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    try:
        res = httpx.post(url, json=payload, timeout=10.0)
        return res.status_code == 200
    except Exception as e:
        print(f"⚠️ Telegram alert dispatch error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Send pipeline alert to webhooks")
    parser.add_argument("--workflow", required=True, help="Workflow name")
    parser.add_argument("--run-id", required=True, help="GitHub Actions run ID")
    parser.add_argument("--repo", required=True, help="GitHub repository (owner/repo)")
    parser.add_argument("--details", default="Market data extraction, Supabase sync, or health check failed.", help="Error details")
    args = parser.parse_args()

    run_url = f"https://github.com/{args.repo}/actions/runs/{args.run_id}"
    title = f"Pipeline Failure: {args.workflow}"
    desc = f"⚠️ Critical failure occurred in `{args.workflow}`.\n**Details:** {args.details}"

    discord_url = os.getenv("DISCORD_WEBHOOK_URL")
    slack_url = os.getenv("SLACK_WEBHOOK_URL")
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN")
    tg_chat_id = os.getenv("TELEGRAM_CHAT_ID")

    sent = False

    if discord_url:
        print("📢 Dispatching alert to Discord webhook...")
        if send_discord_alert(discord_url, title, desc, run_url):
            print("  ✓ Discord notification sent successfully.")
            sent = True

    if slack_url:
        print("📢 Dispatching alert to Slack webhook...")
        if send_slack_alert(slack_url, title, desc, run_url):
            print("  ✓ Slack notification sent successfully.")
            sent = True

    if tg_token and tg_chat_id:
        print("📢 Dispatching alert to Telegram chat...")
        if send_telegram_alert(tg_token, tg_chat_id, title, desc, run_url):
            print("  ✓ Telegram notification sent successfully.")
            sent = True

    if not sent:
        print("ℹ️ No active webhook alert credentials detected (DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL, or TELEGRAM_BOT_TOKEN).")
        print("ℹ️ Standard GitHub email notifications will inform repository administrators of workflow status.")


if __name__ == "__main__":
    main()
