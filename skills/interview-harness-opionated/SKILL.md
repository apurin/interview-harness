---
name: interview-harness-opionated
description: Create a local HTML interview artifact with Interview Harness, using opinionated question patterns for agent-led design, assumption review, scope control, artifact redlining, and concise text-first export.
---

# Interview Harness, Opinionated

Create a local HTML file. Spend tokens on questions and rich items; let the library handle layout, state, navigation, comments, and exports.

```html
<div id="interview-harness"></div>
<script src="./interview-harness.js"></script>
<script>
  const h = InterviewHarness;

  h.mount({
    title: "Direction interview",
    intro: "Short context for the user.",
    questions: [
      // questions go here
    ]
  });
</script>
```

## Use These Patterns

- Use `one` for a concrete direction choice. Include rich previews.
- Use `many` when the user can keep parts from several options or add a missing option.
- Use `review` for assumptions, terms, and claims the user should correct.
- Use `sort` for hard/soft scope boundaries.
- Use `rank` for order and `allocate` for intensity.
- Use `redline` when the artifact itself should be edited.
- Keep intro text short. Put the useful detail inside items.

## Examples

Design selector with cross-comments:

```js
h.one("lead_design", "Which direction should I continue?", [
  h.item("a", "A. Dense workspace", h.frame("mockups/a.html")),
  h.item("b", "B. Guided setup", h.frame("mockups/b.html")),
  h.item("c", "C. Editorial review", h.frame("mockups/c.html"))
])
```

Assumption review:

```js
h.review("assumptions", "Check my working assumptions.",
  ["true", "revise", "false", "unsure"],
  [
    "Users want to answer quickly, then export a concise summary.",
    "Generated pages are temporary and local-first.",
    "Programmatic JSON output is required for the first version."
  ]
)
```

Constraint classifier:

```js
h.sort("constraints", "Classify these constraints.",
  ["hard", "soft", "not relevant", "unsure"],
  [
    "Must work as a standalone local HTML file.",
    "Should avoid a build step.",
    "Should export machine-readable JSON.",
    "Must support mobile review."
  ]
)
```

Pros and cons selector:

```js
h.one("export_shape", "Which export shape should we optimize for?", [
  h.item("summary", "Human-readable summary",
    h.prosCons(
      ["Fast for agents to consume", "Easy for users to inspect"],
      ["Less precise for automation"]
    )),
  h.item("json", "Structured JSON",
    h.prosCons(
      ["Machine-readable", "Easy to validate"],
      ["More API design pressure", "Higher authoring cost"]
    ))
])
```

Artifact redline:

```js
h.redline("draft_prompt", "Edit the prompt until it matches your intent.",
  h.code("md", `Create a local HTML interview.
Ask the user to pick a design direction.
Export the result as JSON.`)
)
```

Priority stack and budget:

```js
h.rank("build_order", "What should come first?", [
  "Readable library source",
  "Neutral skill manual",
  "Opinionated interview examples",
  "Richer preview question types"
])

h.allocate("values", "Allocate 10 priority points.", 10, [
  "Authoring speed",
  "Expressive review",
  "Small API",
  "Export quality"
])
```

Gap finder:

```js
h.many("missing_types", "Which question types belong in the first manual?", [
  "Design selector",
  "Assumption review",
  "Constraint classifier",
  "Artifact redline",
  "Terminology review"
])
```

Default output is text. JSON is available automatically.
