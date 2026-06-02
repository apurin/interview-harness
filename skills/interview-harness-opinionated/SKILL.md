---
name: interview-harness-opinionated
description: Create rich interactive interviews for users as local standalone HTML files. A helper library takes care of layout, styling, interview state, and output. Allows cards with rich content, syntax highlighting, inline design and layout comparisons, iframe previews, and item comments. Instructs how to structure, pace, and write great interviews for users.
---

Create one standalone HTML file that the user can open directly in a browser. Reuse this file shape and replace the sample questions with the task-specific interview.

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
          // Freeform text input question.
          h.text("constraint", "What restaurant constraint should I not break?", {
            multiline: true,
            placeholder: "Walk-ins, phone bookings, table turnover, large parties, deposits, accessibility."
          }),

          // Single-select question; rich choice cards are about 430px wide.
          h.one("restaurant_type", "What kind of reservation flow is this?", [
            h.item("small", "Small restaurant with a few tables", [
              h.html("<div>Keep the flow simple: date, time, party size, contact info.</div>"),
              h.prosCons(["Fast to build", "Low staff overhead"], ["Less control over edge cases"])
            ]),
            h.item("busy", "Busy restaurant with tight table turnover", [
              h.html("<div>Show limited slots, party-size rules, and clear arrival expectations.</div>"),
              h.prosCons(["Protects capacity", "Fewer bad bookings"], ["More rules to explain"])
            ]),
            h.item("events", "Restaurant with private events and large parties", [
              h.html("<div>Route large groups to an inquiry instead of instant booking.</div>"),
              h.prosCons(["Avoids impossible bookings", "Captures special requests"], ["Slower confirmation"])
            ])
          ]),

          // Multi-select question with add-another support; rich choice cards are about 430px wide.
          h.many("booking_details", "What should guests provide before confirming?", [
            h.item("contact", "Name, phone, and email", h.html("<div>Needed for confirmation and changes.</div>")),
            h.item("occasion", "Occasion or seating preference", h.html("<table><tr><th>Occasion</th><th>Example</th></tr><tr><td>Birthday</td><td>Quiet table</td></tr></table>")),
            h.item("dietary", "Dietary restrictions", h.html("<div>Useful for tasting menus or limited kitchens.</div>")),
            h.item("deposit", "Card hold or deposit", h.code("json", "{\"partySize\":8,\"depositRequired\":true}"))
          ]),

          // Editable review question; users can edit each term title, choose a state per term, and add new terms.
          h.review("language", "Classify and edit the terms the reservation page should use.",
            ["guest-facing", "staff-only", "legacy", "avoid"],
            [
              h.item("reservation", "Reservation - Confirmed table at a specific date and time.", h.html("<div>Source: currently used on the public website.</div>")),
              h.item("booking", "Booking - Alternate word for a reservation.", h.html("<div>Source: appears in confirmation email templates.</div>")),
              h.item("cover", "Cover - One seated guest in the restaurant.", h.html("<div>Source: comes from the POS and staffing reports.</div>")),
              h.item("walk_in", "Walk-in - Guest arriving without a reservation.", h.html("<div>Source: used by hosts during service.</div>"))
          ]),

          // Bucket sorting question; sort columns are up to about 420px wide.
          h.sort("policy_timing", "When should these policy decisions be made?",
            ["decide now", "decide later", "staff can choose", "avoid"],
            [
              h.item("cancellations", "Cancellation window", h.html("<div>Affects guest trust and staff planning.</div>")),
              h.item("large_parties", "Large-party cutoff"),
              h.item("table_map", "Exact table assignment"),
              h.item("colors", "Exact button colors")
          ]),

          // Rank order question; rank cards are compact full-width rows.
          h.rank("tradeoffs", "If tradeoffs conflict, what matters most?", [
            "Guest booking speed",
            "Avoiding overbooking",
            "Capturing special requests",
            "Keeping staff workflow simple"
          ]),

          // Editable artifact question with syntax highlighting.
          h.redline("confirmation_policy", "Edit this confirmation policy until it is safe to show guests.",
            h.code("md", `Your table is held for 15 minutes after the reservation time.
For parties of 8 or more, the restaurant may call to confirm details.
Please call the restaurant if your party size changes.`))
        ]
      });
    </script>
  </body>
</html>
```

## Content Helpers

- Plain strings are valid items.
- Use `h.item(id, title, body, options)` when an item needs rich context.
- Use `h.html("<div>...</div>")` for short trusted HTML.
- Use `h.frame(src, options)` for an iframe preview. Frames show a compact source-file header and a new-tab icon button.
- Use `h.prosCons(pros, cons)` for compact tradeoffs.
- Use `h.code(lang, value)` for code, prompt, or artifact text.
- Rich bodies can be arrays.

## How to use?

You can create many questions, types of questions, add rich body parts to each question, but that does not mean you have to. The main goal is to make options clear for the user, allowing them to choose and steer, nothing else.
User can leave comments, even for items they do not selected, which might allow to avoid uneccessary additional questions.
Use the rich body context to be more expressive when it makes sense - add layout examples, visual guides, schemas, etc.
Since it is a local file, you can safely include some visualisation libraries via CDN links for HTML payloads you adding to the questions.

Use only the questions and rich content needed to make the options clear. The goal is to help the user choose, correct, and steer, not to use every available feature.
Rely on item comments to avoid unnecessary follow-up questions. Users can comment on any item, including items they do not select.
Use rich item bodies when they make a decision easier: layout examples, visual guides, schemas, tradeoffs, previews, or code snippets.
Because the interview is a local HTML file, rich HTML payloads may include CDN visualization libraries when they make an option clearer.

## How to interview?

Start with fundamental questions that can invalidate later questions.
Prefer a smaller set of high-leverage questions over many questions that become irrelevant after one choice.
Surface assumptions, important decisions, examples, and tensions.
Unless instructed otherwise, point out the user’s likely bias and propose an alternative they may not have considered.
Prefer questions that change the next action; omit questions whose answers would not affect the work.
Offer and mark a strong default when the path is clear, but make the default reviewable.
Put risky or irreversible decisions before polish questions.

## Usage ideas

Usage examples (but do not limit yourself to only these):
Use `review` to validate ubiquitous language early: terms, labels, domain objects, actions, and claims that must mean the same thing to the user and the agent.
Use `review` to collect assumptions in one place and let the user evaluate them.
Use `sort` to separate decisions into “decide now,” “decide later,” and “do not care.”
Use `rank` to order success criteria before asking for implementation preferences.
Use `redline` to let the user fine-tune something short and critical.

## Output Behavior

- Users can comment on any item, including items they do not select.
- Answers and comments can be exported as text or JSON.
