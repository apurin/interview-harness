# README demo

This folder contains the reproducible source for the animated product demo at `assets/interview-harness-demo.gif`.

## Files

- `interview.html`: the real Interview Harness session shown in the GIF.
- `frames/`: unedited 1280×720 browser captures.
- `assets/GitHub_Invertocat_White.png`: the official GitHub mark used in the repository overlay.
- `build-readme-gif.py`: crops the harness header, adds animated captions and short crossfades, then writes the final GIF.

## Capture

Serve the repository root temporarily:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/demo/interview.html` with a 1280×720 viewport. Use the Light theme, keep the interview in paged mode, and capture these states.

1. `01-layout-decision.png`: select **Three-pane workspace**. Comment “Keep the source list narrow, and let the library rail collapse.” on it and “Borrow the flexible inspector for advanced users.” on **Canvas + inspector**. Close every editor.
2. `02-technology-decision.png`: select **Tauri**. Comment “Best balance for the beta; keep Rust behind a narrow command layer.” on its column and “Borrow its native menu behavior on macOS.” on SwiftUI. Comment “Installer size matters for trial conversion.” on **Installer footprint** and “Keep platform-specific behavior behind one interface.” on **Native integrations**. Close every editor, then hover **~12 MB** to show its installer-footprint detail. Pressing `T` performs the same one-shot hover for deterministic capture.
3. `03-release-table.png`: move **Unified source inbox**, **Evidence board**, and **Citation-backed brief editor** to **Ship in beta**; **Review and approval queue**, **Export packages**, and **Workspace roles and audit log** to **Next release**; and **Continuous source monitoring** and **Public API and webhooks** to **Later**. Pressing `R` performs the same placement for deterministic capture. Comment “Keep approvals lightweight enough for two-person teams.” on Review and approval queue and “Start with outbound webhooks before write APIs.” on Public API and webhooks. Close every editor, then switch to **Table**.
4. `04-customer-flow.png`: wait for the graph to finish arranging. Comment “The weekly brief is the retention moment.” on the full flow and “This is the first meaningful activation event.” on **Create first synthesis**. Close every editor, deselect the node, and return the page to the top before capture.

Capture the full viewport without browser chrome. Do not crop the PNGs manually; the build script applies the shared crop.

## Build

Install Pillow if needed, then run:

```sh
python3 demo/build-readme-gif.py
```

Each state remains visible for about six seconds. The harness capture stays still while the builder animates a generic Interview Harness caption, keeps the repository link visible, and adds a brief transition. Keep caption copy and capture order in `build-readme-gif.py` synchronized with the interview.
