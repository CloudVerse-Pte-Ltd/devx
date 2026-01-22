# DevX CLI v${VERSION}

## Highlights

- Cloud cost analysis CLI for developers
- Runs the same checks locally that appear in PRs
- Silent by default, output only on block or with --warn/--verbose flags

## Install via npm

```bash
npm install -g @cloudverse/devx
```

## Download binaries

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/cloudverse-ai/devx/releases/download/v${VERSION}/devx-darwin-arm64 -o devx
chmod +x devx && sudo mv devx /usr/local/bin/
```

**macOS (Intel):**
```bash
curl -L https://github.com/cloudverse-ai/devx/releases/download/v${VERSION}/devx-darwin-x64 -o devx
chmod +x devx && sudo mv devx /usr/local/bin/
```

**Linux:**
```bash
curl -L https://github.com/cloudverse-ai/devx/releases/download/v${VERSION}/devx-linux-x64 -o devx
chmod +x devx && sudo mv devx /usr/local/bin/
```

## Verification

Verify checksums:
```bash
curl -L https://github.com/cloudverse-ai/devx/releases/download/v${VERSION}/SHA256SUMS -o SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Verify GPG signature:
```bash
curl -L https://github.com/cloudverse-ai/devx/releases/download/v${VERSION}/SHA256SUMS.sig -o SHA256SUMS.sig
gpg --verify SHA256SUMS.sig SHA256SUMS
```

## Software Bill of Materials (SBOM)

SBOM is available in CycloneDX format: `sbom.cdx.json`

## Assets

| File | Description |
|------|-------------|
| `devx-darwin-arm64` | macOS Apple Silicon binary |
| `devx-darwin-x64` | macOS Intel binary |
| `devx-linux-x64` | Linux x64 binary |
| `SHA256SUMS` | SHA256 checksums for all binaries |
| `SHA256SUMS.sig` | GPG signature for checksums |
| `sbom.cdx.json` | Software Bill of Materials (CycloneDX) |
