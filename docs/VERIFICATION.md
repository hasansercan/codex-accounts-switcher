# Verification record — 1.3.0

Date: 2026-11-08. This file distinguishes implementation checks from real account behavior.

## Local macOS development checks

- 15 Node tests pass: fake-account bridge integration, three lifecycle regressions, four automatic-selection/input tests, five TOTP tests and two usage-mapping tests.
- TOTP tests include all 18 RFC 6238 time/algorithm vectors for SHA-1/256/512, plus rollover and invalid parameters.
- Bridge integration runs against synthetic account/auth/app-server executables. It checks account selection, login creation/cancel, independent limit/history failures, metadata changes, removal and absence of fixture secret values in UI output/cache.
- The packaged main process is loaded into an isolated test context. Its inspect/close calls are intercepted; a real non-Electron child independently opens the physical PowerShell script path. No account files or real Codex processes are used.
- Electron demo UI smoke: search/no results, changing the selected demo account, usage table, dialog Escape/focus, invalid/valid/clear TOTP, dark theme and minimum window width. Screenshots show synthetic demo data.
- Runtime package downloads are pinned by npm SHA-512 integrity. Electron ZIPs were checked against the checksums included in the installed official Electron package.
- Build-tool dependency overrides address the glob/minimatch advisories reported at preparation time; `npm audit` reports zero known vulnerabilities after the update. This is not an independent security audit.

## Windows automation

GitHub workflows run unit/policy tests and the Electron demo smoke on a Windows runner. The POSIX executable-fixture bridge test is explicitly skipped on Windows. The package workflow builds native Windows artifacts and verifies the external helper path. Workflow results are visible under Actions; only successful runs should be treated as evidence.

## Still requires real user/device verification

- Real browser/device-code sign-in and organization SSO.
- Native Codex account identity changing after auth-file switching and restart.
- Windows DPAPI save/load/remove behavior with a real user's vault.
- Tray/autostart behavior and installation/uninstallation on a normal Windows desktop.
- Graceful close rejection, activity detection and native Codex relaunch on a real machine.

The previous local Windows build was user-reported to open but failed at a helper path inside ASAR. That packaging defect is fixed and has focused regression coverage. No end-to-end live account success is inferred from the automated checks. This release is a community preview.
