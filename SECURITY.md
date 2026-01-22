# Security Policy — CloudVerse DevX CLI

CloudVerse takes the security of developer machines and enterprise environments seriously.
This document describes how the DevX CLI is built, distributed, and secured.

---

## Supported Versions

Only officially released versions published via GitHub Releases are supported.

| Version | Supported |
|--------|-----------|
| Latest | ✅ Yes |
| Older | ❌ No |

Always upgrade to the latest release to receive security updates.

---

## Supply Chain Security

### Source Code
- The DevX CLI source code is fully open-source.
- All official releases are built from tagged commits in this repository.

### Release Integrity
Each release includes:
- Platform-specific binaries
- SHA-256 checksums
- Detached checksum signature
- Software Bill of Materials (SBOM)

You can verify a release using:

```bash
shasum -a 256 devx-darwin-arm64
gpg --verify SHA256SUMS.sig SHA256SUMS
