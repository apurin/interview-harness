---
name: interview-harness-opinionated
description: Create rich interactive interviews for users as sharable HTML files. A pinned CDN helper library takes care of layout, styling, interview state, output, cards, syntax highlighting, iframe previews, and option comments. Instructs how to structure, pace, and write useful interviews.
---

Create one sharable HTML file with an interactive interview that the user can open directly in a browser. Load `interview-harness.js` from the pinned jsDelivr URL. Do not inline, copy, or read `interview-harness.js`; this skill is the authoring reference.

If the user asks to install the skill locally, suggest `npx skills add apurin/interview-harness --list` to review available interview-harness skills.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Interview title</title>
  </head>
  <body>
    <div id="interview-harness"></div>
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v1.1.1/interview-harness.js"></script>
    <script>
      const h = InterviewHarness;

      h.mount({ title: "Interview title", intro: "Short context.", questions: [] });
    </script>
  </body>
</html>
```

All helpers take one object argument and use the documented field names.

## Mount

- `title`: string.
- `intro`: string shown under the title.
- `questions`: array of question helpers.
- `target`: optional selector or element; omit when using `<div id="interview-harness"></div>`.
- `storageKey`: optional local-storage key; set to `false` to disable progress saving.

Put rich helpers in option `body` values or `h.edit` artifacts.

## Question Helpers

- `h.text({ id, prompt, placeholder, multiline, defaultValue })`: freeform text; `multiline` defaults to `true`.
- `h.choice({ id, prompt, select, options, cardsPerRow })`: one or many selection; `select` is `"one"` or `"many"`. Many-choice lets users add custom options.
- `h.evaluation({ id, prompt, options, rows })`: select one option column while comparing feature rows. Users can comment on columns and rows. Rows use `h.feature({ id, title, body, group, cells })`. `cells` maps option ids to `"yes"`, `"no"`, `"partial"`, `"unknown"`, `"warn"`, `"best"`, text, or `{ icon, text, detail }`.
- `h.rank({ id, prompt, options })`: drag options into priority order.
- `h.bucket({ id, prompt, buckets, options })`: drag options into named buckets.
- `h.classify({ id, prompt, states, options })`: choose one state per option, edit option text, and add options.
- `h.edit({ id, prompt, artifact, language })`: edit a short code or text artifact; use `h.code({ lang, value })` for the artifact.

`cardsPerRow` is only for `choice`: use `"auto"` or omit it for automatic card width, `1` for wide previews, `2` for side-by-side comparisons, `3` for normal rich cards, and `4` for compact scans.

## Content Helpers

- Plain strings are valid options.
- `h.option({ id, title, body, tags })`: rich option. `tags` is an array of short labels.
- `body`: one rich helper or an array of helpers and strings.
- `h.html({ markup })`: trusted inline HTML.
- `h.frame({ src, srcdoc, title, fileName, height })`: iframe preview. Use `srcdoc` for inline frames; they still get a new-tab preview button.
- `h.code({ lang, value })`: highlighted code block.

## How to Interview

Create an interview when the user needs to answer, select, correct, or steer. If the artifact only needs to explain, visualize, or summarize, create a normal artifact or answer directly.

Identify the decision areas before writing questions. A decision area is a distinct choice, correction, or validation that changes the next work. Choose one primary helper for each decision area.

Single-theme comparisons often need one `h.evaluation`; the evaluation can be the whole artifact. Multi-theme briefs may need several interactions when each covers a different area, such as audience, product shape, visual direction, launch scope, or implementation route.

Add another question only when it captures a separate unknown and the answer changes the recommendation, implementation, scope, or next artifact. Mixed helper modes are good when each helper serves a different decision area. They are bad when they rephrase the same decision.

Delete a question when another question already captures the same decision, or when option and row comments let the user express the nuance.

Do not ask the user to choose before seeing a comparison unless that answer changes which comparison appears. Static interview files do not branch, so gating questions usually belong as assumptions, criteria, option notes, or row details.

Offer and mark a strong default when the path is clear. Put the default inside the primary surface with tags, row values, or option body text; do not add a separate confirmation question for the same default.

Put risky or irreversible decisions before polish questions. Omit polish questions unless the answer changes the next action.

Use rich content only when it helps answer the current question: layout examples, images, visual guides, schemas, tradeoffs, previews, or code snippets. Do not create pseudo-questions just to display a visualization, source list, reading material, reasoning trace, or static notes.

Keep background material out of the interview by default. Put sources, reading lists, extended reasoning, research notes, and implementation notes in the final response or another artifact. Include only context that is essential for the user to answer the question: short definitions, assumptions, tradeoffs, examples, previews, or the current default.

Do not force the user to make every little decision. Ask for the least input that resolves the important and irreversible uncertainty.

Before finalizing, verify that all statements apply:

- Each question maps to a separate decision area.
- Each decision area has one primary helper.
- No question restates a decision already captured by another question.
- Every question changes the recommendation, implementation, scope, or next artifact.
- The interview includes only context needed to answer the questions.
- Supporting sources, reading material, extended reasoning, and notes can live outside the interview.
- The exported answer gives the agent enough signal to continue.

## Usage Ideas

- Use `evaluation` for vendor, framework, platform, tier, package, implementation, or design-option comparisons where rows are shared criteria and columns are selectable answers. Include recommendation signals in option tags, option bodies, and row cells. Do not add separate priority, shortlist, or final-choice questions for the same decision area.
- Use `choice` for a small set of distinct routes where the user mainly needs to pick one. Use rich option bodies for tradeoffs or previews.
- Use `classify` for assumptions, terminology, claims, or scope items whose truth changes the work.
- Use `bucket` only when the bucketed categories are the output: decide now/later, include/exclude, must/should/could, or similar planning groups.
- Use `rank` only when the ordered result is the output: workflow steps, roadmap order, agenda order, or independent priorities not already encoded as evaluation rows.
- Use `edit` only when the edited text or code is the deliverable. Do not ask the user to edit a recommendation, shortlist, source list, or decision note unless that edited artifact is the requested output.
- Use `text` for missing context that cannot be represented by selecting, commenting, classifying, ranking, or editing the actual deliverable.
- Keep sources, reading material, and static references outside the interview unless they are essential to a specific question. Do not make them a question.

## Output Behavior

- Users can comment on any option, including options they do not select.
- Answers and comments export as text or JSON.
- Exports include only user-entered or changed answers.
