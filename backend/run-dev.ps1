# Jalankan backend lokal: muat Backend/.env (bila ada) ke environment, lalu start uvicorn.
# Pemakaian (dari folder backend):  .\run-dev.ps1          (normal, paling stabil)
#                                   .\run-dev.ps1 -Reload  (restart otomatis saat file .py berubah)
# Backend tidak membaca file .env sendiri, jadi skrip ini yang memuatnya.
# Biarkan jendela ini terbuka selama dipakai. Tutup jendela / Ctrl+C = server mati.
param([switch]$Reload)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
        $i = $t.IndexOf('=')
        $key = $t.Substring(0, $i).Trim()
        $val = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
        Set-Item -Path "Env:$key" -Value $val
    }
    Write-Host "Memuat variabel dari .env"
}
if (-not $env:DATABASE_URL -and -not $env:LOCAL_DEV_DB) {
    # Tanpa Supabase: pakai database in-memory (frasa dari Database/migrations + 1 device demo).
    $env:LOCAL_DEV_DB = '1'
}
if ($env:LOCAL_DEV_DB -eq '1') {
    Write-Host "Mode DB lokal (in-memory). Login siswa & chat butuh Supabase: isi backend/.env dari .env.example." -ForegroundColor Yellow
}

$py = "$PSScriptRoot\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Venv belum ada. Jalankan dulu: .\setup-dev.ps1" -ForegroundColor Red
    exit 1
}
# Library model (ml/) harus terpasang di venv ini.
& $py -c "import bisindo.predict" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Library model belum terpasang. Jalankan: .\setup-dev.ps1" -ForegroundColor Red
    exit 1
}

# Server lama yang masih tertinggal (jendela ditutup paksa, run sebelumnya) tetap memegang port 8000
# dan membuat server baru tidak terpakai atau mati sendiri. Matikan dulu sebelum mulai.
$procs = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'")
$roots = @($procs | Where-Object { $_.CommandLine -match 'uvicorn app\.main:app' -or $_.CommandLine -match 'serve\.py' })
$ids = @($roots | ForEach-Object { $_.ProcessId })
# anak proses uvicorn (reloader/worker), dicari turun-temurun
do {
    $kids = @($procs | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId })
    $ids += @($kids | ForEach-Object { $_.ProcessId })
} while ($kids.Count -gt 0)
$old = @($procs | Where-Object { $ids -contains $_.ProcessId })
if ($old.Count -gt 0) {
    Write-Host "Mematikan server backend lama yang masih berjalan ($(@($old).Count) proses)..." -ForegroundColor Yellow
    $old | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
$busy = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
if ($busy) {
    $who = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Port 8000 dipakai program lain ($who, PID $($busy[0].OwningProcess)). Tutup program itu lalu jalankan lagi." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Menyalakan backend di http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Write-Host "Tunggu sampai muncul 'Application startup complete' (sekitar 30 detik, model isyarat dimuat dulu)." -ForegroundColor Cyan
Write-Host "Jangan tutup jendela ini selama aplikasi dipakai." -ForegroundColor Cyan
Write-Host ""

# serve.py menjalankan uvicorn di SelectorEventLoop (wajib untuk psycopg async di Windows).
# -Reload memakai reloader uvicorn (subprocess, juga Selector loop).
if ($Reload) {
    & $py -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} else {
    & $py serve.py --host 127.0.0.1 --port 8000
}
