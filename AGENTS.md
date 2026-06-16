# Interview Harness

Interview Harness helps agents create temporary local HTML interviews where users clarify intent by reacting to, selecting, editing, and refining generated material.

Keep generated interview pages cheap to author. Move reusable layout, behavior, state, navigation, selection, editing, and export work into the library and skills.

## Repository Policy

- Treat the skills as the authoring manuals. Update them when the public authoring surface changes.
- Keep `AGENTS.md` focused on project intent and maintenance policy. Do not duplicate API details, dependency versions, or examples from the library and skills.
- Keep committed examples intentional and curated. Leave scratch interview artifacts untracked.
- Favor readable, inspectable source over packaging opacity.
- Avoid minification by default.

## Release Policy

- Set `VERSION` in `interview-harness.js` to the exact release version.
- Keep shared jsDelivr URLs in docs and skills on the active major alias, such as `@2`.
- Update the major alias in docs and skills only when starting a new major line.
- Tag releases as `vX.Y.Z`, then push `main` and the tag.

## Output Direction

Interview output should be easy for a one-off LLM reader to consume. Prefer human-readable exports until there is a concrete programmatic consumer.

## Open Design Space

Do not lock hosting, distribution, persistence, schemas, or the final question taxonomy before implementation work needs those decisions.
