# Optional per-user installation. No administrator privileges required.
$ErrorActionPreference='Stop'
$source=$PSScriptRoot
$target=Join-Path $env:LOCALAPPDATA 'Programs\Codex Accounts'
if(-not (Test-Path (Join-Path $source 'Codex Accounts.exe'))){throw 'Extract the entire ZIP before running this installer.'}
$running=@(Get-Process -Name 'Codex Accounts' -ErrorAction SilentlyContinue)
if($running.Count -gt 0){throw 'Exit Codex Accounts from its tray menu before installing.'}
if([System.IO.Path]::GetFullPath($source).TrimEnd('\') -ne [System.IO.Path]::GetFullPath($target).TrimEnd('\')){
 New-Item -ItemType Directory -Path $target -Force | Out-Null
 Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
}
$ws=New-Object -ComObject WScript.Shell
foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){
 $shortcut=$ws.CreateShortcut((Join-Path $folder 'Codex Accounts.lnk'))
 $shortcut.TargetPath=Join-Path $target 'Codex Accounts.exe'
 $shortcut.WorkingDirectory=$target
 $shortcut.IconLocation=Join-Path $target 'Codex Accounts.exe'
 $shortcut.Save()
}
Write-Host "Installed: $target"
Start-Process -FilePath (Join-Path $target 'Codex Accounts.exe') -WorkingDirectory $target
