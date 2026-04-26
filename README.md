# FastLineage (VS Code)

FastLineage is a lightweight dbt lineage visualiser that lives inside the VS Code **panel**.

## MVP (current)
- Parses `models/**/*.sql` and builds a dependency graph from `ref()` / `source()` calls in the SQL (no `manifest.json`).
- Shows a focused lineage graph for the active model (upstream + downstream).
- Click a node to jump to that model/source.
- Refresh button to rebuild the graph from disk.

## Develop
1. `npm install`
2. `npm run compile`
3. Press `F5` (launches an Extension Development Host)

