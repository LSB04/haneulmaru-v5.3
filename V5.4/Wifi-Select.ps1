# Windows PowerShell 5.1; local credentials use current-user DPAPI.
function ConvertFrom-WifiInterfaces([string[]]$Lines) {
 $items=@();$item=$null
 foreach($line in $Lines){
  if($line -match '^\s*(?:Name|이름)\s*:\s*(.+)$'){
   if($item -and $item.Ssid){$items += [pscustomobject]$item}
   $item=@{Name=$Matches[1].Trim();Ssid=''}
  }elseif($item -and $line -match '^\s*SSID\s*:\s*(.+)$'){$item.Ssid=$Matches[1].Trim()}
 }
 if($item -and $item.Ssid){$items += [pscustomobject]$item};return $items
}
function Get-ConnectedWifi { try { ConvertFrom-WifiInterfaces @(& netsh.exe wlan show interfaces 2>&1 | ForEach-Object {"$_"}) } catch { return @() } }
function Get-WifiPrivateAddress($Connection){
 if(-not $Connection){return ''}
 foreach($a in @(Get-NetIPAddress -InterfaceAlias $Connection.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.AddressState -eq 'Preferred'})){
  if($a.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){return $a.IPAddress}
 };return ''
}
function New-WifiProfileXml([string]$Ssid,[string]$Password){
 $name=[Security.SecurityElement]::Escape($Ssid);$key=[Security.SecurityElement]::Escape($Password)
 $hex=([BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes($Ssid))).Replace('-','')
 return ('<?xml version="1.0" encoding="UTF-8"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>'+ $name +'</name><SSIDConfig><SSID><hex>'+ $hex +'</hex><name>'+ $name +'</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>'+ $key +'</keyMaterial></sharedKey></security></MSM></WLANProfile>')
}
function Show-HaneulmaruWifi([string]$ProjectRoot){
 Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing
 [Windows.Forms.Application]::EnableVisualStyles()
 $secretFile=Join-Path $ProjectRoot '.local-wifi/GEN.dpapi'
 $form=New-Object Windows.Forms.Form;$form.Text='하늘마루 V5.4 · Wi-Fi 선택';$form.ClientSize=New-Object Drawing.Size(620,355)
 $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.Font=New-Object Drawing.Font('Malgun Gothic',10)
 $state=@{Result=$null;Busy=$false}
 $label=New-Object Windows.Forms.Label;$label.SetBounds(20,15,580,50);$label.Text="휴대폰 핫스팟을 켠 뒤 연결할 Wi-Fi를 선택하세요.`r`n모바일 데이터와 외부 인터넷은 필요하지 않습니다."
 $networks=New-Object Windows.Forms.ComboBox;$networks.SetBounds(20,80,420,32);$networks.DropDownStyle='DropDown'
 $refresh=New-Object Windows.Forms.Button;$refresh.Text='목록 새로고침';$refresh.SetBounds(450,78,150,34)
 $passwordLabel=New-Object Windows.Forms.Label;$passwordLabel.SetBounds(20,118,580,28);$passwordLabel.Text='비밀번호 (GEN은 저장 암호 사용 · Windows에 저장된 Wi-Fi는 생략 가능)'
 $password=New-Object Windows.Forms.TextBox;$password.SetBounds(20,150,420,30);$password.UseSystemPasswordChar=$true
 $status=New-Object Windows.Forms.Label;$status.SetBounds(20,193,580,85);$status.Text='Wi-Fi 확인 중…'
 $connect=New-Object Windows.Forms.Button;$connect.Text='선택한 Wi-Fi 연결 후 실행';$connect.SetBounds(20,295,235,40)
 $keep=New-Object Windows.Forms.Button;$keep.Text='현재 Wi-Fi로 실행';$keep.SetBounds(265,295,205,40)
 $cancel=New-Object Windows.Forms.Button;$cancel.Text='취소';$cancel.SetBounds(480,295,120,40)
 $form.Controls.AddRange(@($label,$networks,$refresh,$passwordLabel,$password,$status,$connect,$keep,$cancel))
 $load={
  $current=@(Get-ConnectedWifi);$names=@('GEN');$scan=@()
  try {$scan=@(& netsh.exe wlan show networks mode=ssid 2>&1 | ForEach-Object {"$_"})} catch {}
  foreach($line in $scan){if($line -match '^\s*SSID\s+\d+\s*:\s*(.+)$'){$names+=$Matches[1].Trim()}}
  $names+=@($current | ForEach-Object {$_.Ssid});$networks.Items.Clear()
  foreach($name in ($names | Select-Object -Unique)){[void]$networks.Items.Add($name)};$networks.Text='GEN'
  $currentName=($current | ForEach-Object {$_.Ssid}) -join ', '
  $status.Text="현재 Wi-Fi: $currentName`r`nGEN 저장 암호: $(if(Test-Path -LiteralPath $secretFile){'있음'}else{'없음 · 비밀번호 입력'})"
  if(-not ($scan -match '^\s*SSID\s+\d+\s*:')){$status.Text+="`r`n목록을 읽지 못하면 이름을 직접 입력하거나 Windows에서 Wi-Fi를 켜세요."}
 }
 $finish={param($connection)
  $ip=Get-WifiPrivateAddress $connection
  if(-not $ip){$status.Text='로컬 IPv4 주소를 받지 못했습니다. 핫스팟 연결 후 다시 시도하세요.';return}
  $state.Result=@{Ssid=$connection.Ssid;LanIp=$ip};$form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
 }
 $refresh.Add_Click($load)
 $keep.Add_Click({$current=@(Get-ConnectedWifi);if($current.Count){& $finish $current[0]}else{$status.Text='연결된 Wi-Fi가 없습니다. 핫스팟을 선택해 연결하세요.'}})
 $cancel.Add_Click({$form.Close()})
 $form.Add_FormClosing({param($sender,$eventArgs) if($state.Busy){$eventArgs.Cancel=$true}})
 $connect.Add_Click({
  $ssid=$networks.Text.Trim();if(-not $ssid){$status.Text='Wi-Fi 이름을 입력하세요.';return}
  $state.Busy=$true;$connect.Enabled=$false;$keep.Enabled=$false;$refresh.Enabled=$false;$cancel.Enabled=$false
  $temporary=$null;$plain=$null
  try{
   $plain=$password.Text
   if(-not $plain -and $ssid -ceq 'GEN' -and (Test-Path -LiteralPath $secretFile)){
    $secure=(Get-Content -LiteralPath $secretFile -Raw).Trim() | ConvertTo-SecureString
    $plain=([System.Net.NetworkCredential]::new('',$secure)).Password
   }
   if($plain){
    if($plain.Length -lt 8 -or $plain.Length -gt 63){throw 'WPA2 비밀번호는 8~63자여야 합니다.'}
    $temporary=[IO.Path]::GetTempFileName();[IO.File]::WriteAllText($temporary,(New-WifiProfileXml $ssid $plain),(New-Object Text.UTF8Encoding($false)))
    $ignored=& netsh.exe wlan add profile "filename=$temporary" user=current 2>&1
    if($LASTEXITCODE -ne 0){throw 'Wi-Fi 프로필 등록 실패. Windows Wi-Fi 설정에서 먼저 연결하세요.'}
    Remove-Item -LiteralPath $temporary -Force;$temporary=$null;$plain=$null
   }
   $status.Text="$ssid 연결 중… 인터넷 유무는 검사하지 않습니다.";[Windows.Forms.Application]::DoEvents()
   $ignored=& netsh.exe wlan connect "name=$ssid" "ssid=$ssid" 2>&1
   if($LASTEXITCODE -ne 0){throw 'Wi-Fi 연결 요청 실패. 핫스팟 또는 Windows 저장 프로필·비밀번호를 확인하세요.'}
   $matched=$null
   for($attempt=0;$attempt -lt 20;$attempt++){
    [Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 500
    $matched=@(Get-ConnectedWifi | Where-Object {$_.Ssid -ceq $ssid}) | Select-Object -First 1
    if($matched -and (Get-WifiPrivateAddress $matched)){break}
   }
   $state.Busy=$false
   if($matched){& $finish $matched}else{throw '연결되지 않았습니다. 핫스팟 이름·비밀번호 및 WPA2 호환 설정을 확인하세요.'}
  }catch{$status.Text=$_.Exception.Message}
  finally{
   if($temporary -and (Test-Path -LiteralPath $temporary)){Remove-Item -LiteralPath $temporary -Force}
   $plain=$null;$password.Clear();$state.Busy=$false;$connect.Enabled=$true;$keep.Enabled=$true;$refresh.Enabled=$true;$cancel.Enabled=$true
  }
 })
 $form.Add_Shown($load);[void]$form.ShowDialog();$form.Dispose();return $state.Result
}
