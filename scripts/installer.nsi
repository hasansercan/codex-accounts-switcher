Unicode true
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"

!ifndef APP_DIR
 !error "APP_DIR must point to the complete Windows application folder."
!endif
!ifndef OUT_FILE
 !error "OUT_FILE is required."
!endif
!ifndef APP_ICON
 !error "APP_ICON is required."
!endif
!ifndef UNINSTALL_FILES
 !error "UNINSTALL_FILES is required."
!endif

Name "Codex Accounts"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Codex Accounts"
RequestExecutionLevel user
SetCompressor zlib
CRCCheck on
ShowInstDetails show
ShowUninstDetails show
AutoCloseWindow true
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
BrandingText "Codex Accounts 1.3.0"
VIProductVersion "1.3.0.0"
VIAddVersionKey "ProductName" "Codex Accounts Setup"
VIAddVersionKey "FileDescription" "Codex Accounts Windows Installer"
VIAddVersionKey "FileVersion" "1.3.0.0"
VIAddVersionKey "ProductVersion" "1.3.0"
VIAddVersionKey "LegalCopyright" "Codex Accounts contributors - MIT"

Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Function .onInit
 SetShellVarContext current
 ; Always install per user to a known application folder, including in silent mode.
 StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Codex Accounts"
 ${IfNot} ${RunningX64}
  MessageBox MB_OK|MB_ICONSTOP "Bu uygulama 64 bit Windows 10 veya Windows 11 gerektirir."
  SetErrorLevel 2
  Abort
 ${EndIf}
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_OK|MB_ICONSTOP "Bu uygulama Windows 10 veya Windows 11 gerektirir."
  SetErrorLevel 2
  Abort
 ${EndIf}
 check_running:
 FindWindow $0 "" "Codex Accounts"
 ${If} $0 != 0
  IfSilent cancel_install
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Codex Accounts açık. Sistem tepsisi menüsünden Çık ile kapatıp Yeniden Dene seçin." IDRETRY check_running
  cancel_install:
  SetErrorLevel 2
  Abort
 ${EndIf}
FunctionEnd

Section "Codex Accounts" SEC_MAIN
 SetShellVarContext current
 SetOutPath "$INSTDIR"
 ClearErrors
 File /r "${APP_DIR}/*"
 IfErrors failed
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 IfErrors failed
 CreateShortCut "$DESKTOP\Codex Accounts.lnk" "$INSTDIR\Codex Accounts.exe" "" "$INSTDIR\Codex Accounts.exe" 0
 CreateShortCut "$SMPROGRAMS\Codex Accounts.lnk" "$INSTDIR\Codex Accounts.exe" "" "$INSTDIR\Codex Accounts.exe" 0
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "DisplayName" "Codex Accounts"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "DisplayVersion" "1.3.0"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "Publisher" "Codex Accounts contributors"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "DisplayIcon" '"$INSTDIR\Codex Accounts.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "NoRepair" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts" "EstimatedSize" ${APP_SIZE_KB}
 IfErrors failed
 SetErrorLevel 0
 IfSilent done
 ExecShell "open" "$INSTDIR\Codex Accounts.exe" "" SW_SHOWNORMAL
 Goto done
 failed:
 MessageBox MB_OK|MB_ICONSTOP "Kurulum tamamlanamadı. Uygulamanın kapalı olduğundan ve yeterli disk alanı bulunduğundan emin olun."
 SetErrorLevel 1
 Abort
 done:
SectionEnd

Function un.onInit
 SetShellVarContext current
 ; Never accept an overridden uninstall destination or remove account data.
 StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Codex Accounts"
 check_running:
 FindWindow $0 "" "Codex Accounts"
 ${If} $0 != 0
  IfSilent cancel_uninstall
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Önce Codex Accounts uygulamasını sistem tepsisi menüsünden Çık ile kapatın." IDRETRY check_running
  cancel_uninstall:
  SetErrorLevel 2
  Abort
 ${EndIf}
FunctionEnd

Section "Uninstall"
 SetShellVarContext current
 ClearErrors
 ; An explicit manifest removes only packaged files, never arbitrary user files.
 !include "${UNINSTALL_FILES}"
 IfErrors uninstall_failed
 Delete "$DESKTOP\Codex Accounts.lnk"
 Delete "$SMPROGRAMS\Codex Accounts.lnk"
 ; Startup entries created by this app use its executable name.
 DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Codex Accounts"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccounts"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir "$INSTDIR"
 SetErrorLevel 0
 Goto uninstall_done
 uninstall_failed:
 MessageBox MB_OK|MB_ICONSTOP "Bazı uygulama dosyaları silinemedi. Codex Accounts uygulamasını kapatıp yeniden deneyin."
 SetErrorLevel 1
 Abort
 uninstall_done:
SectionEnd
