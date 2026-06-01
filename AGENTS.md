# Interview Harness

Interview Harness helps agents create throwaway local HTML interview artifacts where a user can express their vision by reacting to, selecting, editing, and refining what the agent generated.

The project should make these interview pages cheap for agents to author and useful for users to answer. Agents should spend few tokens describing the harness and few output tokens writing each interview page. The library should carry the layout, behavior, styling, state handling, and export affordances whenever possible.

## Project Shape

- The project is called **Interview Harness**.
- The distributable is a readable client-side JavaScript library that can be included from a local file, a public repository URL, or a CDN-style URL in a local HTML page.
- The generated interview page is a temporary artifact. It exists to help the user communicate intent more clearly during an agent-led workflow.
- The usage instructions are skills/manuals. They should be short enough for agents to include and follow without spending much context.

## Library Goals

- Keep the logical surface small. Prefer a compact API that agents can remember and invoke with little explanation.
- Provide the heavy lifting in the library: rendering, interaction logic, state, navigation, selection behavior, copy/export helpers, and sensible defaults.
- Support ordinary interview controls such as text input, single choice, and multiple choice.
- Develop richer question types as a core project value, especially question types suited to agent-human collaboration and iterative artifact review.
- Make richer question types feel like natural extensions of normal interview controls, not a separate novelty category.
- Favor readable, inspectable source over packaging opacity. Size is less important than trust.
- Avoid minification by default. Users should be able to inspect the shipped library and see that it does nothing surprising.

## Skills And Manuals

The project should provide two skill/manual flavors:

- A neutral skill that explains how to embed and use the library.
- An opinionated skill with the same usage section, plus examples and guidance for better agent-led interviews.

Both flavors should teach the same library surface. The opinionated flavor may add interviewing advice, sequencing guidance, and examples that use richer question types.

## Current Example

`fullscreen_html_mockup_gallery_interview.html` is an example of a polished interview HTML page. It shows the kind of expressive, full-screen interaction this project should make easier to generate.

It is not canonical. Do not treat its structure, styling, API ideas, or question types as fixed. Future work may salvage style or interaction ideas from it.

## Output Direction

Interview output should be easy for a one-off LLM reader to consume. Human-readable exports may be enough for early versions.

Do not assume a JSON schema is required until the project has researched whether programmatic output adds enough value.

## Open Design Space

Do not lock technical details before the library design needs them. In particular, keep these open for now:

- Exact API names and object model.
- Module format and browser global strategy.
- CDN/repository hosting details.
- Export schema and persistence model.
- Final taxonomy of question types.
