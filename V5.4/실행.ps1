param([string]$LanIp = '', [switch]$SkipWifiChoice)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $SkipWifiChoice -and -not $LanIp) {
    . (Join-Path $PSScriptRoot 'Wifi-Select.ps1')
    $taskWifi = Show-HaneulmaruWifi -ProjectRoot $PSScriptRoot
    if (-not $taskWifi) { Write-Host 'Wi-Fi selection cancelled. Existing server was not stopped.'; return }
    $LanIp = $taskWifi.LanIp
    Write-Host ('Selected Wi-Fi: ' + $taskWifi.Ssid + ' / PC: ' + $LanIp)
}
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = Join-Path (Split-Path $PSScriptRoot) '.venv-clika/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run 모델_설치.ps1 first.' }
if (-not $env:CLIKA_RT_LICENSE) { $env:CLIKA_RT_LICENSE = Join-Path $env:USERPROFILE 'Downloads/Default_Project_license.txt' }
& $taskPython -c "import importlib.util,sys; names=('cryptography','reportlab','serial','bleak','clika_runtime','websockets'); missing=[n for n in names if not importlib.util.find_spec(n)]; print('Missing: '+', '.join(missing)) if missing else None; sys.exit(bool(missing))"
if ($LASTEXITCODE -ne 0) { throw 'Install V5.4 requirements before disconnecting the Internet.' }
$v53Page = $null
$v53Content = ''
try { $v53Page = Invoke-WebRequest -Uri 'http://127.0.0.1:8810/host' -TimeoutSec 2 -UseBasicParsing; $v53Content = [System.Text.Encoding]::UTF8.GetString($v53Page.RawContentStream.ToArray()) } catch {}
if ($v53Page -and $v53Content -match [regex]::Escape('하늘마루 V5.4')) {
    # Refresh the LAN certificate and QR after changing Wi-Fi/hotspot.
    # Stop only the listener naming THIS project's server file.
    $serverFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py'))
    $owners = @(Get-NetTCPConnection -LocalPort 8810 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -ne 1) { throw 'Cannot safely identify the V5.4 server on port 8810.' }
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
    $command = [string]$serverProcess.CommandLine
    if (-not $command.Replace('/', '\').Contains($serverFile)) { throw 'Port 8810 belongs to another checkout. Close that server manually.' }
    Write-Host 'Restarting this V5.4 server to refresh the hotspot IP, certificate and QR.'
    Stop-Process -Id $owners[0] -ErrorAction Stop
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        if (-not (Get-NetTCPConnection -LocalPort 8810,8811,8812,8813,8814 -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 200
    }
    if (Get-NetTCPConnection -LocalPort 8810,8811,8812,8813,8814 -State Listen -ErrorAction SilentlyContinue) { throw 'LAN ports are still in use. Retry after the previous server has closed.' }
    $v53Page = $null
}
if ($v53Page) { throw 'Port 8810 belongs to another application. Close it before starting V5.4.' }
$taskArgs = @('-X','utf8',(Join-Path $PSScriptRoot 'experiments/haneulmaru_pro/stream_server.py'),'--gpu-browser')
if ($LanIp) { $taskArgs += @('--lan-ip',$LanIp) }
Write-Host 'V5.4: same local Wi-Fi/hotspot; Internet and mobile data are not needed for phone transport.'
Write-Host 'PC 8810 / Phone HTTPS 8811 / APK download 8812. First run: allow local firewall access.'
& $taskPython @taskArgs
