---
name: interview-harness-opinionated
description: Create rich interactive interviews for users as local standalone HTML files. A helper library takes care of layout, styling, interview state, output, cards, syntax highlighting, iframe previews, and option comments. Instructs how to structure, pace, and write useful interviews.
---

Create one standalone HTML file that the user can open directly in a browser. Do not read `interview-harness.js`; this skill is the authoring reference.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Interview title</title>
  </head>
  <body>
    <div id="interview-harness"></div>
    <script src="file:///Users/apurin/Code/interview-harness/interview-harness.js"></script>
    <script>
      const h = InterviewHarness;

      h.mount({
        title: "Interview title",
        intro: "Short context for the user.",
        questions: [
          h.text({
            id: "constraint",
            prompt: "What restaurant constraint should I not break?",
            multiline: true,
            placeholder: "Walk-ins, phone bookings, table turnover, large parties, deposits, accessibility."
          }),

          h.choice({
            id: "restaurant_type",
            prompt: "What kind of reservation flow is this?",
            select: "one",
            cardsPerRow: 3,
            options: [
              h.option({
                id: "small",
                title: "Small restaurant with a few tables",
                body: [
                  h.html({ markup: "<div>Keep the flow simple: date, time, party size, contact info.</div>" }),
                  h.prosCons({
                    pros: ["Fast to build", "Low staff overhead"],
                    cons: ["Less control over edge cases"]
                  })
                ]
              }),
              h.option({
                id: "busy",
                title: "Busy restaurant with tight table turnover",
                body: [
                  h.html({ markup: "<div>Show limited slots, party-size rules, and clear arrival expectations.</div>" }),
                  h.prosCons({
                    pros: ["Protects capacity", "Fewer bad bookings"],
                    cons: ["More rules to explain"]
                  })
                ]
              }),
              h.option({
                id: "events",
                title: "Restaurant with private events and large parties",
                body: [
                  h.html({ markup: "<div>Route large groups to an inquiry instead of instant booking.</div>" }),
                  h.prosCons({
                    pros: ["Avoids impossible bookings", "Captures special requests"],
                    cons: ["Slower confirmation"]
                  })
                ]
              })
            ]
          }),

          h.choice({
            id: "booking_details",
            prompt: "What should guests provide before confirming?",
            select: "many",
            cardsPerRow: 4,
            options: [
              h.option({ id: "contact", title: "Name, phone, and email", body: h.html({ markup: "<div>Needed for confirmation and changes.</div>" }) }),
              h.option({ id: "occasion", title: "Occasion or seating preference", body: h.html({ markup: "<table><tr><th>Occasion</th><th>Example</th></tr><tr><td>Birthday</td><td>Quiet table</td></tr></table>" }) }),
              h.option({ id: "dietary", title: "Dietary restrictions", body: h.html({ markup: "<div>Useful for tasting menus or limited kitchens.</div>" }) }),
              h.option({ id: "deposit", title: "Card hold or deposit", body: h.code({ lang: "json", value: "{\"partySize\":8,\"depositRequired\":true}" }) })
            ]
          }),

          h.classify({
            id: "language",
            prompt: "Classify and edit the terms the reservation page should use.",
            states: ["guest-facing", "staff-only", "legacy", "avoid"],
            options: [
              h.option({ id: "reservation", title: "Reservation - Confirmed table at a specific date and time.", body: h.html({ markup: "<div>Source: currently used on the public website.</div>" }) }),
              h.option({ id: "booking", title: "Booking - Alternate word for a reservation.", body: h.html({ markup: "<div>Source: appears in confirmation email templates.</div>" }) }),
              h.option({ id: "cover", title: "Cover - One seated guest in the restaurant.", body: h.html({ markup: "<div>Source: comes from the POS and staffing reports.</div>" }) }),
              h.option({ id: "walk_in", title: "Walk-in - Guest arriving without a reservation.", body: h.html({ markup: "<div>Source: used by hosts during service.</div>" }) })
            ]
          }),

          h.bucket({
            id: "policy_timing",
            prompt: "When should these policy decisions be made?",
            buckets: ["decide now", "decide later", "staff can choose", "avoid"],
            options: [
              h.option({ id: "cancellations", title: "Cancellation window", body: h.html({ markup: "<div>Affects guest trust and staff planning.</div>" }) }),
              "Large-party cutoff",
              "Exact table assignment",
              "Exact button colors"
            ]
          }),

          h.rank({
            id: "tradeoffs",
            prompt: "If tradeoffs conflict, what matters most?",
            options: [
              "Guest booking speed",
              "Avoiding overbooking",
              "Capturing special requests",
              "Keeping staff workflow simple"
            ]
          }),

          h.edit({
            id: "confirmation_policy",
            prompt: "Edit this confirmation policy until it is safe to show guests.",
            artifact: h.code({
              lang: "md",
              value: `Your table is held for 15 minutes after the reservation time.
For parties of 8 or more, the restaurant may call to confirm details.
Please call the restaurant if your party size changes.`
            })
          })
        ]
      });
    </script>
  </body>
