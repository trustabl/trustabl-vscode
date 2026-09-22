# Evaluating Trustabl in VS Code and Cursor

This guide covers two things: **trialling Trustabl** to decide whether it earns a
place in your editor, and **reading the results** once it runs.

---

## What Trustabl evaluates

Trustabl is a static analyzer for AI-agent codebases. It inventories the agents,
tools, subagents, skills and MCP servers in a repository, then evaluates each one
against a rule pack covering ten ecosystems: Claude Agent SDK, OpenAI Agents SDK,
Google ADK, MCP, LangChain, LangGraph, CrewAI, AutoGen AG2, Pydantic AI and
Vercel AI.

It looks for the failure modes ordinary code review misses, for example a tool
that shells out and can be prompt-injected, an agent session with no turn limit,
or an MCP tool that fetches a caller-controlled URL.

Rules are versioned separately from the engine and fetched at scan time from a
signed channel, so a scan picks up new detections without upgrading the binary.

---

## What the extension is

The extension does **not** bundle a scanner, import SARIF, or run a language
server. It shells out to the `trustabl` CLI and parses its JSON report, then
renders that as native diagnostics and a sidebar.

That matters for evaluation in one specific way: **the extension pins the CLI
version it parses against.** If `trustabl` is not already on your `PATH` at a
compatible version, the extension downloads the pinned release, verifies its
checksum, and caches it in extension storage.

