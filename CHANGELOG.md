# Changelog

## 1.3.0 — 2026-11-08

First public community preview of Codex Accounts Switcher.

- Publish complete Windows source, installer, portable ZIP and checksums.
- Restore external Windows lifecycle helper and guard both inspect and close paths with packaged regression checks.
- Add a GitHub releases link in settings, a TOTP display/memory clear action, and correct cancellation handling for saved-key removal.
- Restore modal focus, preserve page-header visibility when changing sections, and clear app-copied clipboard data on normal exit.
- Reject malformed/credential-bearing authentication URLs and control characters in aliases.
- Track and stop child app-server processes on normal service shutdown.
- Update Electron to 45.2.3; pin patched build-tool glob/minimatch dependencies.
- Add English/Turkish documentation, demo screenshots, privacy/security guidance and GitHub workflows.

## Earlier local builds

1.2.1 introduced the Windows adaptation. A user reported PowerShell could not read a helper path inside `app.asar`. 1.2.2 moved that helper outside the archive. Those local builds are not presented as verified public releases here.
