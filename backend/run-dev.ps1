# Jalankan backend lokal: muat Backend/.env (bila ada) ke environment, lalu start uvicorn.
# Pemakaian (dari folder Backend):  .\run-dev.ps1
# Backend tidak membaca file .env sendiri, jadi skrip ini yang memuatnya.
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
    # Tanpa Supabase: pakai database in-memory (32 frasa dari Database/migrations + 1 device demo).
    $env:LOCAL_DEV_DB = '1'
}
if ($env:LOCAL_DEV_DB -eq '1') {
    Write-Host "Mode DB lokal (in-memory). Login petugas asli butuh Supabase: isi Backend/.env dari .env.example." -ForegroundColor Yellow
}

# Library model (ml/) harus terpasang di venv ini.
& "$PSScriptRoot\.venv\Scripts\python.exe" -c "import bisindo.predict" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Library model belum terpasang. Jalankan: .\setup-dev.ps1" -ForegroundColor Red
    exit 1
}

& "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
