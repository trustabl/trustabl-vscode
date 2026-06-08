# Trustabl for VS Code and Cursor

Runs the [Trustabl](https://github.com/trustabl/trustabl) agent-reliability
scanner on save and surfaces findings as native diagnostics (Problems panel),
in a Trustabl activity-bar sidebar (Findings / Scores / Dependencies /
Vulnerabilities / Help & Feedback, with per-surface readiness scores), and in a
webview detail panel when you click a finding or a vulnerability.

The **Dependencies** view is the repo's bill of materials (every declared
dependency, grouped by ecosystem) and is populated on every scan. The
**Vulnerabilities** view lists known CVEs matched against those dependencies
and is populated only when a scan runs with the OSV vulnerability check (see
`trustabl.vulnScan` and the *Scan with Vulnerabilities* command below).

The extension does not bundle a scanner, import SARIF, or run a language
server — it shells out to the `trustabl` CLI and parses its JSON report.

## Install

The extension isn't on the VS Code Marketplace / Open VSX yet, so install it
from a locally built `.vsix`.

### 1. Build the VSIX

Requires Node.js 18+.

```bash
npm ci            # install dev dependencies (first time only)
npm run package   # bundles, then writes trustabl-<version>.vsix to the repo root
```

`npm run package` runs `vsce package` (after `npm run bundle`) and writes
`trustabl-<version>.vsix` to the repo root — e.g. `trustabl-0.1.0.vsix`.

### 2. Install the VSIX

VS Code, Cursor, Windsurf, VSCodium, and other VS Code-compatible editors all
accept a VSIX two ways:

- **From the UI** — open the Extensions view (`Ctrl`/`Cmd`+`Shift`+`X`), click
  the `…` menu at the top of the panel, choose **Install from VSIX…**, and pick
  the file.
- **From the editor's CLI** — each fork ships its own command:

  ```bash
  code     --install-extension trustabl-0.1.0.vsix   # VS Code
  cursor   --install-extension trustabl-0.1.0.vsix   # Cursor
  windsurf --install-extension trustabl-0.1.0.vsix   # Windsurf
  codium   --install-extension trustabl-0.1.0.vsix   # VSCodium
  ```

  Pass `--force` to replace an already-installed copy. If the command isn't
  found, install it from the editor's command palette (e.g. **Shell Command:
  Install 'code' command in PATH**, or the `cursor`/`windsurf` equivalent), then
  reopen your terminal.

Reload the window afterwards (**Developer: Reload Window**). You don't need to
install the `trustabl` CLI separately — the extension resolves or downloads a
compatible binary on first scan (see [How it works](#how-it-works)).

## How it works

On save of a relevant file (Python/TypeScript source, `.claude/agents/*.md`,
or a dependency manifest) the extension runs `trustabl scan --format json`
over your workspace and renders the results. It can also scan automatically
when a workspace is opened (`trustabl.scanOnOpen`). The first scan of a
session refreshes the rule packs; later scans reuse the cached rules.

The `trustabl` binary is resolved in this order: the `trustabl.path` setting
if set; otherwise a compatible `trustabl` already on your `PATH`
(Homebrew/Scoop/Docker); otherwise a copy the extension downloads and caches
on first run from GitHub Releases, verified against the published
`checksums.txt` (sha256) before it is used.

## Settings

See the `Trustabl` section in Settings:

- `trustabl.scanOnSave` — scan when a relevant file is saved (default `true`).
- `trustabl.scanOnOpen` — scan the workspace automatically when it is opened
  (default `true`).
- `trustabl.groupBy` — how to group findings in the Trustabl view
  (`severity` | `file` | `scope` | `rule`; default `severity`).
- `trustabl.detectors` — comma-separated detector categories
  (`claude_sdk`, `openai_sdk`, `google_adk`, `mcp`, `langchain`, `crewai`,
  `pydantic_ai`, `vercel_ai`, `autogen`). Empty = all.
- `trustabl.minSeverity` — hide findings below this severity
  (`info` | `low` | `medium` | `high` | `critical`).
- `trustabl.strict` — pass `--strict` (affects the CLI exit code only).
- `trustabl.vulnScan` — match dependencies against the OSV database on every
  scan (default `false`; does network I/O and downloads the OSV database on
  first use). Leave off and use the *Scan with Vulnerabilities* command for
  one-off checks.
- `trustabl.scanTimeoutSeconds` — kill a scan after this many seconds.
- `trustabl.rulesRepo` / `trustabl.rulesRef` — advanced rule-source overrides.
- `trustabl.path` — explicit path to the `trustabl` binary.

## Commands

- **Trustabl: Scan Workspace** — run a scan now (uses cached rules).
- **Trustabl: Refresh Rules and Scan** — fetch the latest rules, then scan.
- **Trustabl: Scan with Vulnerabilities** — scan and match dependencies against
  the OSV database (downloads it on first use), populating the Vulnerabilities
  view. Also available from that view's title bar.
- **Trustabl: Group Findings By…** — change how the Findings view is grouped
  (also available from the view title bar).

## License

Apache-2.0.
