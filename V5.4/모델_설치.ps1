param(
 [string]$Wheel = "$env:USERPROFILE/Downloads/clika_runtime-0.6.4-cp312-cp312-win_amd64.whl"
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $Wheel)) { throw 'Download the official ClikaRT 0.6.4 Windows Python 3.12 wheel from your CLIKA project first.' }
if ((Get-FileHash -LiteralPath $Wheel -Algorithm SHA256).Hash -ne 'F885F8A991EEA3C068B39D19F74FF7C317AA135C3E5B584BF29C707D907F253D') { throw 'ClikaRT wheel checksum mismatch.' }
if (-not (Test-Path -LiteralPath $pythonExe)) {
 & py -3.12 -m venv (Join-Path $PSScriptRoot '.venv')
 if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required. Install it from python.org.' }
}
& $pythonExe -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt') $Wheel
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
& $pythonExe (Join-Path $PSScriptRoot 'download_model.py')
if ($LASTEXITCODE -ne 0) { throw 'Model download or integrity check failed.' }
Write-Host 'Local model ready. Keep your license in Downloads/Default_Project_license.txt, then run 하늘마루_실행.cmd.'
