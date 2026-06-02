# Interview Harness

Interview Harness is a readable client-side JavaScript library for one-off local interview pages. Agents use it to ask interactive questions, show rich options, let a user react or edit, and export only the user-entered or changed answers.

The output is a temporary HTML artifact. The library carries layout, state, navigation, comments, drag ordering, code editing, and export behavior so generated interview files stay small.

## Files

- `interview-harness.js`: the browser library.
- `skills/interview-harness/SKILL.md`: neutral authoring instructions.
- `skills/interview-harness-opionated/SKILL.md`: opinionated authoring instructions and examples.
- `AGENTS.md`: project guidance for agents working in this repository.

## Usage

Create a local HTML file next to `interview-harness.js`.

```html
<div id="interview-harness"></div>
<script src="./interview-harness.js"></script>
<script>
  const h = InterviewHarness;

  h.mount({
    title: "Project direction interview",
    intro: "Short context for the user.",
    questions: [
      h.text("context", "What should I keep in mind?"),
      h.one("direction", "Which direction should I continue?", [
        h.item("dense", "Dense workspace", h.prosCons(
          ["Fast scanning", "Power-user friendly"],
          ["Can feel busy"]
        )),
        h.item("guided", "Guided setup", h.html("<p>Lower cognitive load, more sequence.</p>"))
      ]),
      h.redline("draft", "Edit this draft.",
        h.code("md", "Write the next implementation prompt."))
    ]
  });
</script>
```

Open the HTML file in a browser. No build step is required.

## Question API

- `h.text(id, prompt, options)`: freeform text.
- `h.one(id, prompt, items, options)`: single choice.
- `h.many(id, prompt, items, options)`: multiple choice with add-item support by default.
- `h.rank(id, prompt, items, options)`: drag reorder.
- `h.sort(id, prompt, buckets, items, options)`: drag items into columns.
- `h.review(id, prompt, verbs, items, options)`: single-select review states, editable item text, and add-item support by default.
- `h.redline(id, prompt, artifact, options)`: editable code or text artifact.

`pageMode` may be `"auto"`, `"all"`, or `"paged"`. Auto shows all questions when there are three or fewer and one question per page otherwise. Users can switch modes in the page.

## Rich Content

Plain strings are valid items. Use `h.item(id, title, body, options)` when an option needs richer context.

Rich body helpers:

- `h.html(markup)`: trusted inline HTML.
- `h.frame(src, options)`: iframe preview. Use `srcdoc` in options for inline frames.
- `h.prosCons(pros, cons)`: compact two-column pros and cons.
- `h.code(lang, value)`: highlighted code. Redline questions use the same helper for editable artifacts.

An item body may be an array, so one option can combine prose, tables, images, pros/cons, frames, and code.

## Output

The page exposes text and JSON export. Exports include only changed answers and user-entered data:

- text answers with content
- selected choices
- added items
- changed rank or sort order
- selected review states
- edited review text
- redline content changed from the original artifact
- comments the user wrote

Untouched defaults stay out of the export.

## Runtime Dependencies

The library is standalone source, but it loads a few browser-side packages when a question needs them:

- SortableJS `1.15.7` for rank and sort drag controls.
- CodeMirror `6.0.2` for redline editing and code previews.
- `@codemirror/lang-javascript` `6.2.5`, `@codemirror/lang-markdown` `6.5.0`, `@codemirror/lang-html` `6.4.11`, and `@codemirror/lang-json` `6.0.2` for syntax support.
- `@codemirror/theme-one-dark` `6.1.3` for a consistent editor theme.

These are loaded from public CDN URLs in `interview-harness.js`.
