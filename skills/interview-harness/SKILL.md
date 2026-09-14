---
name: interview-harness
description: Create a local visual interview that batches important user-owned decisions using choices, comparisons, categorization, flow and sequence correction, and artifact editing.
---

# Interview Harness

Create one local HTML interview that lets the user select, comment on, correct, and refine generated material. Load the harness from `https://cdn.jsdelivr.net/gh/apurin/interview-harness@v6.0.1/interview-harness.js`. This skill is the complete authoring reference; do not read or copy the library source.

Save the page as a `.html` file and present its path. The user can open it directly in a browser. Do not host it or start a server.

## Interview Gate

Inspect the conversation, files, prior decisions, and available context first. Ask a question only when it is:

1. **Unknown:** context, research, tools, and safe inference cannot answer it.
2. **User-owned:** it concerns the user's intent, preferences, constraints, risk tolerance, or desired outcome.
3. **Material:** plausible answers would change the work or prevent costly rework.

For each candidate question, privately complete: “With answer A, I would do ___; with answer B, I would do ___.” Keep it when that difference is worth the user's effort to answer.

## Plan the Complete Session

Identify the desired outcome and hard constraints, then the unresolved decisions that could change the work. Consider the strongest viable alternative to the current plan and which unknown preference could make it better. Prioritize consequential differences, costly rework, and decisions that constrain later choices.

Look for a governing objective or assumption behind several candidate questions. Ask about it once and carry forward the implications that actually follow. Keep independently variable preferences separately answerable. Each question asks for one coherent judgment.

Include every important, currently answerable decision once. Let coverage determine the question count. Order questions by dependency; the interview is static, so defer questions whose meaningful alternatives depend on an earlier answer. The session should provide enough direction to proceed, with remaining uncertainty handled through safe inference or later evidence.

## Author Strong Questions

- **Ask in the user's terms.** Name the situation and the decision in plain language, matching the respondent's expertise. Ask about consequences they can judge; derive implementation details from established intent.
- **Match the evidence needed.** When learning current behavior, request a scoped recent example, such as “Walk me through the last report you published, from preparation to sharing.” When establishing desired behavior, offer a concrete proposal or alternatives to choose or correct. Ground workflow proposals in the available evidence.
- **Choose the easiest useful response.** Use `choice` for a preference, `compare` for competing consequences, `categorize` for applying a shared distinction across items, and `flow`, `sequence`, or `edit` for correcting a coherent proposal. Choose the type that resolves the decision with the least effort.
- **Make every alternative earn its place.** Present the smallest set of feasible options that represents materially different approaches. Every option answers the same question at the same level of abstraction. Use comparable detail and realistic content under shared assumptions.
- **Expose the deciding differences.** Compare options against the same few user-relevant criteria, in the same order. Keep a criterion when its variation could change the choice. State shared facts once. Foreground what the user gains, what it costs, and what it requires; keep decisive uncertainty and assumptions visible. Use `markdownTooltip` for supporting evidence, definitions, and secondary detail.
- **Make advice conditional and correctable.** Use `tags: ["Recommended"]` when established user goals support a clear recommendation, and give its reason beside the label. When the preferred option depends on an unknown priority, ask about the tradeoff. Use comments for local qualifications, combinations, and missing alternatives, and editable proposals for direct correction.

For example, “When should a submitted report become visible to teammates?” can compare immediate publication with publication after approval. Show availability, review work, and the consequence to accept for each. That policy steers the publication flow and permissions; the identity of the reviewer remains separately answerable when material.

## Decompose UI Design Decisions

When UI direction is open, help the user compose it from independently answerable decisions.

- Separate macro layout and information hierarchy, the design of consequential regions or controls, and the overall visual language into different questions.
- Vary one concern at a time while holding the others reasonably constant. Compare layouts using the same content and neutral styling; compare a panel or control in the same surrounding context; compare visual styles using the same layout, components, and content.
- Give a region or control its own question when its alternatives pass the gate and would materially change usability, navigation, density, or workflow.
- For visual language, offer distinct directions that coordinate typography, color, density, boundaries, surfaces, and imagery or iconography. Let meaningful differences determine the option count.
- Use realistic content and account for overflow, empty, selected, and dense states whenever those states could affect the decision.
- Establish decisions that constrain later previews first; keep unconstrained aspects neutral.
- Before presenting the interview, confirm that selections from separate questions can form a coherent interface. If two choices only work as a package, combine them into one decision or make the dependency explicit.

