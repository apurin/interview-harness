---
name: interview-harness-min
description: Create a local visual interview that collects user decisions with Interview Harness.
---

Create one local HTML interview. Load `%SCRIPT_URL%`; do not read or copy the library source. Present the saved file path—the user opens it directly, so do not start a server.

Use an interview only for unknown, user-owned, material decisions. Include every currently answerable question that would change the work. Prefer concrete options over blank prompts, use one question per decision area, and do not ask merely because an interaction is available. Users can comment on any card or structured part, including unselected options.

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interview</title></head>
  <body>
    <script src="%SCRIPT_URL%"></script>
    <script>
      InterviewHarness.mount({
        title: "Interview",
        markdownIntro: "Short context.",
        questions: [{ type: "choice", prompt: "Which direction?", cards: [{ title: "A" }, { title: "B" }] }]
      });
    </script>
  </body>
</html>
```

The harness creates the container, IDs, layout, state, comments, and export.

Cards use `{ title, markdown?, markdownTooltip?, htmlPreview?, tags? }`. Put the main description in `markdown`; reserve `markdownTooltip` for secondary context. Both Markdown fields and comparison text accept Markdown. `htmlPreview` is raw HTML or `"file:./preview.html"`; layout is automatic.

- `{ type: "choice", prompt, multiple?, cards }`
- `{ type: "compare", prompt, cards, criteria }`, where each criterion is `{ title, group?, markdownTooltip?, values }`. Values align positionally with cards and are Markdown strings or `{ markdown?, status?, markdownTooltip? }`. Status: `yes`, `no`, `partial`, `unknown`, `warning`, `best`.
- `{ type: "categorize", prompt, categories, cards }`, where categories are strings.
- `{ type: "flow", prompt, connections }`, where connections are `{ from, to, label? }`.
- `{ type: "edit", prompt, value, language? }`.

Mark a clear recommendation with `tags: ["Recommended"]`. Keep only response-critical context in the interview.
