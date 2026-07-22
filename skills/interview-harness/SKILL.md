---
name: interview-harness
description: Create a local visual interview that batches important user-owned decisions using choices, comparisons, categorization, flow correction, and artifact editing.
---

# Interview Harness

Create one local HTML interview that lets the user select, comment on, correct, and refine generated material. Load the harness from `https://cdn.jsdelivr.net/gh/apurin/interview-harness@v5.2.0/interview-harness.js`. This skill is the complete authoring reference; do not read or copy the library source.

Save the page as a `.html` file and present its path. The user can open it directly in a browser. Do not host it or start a server.

## Interview Gate

Inspect the conversation, files, prior decisions, and available context first. Ask a question only when it is:

1. **Unknown:** context, research, tools, and safe inference cannot answer it.
2. **User-owned:** it concerns the user's intent, preferences, constraints, risk tolerance, or desired outcome.
3. **Material:** plausible answers would change the work or prevent costly rework.

Delete any question unless you can complete: “After this answer, I will do ___ differently.”

## Plan the Complete Session

Include every important question that passes the gate and can be answered meaningfully now. Do not impose a question limit or split known questions across sessions.

Use one question per decision area. A static interview does not branch: defer a downstream question only when its meaningful options depend on an earlier answer. Order foundational constraints and consequential choices before details.

## Decompose UI Design Decisions

When the user has not already established the UI direction, help them compose it from independent decisions instead of asking them to choose between complete designs that bundle unrelated choices.

- Separate macro layout and information hierarchy, the design of consequential regions or controls, and the overall visual language into different questions.
- Vary one concern at a time while holding the others reasonably constant. Compare layouts using the same content and neutral styling; compare a panel or control in the same surrounding context; compare visual styles using the same layout, components, and content.
- Give a region or control its own question when its alternatives would materially change usability, navigation, density, or workflow. Do not ask about incidental details or decisions already established by the user.
- Present meaningfully different approaches, not minor cosmetic variations. For visual language, usually offer three to five distinct directions that coordinate typography, color, density, boundaries, surfaces, and imagery or iconography.
- Use realistic content and account for overflow, empty, selected, and dense states whenever those states could affect the decision.
- Order questions by dependency rather than following a fixed sequence. Establish decisions that constrain later previews first; keep unconstrained aspects neutral.
- Before presenting the interview, confirm that selections from separate questions can form a coherent interface. If two choices only work as a package, combine them into one decision or make the dependency explicit.

A holistic design comparison is appropriate only when the complete concept is itself the material decision and its parts cannot be evaluated independently.

## Author Strong Questions

Prefer concrete candidates, comparisons, proposed scope, flows, and editable drafts over recall from a blank prompt.

- Present meaningfully different options with comparable detail and clear consequences.
- Keep prompts specific about what the answer will steer.
- Include only context needed to answer; keep research notes and extended reasoning elsewhere.
- Mark a clear recommendation with `tags: ["Recommended"]`.
- Treat question types as alternatives, not a checklist.
- Do not create a question merely to display information.

Users can comment on cards, columns, criteria, flow elements, and edits, including options they do not select. They can use comments for nuance, combinations, and parts to borrow from declined options.

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
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v5.2.0/interview-harness.js"></script>
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

Before presenting the path, confirm every question passes the gate, all currently answerable material decisions are included, and no question duplicates another or depends on an answer the session cannot know.
