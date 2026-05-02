# Publishing (VS Code Marketplace)

This extension uses `@vscode/vsce` for packaging and publishing.

## Prereqs (one-time)
1. Create a publisher on the Visual Studio Marketplace:
   - Your `package.json` `"publisher"` must match the publisher ID exactly.
2. Create a Personal Access Token (PAT) for publishing.
   - Scope required: **Marketplace > Manage**

## Publish (public)
1. Install deps + compile:
   - `npm install`
   - `npm run compile`
2. Package a local `.vsix` (optional sanity check):
   - `npm run package`
3. Publish to the Marketplace:
   - `npx vsce publish -p <YOUR_PAT>`

## Publish a GitHub release asset

This repo also includes a GitHub Actions workflow that builds a `.vsix` automatically when you push a version tag such as `v0.0.2`.

1. Make sure `package.json` has the version you want to ship.
2. Create a tag that matches that version:
   - `git tag v0.0.2`
3. Push the tag:
   - `git push origin v0.0.2`
4. GitHub Actions will create a Release and attach the packaged `.vsix`.

## Notes
- Each publish requires a new `version` in `package.json`.
- `node_modules/`, `.DS_Store`, and local dbt-generated outputs are ignored and won’t be published.
