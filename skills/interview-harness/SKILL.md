---
name: interview-harness
description: Create a local visual interview that batches important user-owned decisions using choices, comparisons, categorization, flow and sequence correction, and artifact editing.
---

# Interview Harness

Create a local HTML interview that lets the user select, comment on, correct, and refine generated material. Load the harness from `https://cdn.jsdelivr.net/gh/apurin/interview-harness@v7.0.0/interview-harness.js`. This skill is the complete authoring reference; do not read or copy the library source.

Save the page as a `.html` file and present its path. The user can open it directly in a browser. Do not host it or start a server.

## Interview Gate

Inspect the conversation, files, prior decisions, and available context first. Ask a question only when it is:

1. **Unknown:** context, research, tools, and safe inference cannot answer it.
2. **User-owned:** it concerns the user's intent, preferences, constraints, risk tolerance, or desired outcome. Treat these as user-owned rather than implementation detail: wording users read, defaults users live with, who may do what, what counts, money, legal or privacy exposure, and taste.
3. **Material:** plausible answers would change the work or prevent costly rework.

For each candidate question, privately complete: “With answer A, I would do ___; with answer B, I would do ___.” Keep it when that difference is worth the user's effort to answer.

A user-owned material decision is asked or left open. It is never settled by an assumption or recommendation stated in the reply or on the page, or by a default in the deliverable.

## Run the Interview in Rounds

The interview is a loop, not a page. Each round asks every currently answerable question that passes the gate, once, ordered by dependency; the loop ends when none remains.

- **Settle the pivot first.** When one unknown would change most of the question set, such as what is being built or for whom, ask it in the reply before authoring a page. A one-question page is justified only when the pivot needs material to judge.
- **Hold dependent questions.** A question whose meaningful alternatives depend on an unanswered question belongs to a later round. The reply that links the page lists each held question with the answer it waits for.
- **Keep the reply to the link.** A reply that links a page carries the file name, one sentence on what it covers, and the held list, nothing else. The pivot, or a round of one or two short questions, is a reply without a page.
- **Sort the export.** Separate what the answers settled, what they raised (a comment that opens a new user-owned decision or overturns an assumption), which held questions became answerable, what stayed unanswered (the export lists these; an edit counts as accepted only when marked so), and what is now the agent's call.
- **Run the next round** when raised or newly answerable decisions are material, or when a derived artifact should be corrected before it binds the work: text users will read, a schema with worked rows, a plan in the user's own shape. Start from the held list. Use the reply instead of a page only for one or two short questions whose answers need no preview or editable artifact. Later rounds are more concrete, and usually smaller.
- **Stop** when every material user-owned decision is settled, or the user asks to proceed or declines to settle what remains; then write the synthesis. Do not restate answered decisions for confirmation. Record agent-owned calls in the synthesis as defaults, marked as such, and declined decisions as open, with the default taken and its consequence. The synthesis says the interview is complete and what happens next.
- **Carry answers faithfully.** Use edited text verbatim, keep the user's vocabulary, and keep the structures they produced: a board sorted into columns stays those columns. Labels invented for previews are illustrative: carry wording into the deliverable only when the user accepted or edited it, or it follows the project's established terminology. Wording users will read is asked as an `edit` when it passes the gate; otherwise the synthesis marks it as a placeholder.

## Plan the Round

Identify the desired outcome and hard constraints, then the unresolved decisions. Consider the strongest viable alternative to the current plan and which unknown preference could make it better.

Sweep for decisions the user will not raise unprompted: failure, offline, and stale-data modes, dates and cutover, existing data and its migration, the other roles' views, adjacent screens and features the aspect feeds, how the result will be checked against reality, volume over time, and real data uglier than the examples. Keep those that pass the gate.

Look for a governing objective or assumption behind several candidate questions. Ask about it once and carry forward the implications that actually follow. Keep independently variable preferences separately answerable. Each question asks for one coherent judgment.

Let coverage determine the question count.

## Author Strong Questions

- **Ask in the user's terms.** Name the situation and the decision in plain language, matching the respondent's expertise, in the project's own names and vocabulary. Ask about consequences they can judge; derive implementation details from established intent.
- **Match the evidence needed.** When learning current behavior, request a scoped recent example, such as “Walk me through the last report you published, from preparation to sharing.” When establishing desired behavior, offer a concrete proposal or alternatives to choose or correct.
- **Match the fidelity of the decision.** Show the decision at the fidelity the user will judge it at: real typefaces and the target viewport for visual direction, worked records and their outcomes for a data model, with schema or DDL when the respondent can judge it, the draft itself for text users will read, the real copy rather than placeholder text in a mockup. An answer settles only the aspects the preview rendered at that fidelity.
- **Choose the easiest useful response.** Use `choice` for a preference, `compare` for competing consequences, `categorize` for applying a shared distinction across items, and `flow`, `sequence`, or `edit` for correcting a coherent proposal. Choose the type that resolves the decision with the least effort. A drawn proposal is accepted more readily than a stated one: before drawing a flow or sequence, ask its unknown material policies, such as what counts or who approves, as choices, and encode settled policies directly.
- **Make every alternative earn its place.** Present the smallest set of feasible options that represents materially different approaches. Every option answers the same question at the same level of abstraction. Use comparable detail and realistic content under shared assumptions. Render each option as its own best version; an option drawn worse than the others is a strawman. Card text describes the option; the case for preferring it appears only on a card tagged Recommended.
- **Expose the deciding differences.** Compare options against the same few user-relevant criteria, in the same order. Keep a criterion when its variation could change the choice. State shared facts once. Foreground what the user gains, what it costs, and what it requires; keep decisive uncertainty and assumptions visible. Show each item's decision-changing consequences on its card or in criterion rows; a consequence beside an item surfaces decisions the user has not considered. Use `markdownTooltip` for supporting evidence, definitions, and secondary detail.
- **Make advice conditional and correctable.** Use `tags: ["Recommended"]` only when a goal the user stated decides the option and no unknown constraint could reverse it, and state that goal in the card's `markdown`. Otherwise ask about the tradeoff. Use comments for local qualifications, combinations, and missing alternatives, and editable proposals for direct correction.

## Decompose UI Design Decisions

When UI direction is open, help the user compose it from independently answerable decisions.

- Separate macro layout and information hierarchy, the design of consequential regions or controls, and the overall visual language into different questions.
- Vary one concern at a time while holding the others reasonably constant. Compare layouts using the same content and the same realistic styling; compare a panel or control in the same surrounding context; compare visual styles using the same layout, components, and content.
- For visual language, offer distinct directions that coordinate typography, color, density, boundaries, surfaces, and imagery or iconography. Let meaningful differences determine the option count.
- Render previews with real typefaces, the scripts and direction the content will carry, and the target viewport; use `previewFrame: "phone"` for a mobile-first product. When typography is the decision, show candidate typefaces as specimens set in the real content.
- Use realistic content and account for overflow, empty, selected, and dense states whenever those states could affect the decision.
- Establish decisions that constrain later previews first. Hold unconstrained aspects at the project's current choice or one realistic choice, never at browser defaults: generic fonts at desktop width make every direction look alike.
- Before presenting the interview, confirm that selections from separate questions can form a coherent interface. If two choices only work as a package, combine them into one decision or make the dependency explicit.

A holistic design comparison is appropriate when the complete concept is itself the material decision and its parts depend on one another.

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

Before presenting the path, confirm every question passes the gate, each preview is at the fidelity of its decision, and the reply lists held questions and settles nothing. When a browser is available, open the file and check that it loads without an error panel, previews render, and labels are legible at the intended width. Keep research notes and extended rationale outside the interview.
