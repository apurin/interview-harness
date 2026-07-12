# Interview Harness

**Agents do better work when users can react to something concrete.**

![Interview Harness showing layout choices, contextual comments, technology comparison, release planning, and flow editing](assets/interview-harness-demo.gif)

Interview Harness turns important clarifying questions into one focused, visual session. An agent generates a local HTML file with concrete options, comparisons, plans, flows, and editable drafts; the user responds once, and the agent gets a concise answer summary.

There is no app to deploy, build step to run, or server to keep alive. The user opens the generated file directly in a browser.

## Why Interview Harness

- **Recognition over recall.** Users react to previews and proposals instead of describing everything from scratch.
- **One complete session.** Agents collect every material decision they can identify before continuing the work.
- **Nuance stays attached.** Users can comment on options—including ones they decline—and on structured parts of a question.
- **Clean handoff.** Only selections, edits, changes, and comments appear in the exported answer.
- **Disposable by design.** Each interview is one readable HTML file backed by a major-pinned CDN script.

## Give It to an Agent

Install the authoring skill:

```sh
npx skills add apurin/interview-harness --list
```

The skill teaches an agent when an interview is worthwhile, which questions belong in it, and how to generate the file. The full authoring guide is also readable at [skills/interview-harness/SKILL.md](skills/interview-harness/SKILL.md).

## Author One Directly

```html
<div id="interview-harness"></div>
<script src="https://cdn.jsdelivr.net/gh/apurin/interview-harness@3/interview-harness.js"></script>
<script>
  const h = InterviewHarness;

  h.mount({
    title: "Shape the beta",
    intro: "Resolve the product direction before implementation continues.",
    questions: [
      h.choice({
        id: "direction",
        prompt: "Which experience should anchor the beta?",
        select: "one",
        options: [
          h.option({
            id: "command-center",
            title: "Command center",
            tags: ["Recommended"],
            body: "A dense operational workspace for experienced teams."
          }),
          h.option({
            id: "guided-inbox",
            title: "Guided inbox",
            body: "A prioritized daily workflow with faster onboarding."
          })
        ]
      })
    ]
  });
</script>
```

Save the file and open it directly in a browser. No hosting is required.

## Question Types

| Helper | Collects |
| --- | --- |
| `choice` | One or several selections from plain or rich options |
| `evaluation` | One decision across a shared comparison matrix |
| `bucket` | A categorized scope or plan |
| `flow` | Corrections to a directed process or journey |
| `edit` | Changes to a text or code artifact |

Rich options can combine HTML, iframe previews, and highlighted code. The library supplies the responsive layout, navigation, progress, comments, editing, state, and text export.

<details>
<summary>Maintaining the project</summary>

The source is intentionally readable and unminified. Project policy lives in [AGENTS.md](AGENTS.md).

The README animation source and capture workflow live in [demo/](demo/README.md).

Release with:

```sh
node scripts/release.mjs X.Y.Z
```

The release script renders the skills, updates major-pinned URLs, commits, tags, pushes, and refreshes jsDelivr.

</details>