A holistic design comparison is appropriate when the complete concept is itself the material decision and its parts depend on one another.

## Authoring API

Call `InterviewHarness.mount({ title, markdownIntro?, questions })`. Use only documented fields; invalid shapes fail with a path-specific error. The harness creates its own page container, IDs, layout, state, navigation, comments, and export.

Usually omit `markdownIntro`. When the file itself needs context, use one short sentence that states what the user is reviewing. Put project background, research, rationale, and usage instructions in the reply that links to the interview.

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

Choice, compare, and categorize questions accept `columnWidth: "narrow" | "medium" | "wide"` to preselect the user-adjustable column width. Choice maps those presets to three, two, or one card per row and preserves its previous automatic count when omitted; compare and categorize default to narrow. Categorize shows the width control only in Board view.

### Choice

```js
{
  type: "choice",
  prompt: "Which direction should steer the build?",
  multiple: true, // omit for one selection
  columnWidth: "medium", // optional; two cards per row
  cards: [card, card]
}
```

Multiple choice also lets the user add an option.

### Compare

```js
{
  type: "compare",
  prompt: "Which technology best fits this project?",
  columnWidth: "wide", // optional
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
  columnWidth: "medium", // optional; applies to Board view
  categories: ["Now", "Next", "Later"],
  cards: [card, card]
}
```

### Flow

Use flow to correct topology: meaningful stages, states, decisions, and allowed transitions. Nodes represent states or decision points; connections express a transition, branch, loop, or convergence. Use edit for an unbranched procedure and sequence for messages between participants.

```js
{
  type: "flow",
  prompt: "Correct this proposed approval topology.",
  connections: [
    { from: "Draft", to: "Review" },
    { from: "Review", to: "Approved", label: "accepted" },
    { from: "Review", to: "Draft", label: "changes requested" }
  ]
}
```

Label connections when the label distinguishes a transition or decision outcome.

### Sequence

Use sequence when the respondent can correct a proposed exchange between two or more participants and those corrections will change the work. The diagram must expose an interaction fact they own: who sends or receives, message order, a reply or delivery outcome, timing, or a material alternative.

Keep one bounded exchange readable at a glance. Use edit for a numbered procedure or single-role checklist, flow for stages or states, and compare for competing interaction designs.

```js
{
  type: "sequence",
  prompt: "Correct the proposed job completion, failure, and retry interaction.",
  source: `@Client
@API
@Worker

Client -> API: Start job
API -> Worker: Run job
choice Result
  | completed
    Worker --> API: Job complete
    API --> Client: Job complete
  | delivery failed
    Worker ->x API: Deliver result
    gap Before retry
    API -> Worker: Retry job`
}
```

Write stable Lines & Arrows source:

- Declare each participant once at the start as `@Name`, in the intended left-to-right order. Reuse each name exactly in messages.
- Write messages in timeline order as `Sender -> Receiver: Action`. Use `-->` consistently for replies or completions and `->x` only when delivery fails.
- Start a material group with a lowercase type and optional label, such as `choice Result` or `parallel Gather data`. `gap` is reserved for time jumps; every other lowercase group type is valid.
- Prefer familiar types such as `choice`, `parallel`, `optional`, `repeat`, and `critical` when they describe the interaction clearly.
- An indented `| label` starts a section, such as a choice outcome or parallel branch. Choose exactly one form at each group level: direct items or `|` sections.
- Indent every child level with exactly two spaces. Every group and section contains an item.
- Keep each displayed label line to 32 characters. Put literal `\n` inside a label for its next displayed line.
- Use `gap Label` for a meaningful time jump or omitted interval.
- Include participant interactions that matter to the decision. Put internal implementation detail in supporting context and split long end-to-end journeys into separate exchanges.

### Edit

An edit question must contain one cohesive artifact that the user can revise independently. Never use it as a cumulative project summary, constitution, or repetition of decisions handled elsewhere. Split independent sections into separate edit questions. Produce the complete synthesis after the user returns the interview.

```js
{
  type: "edit",
  prompt: "Refine this proposed success criterion.",
  language: "markdown",
  value: "A new user can finish setup and create their first project in under five minutes."
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
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v6.0.1/interview-harness.js"></script>
    <script>
      InterviewHarness.mount({
        title: "Interview title",
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

Before presenting the path, confirm every question passes the gate, each currently answerable material decision is covered once, alternatives are comparable, and the session can be answered coherently with the context available. Keep research notes and extended rationale outside the interview.
