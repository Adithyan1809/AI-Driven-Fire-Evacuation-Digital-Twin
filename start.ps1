# AI-Driven Fire Evacuation Digital Twin — Windows Desktop Launcher
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "   AI-Driven Fire Evacuation Digital Twin (Windows App)" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ──────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$nodeVer = node -v
Write-Host "  [OK] Node.js $nodeVer detected" -ForegroundColor Green

# ── Copy .env if missing ───────────────────────────────────────
$envFile    = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "  [INFO] .env initialized from .env.example" -ForegroundColor Yellow
}

# ── Launch Desktop App via Electron ───────────────────────────
Write-Host "  Starting Desktop Application..." -ForegroundColor Cyan

$electronBin = Join-Path $Root "node_modules\.bin\electron.cmd"
if (Test-Path $electronBin) {
    Push-Location $Root
    & $electronBin "electron/main.cjs"
    Pop-Location
} else {
    Write-Host "  [FALLBACK] Starting Digital Twin Server..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle = 'Digital Twin Server'; node server.js"
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8080"
}
