# Work log

## 2026-04-26

- Added `notes/` folder to keep context/decisions/logs in one place.
- Implemented webview UX updates (depth controls + node card styling + conditional expand visibility).
- Combined upstream/downstream depth into a single toolbar control with “Depth” centered.
- Restructured the dbt fixture into per-model folders with `.sql`, `.yml`, and `.md` docs blocks.
- Restructured seeds and snapshots into per-asset folders with matching config/docs files.
- Rewrote generated doc blocks to reduce repeated boilerplate across column docs.
- Added shared `common_docs` anchors and rewired repeated column descriptions to them.