</html>
```

## Question Helpers

- `h.text({ id, prompt, placeholder, multiline, defaultValue })`: freeform text. `multiline` defaults to `true`.
- `h.choice({ id, prompt, select, options, cardsPerRow })`: one or many selection. `select` is `"one"` or `"many"`. Users can add custom options when `select` is `"many"`.
- `h.rank({ id, prompt, options })`: drag options into priority order.
- `h.bucket({ id, prompt, buckets, options })`: drag options into named buckets.
- `h.classify({ id, prompt, states, options })`: choose one state per option, edit option text, and add options.
- `h.edit({ id, prompt, artifact, language })`: edit a short code or text artifact.

`cardsPerRow` is only for `choice`: use `"auto"` or omit it for automatic card width, `1` for wide previews, `2` for side-by-side comparisons, `3` for normal rich cards, and `4` for compact scans. The layout collapses on narrow screens.

## Content Helpers

- Plain strings are valid options.
- `h.option({ id, title, body, tags })`: rich option. `tags` is an array of short labels.
- `h.html({ markup })`: trusted inline HTML.
- `h.frame({ src, srcdoc, title, fileName, height })`: iframe preview. Use `srcdoc` for inline frames; they still get a new-tab preview button.
- `h.prosCons({ pros, cons })`: compact tradeoff block.
- `h.code({ lang, value })`: highlighted code block. Use this as the `artifact` for `h.edit`.
- Rich option bodies can be arrays.

## Mount Fields

- `title`: page title.
- `intro`: short context shown under the title.
- `questions`: question helper outputs.
- `target`: selector or element for the mount node; omit when using `<div id="interview-harness"></div>`.
- `storageKey`: local-storage key; set to `false` only when the page should not save progress.

## How to Interview

Use only the questions and rich content needed to make the options clear. The goal is to help the user choose, correct, and steer, not to use every available feature.
Start with fundamental questions that can invalidate later questions.
Prefer a smaller set of high-leverage questions over many questions that become irrelevant after one answer.
Surface assumptions, important decisions, examples, and tensions.
Unless instructed otherwise, point out the user’s likely bias and propose an alternative they may not have considered.
Prefer questions that change the next action; omit questions whose answers would not affect the work.
Offer and mark a strong default when the path is clear, but make the default reviewable.
Put risky or irreversible decisions before polish questions.
Rely on option comments to avoid unnecessary follow-up questions. Users can comment on any option, including options they do not select.
Use rich option bodies when they make a decision easier: layout examples, visual guides, schemas, tradeoffs, previews, or code snippets.
Because the interview is a local HTML file, rich HTML payloads may include CDN visualization libraries when they make an option clearer.

## Usage Ideas

- Use `classify` to validate ubiquitous language: terms, labels, domain objects, actions, and claims that must mean the same thing to the user and the agent.
- Use `classify` to collect assumptions in one place and let the user evaluate them.
- Use `bucket` to separate decisions into “decide now,” “decide later,” and “do not care.”
- Use `rank` to order success criteria before asking for implementation preferences.
- Use `edit` to let the user fine-tune something short and critical.
- Use `choice` with `cardsPerRow: 1` or `2` for design previews and side-by-side visual comparisons.

## Output Behavior

- Users can comment on any option, including options they do not select.
- Answers and comments can be exported as text or JSON.
- Exports include only user-entered or changed answers.
