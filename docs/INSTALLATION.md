# Install, upgrade and build

## Windows installer / Windows kurulumu

Download the Setup.exe from [Releases](https://github.com/hasansercan/codex-accounts-switcher/releases/latest). Run it as your ordinary Windows user. It installs under `%LOCALAPPDATA%\Programs\Codex Accounts`, adds Desktop/Start menu shortcuts and an Apps uninstall entry. It does not require administrator rights. Interactive setup starts the app; silent `/S` mode does not.

Türkçe: Setup.exe’yi çift tıkla. Programı açıp **Hesap ekle** seç. Her hesap için resmî giriş yap; sonra **Bu hesaba geç** ile etkinleştir.

Windows 10/11 Intel/AMD x64 is the supported distribution target. The installer bootstrap itself is a standard 32-bit NSIS executable that installs the **64-bit application**; its PE header does not indicate a 32-bit application build. macOS/Linux/ARM64/Windows 7/8 are not distributed by this release.

## Verify a download

Download `SHA256SUMS.txt` next to your chosen asset. In PowerShell:

```powershell
Get-FileHash .\Codex-Accounts-1.3.0-Windows-x64-Setup.exe -Algorithm SHA256
```

Compare with the line for that filename. Checksums detect changes; they do not replace publisher signing. The release is unsigned, so SmartScreen or organizational policies may prevent execution. Do not disable system protections globally.

## Portable ZIP

Extract the entire ZIP. Run `Codex Accounts.exe` in the extracted folder. Do not move only the EXE. Preferences are stored in AppData, so this is a no-install distribution rather than a fully self-contained data folder.

## Sign-in

- Add each account you are authorized to use.
- Browser sign-in uses a temporary Chrome profile, falling back to Edge on Windows.
- Turn off automatic browser opening to copy the official URL to your own browser on the same PC.
- Device code is optional and may be disabled by organization policy.
- Leave the app running until login completes. Never share a sign-in URL.
- Your active account is preserved while adding another account.

## Upgrade and uninstall

Quit via the tray menu, then run the new installer over the existing installation. The application keeps its historic `Codex Accounts` installation and data paths for compatibility. Uninstall through Windows Settings → Apps. Account files and AppData are deliberately preserved. See [PRIVACY.md](PRIVACY.md) before manually deleting personal data.

## Source build

Node.js 24+, npm, and NSIS 3 are required. `npm ci`, `node node_modules/electron/install.js`, `npm test`, then `npm run build:win`. Use `MAKENSIS` with an absolute compiler path if it is not on PATH. The Windows build detects the default NSIS Program Files location. The native compiler on macOS can cross-build the installer without Wine.

The first build downloads pinned dependency archives from the npm registry and Electron from its official release distribution. Runtime npm integrity is checked before extraction. Do not change the pins without testing the account protocol, packaging and license notices.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| PowerShell says `app.asar/src/lifecycle.ps1` is missing | Quit the old app and install the current release. The helper is now a real `resources/lifecycle.ps1` file. |
| Account bridge unavailable | Reinstall the complete package, including `resources/runtime`, and restart. Check organizational security policy. |
| Browser did not open | Install Chrome/Edge, or turn automatic opening off and copy the login URL. |
| No usage / token history | Check connectivity and sign-in. The server may not provide that endpoint for the account/version. Unknown fields remain unknown. |
| Wrong TOTP code | Check Windows time synchronization and the original setup key, algorithm, digit count and period. A recovery code cannot generate TOTP codes. |
| Codex will not close | Finish ongoing work and close Codex normally, then retry. No forced Codex termination is used. |
| Native Codex still uses old account | Restart Codex and verify compatibility with its credential store. Auth-file switching is not guaranteed for every native client version. |
| Window disappears after close | The app stays in the system tray. Open or quit it there. |

Report version, OS and sanitized steps in an issue. Do not attach `auth.json`, account snapshots, login URLs, cache exports or 2FA keys.
