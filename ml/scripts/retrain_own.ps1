# Retrain the 32-word model with own live recordings (data/manifest_own.csv, from live_demo.py --record).
# Usage (from ml/):  powershell -ExecutionPolicy Bypass -File scripts\retrain_own.ps1
# Takes ~50 min on CPU: LOSO (~15) + hidden-words LOSO (~12) + calibrate + final 3 seeds (~20) + export.
# The current artifacts/ are backed up first to runs/artifacts_backup_<time>/ (restore = copy back).
$ErrorActionPreference = "Stop"
$py = ".venv\Scripts\python.exe"

if (-not (Test-Path "data\manifest_own.csv")) { throw "data\manifest_own.csv not found - record first (live_demo.py --record 5)" }
$own = & $py -c "import pandas as pd; m=pd.read_csv('data/manifest_own.csv'); print(','.join(map(str, sorted(m.signer.unique()))))"
& $py -c "import pandas as pd; m=pd.read_csv('data/manifest_own.csv'); print(m.groupby('signer').label.agg(['count','nunique']).rename(columns={'count':'clips','nunique':'words'}))"
$signers = "[1,2,3,4,$own]"
Write-Host "LOSO signers: $signers"

$ts = Get-Date -Format "yyyyMMdd-HHmm"
Copy-Item -Recurse artifacts "runs\artifacts_backup_$ts"
Write-Host "artifacts backed up to runs\artifacts_backup_$ts"

function Run($argsList, $log) {
    Write-Host ">> python $($argsList -join ' ')"
    & $py @argsList 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw "failed: $($argsList -join ' ') (see $log)" }
}

Run @("-m", "bisindo.train", "--name", "gru_own", "--set", "eval.loso_signers=$signers") "runs\gru_own.log"
Run @("-m", "bisindo.train", "--name", "gru_own_hidden", "--hidden-labels", "--set", "eval.loso_signers=$signers") "runs\gru_own_hidden.log"
Run @("-m", "bisindo.calibrate", "--run", "runs\gru_own", "--hidden-run", "runs\gru_own_hidden") "runs\calib_own.log"
Run @("-m", "bisindo.train", "--name", "final_own", "--final") "runs\final_own.log"
Run @("-m", "bisindo.export", "--run", "runs\final_own") "runs\export_own.log"
Run @("-m", "bisindo.compare", "gru_base", "gru_own") "runs\compare_own.log"
& $py -m pytest tests\test_predict.py -q -p no:warnings
Write-Host "done. Test live: $py scripts\live_demo.py --target 0"
