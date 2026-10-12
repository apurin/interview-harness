---
name: interview-harness-min
description: Create a local visual interview from already-planned questions using choices, comparisons, categorization, flow and sequence correction, and artifact editing.
---

# Interview Harness

Create one local HTML interview that lets the user select, comment on, correct, and refine generated material. Load the harness from `https://cdn.jsdelivr.net/gh/apurin/interview-harness@v7.0.0/interview-harness.js`. This skill is the complete authoring reference; do not read or copy the library source.

Save the page as a `.html` file and present its path. The user can open it directly in a browser. Do not host it or start a server.

## Authoring API

Call `InterviewHarness.mount({ title, markdownIntro?, questions })`. Use only documented fields; an invalid shape renders an error panel that lists the validation problems it detects, with their paths, and a report the user can paste back to you. The harness creates its own page container, IDs, layout, state, navigation, comments, and export. The export lists unanswered questions at the end and, when the user fills the closing field for constraints and topics the questions missed, a “Not covered by the questions” section.

Usually omit `markdownIntro`. When the file itself needs context, use one short sentence that states what the user is reviewing. Put the context that supports a decision on its cards and in their tooltips.

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

Put the main card description in `markdown`. Use `markdownTooltip` only for useful secondary context that would impede scanning. Raw `htmlPreview` is shown inline and shares the page's document and CSS; prefix a local HTML filename with `file:` to show it in a full-width iframe. Previews under `file:` or `previewFrame` are their own documents and load their own fonts and stylesheets. Choice lays out one card per row for file previews, two for inline previews, and compact cards without previews; phone previews and an explicit `columnWidth` override this, and narrow screens reduce the count.

Choice, compare, and categorize questions accept `previewFrame: "phone"` to show every card preview inside a 390px phone frame. Inline previews then render as their own page, so fonts, linked stylesheets, viewport queries, and right-to-left content behave as on a device, and choice places three framed cards per row at narrow width.

Choice, compare, and categorize questions accept `columnWidth: "narrow" | "medium" | "wide"` to preselect the user-adjustable column width. Choice maps those presets to three, two, or one card per row and preserves its previous automatic count when omitted. Compare and categorize default to narrow, which fits all columns to the page when they can share it. A wider preset that would hide columns uses narrow when narrow fits, otherwise keeps the requested width with a scroll hint, until the user picks a width. Categorize shows the width control only in Board view.

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

Single and multiple choice let the user add their own option; the export marks it as added by the user. Do not add an “Other” or “None of these” card.

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
  ordered: true, // optional; the user orders cards within a category and the export numbers them
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

Label connections when the label distinguishes a transition or decision outcome. Each from→to pair appears once.

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

An edit question must contain one cohesive artifact that the user can revise independently, or accept as proposed; the export marks acceptance. Never use it as a cumulative project summary, constitution, or repetition of decisions handled elsewhere. Split independent sections into separate edit questions. The synthesis comes after the interview ends, never inside an edit question. `language` highlights `markdown`, `html`, `json`, and `javascript`; other values render as plain text.

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
    <script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@v7.0.0/interview-harness.js"></script>
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
