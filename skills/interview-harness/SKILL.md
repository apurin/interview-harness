---
name: interview-harness
description: Create a local HTML interview artifact with the Interview Harness library. Use when an agent needs compact interactive questions and text or JSON export.
---

# Interview Harness

Create a local HTML file. Let the library handle layout, state, navigation, comments, drag ordering, code editing, and exports.

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
