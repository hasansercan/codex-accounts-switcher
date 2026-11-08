param([ValidateSet('inspect','close')][string]$Mode='inspect', [string]$Ids='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($Mode -eq 'inspect') {
  $items = @(Get-Process -Name Codex -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
    if ($_.Path) { @{ id=$_.Id; path=$_.Path; title=$_.MainWindowTitle } }
  })
  ConvertTo-Json -InputObject $items -Compress
} else {
  $targets=@()
  foreach($item in ($Ids -split ',')) {
    if($item -notmatch '^\d+$'){throw 'Invalid process ID'}
    $p=Get-Process -Id ([int]$item) -ErrorAction SilentlyContinue
    if($p){if($p.ProcessName -ne 'Codex'){throw 'Unexpected process'}; $targets+= $p}
  }
  foreach($p in $targets){if(-not $p.CloseMainWindow()){throw 'Codex kapanmayı kabul etmedi; hesap değiştirilmedi.'}}
  $end=(Get-Date).AddSeconds(20)
  do {
    $remaining=@($targets | Where-Object { -not $_.HasExited })
    if($remaining.Count -eq 0){break}
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $end)
  if($remaining.Count -gt 0){throw 'Codex kapanmadı; hesap değiştirilmedi.'}
  '{"ok":true}'
}
