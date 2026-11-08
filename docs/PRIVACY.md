# Privacy and local data

No developer-operated backend, analytics SDK or remote application UI is included. Network access is used by official sign-in / Codex app-server processes. The renderer's network connections and remote navigation are blocked by its Content Security Policy and window handlers. The app does not ask for your account password; enter passwords only on the provider's sign-in page.

| Data | Windows location / handling |
| --- | --- |
| Codex account snapshots | `%USERPROFILE%\.codex\accounts\` |
| Active Codex credentials | `%USERPROFILE%\.codex\auth.json` |
| Preferences / usage cache | `%APPDATA%\Codex Accounts\preferences.json`, `usage-cache.json` |
| Desktop preferences | `%APPDATA%\Codex Accounts\desktop.json` |
| Optional 2FA vault | `%APPDATA%\Codex Accounts\totp-vault.json`, encrypted with Windows DPAPI |

DPAPI protects stored secrets in the Windows user context; other software running as that same user is not fully excluded. Codex credential files are managed by Codex Auth and are not encrypted by this app. Protect the Windows user account and backups. The application never bundles your live `.codex` data.

TOTP calculation is offline. Entered setup keys are cleared from the visible input after validation. Use **Kodu ekrandan temizle** to clear the generated display and the in-memory setup value without deleting a saved key. Clipboard contents copied by the app are cleared after 45 seconds if unchanged, or on normal app exit. OS clipboard history and external clipboard managers can retain their own copies.

Sign-in uses temporary account/profile directories, cleaned on completion or cancellation. Unexpected system termination can leave temporary directories behind. Native browser authentication pages use provider policies. Usage cache and visible screens can contain emails; redact them before sharing.

Uninstall removes program files and shortcuts, preserving personal account and AppData files. Manual deletion is separate and may remove access to saved accounts/2FA keys; never do it without backups of necessary recovery material.
