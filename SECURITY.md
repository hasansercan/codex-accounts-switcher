# Security policy

Use GitHub's private vulnerability reporting at **Security → Report a vulnerability** for this repository. Do not disclose live credentials, auth files, OAuth links, TOTP secrets or personal account exports in public issues.

Only the latest preview release is maintained. No independent security audit or guarantee is claimed.

The desktop renderer uses sandboxing, context isolation, disabled Node integration, a limited IPC surface, sender-frame checks, denied permission requests and a restrictive Content Security Policy. External authentication is delegated to Chrome/Edge. External links opened by the app are fixed official documentation / project release URLs. Windows lifecycle scripts are packaged as real files outside ASAR and receive numeric process IDs.

Automatic switching is opt-in and must not be used to bypass organization policies or service restrictions. The application does not grant additional subscription entitlement or redeem reset credits. Refer to [privacy and storage](docs/PRIVACY.md) for credential-file and DPAPI limitations.

A checksum authenticates neither a publisher nor a compromised release account. Download only from the project's release page, review the source, and respect organizational software policy. The current Windows installer is unsigned.
