# Trustabl for VS Code and Cursor

Runs the [Trustabl](https://github.com/trustabl/trustabl) agent-reliability
scanner on save and shows findings in the Problems panel and a Trustabl
sidebar (with per-surface readiness scores).

## How it works

On save of a relevant file (Python/TypeScript source, `.claude/agents/*.md`,
or a dependency manifest) the extension runs `trustabl scan --format json`
over your workspace and renders the results. The first scan of a session
refreshes the rule packs; later on-save scans use the cached rules.

The `trustabl` binary is downloaded on first run from GitHub Releases and
verified against the published `checksums.txt`. If you already have it on your
`PATH` (Homebrew/Scoop/Docker), that is used instead. Set `trustabl.path` to
point at a specific binary.

## Settings

See the `Trustabl` section in Settings:

- `trustabl.scanOnSave` — scan when a relevant file is saved (default `true`).
- `trustabl.detectors` — restrict detector categories (e.g. `claude_sdk`).
- `trustabl.minSeverity` — hide findings below this severity.
- `trustabl.strict` — pass `--strict` (affects the CLI exit code only).
- `trustabl.scanTimeoutSeconds` — kill a scan after this many seconds.
- `trustabl.rulesRepo` / `trustabl.rulesRef` — advanced rule-source overrides.
- `trustabl.path` — explicit path to the `trustabl` binary.

## Commands

- **Trustabl: Scan Workspace** — run a scan now (uses cached rules).
- **Trustabl: Refresh Rules and Scan** — fetch the latest rules, then scan.

## License

Apache-2.0.
