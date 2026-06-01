---
name: interview-harness
description: Create a local HTML interview artifact with the Interview Harness library. Use when an agent needs to ask compact, interactive questions and export text or JSON answers.
---

# Interview Harness

Create a local HTML file. Let the library handle layout, state, navigation, comments, and exports.

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
        h.item("a", "A. Dense workspace", h.frame("mockups/a.html")),
        h.item("b", "B. Guided setup", h.frame("mockups/b.html"))
      ]),
      h.many("features", "Which features matter?", [
        "Fast export",
        "Rich previews",
        "Line comments"
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
- `h.allocate(id, prompt, total, items, options)`
- `h.sort(id, prompt, buckets, items, options)`
- `h.review(id, prompt, verbs, items, options)`
- `h.redline(id, prompt, artifact, options)`

## Rich Items

Use rich items when the user needs to react to concrete options. Plain strings are valid items.

```js
h.item("summary", "Human-readable summary",
  h.prosCons(
    ["Fast for agents to read", "Easy for users to inspect"],
    ["Less precise for automation"]
  ))

h.item("preview", "Preview plus notes",
  h.html("<div class='mini-preview'>...</div>"))

h.redline("draft", "Edit this draft.",
  h.code("md", "Create a local HTML interview."))
```

Default output is text. JSON is available automatically.
