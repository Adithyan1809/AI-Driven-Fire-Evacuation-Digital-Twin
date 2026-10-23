# AI-Driven Fire Evacuation Digital Twin — Launcher
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "   AI-Driven Fire Evacuation Digital Twin" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ──────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$nodeVer = node -v
Write-Host "  [OK] Node.js $nodeVer" -ForegroundColor Green

# ── Copy .env if missing ───────────────────────────────────────
$envFile    = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "  [INFO] .env created from .env.example" -ForegroundColor Yellow
    Write-Host "         Add your GEMINI_API_KEY to enable Gemini AI features." -ForegroundColor Yellow
}

# ── Install backend dependencies if missing ────────────────────
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "  [INFO] Installing backend dependencies..." -ForegroundColor Yellow
    Push-Location $Root
    npm install
    Pop-Location
}

# ── Install client dependencies if missing ────────────────────
$clientDir = Join-Path $Root "client"
if (-not (Test-Path (Join-Path $clientDir "node_modules"))) {
    Write-Host "  [INFO] Installing React client dependencies..." -ForegroundColor Yellow
    Push-Location $clientDir
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "  Starting servers..." -ForegroundColor Green
Write-Host ""

# ── Launch Backend (port 8080) ─────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle = 'Backend [port 8080]'; node server.js"

Start-Sleep -Seconds 3

# ── Launch React Client (Vite, port 5173) ─────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$clientDir'; `$Host.UI.RawUI.WindowTitle = 'React Client [port 5173]'; npm run dev"

Start-Sleep -Seconds 4

# ── Open Browser ───────────────────────────────────────────────
Write-Host "  Opening http://localhost:8080 ..." -ForegroundColor Green
Start-Process "http://localhost:8080"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "   Backend  ->  http://localhost:8080   (main dashboard)" -ForegroundColor White
Write-Host "   React UI ->  http://localhost:5173   (modern client)" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Both servers are running in their own windows." -ForegroundColor Gray
Write-Host "  Close those windows to stop the servers." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close this launcher"
