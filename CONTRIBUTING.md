# Contributing

Thank you for helping improve Codex Accounts Switcher.

1. Open an issue describing the user-visible problem, expected behavior and version. Sanitize all personal data.
2. Use Node.js 24+, run `npm ci`, and preview only with `npm run demo` when no real account interaction is needed.
3. Keep application behavior and credential/data paths compatible. Do not add telemetry, remote renderer content, arbitrary shell commands or auto-switch defaults.
4. Add focused regression coverage for account selection, usage mapping, credential isolation or lifecycle changes.
5. Run `npm test`, `npm audit` and `npm run build:win` for release/package changes (NSIS 3 required). Record what you actually verified, especially Windows-only behavior.
6. Submit a pull request describing the problem, change and validation. Never commit personal `.codex` files or tokens.

UI strings are currently Turkish. English localization, accessibility improvements and Windows-native lifecycle/DPAPI test reports are useful contributions. Dependencies and application code keep their own license obligations; preserve attributions. Contributions are submitted under this repository's MIT license.
