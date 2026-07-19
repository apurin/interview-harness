# Interview Harness

Interview Harness helps agents create temporary local HTML interviews where users clarify intent by reacting to, selecting, editing, and refining generated material.

Keep generated interview pages cheap to author. Move reusable layout, behavior, state, navigation, selection, editing, and export work into the library and skills.

## Repository Policy

- Treat the skills as the authoring manuals. Update them when the public authoring surface changes.
- Keep the minimal skill's authoring API and HTML-file reference identical to the full skill; omit only interview-planning guidance.
- Keep `AGENTS.md` focused on project intent and maintenance policy. Do not duplicate API details, dependency versions, or examples from the library and skills.
- Keep committed examples intentional and curated. Leave scratch interview artifacts untracked.
- Favor readable, inspectable source over packaging opacity.
- Avoid minification by default.

## Release Policy

- Release with `node scripts/release.mjs X.Y.Z`.
- The release script sets `VERSION`, renders skills with the exact `vX.Y.Z` jsDelivr runtime URL, commits release files, tags `vX.Y.Z`, pushes `main` and the tag, refreshes the `@latest` skill URLs, and verifies their published content.
- Update skill templates when the public authoring surface changes; do not hand-edit generated skill files for release content.

## Output Direction

Interview output should be easy for a one-off LLM reader to consume. Prefer human-readable exports until there is a concrete programmatic consumer.

## README Demo Policy

- Keep the README animation reproducible from `demo/`.
- When changing `assets/interview-harness-demo.gif`, update `demo/interview.html`, the real captures in `demo/frames/`, `demo/build-readme-gif.py`, and `demo/README.md` in the same change.
- Use real Interview Harness captures; do not recreate the product UI.
- A temporary localhost server is acceptable for capture only. Generated interviews remain local files that need no hosting.
- Verify that `python3 demo/build-readme-gif.py` reproduces the committed GIF.

## Open Design Space

Do not lock hosting, distribution, persistence, schemas, or the final question taxonomy before implementation work needs those decisions.
