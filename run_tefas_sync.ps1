# MarketPulse TEFAS Funds Dedicated Automated Runner
# Synchronizes official NAV quotes for all 75 TEFAS funds to Supabase

$ErrorActionPreference = "Continue"
$projectRoot = "C:\Users\elif\.gemini\antigravity\scratch\market-pulse"
$pythonExe = Join-Path $projectRoot "backend\.venv\Scripts\python.exe"
$scriptPath = Join-Path $projectRoot "scripts\sync_tefas_funds.py"
$logFile = Join-Path $projectRoot "scheduler.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "`n============================================================"
Add-Content -Path $logFile -Value "[$timestamp] Starting TEFAS Funds Automated Synchronization..."

$env:PYTHONIOENCODING = "utf-8"

try {
    & $pythonExe $scriptPath *>> $logFile
    $endTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$endTimestamp] TEFAS Funds Automated Synchronization finished successfully."
} catch {
    $errTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$errTimestamp] ERROR during TEFAS execution: $_"
}
