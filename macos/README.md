# Native macOS edition

The macOS edition is a SwiftUI menu bar app for Apple Silicon (M-series), macOS 13.5 or later. It supports account switching, usage details, automatic switching preferences and offline TOTP with optional Keychain storage.

If this Mac has never run Codex, open Codex once to initialize its local account directory before using the switcher.

Download the macOS arm64 ZIP from Releases, extract it, and move Codex Accounts.app into Applications. Quit any previous instance before replacing it. The preview uses an ad-hoc signature and is not notarized. macOS Gatekeeper may block the initial launch. Verify the release checksum and follow the macOS Privacy & Security prompts for this specific application.

## Build

On an Apple Silicon Mac with Xcode Command Line Tools, provide a runtime directory containing arm64 executables named `node`, `codex` and `codex-auth`, plus the matching Node license at `Licenses/Node.txt`. The release uses Codex CLI 0.162.0 and Codex Auth 0.3.1. Their binaries can be obtained from the official npm packages for darwin-arm64. Then run:

```sh
./macos/build.sh /absolute/path/to/runtime
```

The app and ZIP are generated under `dist/`. The script builds the source with Swift, packages the shared account bridge and checks the bundle signature. Intel builds are not distributed.
