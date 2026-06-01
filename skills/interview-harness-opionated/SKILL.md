---
name: interview-harness-opionated
description: Create a local HTML interview artifact with Interview Harness, using opinionated question patterns for agent-led design, assumption review, scope control, artifact redlining, and concise text-first export.
---

# Interview Harness, Opinionated

Create a local HTML file. Spend tokens on questions and rich items; let the library handle layout, state, navigation, comments, drag ordering, code editing, and exports.

<!-- shared-start -->
## Shared Usage

- Write minimal standalone HTML that includes `interview-harness.js`.
- Use the harness API for controls, layout, navigation, comments, persistence, and export.
- Spend effort on question quality, item wording, and useful rich previews.
- Keep intro text short. Put context in questions, help text, and item bodies.
- Avoid custom CSS or bespoke layout unless the user explicitly asks for it.
- Do not run a dev server, app scaffold, or browser layout test for an ordinary interview artifact.
- Hand the user the local HTML file to open.

```html
<div id="interview-harness"></div>
<script src="./interview-harness.js"></script>
<script>
  const h = InterviewHarness;

  h.mount({
    title: "Project direction interview",
    intro: "Short context for the user.",
    pageMode: "auto",
    questions: [
      h.text("context", "What should I keep in mind?"),
      h.one("direction", "Which direction should I continue?", [
        h.item("a", "A. Dense workspace", h.frame("mockups/a.html")),
        h.item("b", "B. Guided setup", h.frame("mockups/b.html"))
      ]),
      h.many("features", "Which features matter?", [
        "Fast export",
        "Rich previews",
        "Comment buttons"
      ])
    ]
  });
</script>
```

## Surface

- `h.text(id, prompt, options)`
- `h.one(id, prompt, items, options)`
- `h.many(id, prompt, items, options)`
- `h.rank(id, prompt, items, options)`
- `h.sort(id, prompt, buckets, items, options)`
- `h.review(id, prompt, verbs, items, options)`
- `h.redline(id, prompt, artifact, options)`

## Items

Plain strings are valid items. Use `h.item(id, title, body, options)` when an option needs rich context.

```js
h.item("summary", "Human-readable summary",
  h.prosCons(
    ["Fast for agents to read", "Easy for users to inspect"],
    ["Less precise for automation"]
  ))

h.item("preview", "Preview plus notes",
  h.html("<div class='mini-preview'>...</div>"))

h.item("code", "Editable interaction model",
  h.code("js", "select(anchor).preview().commitWhenValid();"))
```

## Rich Content

- `h.html(markup)` renders trusted inline HTML.
- `h.frame(src, options)` embeds an iframe preview. Use `srcdoc` in options for inline frames.
- `h.prosCons(pros, cons)` renders two compact lists.
- `h.code(lang, value)` renders highlighted code. Redline questions use the same code helper for editable artifacts.

Rich content can be an array, so an item may combine images, tables, prose, pros/cons, frames, and code.

## Options And Output

- `pageMode` may be `"auto"`, `"all"`, or `"paged"`. Auto shows all questions when there are three or fewer and one question per page otherwise. Users can switch modes in the interview UI.
- `many` and `review` support added items by default. Added items are selected/kept by default and only expose delete.
- `sort` and `rank` use drag controls.
- Comments open in a modal and only appear in output when the user wrote one.
- Text and JSON exports include user-entered data and changed answers, not untouched defaults.
- Default output is text. JSON is available automatically.
<!-- shared-end -->

## Opinionated Patterns

- Start with `text` only when context is genuinely open-ended.
- Use `one` for a direction choice. Include rich previews that make tradeoffs concrete.
- Use `many` when the user can keep parts from several options or add a missing option.
- Use `review` for assumptions, terms, claims, and draft requirements the user should correct.
- Use `sort` for hard scope boundaries.
- Use `rank` for implementation order, priority, or sequencing.
- Use `redline` when the artifact itself should be edited.
- Put risky assumptions in review items before asking the user for prose.
- Keep the final question broad enough for caveats the structured controls missed.

## Examples

Direction selector:

```js
h.one("lead_design", "Which direction should I continue?", [
  h.item("dense", "Dense workspace", [
    h.frame("mockups/dense.html"),
    h.prosCons(["Fast scanning", "Power-user friendly"], ["Can feel busy"])
  ]),
  h.item("guided", "Guided setup", [
    h.frame("mockups/guided.html"),
    h.prosCons(["Clear first run", "Easy decisions"], ["Less flexible"])
  ])
])
```

Assumption review:

```js
h.review("assumptions", "Check my working assumptions.",
  ["keep", "revise", "drop", "unsure"],
  [
    "Users want to answer quickly, then export a concise summary.",
    "Generated pages are temporary and local-first.",
    "Programmatic JSON output is required for the first version."
  ])
```

Scope classifier:

```js
h.sort("scope", "Classify these features.",
  ["must have", "nice later", "avoid for now", "unclear"],
  [
    "Standalone local HTML file",
    "No build step",
    "Machine-readable JSON",
    "Mobile review"
  ])
```

Artifact redline:

```js
h.redline("draft_prompt", "Edit the prompt until it matches your intent.",
  h.code("md", `Create a local HTML interview.
Ask the user to pick a design direction.
Export the result as JSON.`))
```
