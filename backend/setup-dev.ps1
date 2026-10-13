# Setup sekali: venv Python 3.12 + dependency backend + library model ml/ (runtime saja, tanpa torch/mediapipe).
# Pemakaian (dari folder Backend):  .\setup-dev.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path .venv\Scripts\python.exe)) {
    $py = "$env:LOCALAPPDATA\Microsoft\WindowsApps\py.exe"
    if (-not (Test-Path $py)) { $py = 'py' }
    try { & $py install 3.12 -y | Out-Null } catch { }   # Python install manager; aman bila sudah ada
    & $py -V:3.12 -m venv .venv
}
$pip = '.\.venv\Scripts\python.exe'
& $pip -m pip install -q -e ".[test]"
# Versi sama dengan ml/requirements.txt (hanya yang dipakai Predictor saat inferensi).
& $pip -m pip install -q numpy==2.2.6 onnxruntime==1.23.2 scikit-learn==1.7.2 pyyaml==6.0.3 matplotlib==3.10.6
& $pip -m pip install -q --no-deps -e ..\ml
& $pip -c "from bisindo.predict import Predictor; p = Predictor(); print('Model', p.version, '-', len(p.vocabulary()), 'kata')"
