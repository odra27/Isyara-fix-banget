# Jalankan semua server dev ISYARA sekaligus, masing-masing di jendela PowerShell sendiri.
# Pemakaian (dari root repo):  .\start-dev.ps1
#   Backend  -> http://127.0.0.1:8000  (backend\run-dev.ps1, memuat backend\.env)
#   Landing  -> http://localhost:5173  (Frontend\landing page)
#   App      -> http://localhost:5174  (Frontend\main, /api diproksikan ke backend)
# Tutup jendelanya (atau Ctrl+C di tiap jendela) untuk mematikan server.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$apps = @(
    @{ Name = 'backend :8000'; Dir = Join-Path $root 'backend';               Cmd = '.\run-dev.ps1' },
    @{ Name = 'landing :5173'; Dir = Join-Path $root 'Frontend\landing page'; Cmd = 'npm run dev' },
    @{ Name = 'app :5174';     Dir = Join-Path $root 'Frontend\main';         Cmd = 'npm run dev' }
)

# Pasang dependency bila belum ada (sekali saja).
if (-not (Test-Path (Join-Path $root 'backend\.venv\Scripts\python.exe'))) {
    Write-Host 'Venv backend belum ada, menjalankan setup-dev.ps1...' -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backend\setup-dev.ps1')
}
foreach ($fe in 'Frontend\landing page', 'Frontend\main') {
    $dir = Join-Path $root $fe
    if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
        Write-Host "node_modules belum ada di $fe, menjalankan npm ci..." -ForegroundColor Yellow
        Push-Location $dir; try { npm ci } finally { Pop-Location }
    }
}

# Server FE lama (vite dari run sebelumnya) masih memegang port 5173/5174 → server baru gagal start.
# Matikan dulu (hanya vite di repo ini). Backend lama dimatikan oleh backend\run-dev.ps1 sendiri.
$oldVite = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$root*" -and $_.CommandLine -match 'vite' }
if ($oldVite) {
    Write-Host "Mematikan server FE lama ($(@($oldVite).Count) proses)..." -ForegroundColor Yellow
    $oldVite | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

foreach ($a in $apps) {
    $title = "ISYARA $($a.Name)"
    $inner = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$($a.Dir)'; $($a.Cmd)"
    Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $inner
}

Write-Host ''
Write-Host 'Server dibuka di 3 jendela baru. Backend butuh ~30 detik untuk memuat model.' -ForegroundColor Green
Write-Host '  Landing : http://localhost:5173'
Write-Host '  App     : http://localhost:5174'
