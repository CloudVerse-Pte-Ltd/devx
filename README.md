# CloudVerse DevX CLI

Cloud cost issues are introduced through code and IaC changes. DevX surfaces cost impact locally and in pull requests.

## Install (recommended)

```bash
npm install -g @cloudverse/devx
```

## Authenticate

```bash
devx auth login
```

## Common usage

```bash
devx scan
devx scan --staged
devx scan --iac
```

## Hooks

```bash
devx hooks install
devx hooks status
git commit --no-verify
```

## Security

- No cloud credentials required
- No full repo uploads
- Only changed files are analyzed

### Verification

Every release includes checksums and GPG signatures:

```bash
shasum -a 256 <artifact>
gpg --verify SHA256SUMS.sig SHA256SUMS
```

See [SECURITY.md](./SECURITY.md) for details.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean (no findings, or advisory-only) |
| 1 | Warnings present (non-blocking) |
| 2 | Blocked by policy |
| 3 | CLI / auth / backend error |

## Commands

```bash
devx auth login           # Authenticate via browser
devx auth status          # Check authentication status
devx auth logout          # Clear credentials
devx scan                 # Analyze working directory changes
devx scan --staged        # Analyze staged changes only
devx hooks install        # Install pre-commit/pre-push hooks
devx hooks uninstall      # Remove DevX hooks
devx hooks status         # Show hook installation status
devx explain <ruleId>     # Get rule explanation
devx doctor               # Run diagnostics
```

## Distribution

Official binaries and signatures are available at:
https://github.com/CloudVerse-Pte-Ltd/devx/releases

## License

MIT
