# Generates one spoken WAV per vocabulary word with the Windows Indonesian voice (Microsoft Andika, id-ID).
# Offline: uses the built-in Windows.Media.SpeechSynthesis engine, nothing is sent over the network.
#
# Usage (from ml/, Windows PowerShell 5.1):
#     powershell -ExecutionPolicy Bypass -File scripts\generate_audio.ps1
# Output: artifacts/audio/label_XX.wav + artifacts/audio/index.json
param(
    [string]$LabelMap = "$PSScriptRoot\..\artifacts\label_map.json",
    [string]$OutDir = "$PSScriptRoot\..\artifacts\audio",
    [string]$Voice = "Andika",
    [double]$Rate = 0.9
)
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
    $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait() | Out-Null
    $t.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -match $Voice } | Select-Object -First 1
if (-not $v) { throw "Voice '$Voice' not installed (Settings > Time & language > Speech > add Indonesian)." }
$synth.Voice = $v
$synth.Options.SpeakingRate = $Rate

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$map = Get-Content $LabelMap -Raw -Encoding UTF8 | ConvertFrom-Json
$index = [ordered]@{ voice = $v.DisplayName; language = $v.Language; files = [ordered]@{} }

foreach ($key in ($map.PSObject.Properties.Name | Sort-Object { [int]$_ })) {
    $entry = $map.$key
    $stream = Await ($synth.SynthesizeTextToStreamAsync($entry.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $n = [uint32]$stream.Size
    [void](Await ($reader.LoadAsync($n)) ([uint32]))
    $bytes = New-Object byte[] $n
    $reader.ReadBytes($bytes)
    $file = "$($entry.phraseId).wav"
    [System.IO.File]::WriteAllBytes((Join-Path $OutDir $file), $bytes)
    $index.files[$entry.phraseId] = @{ file = $file; text = $entry.text }
    Write-Output "$($entry.phraseId)  $($entry.text)  ($n bytes)"
}
$index | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $OutDir "index.json")
