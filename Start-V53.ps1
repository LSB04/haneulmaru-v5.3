param([string]$LanIp = '')
& (Join-Path $PSScriptRoot '실행.ps1') -LanIp $LanIp
exit $LASTEXITCODE
