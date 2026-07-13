---
name: interview-harness-min
description: Create a local visual interview from already-planned questions using choices, comparisons, categorization, flow correction, and artifact editing.
---

# Interview Harness

Create one local HTML interview that lets the user select, comment on, correct, and refine generated material. Load the harness from `%SCRIPT_URL%`. This skill is the complete authoring reference; do not read or copy the library source.

Save the page as a `.html` file and present its path. The user can open it directly in a browser. Do not host it or start a server.

## Authoring API

Call `InterviewHarness.mount({ title, markdownIntro?, questions })`. Use only documented fields; invalid shapes fail with a path-specific error. The harness creates its own page container, IDs, layout, state, navigation, comments, and export.

Every card uses:

```js
{
  title: "Required title",
  markdown: "Optional **Markdown** shown on the card",
  markdownTooltip: "Optional Markdown detail behind an info icon",
  htmlPreview: "<svg>...</svg>", // raw HTML, or "file:./preview.html"
  tags: ["Short label"]
}
```

Put the main card description in `markdown`. Use `markdownTooltip` only for useful secondary context that would impede scanning. Raw `htmlPreview` is shown inline; prefix a local HTML filename with `file:` to show it in a full-width iframe. Layout is automatic: one card per row for file previews, at most two for inline previews, and compact cards without previews.

### Choice

```js
{
  type: "choice",
  prompt: "Which direction should steer the build?",
  multiple: true, // omit for one selection
  cards: [card, card]
}
```

Multiple choice also lets the user add an option.

### Compare

```js
{
  type: "compare",
  prompt: "Which technology best fits this project?",
  cards: [card, card, card],
  criteria: [
    {
      title: "Delivery time",
      group: "Execution", // optional
      markdownTooltip: "Optional criterion detail",
      values: [
        "**5 weeks**",
        { markdown: "7 weeks", status: "best", markdownTooltip: "Why" },
        { status: "warning" }
      ]
    }
  ]
}
```

Each criterion has one positional value per card. A value is Markdown text or `{ markdown?, status?, markdownTooltip? }`. Status is `yes`, `no`, `partial`, `unknown`, `warning`, or `best`.

### Categorize

```js
{
  type: "categorize",
  prompt: "Place each capability in the release plan.",
  categories: ["Now", "Next", "Later"],
  cards: [card, card]
}
```

### Flow

```js
{
  type: "flow",
  prompt: "Correct this proposed journey.",
  connections: [
    { from: "Start", to: "Review" },
    { from: "Review", to: "Finish", label: "approved" }
  ]
}
```

Omit a connection label when it adds no meaning.

### Edit

```js
{
  type: "edit",
  prompt: "Edit the proposed specification.",
  language: "markdown",
  value: "# Draft"
}
```

## HTML File

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Interview title</title>
  </head>
  <body>
    <script src="%SCRIPT_URL%"></script>
    <script>
      InterviewHarness.mount({
        title: "Interview title",
        markdownIntro: "Short context for the user.",
        questions: [{
          type: "choice",
          prompt: "Which direction should steer the work?",
          cards: [{ title: "Direction A" }, { title: "Direction B" }]
        }]
      });
    </script>
  </body>
</html>
```
