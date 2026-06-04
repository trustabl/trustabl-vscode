# Trustabl for VS Code and Cursor

Runs the [Trustabl](https://github.com/trustabl/trustabl) agent-reliability
scanner on save and surfaces findings as native diagnostics (Problems panel),
in a Trustabl activity-bar sidebar (Findings / Scores / Help & Feedback, with
per-surface readiness scores), and in a webview detail panel when you click a
finding.

The extension does not bundle a scanner, import SARIF, or run a language
server — it shells out to the `trustabl` CLI and parses its JSON report.

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
  (`claude_sdk`, `openai_sdk`, `google_adk`). Empty = all.
- `trustabl.minSeverity` — hide findings below this severity
  (`info` | `low` | `medium` | `high` | `critical`).
- `trustabl.strict` — pass `--strict` (affects the CLI exit code only).
- `trustabl.scanTimeoutSeconds` — kill a scan after this many seconds.
- `trustabl.rulesRepo` / `trustabl.rulesRef` — advanced rule-source overrides.
- `trustabl.path` — explicit path to the `trustabl` binary.

## Commands

- **Trustabl: Scan Workspace** — run a scan now (uses cached rules).
- **Trustabl: Refresh Rules and Scan** — fetch the latest rules, then scan.
- **Trustabl: Group Findings By…** — change how the Findings view is grouped
  (also available from the view title bar).

## License

Apache-2.0.
