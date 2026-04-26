# FastLineage

FastLineage is a lightweight VS Code extension for exploring dbt lineage directly inside the editor panel.

## What it does

- Parses `models/**/*.sql` and builds a lineage graph from `ref()` and `source()` calls.
- Focuses the graph around the active model so upstream and downstream context stay readable.
- Lets you pan, zoom, re-root, and jump from graph nodes back into the corresponding file.
- Includes a sizeable sample dbt project in `fixtures/dbt_project` for local development and demoing.

## Current scope

FastLineage is intentionally small and fast. Today it is SQL-driven and does not rely on `manifest.json`.

## Install locally

If you want to try the extension without publishing it:

1. Open the repository's GitHub Releases page.
2. Download the latest `fastlineage-*.vsix` asset.
3. In VS Code or Cursor, open Extensions and choose "Install from VSIX...".

If you want to build it yourself instead:

1. Clone the repo.
2. Run `npm install`.
3. Run `npm run package`.
4. Install the generated `.vsix` file via "Install from VSIX...".

## Develop

1. Run `npm install`.
2. Run `npm run compile`.
3. Press `F5` to launch an Extension Development Host.
4. The launch config opens the included fixture project automatically.

## Repo guide

- `src/` contains the extension source.
- `out/` contains the compiled extension bundled for development and packaging.
- `media/` contains the webview assets.
- `fixtures/dbt_project/` contains the demo dbt project used for testing and iteration.
- `docs/` contains repository-level docs such as packaging and publishing notes.
