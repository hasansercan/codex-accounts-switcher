# Third-party notices

Codex Accounts application sources: MIT; see LICENSE.

Bundled runtime:
- Electron 45.2.3: MIT, Chromium, Node.js and their third-party licenses. The packaged runtime includes LICENSE and LICENSES.chromium.html.
- OpenAI Codex CLI 0.162.0, Windows x64: Apache-2.0; see licenses/codex-LICENSE.txt.
- Loongphy Codex Auth 0.3.1, Windows x64: MIT; see licenses/codex-auth-LICENSE.txt.

Only the Codex CLI executable is shipped, for account app-server requests. Code-mode, voice, sandbox helpers and ripgrep are not used or bundled. No separate Node executable is required: the bridge runs using Electron's bundled Node runtime.

Build and test dependencies are retained in package-lock.json and are not bundled in the desktop application.
