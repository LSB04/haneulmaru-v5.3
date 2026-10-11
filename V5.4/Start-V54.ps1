param([string]$LanIp = '', [switch]$SkipWifiChoice)
& (Join-Path $PSScriptRoot '실행.ps1') -LanIp $LanIp -SkipWifiChoice:$SkipWifiChoice
exit $LASTEXITCODE
