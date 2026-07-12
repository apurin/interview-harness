---
name: interview-harness
description: Create concise, sharable HTML interviews that collect important user-owned decisions with choices, comparisons, bucketing, flow correction, and artifact editing. Includes the full authoring API and question-selection rules.
---

# Interview Harness

Create one sharable HTML file that lets the user select, correct, and refine generated material. Load `interview-harness.js` from the major-pinned jsDelivr URL. Do not inline, copy, or read `interview-harness.js`; this skill is the authoring reference.

Save the interview as a local `.html` file and present its file path. The user can open it directly in a browser; do not host it or start a local server.

If the user asks to install the skill locally, suggest `npx skills add apurin/interview-harness --list` to review available interview-harness skills.

## Interview Gate

Use an interview to batch important questions or when concrete options, comparisons, or editable material will help the user respond. Do not create one merely to explain, summarize, visualize, or display static information.

Inspect the conversation, files, prior decisions, and other available context first. Every question must be:

1. **Unknown:** not already answered by context, research, tools, or a safe inference.
2. **User-owned:** about the user's intent, preferences, constraints, risk tolerance, or desired outcome rather than a judgment the agent should make.
3. **Material:** plausible answers would meaningfully change the work, scope, recommendation, or artifact, or prevent costly rework.

Delete a question unless you can complete: “After this answer, I will do ___ differently.”

## Plan the Complete Session

Include every important question that passes the gate and can be asked meaningfully now. Do not impose an arbitrary question limit or split known questions across interviews merely for focus. The session should collect the direction needed for the agent's next uninterrupted stretch of work.

Questions may cover different decision areas. Use one primary interaction for each area and do not ask the same decision in several forms.

Do not speculate about distant decisions or ask a downstream question whose meaningful options depend on an unanswered earlier question. A static interview does not branch. Defer only those dependent questions; include all other currently answerable questions.

Order foundational constraints and consequential choices before implementation detail and polish.

## Author the Questions

Prefer recognition over recall. Show concrete candidates, a comparison, proposed scope, a flow, or an editable draft when useful.

- Present meaningfully different options, not superficial variations or an exhaustive menu.
- Make compared options similarly detailed and show their actual differences and consequences.
- Mark a recommendation with a tag or concise option text when one is clear; do not add a separate confirmation question.
- Keep prompts specific about what the response will steer.
- Include only context required to answer. Keep sources, research notes, extended reasoning, and implementation notes outside the interview.
- Do not create pseudo-questions only to display content.

Users can comment on options, including unselected ones, and on parts of structured questions. This lets them explain nuance, point out parts to borrow from declined options, and add context.

Treat the question types as alternatives, not a checklist. Choose the type that directly captures each answer; do not restate the same decision through another type.

## Authoring API

All helpers take one object argument and use the documented field names.

### Mount

- `h.mount({ title, intro, questions })`: `title` and `intro` are strings; `questions` is an array of question helpers.

### Questions

- `h.choice({ id, prompt, select, options, cardsPerRow })`: one or many selection; `select` is `"one"` or `"many"`. Many-choice lets users add custom options.
- `h.evaluation({ id, prompt, options, rows })`: select one option column while comparing feature rows. Rows use `h.feature({ id, title, body, group, cells })`. `cells` maps option ids to `"yes"`, `"no"`, `"partial"`, `"unknown"`, `"warn"`, `"best"`, text, or `{ icon, text, detail }`.
- `h.bucket({ id, prompt, buckets, options })`: drag options into named buckets.
- `h.flow({ id, prompt, connections })`: review and correct a directed flow. Connections are `{ from, to, label? }`; node names are inferred. Omit empty labels.
- `h.edit({ id, prompt, artifact, language })`: edit a short code or text artifact; use `h.code({ lang, value })` for the artifact.

For `choice`, omit `cardsPerRow` for automatic layout. Use `1` for wide previews, `2` for side-by-side comparisons, `3` for normal rich cards, or `4` for compact cards.

### Rich Content

- Plain strings are valid options.
- `h.option({ id, title, body, tags })`: rich option; `tags` is an array of short labels.
- An option `body` may be one rich helper or an array of helpers and strings.
- `h.html({ markup })`: trusted inline HTML.
- `h.frame({ src, srcdoc, title, fileName, height })`: iframe preview; use `srcdoc` for an inline preview.
- `h.code({ lang, value })`: highlighted code block or editable artifact content.

## HTML File

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Interview title</title>
  </head>
  <body>
    <div id="interview-harness"></div>
    <script src="%SCRIPT_URL%"></script>
    <script>
      const h = InterviewHarness;

      h.mount({
        title: "Interview title",
        intro: "Short context for the user.",
        questions: []
      });
    </script>
  </body>
</html>
```

## Final Check

- Every question is unknown, user-owned, and material.
- All currently identifiable questions needed for the next stretch of work are included.
- No question duplicates another or depends on an answer this static session cannot know.
- The interview contains only context needed to respond.

Present the local file path to the user, then wait for the answer they return.
