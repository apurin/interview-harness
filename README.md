# Interview Harness

Interview Harness is a readable client-side JavaScript library for one-off local interview pages. Agents use it to ask interactive questions, show rich options, let a user react or edit, and export only the user-entered or changed answers.

The output is a temporary HTML artifact. The library carries layout, state, navigation, comments, drag-and-drop bucketing, code editing, and export behavior so generated interview files stay small.

## Files

- `interview-harness.js`: the browser library.
- `skills/interview-harness/SKILL.md`: opinionated authoring instructions and examples.
- `skills/interview-harness-min/SKILL.md`: minimal authoring instructions.
- `AGENTS.md`: project guidance for agents working in this repository.

## Usage

Create one HTML file that loads the major-pinned browser library from jsDelivr.

```html
<div id="interview-harness"></div>
<script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@3/interview-harness.js"></script>
<script>
  const h = InterviewHarness;

  h.mount({
    title: "Project direction interview",
    intro: "Short context for the user.",
    questions: [
      h.choice({
        id: "direction",
        prompt: "Which direction should I continue?",
        select: "one",
        cardsPerRow: 2,
        options: [
          h.option({
            id: "dense",
            title: "Dense workspace",
            body: h.html({ markup: "<p>Fast scanning for power users.</p>" })
          }),
          h.option({
            id: "guided",
            title: "Guided setup",
            body: h.html({ markup: "<p>Lower cognitive load, more sequence.</p>" })
          })
        ]
      }),
      h.evaluation({
        id: "tier",
        prompt: "Which launch package fits best?",
        options: ["Lean", "Guided", "Enterprise"],
        rows: [
          h.feature({
            title: "Visual preview",
            cells: {
              lean: "no",
              guided: { icon: "partial", text: "One preview" },
              enterprise: { icon: "yes", detail: "Comparison gallery" }
            }
          })
        ]
      }),
      h.flow({
        id: "fulfillment-flow",
        prompt: "Review and correct this fulfillment flow.",
        connections: [
          { from: "Receive order", to: "Check inventory" },
          { from: "Check inventory", to: "Reserve stock", label: "available" }
        ]
      }),
      h.edit({
        id: "draft",
        prompt: "Edit this draft.",
        artifact: h.code({ lang: "md", value: "Write the next implementation prompt." })
      })
    ]
  });
</script>
```

Open the HTML file in a browser. No build step is required.

## Distribution

Interview Harness uses jsDelivr's GitHub CDN endpoint for shared interview files.

- Use Git tags as release versions.
- Use the active major version in generated artifacts, such as `https://cdn.jsdelivr.net/gh/apurin/interview-harness@3/interview-harness.js`.
- Use exact tags only for frozen archival artifacts, such as `https://cdn.jsdelivr.net/gh/apurin/interview-harness@vX.Y.Z/interview-harness.js`.
- Use `@latest` only for fetching the newest skill source; generated interview HTML should stay on the active major alias.
- Avoid `@main`, omitted versions, and mutable non-semver aliases in shared artifacts.
- Keep npm packaging out of scope until there is a concrete need for npm installation, package metadata, or ecosystem discovery.

Release command:

```sh
node scripts/release.mjs X.Y.Z
```

The release script updates `VERSION`, renders `skills/*/SKILL.md` from `templates/skills/*/SKILL.md`, checks the library syntax, commits the current worktree, tags `vX.Y.Z`, pushes `main` and the tag, purges jsDelivr URLs for the active major and `@latest`, then fetches the exact tag, active major, and `@latest`.

Remote skill reference:

```text
https://cdn.jsdelivr.net/gh/apurin/interview-harness@3/skills/interview-harness/SKILL.md
```

## Question API

- `h.choice({ id, prompt, select, options, cardsPerRow })`: single or multiple choice. `select` is `"one"` or `"many"`. `cardsPerRow` is `"auto"`, `1`, `2`, `3`, or `4`.
- `h.evaluation({ id, prompt, options, rows })`: select one option column while comparing feature rows. Use `h.feature({ id, title, body, group, cells })` for rows. Users can comment on columns and rows. Cell icons are `"yes"`, `"no"`, `"partial"`, `"unknown"`, `"warn"`, and `"best"`; add `text` or `detail` when an icon is not enough.
- `h.bucket({ id, prompt, buckets, options })`: drag options into buckets.
- `h.flow({ id, prompt, connections })`: review and correct a directed flow. Each connection has `from`, `to`, and an optional `label`; node names are inferred from the connections. Users can add, rename, move, and remove nodes; Command-drag between nodes to connect them; name or remove connections; press Delete or Backspace to remove the selected node or connection; comment on the whole flow, nodes, or connections; arrange the graph; and revert structural edits.
- `h.edit({ id, prompt, artifact, language })`: editable code or text artifact.

Short interviews show all questions by default. Longer interviews show one question per page. Users can switch views in the page.

## Rich Content

Plain strings are valid options. Use `h.option({ id, title, body, tags })` when an option needs richer context.

Rich body helpers:

- `h.html({ markup })`: trusted inline HTML.
- `h.frame({ src, srcdoc, title, fileName, height })`: iframe preview with a compact source-file header and a new-tab icon button. Inline `srcdoc` frames open from a generated preview URL.
- `h.code({ lang, value })`: highlighted code. Edit questions use the same helper for editable artifacts.

An option body may be an array, so one option can combine prose, tables, images, frames, and code.

## Output

The page exports a text answer summary containing only changed answers and user-entered data:

- selected choices
- selected evaluation columns with their row values
- added options
- changed bucket assignments
- corrected flows, including the complete final flow when its structure changed; comment-only reviews export only their comments
- edited content changed from the original artifact
- comments the user wrote

Untouched defaults stay out of the export.

## Runtime Dependencies

The library is standalone source, but it loads a few browser-side packages when a question needs them:

- SortableJS `1.15.7` for bucket drag controls.
- vis-network `10.1.0` for flow questions.
- CodeMirror `6.0.2` for edit questions and code previews.
- `@codemirror/lang-javascript` `6.2.5`, `@codemirror/lang-markdown` `6.5.0`, `@codemirror/lang-html` `6.4.11`, and `@codemirror/lang-json` `6.0.2` for syntax support.
- `@codemirror/theme-one-dark` `6.1.3` for a consistent editor theme.

These are loaded from public CDN URLs in `interview-harness.js`.