So the analysis you see in the editor is produced by the pinned CLI, which may be
older than the CLI you would install yourself. Check `PINNED_CLI_VERSION` in
`src/binary.ts` against the [latest
release](https://github.com/trustabl/agent-reliability-analyzer/releases) before
concluding a rule is missing — it may simply not exist in the pinned build.

To evaluate against a newer engine, install the CLI yourself and point
`trustabl.path` at it.

---

## Installing it

### VS Code

Search **Trustabl** in the Extensions panel, or install from the
[Marketplace listing](https://marketplace.visualstudio.com/items?itemName=trustabl.trustabl).

### Cursor, Windsurf, VSCodium

These read the Open VSX registry, where the extension is **not yet published**.
Install from a `.vsix` instead:

```bash
git clone https://github.com/trustabl/trustabl-vscode
cd trustabl-vscode
npm install
npx vsce package          # produces trustabl-<version>.vsix
```

Then in the editor: **Extensions → ⋯ → Install from VSIX…** and pick the file.
Or from a terminal:

```bash
code --install-extension trustabl-0.1.0.vsix      # cursor --install-extension … in Cursor
```

### The scanner binary

You do not need to install the CLI first. On activation the extension looks for
`trustabl` on your `PATH`; if it is missing or at an incompatible version, it
downloads the pinned release, verifies its checksum, and caches it in extension
storage.

Install the CLI yourself only if you want to evaluate against a newer engine than
the pinned one — then set `trustabl.path` to it.

---

## First run

1. Open a repository that uses one of the ten supported SDKs.
2. The extension activates on startup and scans on open, so findings appear
   without you asking. A large repo takes a moment on the first scan while the
   rule pack is fetched.
3. Click the **Trustabl** icon in the activity bar for the sidebar: Findings,
   Scores, Dependencies, Vulnerabilities, Help & Feedback.
4. Findings also appear in the **Problems** panel as native diagnostics.
5. Click any finding for the detail panel with the full explanation and fix.

If nothing appears, run **Trustabl: Scan Workspace** from the command palette —
that distinguishes "no findings" from "never scanned".

---

## Trialling it

**1. Open a repo you know well.** The extension scans on open and on save by
default, so findings appear without you asking. You are checking whether they are
real, not whether a build passes.

**2. Read the inventory before the findings.** Open the **Scores** view. If the
tool and agent counts look wrong, the scan is pointed at the wrong workspace
folder or your SDK is not being detected. A score computed over the wrong
inventory is meaningless.

**3. Sample five findings and judge them yourself.** Click one to open the detail
panel, then jump to the file. The question is not "is this a bug" but "would we
have wanted to know". False positives cost trust; findings you would have fixed
anyway are the signal.

**4. Then decide the noise budget.** `trustabl.minSeverity` controls what reaches
the Problems panel. Start at `info` to see everything during the trial, then
raise it once you know what you want to act on.

---

## Reading the results

### Readiness score

A number from 0 to 100. **Risk is simply `100 - readiness`.** The score is
weighted across the surfaces found, so a repo with one bad tool out of fifty
scores far better than a repo with one bad tool out of two.

**Do not read the score in isolation.** A high score over an empty inventory
means nothing was analysed, not that the code is safe. Check the tool and agent
counts first.

### Severity

| Severity | Meaning |
|---|---|
| `critical` | Exploitable now, fix before shipping |
| `high` | Serious weakness, fix this sprint |
| `medium` | Real defect, schedule it |
| `low` | Worth improving, not urgent |
| `info` / META | Observations, **not defects** — an opaque agent, an unaudited SDK |

`info` and META signals are observations. They exist so the report is honest
about what it could not evaluate.

### Triage order

Fix in severity order, but use the **projected scores** in the Scores view to
decide where effort pays off. They estimate the score if you resolved everything
at a given severity, so you can see whether clearing every `low` finding is worth
it or whether two `high` ones dominate the result.

Projections come from the same formula, not a re-scan.

---

## Where the results appear

| Surface | What you get |
|---|---|
| **Problems panel** | Findings as native diagnostics, filtered by `trustabl.minSeverity` |
| **Findings** view | Every finding, grouped by severity, rule, or file |
| **Scores** view | Readiness per surface — tools, agents, subagents, skills |
| **Dependencies** view | The repo's bill of materials, every declared dependency by ecosystem |
| **Vulnerabilities** view | Known CVEs matched against those dependencies |
| **Detail panel** | Click a finding for the full explanation and suggested fix |

The **Dependencies** view populates on every scan. **Vulnerabilities** populates
only when a scan runs with the OSV check — `trustabl.vulnScan`, or the *Scan with
Vulnerabilities* command. The first such scan downloads the OSV database and
takes noticeably longer than the timeout you may be used to.

---

## Commands

| Command | Use |
|---|---|
| `Trustabl: Scan Workspace` | Scan now, without waiting for a save |
| `Trustabl: Refresh Rules and Scan` | Fetch the latest rule pack, then scan |
| `Trustabl: Scan with Vulnerabilities` | Scan including the OSV vulnerability check |
| `Trustabl: Group Findings By…` | Switch the Findings view between severity, rule and file |

---

## Settings worth knowing during a trial

| Setting | Default | Why it matters |
|---|---|---|
| `trustabl.scanOnSave` | `true` | Every save triggers a scan. Turn off on a large repo if it feels heavy. |
| `trustabl.scanOnOpen` | `true` | You get findings before asking for them. |
| `trustabl.minSeverity` | `info` | Everything reaches the Problems panel. Raise it once you know what you want. |
| `trustabl.path` | *(empty)* | Point at your own CLI to evaluate against a newer engine than the pinned one. |
| `trustabl.detectors` | *(empty)* | Limit to specific ecosystems. Leave empty for all. |
| `trustabl.scanTimeoutSeconds` | `120` | Raise it for a large repo, or for the first `--vuln-scan`. |
| `trustabl.vulnScan` | `false` | Opt-in. Adds CVE matching, and time. |
| `trustabl.strict` | `false` | Lowers the bar to any finding of low or above. |

---

## How this differs from the CI plugins

This runs at **editor time**, before code is committed. There is no build to
gate and no exit code to act on — the point is fixing findings as you write.

Use the CI plugin for enforcement and this for the feedback loop. Evaluating this
extension as a gate will disappoint; evaluate it as a linter for agent code.

---

## What Trustabl does not do

Worth knowing before you evaluate it, so the result is not oversold:

- **It is static analysis.** It reads code, it does not run your agent, so it
  cannot observe what happens at inference time.
- **A finding is a weakness, not a proven exploit.** Severity reflects the shape
  of the risk, not a demonstrated attack.
- **Coverage depends on detection.** If your SDK is not one of the ten supported,
  or your agents are constructed dynamically, they may not appear in the
  inventory. The report states what it parsed and what it skipped — read it.
- **An empty result is not a pass.** If nothing was found, verify the scanned
  path and that your SDK is supported before concluding the repo is clean.
- **The editor view is only as current as the pinned CLI.** A rule released after
  that pin will not fire here, even though it fires for a CLI user.

---

## Troubleshooting a trial

| Symptom | Likely cause |
|---|---|
| No findings at all, empty Scores view | Wrong workspace folder, or an unsupported SDK. Check the inventory counts. |
| "trustabl.path is set but not found" | The configured path is wrong. Clear the setting to let the extension manage the binary. |
| Scans time out | Large repo, or a first `--vuln-scan` downloading the OSV database. Raise `trustabl.scanTimeoutSeconds`. |
| A rule you expect is missing | It may postdate the pinned CLI version. Point `trustabl.path` at a current CLI and re-scan. |
| Vulnerabilities view stays empty | `trustabl.vulnScan` is off. Run *Scan with Vulnerabilities*. |

For a trial, scan a repo you know, open one finding, and decide whether the
explanation tells you something you did not already know. That tests both the
detection and whether the output is actionable.
