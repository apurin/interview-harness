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
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v1.0.0/interview-harness.js"></script>
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
- `h.evaluation({ id, prompt, select, options, rows })`: select one or many option columns while comparing feature rows. Users can comment on columns and rows. Rows use `h.feature({ id, title, body, group, cells })`. `cells` maps option ids to `"yes"`, `"no"`, `"partial"`, `"unknown"`, `"warn"`, `"best"`, text, or `{ icon, text, detail }`.
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

Use only the questions and rich content needed to make the options clear. The goal is to help the user choose, correct, and steer, not to use every available feature or question type.
Start with fundamental questions that can invalidate later questions.
Prefer a smaller set of high-leverage questions over many questions that become irrelevant after one answer.
Prefer questions that change the next action; omit questions whose answers would not affect the work.
Offer and mark a strong default when the path is clear, but make the default reviewable.
Put risky or irreversible decisions before polish questions.
Rely on option comments to avoid unnecessary follow-up questions. Users can comment on any option, including options they do not select.
Use rich option bodies when they make a decision easier: layout examples, images, visual guides, schemas, tradeoffs, previews, or code snippets.
Because the interview is an HTML file, rich HTML payloads may include CDN visualization libraries when they make an option clearer.
Do not force user to make every little decision - aim at the least amount of questions to clarify the most important and especially irreversible decisions as easy and transparently for user as possible.

## Usage Ideas

- Use `classify` to validate ubiquitous language: terms, labels, domain objects, actions, and claims that must mean the same thing to the user and the agent.
- Use `classify` to collect assumptions in one place and let the user evaluate them.
- Use `evaluation` for tier, package, vendor, implementation, or design-option comparisons where rows are shared criteria and columns are the selectable answers.
- Use `bucket` to separate decisions into “decide now,” “decide later,” and “do not care.”
- Use `rank` when the ordered result itself matters: workflow steps, independent sections, or agenda items.
- Use `edit` to let the user fine-tune something short and critical.
- Use `choice` with `cardsPerRow: 1` or `2` for design previews and side-by-side visual comparisons.

## Output Behavior

- Users can comment on any option, including options they do not select.
- Answers and comments export as text or JSON.
- Exports include only user-entered or changed answers.
