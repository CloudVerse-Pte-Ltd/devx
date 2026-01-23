# CloudVerse DevX CLI — Developer Handbook

## Overview
The DevX CLI allows you to run the same cost analysis locally that runs on your pull requests. This helps you identify and fix expensive cloud infrastructure decisions before they ever leave your machine.

---

## Installation

### Method 1: npm (Recommended)
Requires Node.js 18+.
```bash
npm install -g @cloudverse/devx
```

### Method 2: Binary Download
Download signed binaries from [GitHub Releases](https://github.com/cloudverse-ai/devx/releases).
1. Download for your OS (e.g., `devx-darwin-arm64`)
2. `chmod +x devx-darwin-arm64`
3. `sudo mv devx-darwin-arm64 /usr/local/bin/devx`

---

## Getting Started

### 1. Authenticate
```bash
devx auth login
```
This opens your browser. Once you log in and select your organization, your CLI is ready.

### 2. Run a Scan
```bash
# Scan your current uncommitted changes
devx scan

# Scan staged changes only
devx scan --staged

# Scan against main branch
devx scan --range origin/main
```

### 3. Install Git Hooks
Automate scans on every commit:
```bash
devx hooks install
```
*Note: Hooks are "silent by default"—they only output if a "BLOCK" finding is detected.*

---

## Exit Codes & CI Usage
| Code | Meaning | Outcome |
|------|---------|---------|
| 0    | Clean / Advisory | Success |
| 1    | Warnings | Success (unless --strict used) |
| 2    | Blocked | Failure (Blocked findings detected) |
| 3    | Error | Internal CLI/API Error |

---

## Security & Privacy
- **No Credentials Stored**: We do not store cloud provider keys. We use OAuth device flow.
- **Partial Diffs**: We only transmit the diffs of changed files for analysis.
- **SBOM**: Every release includes a CycloneDX SBOM (`sbom.cdx.json`) for dependency auditing.

---

## Troubleshooting
- **Re-authenticate**: `devx auth logout` followed by `devx auth login`
- **Update CLI**: `npm update -g @cloudverse/devx`
- **Help**: `devx --help` or `devx scan --help`
