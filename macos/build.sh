#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
runtime="${1:?Pass the directory containing macOS arm64 node, codex and codex-auth binaries}"
output="$PWD/../dist"
app="$output/macos/Codex Accounts.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/Licenses"
swiftc -swift-version 5 -target arm64-apple-macosx13.5 -parse-as-library -O src/*.swift -o "$app/Contents/MacOS/CodexAccounts"
cp Info.plist "$app/Contents/Info.plist"
cp AppIcon.icns ../src/{bridge,policy,usage}.mjs "$app/Contents/Resources/"
for binary in node codex codex-auth; do
  file "$runtime/$binary" | grep -q arm64
  install -m 755 "$runtime/$binary" "$app/Contents/Resources/$binary"
done
cp ../licenses/*.txt "$app/Contents/Resources/Licenses/"
cp "$runtime/Licenses/Node.txt" "$app/Contents/Resources/Licenses/"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --keepParent "$app" "$output/Codex-Accounts-macOS-arm64.zip"
