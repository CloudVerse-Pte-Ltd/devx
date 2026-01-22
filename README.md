**CloudVerse DevX CLI**

CloudVerse DevX is a developer-first cost impact analyzer that runs in your local workflow and surfaces cloud cost risks before code or infrastructure is merged.

It integrates with GitHub, GitLab, and Azure DevOps to show cost impact directly in pull requests — and can also be run locally from your terminal.

**What DevX Does**

DevX analyzes:

Application code (loops, retries, API fan-out, logging)

Infrastructure-as-Code (Terraform, CloudFormation, Kubernetes, Serverless)

It detects patterns that commonly cause:

Unexpected cloud spend

Runaway runtime costs

Missing cost controls or metadata

DevX is not a billing dashboard.
It is an engineering-time guardrail.

How It Works (High Level)

DevX CLI runs locally on your machine

It analyzes changed files (code or IaC)

Findings are securely sent to CloudVerse for evaluation

Results appear:

In your terminal (local scan)

In pull requests (CI / PR checks)

The CLI itself is intentionally thin.
All policy evaluation and cost modeling happens remotely.

Installation
macOS / Linux
curl -fsSL https://devx.cloudverse.ai/install.sh | sh

Windows (PowerShell)
iwr https://devx.cloudverse.ai/install.ps1 -useb | iex

npm (optional)
npm install -g @cloudverse/devx


Verify installation:

devx --version

First-Run Authentication (Device Auth)

On first run:

devx


You’ll see:

Authenticate this device to continue.

Open:
https://devx.cloudverse.ai/device

Enter code:
ABCD-EFGH


No credentials are entered in the terminal

Each device is registered and visible to org admins

Devices can be revoked at any time from the DevX portal

Common Commands
devx scan


Run a local cost impact scan on changed files.

devx scan --staged


Scan staged changes before commit.

devx install hook


Install an optional pre-commit hook (warn-only by default).

devx doctor


Show device status, org, auth state, and what data is sent.

What Data Is Sent

DevX is designed to minimize data collection.

Sent:

File paths

Rule matches / findings

Aggregated metadata needed for analysis

Not sent:

Secrets

Credentials

Environment variables

Full repositories

Git history beyond the current change set

You can inspect this at any time:

devx doctor

Security & Trust

Source code is fully open-source

Releases are signed

Checksums are published with every release

SBOMs are provided for enterprise review

See SECURITY.md
 for details.

CI / Pull Request Integration

Once installed, DevX automatically posts cost impact checks to:

GitHub Pull Requests

GitLab Merge Requests

Azure DevOps PRs

Local CLI output is intentionally aligned word-for-word with PR comments to avoid confusion.

Philosophy

DevX is built on a simple belief:

Cloud cost issues are introduced through code and IaC — not discovered in dashboards.

The goal is not perfect prediction.
The goal is better engineering decisions at the moment of change.

License

Apache 2.0
