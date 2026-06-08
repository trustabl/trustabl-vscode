# Publishing Trustabl

The extension ships to two registries:

- **VS Code Marketplace** — for VS Code
- **Open VSX** — for Cursor, Windsurf, VSCodium, and other VS Code-compatible editors

`.github/workflows/release.yml` publishes to **both** automatically when you push a
`v*` tag. You only do the one-time account setup + secrets below, then tag releases.

---

## One-time setup

### 1. VS Code Marketplace publisher + token

1. Sign in to <https://marketplace.visualstudio.com/manage> with a Microsoft account
   (this also creates/uses an Azure DevOps organization).
2. Create a publisher whose ID is **`trustabl`** — it must equal `"publisher"` in
   `package.json`.
3. Create a Personal Access Token in Azure DevOps:
   <https://dev.azure.com> → user settings (top right) → **Personal access tokens** →
   **New Token**:
   - **Organization:** *All accessible organizations*
   - **Scopes:** *Marketplace → Manage*
   - Copy the token — this is **`VSCE_PAT`**.

### 2. Open VSX publisher + token (for Cursor)

1. Sign in to <https://open-vsx.org> with the GitHub account that owns the namespace
   (`jhumel-code`).
2. Sign the Eclipse Foundation **Publisher Agreement**: open-vsx.org → your avatar →
   **Settings** → **Show Publisher Agreement** → read → **Agree**.
   (Your eclipse.org account's GitHub username must match your open-vsx login.)
3. Generate a token: avatar → **Settings** → **Access Tokens** → **Generate New Token**.
   Copy it — this is **`OVSX_PAT`**.
4. Create the namespace once (locally):
   ```bash
   npx ovsx create-namespace trustabl -p <OVSX_PAT>
   ```

### 3. GitHub repo secrets

In `trustabl/trustabl-vscode` → **Settings → Secrets and variables → Actions →
New repository secret** (needs repo admin):

- `VSCE_PAT` = the Marketplace token
- `OVSX_PAT` = the Open VSX token

`release.yml` reads both.

---

## Cutting a release

1. Bump `"version"` in `package.json` (e.g. `0.1.0` → `0.1.1`). Both registries reject
   re-publishing the same version.
2. Confirm `PINNED_CLI_VERSION` in `src/binary.ts` points at a **published**
   `trustabl/trustabl` engine release that has assets (currently `0.1.4`). Bump it as the
   engine releases.
3. (Optional) update a `CHANGELOG`.
4. Commit, then tag and push the tag (push via the gh credential helper, not bare
   `git push`):
   ```bash
   git commit -am "release: v0.1.1"
   git tag v0.1.1
   unset GITHUB_TOKEN GH_TOKEN
   git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main v0.1.1
   ```
5. The **release** workflow runs: `npm ci` → `npm run test:unit` →
   `vsce publish` → `ovsx publish`. Watch the **Actions** tab.

---

## Manual / local publish (fallback)

If you'd rather publish by hand instead of via the tag workflow:

```bash
npm ci
npm run bundle
npx @vscode/vsce package                                  # trustabl-<version>.vsix
npx @vscode/vsce publish -p <VSCE_PAT>                    # VS Code Marketplace
npx ovsx publish trustabl-<version>.vsix -p <OVSX_PAT>    # Open VSX
```

---

## Pre-publish checklist

- [ ] `npm run test:unit` green and CI green on `main`
- [ ] `"version"` bumped in `package.json`
- [ ] `media/icon.png` present and `README.md` accurate
- [ ] `PINNED_CLI_VERSION` matches a live engine release with assets
- [ ] smoke-tested the packaged `.vsix` locally (install with `--force`, open a repo, scan)

## Notes

- The publisher id `trustabl` in `package.json` must match the publisher created on
  **both** registries.
- Marketplace listing icon is `media/icon.png` (128px+ PNG); the activity-bar icon is
  `media/icon.svg` (themed/monochrome).
- Optional Open VSX/Cursor verification badge: post in the Cursor forum's
  *Extension Verification* category with the extension name and a website link.
