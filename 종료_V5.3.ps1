$ErrorActionPreference = 'Stop'
$taskServer = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py'))
$taskOwners = @(Get-NetTCPConnection -LocalPort 8800 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($taskOwner in $taskOwners) {
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskOwner"
    if (-not ([string]$taskProcess.CommandLine).Replace('/', '\').Contains($taskServer)) { throw 'Port 8800 belongs to another checkout. It was not stopped.' }
    Stop-Process -Id $taskOwner -ErrorAction Stop
}
Write-Host 'This V5.3 server has stopped. Other versions were not stopped.'
