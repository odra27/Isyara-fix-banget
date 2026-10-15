# Matikan semua server dev ISYARA (backend :8000, landing :5173, app :5174),
# termasuk proses yang tertinggal di latar belakang. Pemakaian: .\stop-dev.ps1 atau klik stop-dev.cmd
$root = $PSScriptRoot
$procs = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='node.exe'")
$ids = @($procs | Where-Object {
        ($_.Name -eq 'python.exe' -and $_.CommandLine -match 'serve\.py|uvicorn app\.main:app') -or
        ($_.Name -eq 'node.exe' -and $_.CommandLine -like "*$root*" -and $_.CommandLine -match 'vite')
    } | ForEach-Object { $_.ProcessId })
# anak proses (reloader/worker uvicorn)
do {
    $kids = @($procs | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId })
    $ids += @($kids | ForEach-Object { $_.ProcessId })
} while ($kids.Count -gt 0)

if ($ids.Count -eq 0) { Write-Host 'Tidak ada server ISYARA yang berjalan.' }
else {
    Write-Host "Mematikan $($ids.Count) proses server..." -ForegroundColor Yellow
    $ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
foreach ($p in 8000, 5173, 5174) {
    if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) {
        Write-Host "port $p masih dipakai program lain" -ForegroundColor Red
    } else {
        Write-Host "port $p bebas" -ForegroundColor Green
    }
}
