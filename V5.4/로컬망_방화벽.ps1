# Scope access to this application and peers on directly connected subnets.
$ErrorActionPreference = 'Stop'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskAdmin = (New-Object Security.Principal.WindowsPrincipal $taskIdentity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $taskAdmin) {
    Start-Process powershell.exe -WindowStyle Hidden -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'))
    exit
}
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = Join-Path (Split-Path $PSScriptRoot) '.venv-clika/Scripts/python.exe' }
$taskChrome = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (-not (Test-Path -LiteralPath $taskChrome)) { $taskChrome = Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Python missing' }
# Windows venv launchers run the base interpreter, which owns the listening socket.
$taskPython = (& $taskPython -c "import sys; print(getattr(sys, '_base_executable', sys.executable))").Trim()
if (-not (Get-NetFirewallRule -Name 'Haneulmaru-V54-LAN-HTTPS' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'Haneulmaru-V54-LAN-HTTPS' -DisplayName 'Haneulmaru V5.4 local HTTPS and APK' -Direction Inbound -Action Allow -Program $taskPython -Protocol TCP -LocalPort 8811,8812,8813 -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
else {
    Get-NetFirewallRule -Name 'Haneulmaru-V54-LAN-HTTPS' | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program $taskPython | Out-Null
}
if ((Test-Path -LiteralPath $taskChrome) -and -not (Get-NetFirewallRule -Name 'Haneulmaru-V54-WebRTC' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'Haneulmaru-V54-WebRTC' -DisplayName 'Haneulmaru V5.4 Chrome local WebRTC' -Direction Inbound -Action Allow -Program $taskChrome -Protocol UDP -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Host 'Local-subnet rules are ready. No router port forwarding is required.'
