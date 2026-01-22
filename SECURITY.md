# Security Policy — CloudVerse DevX CLI

## What the CLI Sends

When you run `devx scan`, the CLI sends the following to the CloudVerse DevX API:

- **File diffs**: Only the changed portions of files in your commit or working directory
- **File paths**: Relative paths within your repository
- **Git metadata**: Branch name, commit SHA, repository name
- **Machine identifier**: A random UUID generated on first run (for rate limiting)

## What the CLI Does NOT Send

- **Secrets or credentials**: Environment variables, API keys, tokens
- **Full repository contents**: Only changed files are transmitted
- **System information**: No telemetry about your machine beyond OS type
- **Unchanged files**: Only modified, added, or staged files are analyzed

## Token Storage

CLI authentication tokens are stored locally at:

```
~/.cloudverse/devx/config.json
```

This file contains:
- `accessToken`: Your CLI session token (expires after 90 days)
- `orgId`: Your organization identifier
- `userId`: Your user identifier

**To revoke access:**
1. Run `devx auth logout` to clear local credentials
2. Or delete `~/.cloudverse/devx/config.json` manually
3. Admins can revoke devices from the portal at `/devx/settings/cli-devices`

When a device is revoked:
- The CLI will receive a 401 error on next scan attempt
- The user must re-authenticate with `devx auth login`
- Revocation takes effect immediately

## Verifying Release Artifacts

Every release includes SHA256 checksums and GPG signatures for verification.

### Verify Checksums

```bash
# Download the binary and checksums
curl -L https://github.com/cloudverse-ai/devx/releases/latest/download/devx-linux-x64 -o devx
curl -L https://github.com/cloudverse-ai/devx/releases/latest/download/SHA256SUMS -o SHA256SUMS

# Verify the checksum
sha256sum -c SHA256SUMS --ignore-missing
```

Expected output: `devx-linux-x64: OK`

### Verify GPG Signature

```bash
# Download signature
curl -L https://github.com/cloudverse-ai/devx/releases/latest/download/SHA256SUMS.sig -o SHA256SUMS.sig

# Import CloudVerse public key (if not already imported)
gpg --keyserver keyserver.ubuntu.com --recv-keys <CLOUDVERSE_KEY_ID>

# Verify signature
gpg --verify SHA256SUMS.sig SHA256SUMS
```

Expected output: `Good signature from "CloudVerse Security <security@cloudverse.ai>"`

## Software Bill of Materials (SBOM)

Each release includes an SBOM in CycloneDX JSON format:

- **File**: `sbom.cdx.json`
- **Format**: CycloneDX 1.5 JSON
- **Contents**: Complete dependency tree with versions and licenses

Use the SBOM to:
- Audit dependencies for vulnerabilities
- Verify license compliance
- Track supply chain components

## Reporting Vulnerabilities

If you discover a security vulnerability in the DevX CLI, please report it to:

**Email**: security@cloudverse.ai

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 24 hours and provide a fix within 7 days for critical issues.

## Security Best Practices

1. **Keep CLI updated**: Run `npm update -g @cloudverse/devx` regularly
2. **Verify downloads**: Always check SHA256 checksums before running binaries
3. **Protect tokens**: Do not share your `~/.cloudverse/devx/config.json` file
4. **Use `--no-verify` sparingly**: Bypassing hooks is logged for audit purposes
