# MarketPulse Automated Scheduled Runner
# Executes export_to_spreadsheet.py (which generates MarketPulse_Latest.xlsx AND syncs to Supabase)

$ErrorActionPreference = "Continue"
$projectRoot = "C:\Users\elif\.gemini\antigravity\scratch\market-pulse"
$pythonExe = Join-Path $projectRoot "backend\.venv\Scripts\python.exe"
$scriptPath = Join-Path $projectRoot "export_to_spreadsheet.py"
$logFile = Join-Path $projectRoot "scheduler.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "`n============================================================"
Add-Content -Path $logFile -Value "[$timestamp] Starting MarketPulse automated sync run..."

# Ensure UTF-8 output
$env:PYTHONIOENCODING = "utf-8"

try {
    # Run the export and sync script
    & $pythonExe $scriptPath *>> $logFile
    $endTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$endTimestamp] MarketPulse automated run finished successfully."
} catch {
    $errTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$errTimestamp] ERROR during execution: $_"
}
