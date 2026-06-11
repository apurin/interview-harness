---
name: interview-harness
description: Create rich interactive interviews for users as sharable HTML files. A pinned CDN helper library takes care of layout, styling, interview state, output, cards, syntax highlighting, iframe previews, and option comments.
---

Create one sharable HTML file with an interactive interview that the user can open directly in a browser. Load `interview-harness.js` from the pinned jsDelivr URL. Do not inline, copy, or read `interview-harness.js`; this skill is the authoring reference.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Interview title</title>
  </head>
  <body>
    <div id="interview-harness"></div>
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v0.1.0/interview-harness.js"></script>
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
- `h.prosCons({ pros, cons })`: compact tradeoff block.
- `h.code({ lang, value })`: highlighted code block.

## Output Behavior

- Users can comment on any option, including options they do not select.
- Answers and comments export as text or JSON.
- Exports include only user-entered or changed answers.
