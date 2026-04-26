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

## Notes
- Each publish requires a new `version` in `package.json`.
- `node_modules/`, `.DS_Store`, and dbt-generated fixture outputs are ignored and won’t be published.

