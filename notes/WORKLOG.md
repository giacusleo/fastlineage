# Work log

## 2026-04-26

- Added `notes/` folder to keep context/decisions/logs in one place.
- Implemented webview UX updates (depth controls + node card styling + conditional expand visibility).
- Combined upstream/downstream depth into a single toolbar control with “Depth” centered.
- Restructured the dbt fixture into per-model folders with `.sql`, `.yml`, and `.md` docs blocks.
- Restructured seeds and snapshots into per-asset folders with matching config/docs files.
- Rewrote generated doc blocks to reduce repeated boilerplate across column docs.
- Added shared `common_docs` anchors and rewired repeated column descriptions to them.
- Refreshed lineage card design with db-style glyphs, materialization labels, cleaner edge routing, freer drag bounds, and default downstream depth of 1.
- Made lineage layout responsive to narrower VS Code panes with adaptive sizing, board bounds, and resize refitting.
- Changed the default upstream depth from 2 to 1.
- Reworked lineage layering from shortest-hop placement to dependency-depth placement and simplified routing around target-side trunks for better scalability.
- Refined edge styling with smaller card-touching arrowheads and smoother fan-in curves.
- Replaced faux fan-in edge endings with true bundled-trunk routing so multiple inbound dependencies share one final arrow into each target card.
- Refined the bundled trunk geometry again to remove the clunky target-side vertical rail and converge branches into a smoother shared horizontal stub.
