/*
 * Interview Harness
 * Readable, no-build client-side library for temporary agent-authored interviews.
 */
(function attachInterviewHarness(global) {
  "use strict";

  const VERSION = "0.1.0";
  const STYLE_ID = "interview-harness-styles";
  const DEFAULT_TARGET_ID = "interview-harness";
  const SORTABLE_URL = "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js";
  const CODEMIRROR_URL = "https://esm.sh/codemirror@6.0.2";
  const CODEMIRROR_THEME_URL = "https://esm.sh/@codemirror/theme-one-dark@6.1.3";
  const CODEMIRROR_LANGS = {
    js: "https://esm.sh/@codemirror/lang-javascript@6.2.5",
    javascript: "https://esm.sh/@codemirror/lang-javascript@6.2.5",
    md: "https://esm.sh/@codemirror/lang-markdown@6.5.0",
    markdown: "https://esm.sh/@codemirror/lang-markdown@6.5.0",
    html: "https://esm.sh/@codemirror/lang-html@6.4.11",
    json: "https://esm.sh/@codemirror/lang-json@6.0.2"
  };
  let sortablePromise = null;
  let codeMirrorPromise = null;
  let codeMirrorThemePromise = null;
  const codeMirrorLanguagePromises = {};

  // Authoring helpers --------------------------------------------------------

  function question(type, id, prompt, extra) {
    return Object.assign({ type, id, prompt }, extra || {});
  }

  function text(id, prompt, options) {
    return question("text", id, prompt, options);
  }

  function one(id, prompt, items, options) {
    return question("one", id, prompt, Object.assign({ items }, options || {}));
  }

  function many(id, prompt, items, options) {
    return question("many", id, prompt, Object.assign({ items, allowAdd: true }, options || {}));
  }

  function rank(id, prompt, items, options) {
    return question("rank", id, prompt, Object.assign({ items }, options || {}));
  }

  function sort(id, prompt, buckets, items, options) {
    return question("sort", id, prompt, Object.assign({ buckets, items }, options || {}));
  }

  function review(id, prompt, verbs, items, options) {
    return question("review", id, prompt, Object.assign({ verbs, items, allowAdd: true }, options || {}));
  }

  function redline(id, prompt, artifact, options) {
    return question("redline", id, prompt, Object.assign({ artifact }, options || {}));
  }

  function item(id, title, body, options) {
    if (arguments.length === 1 && typeof id === "object") return id;
    return Object.assign({ id, title, body }, options || {});
  }

  function frame(src, options) {
    return Object.assign({ view: "frame", src }, options || {});
  }

  function html(markup, options) {
    return Object.assign({ view: "html", markup }, options || {});
  }

  function prosCons(pros, cons, options) {
    return Object.assign({ view: "prosCons", pros, cons }, options || {});
  }

  function code(lang, value, options) {
    return Object.assign({ view: "code", lang, value }, options || {});
  }

  // Normalization ------------------------------------------------------------

  function normalizeConfig(input, target) {
    const config = Array.isArray(input) ? { questions: input } : Object.assign({}, input || {});
    config.target = target || config.target || `#${DEFAULT_TARGET_ID}`;
    config.title = String(config.title || "Interview");
    config.intro = String(config.intro || "");
    config.questions = asArray(config.questions || config.steps || config.items).map(normalizeQuestion);
    config.storageKey = config.storageKey === false ? false : String(config.storageKey || defaultStorageKey(config.title));
    config.pageMode = ["auto", "paged", "all"].includes(config.pageMode) ? config.pageMode : "auto";
    config.copyTextLabel = config.copyTextLabel || "Copy text";
    config.copyJsonLabel = config.copyJsonLabel || "Copy JSON";
    return config;
  }

  function normalizeQuestion(input, index) {
    if (typeof input === "string") {
      return {
        type: "text",
        id: `q${index + 1}`,
        prompt: input,
        help: "",
        placeholder: "",
        multiline: true
      };
    }

    const raw = Object.assign({}, input || {});
    const prompt = String(raw.prompt || raw.question || raw.title || `Question ${index + 1}`);
    const type = String(raw.type || inferQuestionType(raw)).toLowerCase();
    const id = String(raw.id || slugify(prompt) || `q${index + 1}`);

    const base = {
      type,
      id,
      prompt,
      help: String(raw.help || raw.description || raw.note || ""),
      optional: Boolean(raw.optional)
    };

    if (type === "text") {
      return Object.assign(base, {
        placeholder: String(raw.placeholder || ""),
        multiline: raw.multiline !== false,
        defaultValue: valueToText(raw.defaultValue || raw.value || "")
      });
    }

    if (type === "sort") {
      return Object.assign(base, {
        buckets: normalizeBuckets(raw.buckets || raw.choices || raw.verbs || ["yes", "maybe", "no"]),
        items: normalizeItems(raw.items || raw.options || raw.choices)
      });
    }

    if (type === "review") {
      return Object.assign(base, {
        verbs: normalizeBuckets(raw.verbs || raw.buckets || raw.choices || ["keep", "revise", "remove"]),
        items: normalizeItems(raw.items || raw.options),
        allowAdd: raw.allowAdd !== false
      });
    }

    if (type === "redline") {
      return Object.assign(base, {
        artifact: normalizeArtifact(raw.artifact || raw.body || raw.content || raw.value || ""),
        language: raw.language || ""
      });
    }

    return Object.assign(base, {
      items: normalizeItems(raw.items || raw.options || raw.choices),
      allowAdd: type === "many" ? raw.allowAdd !== false : Boolean(raw.allowAdd)
    });
  }

  function inferQuestionType(raw) {
    if (raw.artifact || raw.content) return "redline";
    if (raw.buckets) return "sort";
    if (raw.verbs) return "review";
    if (raw.items || raw.options || raw.choices) return raw.multiple ? "many" : "one";
    return "text";
  }

  function normalizeItems(input) {
    return asArray(input).map((entry, index) => normalizeItem(entry, index));
  }

  function normalizeItem(entry, index) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      const title = String(entry);
      return { id: slugify(title) || `item-${index + 1}`, title, body: "" };
    }

    const raw = Object.assign({}, entry || {});
    const title = String(raw.title || raw.label || raw.name || raw.id || `Item ${index + 1}`);
    return {
      id: String(raw.id || slugify(title) || `item-${index + 1}`),
      title,
      body: raw.body || raw.detail || raw.description || raw.preview || "",
      meta: raw.meta || raw.tags || null
    };
  }

  function normalizeBuckets(input) {
    return asArray(input).map((bucket, index) => {
      if (typeof bucket === "string") return { id: slugify(bucket) || `bucket-${index + 1}`, title: bucket };
      const raw = Object.assign({}, bucket || {});
      const title = String(raw.title || raw.label || raw.name || raw.id || `Bucket ${index + 1}`);
      return { id: String(raw.id || slugify(title) || `bucket-${index + 1}`), title };
    });
  }

  function normalizeArtifact(input) {
    if (typeof input === "string") return { view: "code", lang: "", value: input };
    if (input && input.view === "code") return input;
    if (input && input.value !== undefined) return Object.assign({ view: "code", lang: "" }, input);
    return { view: "code", lang: "", value: valueToText(input) };
  }

  // State and export logic ---------------------------------------------------

  function createInitialState(questions) {
    const answers = {};
    questions.forEach((questionDef) => {
      answers[questionDef.id] = initialAnswer(questionDef);
    });
    return { version: VERSION, step: 0, viewMode: "paged", commentEditor: null, answers };
  }

  function initialAnswer(questionDef) {
    if (questionDef.type === "text") return { answer: questionDef.defaultValue || "" };
    if (questionDef.type === "one") return { selected: "", comments: {} };
    if (questionDef.type === "many") return { selected: [], comments: {}, added: [] };
    if (questionDef.type === "rank") return { order: questionDef.items.map((entry) => entry.id), comments: {}, touched: false };
    if (questionDef.type === "sort") return { buckets: objectFrom(questionDef.items, ""), comments: {} };
    if (questionDef.type === "review") return { states: objectFrom(questionDef.items, ""), edits: objectFrom(questionDef.items, "title"), comments: {}, added: [] };
    if (questionDef.type === "redline") return { content: artifactText(questionDef.artifact), summary: "", touched: false };
    return { answer: "" };
  }

  function mergeState(saved, current, questions) {
    if (!saved || typeof saved !== "object") return current;
    const next = Object.assign({}, current, {
      version: VERSION,
      viewMode: saved.viewMode === "all" || saved.viewMode === "paged" ? saved.viewMode : current.viewMode,
      commentEditor: null,
      answers: Object.assign({}, current.answers)
    });
    if (Number.isInteger(saved.step)) next.step = Math.max(0, Math.min(saved.step, questions.length));
    questions.forEach((questionDef) => {
      if (saved.answers && saved.answers[questionDef.id]) {
        next.answers[questionDef.id] = hydrateAnswer(questionDef, next.answers[questionDef.id], saved.answers[questionDef.id]);
      }
    });
    return next;
  }

  function hydrateAnswer(questionDef, initial, saved) {
    const answer = Object.assign({}, initial, saved || {});
    if (initial.comments) answer.comments = Object.assign({}, initial.comments, safeObject(saved.comments));

    if (questionDef.type === "many") {
      answer.selected = asArray(saved.selected);
      answer.added = normalizeAddedItems(saved.added);
      answer.touched = Boolean(answer.selected.length || answer.added.length || Object.keys(answer.comments || {}).length);
    }

    if (questionDef.type === "rank") {
      const known = new Set(questionDef.items.map((entry) => entry.id));
      answer.order = asArray(saved.order).filter((id) => known.has(id));
      questionDef.items.forEach((entry) => { if (!answer.order.includes(entry.id)) answer.order.push(entry.id); });
      answer.touched = Boolean(saved.touched || Object.keys(answer.comments || {}).length || asArray(saved.order).join("|") !== questionDef.items.map((entry) => entry.id).join("|"));
    }

    if (questionDef.type === "sort") {
      answer.buckets = Object.assign({}, initial.buckets, safeObject(saved.buckets));
      answer.touched = Boolean(Object.values(answer.buckets).some(Boolean) || Object.keys(answer.comments || {}).length);
    }

    if (questionDef.type === "review") {
      answer.states = Object.assign({}, initial.states, safeObject(saved.states));
      answer.edits = Object.assign({}, initial.edits, safeObject(saved.edits));
      answer.added = normalizeAddedItems(saved.added);
      answer.added.forEach((entry) => {
        if (answer.edits[entry.id] === undefined) answer.edits[entry.id] = entry.title;
      });
      answer.touched = Boolean(
        answer.added.length ||
        Object.values(answer.states).some(Boolean) ||
        Object.keys(answer.comments || {}).length ||
        questionDef.items.some((entry) => answer.edits[entry.id] && answer.edits[entry.id] !== entry.title)
      );
    }

    if (questionDef.type === "redline") {
      answer.summary = String(saved.summary || "");
      answer.touched = Boolean(saved.touched || saved.summary || String(answer.content || "") !== artifactText(questionDef.artifact));
    }

    return answer;
  }

  function buildResult(config, state) {
    const answers = config.questions
      .map((questionDef, index) => serializeAnswer(questionDef, state.answers[questionDef.id], index))
      .filter(Boolean);
    return {
      title: config.title,
      generatedAt: new Date().toISOString(),
      answers
    };
  }

  function serializeAnswer(questionDef, answer, index) {
    if (!answer || !isAnswerChanged(questionDef, answer)) return null;
    const base = {
      id: questionDef.id,
      type: questionDef.type,
      question: questionDef.prompt,
      position: index + 1
    };

    if (questionDef.type === "text") return Object.assign(base, { answer: answer.answer || "" });

    if (questionDef.type === "one") {
      const comments = itemComments(answerItems(questionDef, answer), answer.comments);
      const payload = {};
      if (answer.selected) payload.selected = findItem(questionDef, answer, answer.selected);
      if (comments.length) payload.comments = comments;
      return Object.assign(base, payload);
    }

    if (questionDef.type === "many") {
      const items = answerItems(questionDef, answer);
      const selected = asArray(answer.selected).map((id) => findItem(questionDef, answer, id)).filter(Boolean);
      const added = asArray(answer.added)
        .filter((entry) => entry.title || asArray(answer.selected).includes(entry.id) || answer.comments && answer.comments[entry.id])
        .map((entry) => {
          const payload = {
            id: entry.id,
            title: entry.title,
            selected: asArray(answer.selected).includes(entry.id)
          };
          const comment = answer.comments && answer.comments[entry.id] || "";
          if (comment) payload.comment = comment;
          return payload;
        });
      const comments = itemComments(items, answer.comments);
      const payload = {};
      if (selected.length) payload.selected = selected;
      if (added.length) payload.added = added;
      if (comments.length) payload.comments = comments;
      return Object.assign(base, payload);
    }

    if (questionDef.type === "rank") {
      const defaultOrder = questionDef.items.map((entry) => entry.id);
      const order = asArray(answer.order);
      const orderChanged = order.join("|") !== defaultOrder.join("|");
      const comments = itemComments(answerItems(questionDef, answer), answer.comments);
      const payload = {};
      if (orderChanged) payload.order = order.map((id) => findItem(questionDef, answer, id)).filter(Boolean);
      if (comments.length) payload.comments = comments;
      return Object.assign(base, payload);
    }

    if (questionDef.type === "sort") {
      const buckets = {};
      questionDef.buckets.forEach((bucket) => { buckets[bucket.title] = []; });
      const unset = [];
      questionDef.items.forEach((entry) => {
        const bucket = questionDef.buckets.find((candidate) => candidate.id === answer.buckets[entry.id]);
        const comment = (answer.comments && answer.comments[entry.id]) || "";
        const payload = { id: entry.id, title: entry.title };
        if (comment) payload.comment = comment;
        if (bucket) buckets[bucket.title].push(payload);
        else if (comment) unset.push(payload);
      });
      Object.keys(buckets).forEach((bucket) => {
        if (!buckets[bucket].length) delete buckets[bucket];
      });
      const payload = {};
      if (Object.keys(buckets).length) payload.buckets = buckets;
      if (unset.length) payload.unset = unset;
      return Object.assign(base, payload);
    }

    if (questionDef.type === "review") {
      const items = answerItems(questionDef, answer);
      return Object.assign(base, {
        items: items.map((entry) => {
          const state = (answer.states && answer.states[entry.id]) || "";
          const edited = (answer.edits && answer.edits[entry.id]) || entry.title;
          const comment = (answer.comments && answer.comments[entry.id]) || "";
          if (!entry.custom && !state && !comment && edited === entry.title) return null;
          const payload = { id: entry.id, title: entry.title };
          if (entry.custom) payload.added = edited;
          if (state) payload.state = state;
          if (!entry.custom && edited !== entry.title) payload.edited = edited;
          if (comment) payload.comment = comment;
          return payload;
        }).filter(Boolean)
      });
    }

    if (questionDef.type === "redline") {
      const output = { summary: answer.summary || "" };
      if (String(answer.content || "") !== artifactText(questionDef.artifact)) output.content = answer.content || "";
      return Object.assign(base, output);
    }

    return Object.assign(base, { answer });
  }

  function buildTextExport(config, state) {
    const result = buildResult(config, state);
    const lines = [`# ${result.title}`, ""];
    if (!result.answers.length) {
      lines.push("No user changes yet.");
      return lines.join("\n").trim() + "\n";
    }

    result.answers.forEach((entry) => {
      lines.push(`## ${entry.position}. ${entry.question}`);

      if (entry.type === "text") {
        lines.push(entry.answer ? entry.answer : "No answer provided.");
      }

      if (entry.type === "one") {
        if (entry.selected) lines.push(`Selected: ${entry.selected.title}`);
        appendComments(lines, entry.comments || []);
      }

      if (entry.type === "many") {
        if (entry.selected && entry.selected.length) {
          lines.push("Selected:");
          entry.selected.forEach((item) => lines.push(`- ${item.title}`));
        }
        if (entry.added && entry.added.length) {
          lines.push("Added custom items:");
          entry.added.forEach((added) => {
            const selected = added.selected ? "selected" : "not selected";
            const comment = added.comment ? ` Comment: ${added.comment}` : "";
            lines.push(`- ${added.title || added} (${selected})${comment}`);
          });
        }
        appendComments(lines, entry.comments || []);
      }

      if (entry.type === "rank") {
        if (entry.order && entry.order.length) {
          lines.push("Order:");
          entry.order.forEach((item, index) => lines.push(`${index + 1}. ${item.title}`));
        }
        appendComments(lines, entry.comments || []);
      }

      if (entry.type === "sort") {
        Object.keys(entry.buckets || {}).forEach((bucket) => {
          lines.push(`${bucket}:`);
          if (entry.buckets[bucket].length) {
            entry.buckets[bucket].forEach((item) => {
              const comment = item.comment ? ` Comment: ${item.comment}` : "";
              lines.push(`- ${item.title}${comment}`);
            });
          } else {
            lines.push("- none");
          }
        });
        if (entry.unset && entry.unset.length) {
          lines.push("Unsorted:");
          entry.unset.forEach((item) => lines.push(`- ${item.title}`));
        }
      }

      if (entry.type === "review") {
        entry.items.forEach((item) => {
          const label = item.added || item.title || "Custom item";
          lines.push(`- ${label}`);
          if (item.state) lines.push(`  State: ${item.state}`);
          if (item.edited) lines.push(`  Edited: ${item.edited}`);
          if (item.comment) lines.push(`  Comment: ${item.comment}`);
        });
      }

      if (entry.type === "redline") {
        if (entry.content !== undefined) {
          lines.push("Edited artifact:");
          lines.push("```");
          lines.push(entry.content || "");
          lines.push("```");
        }
        if (entry.summary) lines.push(`Overall comment: ${entry.summary}`);
      }

      lines.push("");
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function appendComments(lines, comments) {
    const filled = comments.filter((entry) => entry.comment);
    if (!filled.length) return;
    lines.push("Comments:");
    filled.forEach((entry) => lines.push(`- ${entry.title}: ${entry.comment}`));
  }

  function isAnswerChanged(questionDef, answer) {
    if (!answer) return false;
    if (questionDef.type === "text") return Boolean(String(answer.answer || "").trim());
    if (questionDef.type === "one") return Boolean(answer.selected || itemComments(answerItems(questionDef, answer), answer.comments).length);
    if (questionDef.type === "many") {
      return Boolean(asArray(answer.selected).length || asArray(answer.added).length || itemComments(answerItems(questionDef, answer), answer.comments).length);
    }
    if (questionDef.type === "rank") {
      const defaultOrder = questionDef.items.map((entry) => entry.id).join("|");
      return Boolean(
        asArray(answer.order).join("|") !== defaultOrder ||
        itemComments(questionDef.items, answer.comments).length
      );
    }
    if (questionDef.type === "sort") {
      return Boolean(
        Object.values(safeObject(answer.buckets)).some(Boolean) ||
        itemComments(questionDef.items, answer.comments).length
      );
    }
    if (questionDef.type === "review") {
      return answerItems(questionDef, answer).some((entry) => {
        const edited = answer.edits && answer.edits[entry.id] || entry.title;
        const state = answer.states && answer.states[entry.id] || "";
        return Boolean(entry.custom || state || answer.comments && answer.comments[entry.id] || edited !== entry.title);
      });
    }
    if (questionDef.type === "redline") {
      return Boolean(String(answer.content || "") !== artifactText(questionDef.artifact) || answer.summary);
    }
    return false;
  }

  // Rendering and styles -----------------------------------------------------

  const styles = `
    :root {
      color-scheme: dark;
      --ih-bg: #262b2a;
      --ih-surface: #303735;
      --ih-surface-2: #3d4744;
      --ih-ink: #eef1ec;
      --ih-muted: #b8c0ba;
      --ih-line: #46524f;
      --ih-line-strong: #5b6864;
      --ih-accent: #8dd7bd;
      --ih-accent-ink: #14231e;
      --ih-accent-soft: rgb(141 215 189 / 28%);
      --ih-good: #a2d987;
      --ih-warn: #f2c14e;
      --ih-danger: #ee9b93;
      --ih-shadow: 0 22px 48px rgb(8 14 13 / 30%);
      --ih-radius: 4px;
      --ih-mark-radius: 0;
      --ih-code-bg: #202625;
      --ih-code-ink: #eff6f2;
      --ih-max: 1480px;
      --ih-choice-column-width: 430px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .ih-app, .ih-app * { box-sizing: border-box; }
    html:has(.ih-app), body:has(.ih-app) { background: var(--ih-bg); }
    body:has(.ih-app) { margin: 0; }
    .ih-app { min-height: 100vh; background: var(--ih-bg); color: var(--ih-ink); }
    .ih-app button, .ih-app input, .ih-app textarea, .ih-app select, .ih-app summary { font: inherit; }
    .ih-app button, .ih-app summary { cursor: pointer; color: inherit; }
    .ih-app button:focus-visible, .ih-app input:focus-visible, .ih-app textarea:focus-visible, .ih-app select:focus-visible, .ih-app summary:focus-visible, .cm-editor.cm-focused {
      outline: 3px solid var(--ih-accent-soft);
      outline-offset: 2px;
    }

    .ih-topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      border-bottom: 0;
      background: color-mix(in srgb, var(--ih-bg) 92%, transparent);
      box-shadow: 0 1px 0 rgb(255 255 255 / 4%), 0 12px 28px rgb(8 14 13 / 16%);
      backdrop-filter: blur(16px);
    }
    .ih-topbar-inner {
      max-width: var(--ih-max);
      margin: 0 auto;
      padding: 12px clamp(14px, 3vw, 34px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    .ih-brand { display: flex; align-items: start; gap: 12px; min-width: 0; }
    .ih-mark {
      width: 34px;
      height: 34px;
      border-radius: var(--ih-mark-radius);
      display: grid;
      place-items: center;
      background: var(--ih-ink);
      color: var(--ih-surface);
      font-weight: 850;
      flex: 0 0 auto;
      font-size: 13px;
    }
    .ih-title { margin: 0; max-width: 980px; font-size: clamp(18px, 2vw, 24px); line-height: 1.15; letter-spacing: 0; overflow-wrap: anywhere; }
    .ih-intro { margin: 4px 0 0; max-width: 980px; color: var(--ih-muted); font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
    .ih-actions { display: flex; gap: 8px; justify-content: end; flex-wrap: wrap; }

    .ih-timeline { max-width: var(--ih-max); margin: 0 auto; padding: 0 clamp(14px, 3vw, 34px) 10px; overflow-x: auto; }
    .ih-timeline-list { position: relative; width: max-content; display: flex; align-items: center; gap: clamp(8px, 1.4vw, 16px); padding: 5px 0; }
    .ih-timeline-list::before { content: ""; position: absolute; left: 12px; right: 12px; top: 50%; height: 2px; background: var(--ih-line); transform: translateY(-50%); }
    .ih-timeline-dot {
      position: relative;
      z-index: 1;
      width: 23px;
      height: 23px;
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      background: var(--ih-surface);
      color: transparent;
      padding: 0;
    }
    .ih-timeline-dot.is-active { background: var(--ih-accent); box-shadow: 0 0 0 4px var(--ih-accent-soft); }
    .ih-timeline-dot.is-answered { background: var(--ih-good); }
    .ih-timeline-dot.is-export.is-waiting { background: var(--ih-warn); }
    .ih-timeline-dot.is-export.is-ready { background: var(--ih-good); }

    .ih-main {
      max-width: var(--ih-max);
      margin: 0 auto;
      padding: clamp(22px, 4vw, 48px) clamp(14px, 3vw, 34px) 104px;
    }
    .ih-main.is-all { display: grid; gap: 44px; padding-bottom: 58px; }
    .ih-step { min-width: 0; scroll-margin-top: 118px; }
    .ih-question-head { margin-bottom: clamp(16px, 2.4vw, 24px); }
    .ih-kicker { margin: 0 0 8px; color: var(--ih-accent); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 850; }
    .ih-prompt { margin: 0; max-width: 980px; font-size: clamp(22px, 2.5vw, 34px); line-height: 1.12; letter-spacing: 0; }
    .ih-help { margin: 10px 0 0; max-width: 900px; color: var(--ih-muted); line-height: 1.5; font-size: clamp(14px, 1vw, 16px); }

    .ih-btn {
      min-height: 36px;
      border: 0;
      border-radius: 999px;
      background: var(--ih-surface-2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 12px;
      font-weight: 760;
      font-size: 13px;
    }
    .ih-btn:hover { background: color-mix(in srgb, var(--ih-accent) 16%, var(--ih-surface-2)); color: var(--ih-ink); }
    .ih-btn:disabled { opacity: .45; cursor: not-allowed; }
    .ih-app .ih-btn-primary { background: var(--ih-accent); color: var(--ih-accent-ink); box-shadow: var(--ih-shadow); }
    .ih-app .ih-btn-accent { background: var(--ih-accent); color: var(--ih-accent-ink); }
    .ih-mode-toggle { min-width: 124px; }

    .ih-grid {
      column-width: var(--ih-choice-column-width);
      column-gap: 14px;
    }
    .ih-grid > .ih-card {
      width: 100%;
      margin: 0 0 14px;
      break-inside: avoid;
    }
    .ih-stack { display: grid; gap: 10px; }
    .ih-card {
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-surface);
      padding: 14px;
      min-width: 0;
      align-content: start;
    }
    .ih-choice {
      text-align: left;
      display: grid;
      gap: 10px;
      min-height: 118px;
      transition: box-shadow .12s ease;
      align-content: start;
    }
    .ih-choice:hover { box-shadow: 0 12px 28px rgb(8 14 13 / 22%); }
    .ih-choice.is-selected { box-shadow: 0 0 0 3px var(--ih-accent-soft); }
    .ih-item-top { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
    .ih-item-actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .ih-item-title { margin: 0; font-size: clamp(16px, 1.25vw, 20px); line-height: 1.18; letter-spacing: 0; }
    .ih-select-dot, .ih-icon-btn, .ih-comment-button, .ih-move-button, .ih-remove-icon {
      width: 32px;
      height: 32px;
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: var(--ih-muted);
      background: var(--ih-surface-2);
      font-weight: 850;
      padding: 0;
    }
    .ih-choice.is-selected .ih-select-dot { color: var(--ih-accent-ink); background: var(--ih-accent); }
    .ih-comment-button svg, .ih-move-button svg, .ih-remove-icon svg { width: 16px; height: 16px; }
    .ih-comment-button { border-color: transparent; background: color-mix(in srgb, var(--ih-accent) 14%, var(--ih-surface-2)); color: var(--ih-accent); }
    .ih-comment-button:hover { background: color-mix(in srgb, var(--ih-accent) 22%, var(--ih-surface-2)); color: var(--ih-accent); }
    .ih-comment-button.has-comment { color: var(--ih-accent-ink); border-color: transparent; background: var(--ih-accent); }
    .ih-move-menu { display: inline-grid; }
    .ih-move-menu[open] { z-index: 70; }
    .ih-move-button { list-style: none; border-color: transparent; background: color-mix(in srgb, var(--ih-ink) 7%, var(--ih-surface-2)); color: var(--ih-muted); }
    .ih-move-button::-webkit-details-marker { display: none; }
    .ih-move-button::marker { content: ""; }
    .ih-move-button:hover, .ih-move-menu[open] .ih-move-button { background: color-mix(in srgb, var(--ih-accent) 18%, var(--ih-surface-2)); color: var(--ih-accent); }
    .ih-move-dropdown {
      position: fixed;
      top: var(--ih-move-top, 8px);
      left: var(--ih-move-left, 8px);
      z-index: 70;
      min-width: 178px;
      max-width: min(230px, calc(100vw - 16px));
      max-height: min(260px, var(--ih-move-max-height, calc(100vh - 16px)));
      overflow: auto;
      display: grid;
      gap: 2px;
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-surface);
      box-shadow: var(--ih-shadow);
      padding: 6px;
    }
    .ih-move-option {
      width: 100%;
      border: 0;
      border-radius: var(--ih-radius);
      background: transparent;
      color: var(--ih-ink);
      padding: 8px 9px;
      text-align: left;
      font-size: 12px;
      font-weight: 760;
      line-height: 1.2;
    }
    .ih-move-option:hover, .ih-move-option.is-current { background: var(--ih-surface-2); }
    .ih-remove-icon { color: var(--ih-danger); }
    .ih-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .ih-pill { border: 0; border-radius: 999px; padding: 4px 8px; color: var(--ih-muted); background: var(--ih-surface-2); font-size: 12px; font-weight: 700; }
    .ih-label { display: block; font-size: 12px; color: var(--ih-muted); font-weight: 760; margin-bottom: 6px; }
    .ih-field {
      width: 100%;
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-surface-2);
      color: var(--ih-ink);
      padding: 10px 11px;
      min-height: 42px;
      resize: vertical;
    }
    .ih-field-large { min-height: 178px; }
    .ih-auto-field { overflow: hidden; resize: none; }
    .ih-custom-title { min-height: 58px; font-weight: 760; }

    .ih-rich { min-width: 0; color: var(--ih-muted); line-height: 1.45; display: grid; gap: 12px; align-content: start; }
    .ih-rich p { margin: 0; }
    .ih-rich ul { margin: 8px 0 0; }
    .ih-frame { width: 100%; height: min(54vh, 520px); border: 0; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-html-preview { overflow: auto; }
    .ih-html-preview > * + * { margin-top: 9px; }
    .ih-html-preview figure { margin: 0; display: grid; gap: 6px; }
    .ih-html-preview img { display: block; width: 100%; max-height: 240px; object-fit: cover; border: 0; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-html-preview figcaption { color: var(--ih-muted); font-size: 12px; }
    .ih-html-preview table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ih-html-preview th, .ih-html-preview td { border-bottom: 0; padding: 6px 7px; text-align: left; vertical-align: top; }
    .ih-html-preview th { color: var(--ih-ink); font-weight: 850; }
    .ih-html-preview .ih-mini-callout { border-left: 0; padding: 8px 10px; background: var(--ih-surface-2); color: var(--ih-ink); }
    .ih-pros-cons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 0; }
    .ih-pros, .ih-cons { padding: 0; border: 0; background: transparent; }
    .ih-pros strong, .ih-cons strong { display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .ih-pros strong { color: var(--ih-good); }
    .ih-cons strong { color: var(--ih-danger); }
    .ih-pros ul, .ih-cons ul { margin: 0; padding-left: 18px; }
    .ih-add-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: start; margin-top: 14px; }
    .ih-add-row textarea { min-height: 70px; }
    .ih-add-row .ih-btn { justify-self: start; }
    .ih-compact-list { display: grid; gap: 8px; }
    .ih-rank-item, .ih-sort-card {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: start;
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-surface);
      padding: 9px 10px;
      font-size: 13px;
    }
    .ih-rank-item .ih-item-title, .ih-sort-card .ih-item-title { font-size: 14px; line-height: 1.25; }
    .ih-rank-item .ih-rich, .ih-sort-card .ih-rich { font-size: 12px; line-height: 1.35; }
    .ih-sort-card > .ih-item-title { grid-column: 2; grid-row: 1; align-self: center; }
    .ih-rank-item > .ih-item-title { grid-column: 2; grid-row: 1; }
    .ih-sort-card > .ih-sort-actions { grid-column: 3; grid-row: 1; align-self: center; justify-self: end; display: inline-flex; align-items: center; gap: 6px; }
    .ih-rank-item > .ih-comment-button { grid-column: 3; grid-row: 1; justify-self: end; }
    .ih-rank-item > .ih-rich, .ih-sort-card > .ih-rich { grid-column: 1 / -1; grid-row: 2; }
    .ih-rank-item.is-dragging, .ih-sort-card.is-dragging { opacity: .55; }
    .ih-rank-item.is-drop-target, .ih-bucket.is-drop-target { box-shadow: 0 0 0 3px var(--ih-accent-soft); }
    .ih-rank-item { grid-template-columns: 20px minmax(0, 1fr) auto; align-items: start; }
    .ih-grip {
      width: 18px;
      height: 30px;
      border: 0;
      background:
        radial-gradient(circle, var(--ih-line-strong) 1.4px, transparent 1.7px) 0 0 / 8px 8px;
      opacity: .9;
      cursor: grab;
      align-self: center;
    }
    .ih-grip:active { cursor: grabbing; }
    .ih-sort-frame { --ih-sort-column-width: min(420px, calc(100vw - 64px)); overflow-x: auto; padding-bottom: 4px; overscroll-behavior-x: contain; }
    .ih-sort-board { display: flex; align-items: stretch; gap: 12px; min-width: max-content; }
    .ih-bucket { width: var(--ih-sort-column-width); flex: 0 0 var(--ih-sort-column-width); display: grid; grid-template-rows: auto minmax(128px, 1fr); border: 0; border-radius: var(--ih-radius); background: color-mix(in srgb, var(--ih-surface) 74%, var(--ih-surface-2)); padding: 10px; min-height: 180px; }
    .ih-bucket-title { font-weight: 850; margin-bottom: 8px; font-size: 14px; }
    .ih-bucket-list { display: grid; gap: 7px; min-height: 128px; align-content: start; }
    .ih-bucket-empty { color: var(--ih-muted); font-size: 12px; padding: 7px 0; }
    .ih-number { width: 72px; min-height: 38px; border: 0; border-radius: var(--ih-radius); padding: 8px; }

    .ih-review-card { display: grid; gap: 10px; }
    .ih-review-row { display: grid; gap: 9px; }
    .ih-review-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ih-review-options {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      border-radius: 999px;
      background: var(--ih-surface-2);
      padding: 4px;
    }
    .ih-app .ih-review-option, .ih-app .ih-added-pill { font-size: 12px; font-weight: 850; line-height: 1; }
    .ih-review-option {
      min-height: 30px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      padding: 0 10px;
      color: var(--ih-muted);
      white-space: nowrap;
      transition: background-color .14s ease, color .14s ease, box-shadow .14s ease;
    }
    .ih-review-option:hover { background: color-mix(in srgb, var(--ih-accent) 14%, var(--ih-surface)); color: var(--ih-ink); }
    .ih-review-option.is-selected { color: var(--ih-accent-ink); background: var(--ih-accent); box-shadow: 0 1px 4px rgb(8 14 13 / 18%); }
    .ih-added-pill { min-height: 30px; border-radius: 999px; display: inline-grid; place-items: center; padding: 0 12px; background: var(--ih-surface-2); color: var(--ih-muted); }

    .ih-redline { display: grid; gap: 10px; }
    .ih-code-editor-host, .ih-code-fallback, .ih-code-viewer-host, .ih-code-viewer-fallback {
      min-height: 440px;
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-code-bg);
      color: var(--ih-code-ink);
      overflow: hidden;
    }
    .ih-code-editor-host, .ih-code-viewer-host { display: none; }
    .ih-code-editor-host .cm-editor { min-height: 440px; }
    .ih-code-editor-host .cm-editor, .ih-code-viewer-host .cm-editor { font-size: 13px; }
    .ih-code-editor-host .cm-scroller, .ih-code-viewer-host .cm-scroller { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.55; }
    .ih-code-fallback { display: block; width: 100%; padding: 12px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize: vertical; white-space: pre; }
    [data-redline].has-editor .ih-code-editor-host { display: block; }
    [data-redline].has-editor .ih-code-fallback { display: none; }
    .ih-code-viewer { display: grid; margin-top: 8px; }
    .ih-code-viewer-host, .ih-code-viewer-fallback { min-height: 0; }
    .ih-code-viewer-host .cm-editor { min-height: 0; }
    .ih-code-viewer.has-editor .ih-code-viewer-host { display: block; }
    .ih-code-viewer.has-editor .ih-code-viewer-fallback { display: none; }
    .ih-code-viewer-fallback { margin: 0; padding: 12px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; }
    .ih-editor-loading { color: var(--ih-muted); font-size: 13px; padding: 12px 0 0; }

    .ih-export { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .ih-output { min-height: 420px; max-height: 62vh; overflow: auto; white-space: pre-wrap; word-break: break-word; background: var(--ih-code-bg); color: var(--ih-code-ink); border-radius: var(--ih-radius); padding: 16px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    .ih-bottom { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; border-top: 0; background: color-mix(in srgb, var(--ih-bg) 92%, transparent); box-shadow: 0 -1px 0 rgb(255 255 255 / 4%), 0 -12px 28px rgb(8 14 13 / 16%); backdrop-filter: blur(16px); }
    .ih-bottom-inner { max-width: var(--ih-max); margin: 0 auto; padding: 11px clamp(14px, 3vw, 34px); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .ih-toast { position: fixed; right: 20px; bottom: 78px; z-index: 60; background: var(--ih-ink); color: var(--ih-surface); border-radius: 999px; padding: 11px 14px; box-shadow: var(--ih-shadow); font-weight: 760; opacity: 0; transform: translateY(10px); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .ih-toast.is-visible { opacity: 1; transform: none; }

    .ih-comment-popover-backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(8 14 13 / 60%); display: grid; place-items: center; padding: 18px; }
    .ih-comment-popover { width: min(720px, 100%); border: 0; border-radius: var(--ih-radius); background: var(--ih-surface); box-shadow: var(--ih-shadow); padding: 14px; }
    .ih-comment-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
    .ih-comment-head h3 { margin: 0; font-size: 16px; }
    .ih-comment-popover textarea { min-height: 150px; max-height: 55vh; width: 100%; resize: none; line-height: 1.45; }

    @media (max-width: 900px) {
      .ih-topbar-inner, .ih-export { grid-template-columns: 1fr; }
      .ih-actions { justify-content: start; }
      .ih-title, .ih-intro { white-space: normal; }
      .ih-prompt { font-size: clamp(22px, 6vw, 32px); }
      .ih-pros-cons { grid-template-columns: 1fr; }
      .ih-bottom-inner { align-items: stretch; }
    }
  `;

  function renderApp(instance) {
    const viewMode = instance.viewMode();
    const isExport = instance.state.step >= instance.config.questions.length;
    const canToggleMode = instance.config.questions.length > 1;
    const modeToggle = canToggleMode
      ? `<button class="ih-btn ih-mode-toggle" type="button" data-action="toggle-mode">${viewMode === "all" ? "One per page" : "All questions"}</button>`
      : "";
    const stepHtml = viewMode === "all"
      ? renderAllQuestions(instance)
      : isExport ? renderExportStep(instance) : renderQuestionStep(instance, instance.config.questions[instance.state.step], instance.state.step);

    instance.root.innerHTML = `
      <div class="ih-app">
        <header class="ih-topbar">
          <div class="ih-topbar-inner">
            <div class="ih-brand">
              <div class="ih-mark">IH</div>
              <div>
                <h1 class="ih-title">${escapeHTML(instance.config.title)}</h1>
                ${instance.config.intro ? `<p class="ih-intro">${escapeHTML(instance.config.intro)}</p>` : ""}
              </div>
            </div>
            <div class="ih-actions">
              ${modeToggle}
              <button class="ih-btn" type="button" data-action="reset">Reset</button>
            </div>
          </div>
          ${renderTimeline(instance)}
        </header>
        <main class="ih-main ${viewMode === "all" ? "is-all" : ""}">${stepHtml}</main>
        ${viewMode === "paged" ? `<footer class="ih-bottom">
          <div class="ih-bottom-inner">
            <button class="ih-btn" type="button" data-action="back" ${instance.state.step === 0 ? "disabled" : ""}>Back</button>
            <button class="ih-btn ih-btn-primary" type="button" data-action="next">${escapeHTML(nextLabel(instance))}</button>
          </div>
        </footer>` : ""}
        ${renderCommentPopover(instance)}
        <div class="ih-toast" role="status" aria-live="polite"></div>
      </div>
    `;
  }

  function renderAllQuestions(instance) {
    return [
      ...instance.config.questions.map((questionDef, index) => renderQuestionStep(instance, questionDef, index)),
      renderExportStep(instance)
    ].join("");
  }

  function renderTimeline(instance) {
    const ready = isInterviewReady(instance);
    const questionDots = instance.config.questions.map((questionDef, index) => {
      const state = timelineState(instance, questionDef, index);
      const label = `${index + 1}. ${questionDef.prompt}`;
      return `<button class="ih-timeline-dot ${state}" type="button" data-action="jump" data-step="${index}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"></button>`;
    }).join("");
    const exportState = [
      "ih-timeline-dot",
      "is-export",
      instance.state.step >= instance.config.questions.length ? "is-active" : "",
      ready ? "is-ready" : "is-waiting"
    ].filter(Boolean).join(" ");
    const exportLabel = ready ? "Output ready to export" : "Output waiting for required answers";
    return `
      <nav class="ih-timeline" aria-label="Interview questions">
        <div class="ih-timeline-list">
          ${questionDots}
          <button class="${exportState}" type="button" data-action="jump" data-step="${instance.config.questions.length}" title="${escapeAttr(exportLabel)}" aria-label="${escapeAttr(exportLabel)}"></button>
        </div>
      </nav>
    `;
  }

  function renderQuestionStep(instance, questionDef, index) {
    return `
      <section class="ih-step" id="ih-question-${index}" data-question-id="${escapeAttr(questionDef.id)}" data-question-index="${index}">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Question ${index + 1} / ${instance.config.questions.length}</p>
            <h2 class="ih-prompt">${escapeHTML(questionDef.prompt)}</h2>
            ${questionDef.help ? `<p class="ih-help">${escapeHTML(questionDef.help)}</p>` : ""}
          </div>
        </div>
        ${renderQuestionBody(questionDef, instance.state.answers[questionDef.id])}
      </section>
    `;
  }

  function renderQuestionBody(questionDef, answer) {
    if (questionDef.type === "text") return renderText(questionDef, answer);
    if (questionDef.type === "one") return renderChoice(questionDef, answer, false);
    if (questionDef.type === "many") return renderChoice(questionDef, answer, true);
    if (questionDef.type === "rank") return renderRank(questionDef, answer);
    if (questionDef.type === "sort") return renderSort(questionDef, answer);
    if (questionDef.type === "review") return renderReview(questionDef, answer);
    if (questionDef.type === "redline") return renderRedline(questionDef, answer);
    return renderText(questionDef, answer);
  }

  function renderText(questionDef, answer) {
    const tag = questionDef.multiline ? "textarea" : "input";
    const className = questionDef.multiline ? "ih-field ih-field-large" : "ih-field";
    if (tag === "input") {
      return `<input class="${className}" data-input="text" value="${escapeAttr(answer.answer || "")}" placeholder="${escapeAttr(questionDef.placeholder || "")}">`;
    }
    return `<textarea class="${className}" data-input="text" placeholder="${escapeAttr(questionDef.placeholder || "")}">${escapeHTML(answer.answer || "")}</textarea>`;
  }

  function renderChoice(questionDef, answer, multiple) {
    const selected = multiple ? asArray(answer.selected) : [answer.selected];
    const gridClass = questionDef.items.some((entry) => entry.body) ? "ih-grid" : "ih-stack";
    const items = answerItems(questionDef, answer).map((entry) => renderChoiceItem(entry, answer, selected.includes(entry.id), multiple)).join("");
    const addRow = multiple && questionDef.allowAdd ? renderAddRow("Add another item") : "";
    return `<div class="${gridClass}">${items}</div>${addRow}`;
  }

  function renderChoiceItem(entry, answer, isSelected, multiple) {
    const action = entry.custom ? "" : ` data-action="${multiple ? "toggle-many" : "select-one"}" tabindex="0"`;
    return `
      <article class="ih-card ih-choice ${isSelected ? "is-selected" : ""}" data-item-id="${escapeAttr(entry.id)}"${action}>
        <div class="ih-item-top">
          ${entry.custom ? `<textarea class="ih-field ih-custom-title ih-auto-field" data-input="added-title" data-item-id="${escapeAttr(entry.id)}" rows="2" aria-label="Custom item text">${escapeHTML(entry.title)}</textarea>` : `<h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>`}
          <div class="ih-item-actions">
            ${entry.custom ? "" : renderCommentButton("item-comment", entry.id, answer.comments && answer.comments[entry.id] || "", "Comment on item")}
            ${entry.custom ? `<button class="ih-remove-icon" type="button" data-action="remove-added" data-item-id="${escapeAttr(entry.id)}" aria-label="Remove custom item">${trashIcon()}</button>` : ""}
            ${entry.custom ? "" : `<span class="ih-select-dot">${isSelected ? "✓" : "+"}</span>`}
          </div>
        </div>
        ${renderMeta(entry.meta)}
        ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
      </article>
    `;
  }

  function renderAddRow(label) {
    return `
      <div class="ih-card ih-add-row">
        <textarea class="ih-field ih-add-custom ih-auto-field" data-input="add-text" rows="2" placeholder="${escapeAttr(label)}"></textarea>
        <button class="ih-btn ih-btn-accent" type="button" data-action="add-item">Add item</button>
      </div>
    `;
  }

  function renderRank(questionDef, answer) {
    const order = asArray(answer.order).filter((id) => questionDef.items.some((entry) => entry.id === id));
    questionDef.items.forEach((entry) => { if (!order.includes(entry.id)) order.push(entry.id); });
    return `
      <div class="ih-rank-list ih-compact-list" data-sortable-rank>
        ${order.map((id) => {
          const entry = questionDef.items.find((candidate) => candidate.id === id);
          return `
            <article class="ih-rank-item" data-item-id="${escapeAttr(entry.id)}">
              <button class="ih-grip" type="button" aria-label="Drag to reorder"></button>
              <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
              ${renderCommentButton("item-comment", entry.id, answer.comments && answer.comments[entry.id] || "", "Comment on rank item")}
              ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSort(questionDef, answer) {
    const byBucket = {};
    questionDef.buckets.forEach((bucket) => { byBucket[bucket.id] = []; });
    const unset = [];
    questionDef.items.forEach((entry) => {
      const bucketId = answer.buckets && answer.buckets[entry.id] || "";
      if (byBucket[bucketId]) byBucket[bucketId].push(entry);
      else unset.push(entry);
    });

    return `
      <div class="ih-sort-frame" tabindex="0" aria-label="Sort columns">
        <div class="ih-sort-board">
          <section class="ih-bucket" data-bucket-id="">
            <div class="ih-bucket-title">Unsorted</div>
            <div class="ih-bucket-list" data-sortable-sort data-bucket-id="">
              ${unset.length ? unset.map((entry) => renderSortCard(questionDef, answer, entry)).join("") : `<div class="ih-bucket-empty">Everything is classified</div>`}
            </div>
          </section>
          ${questionDef.buckets.map((bucket) => `
            <section class="ih-bucket" data-bucket-id="${escapeAttr(bucket.id)}">
              <div class="ih-bucket-title">${escapeHTML(bucket.title)}</div>
              <div class="ih-bucket-list" data-sortable-sort data-bucket-id="${escapeAttr(bucket.id)}">
                ${byBucket[bucket.id].length ? byBucket[bucket.id].map((entry) => renderSortCard(questionDef, answer, entry)).join("") : `<div class="ih-bucket-empty">Drop items here</div>`}
              </div>
            </section>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderSortCard(questionDef, answer, entry) {
    const currentBucketId = answer.buckets && answer.buckets[entry.id] || "";
    return `
      <article class="ih-sort-card" data-item-id="${escapeAttr(entry.id)}">
        <button class="ih-grip" type="button" aria-label="Drag to bucket"></button>
        <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
        <div class="ih-sort-actions">
          ${renderMoveMenu(questionDef, entry, currentBucketId)}
          ${renderCommentButton("item-comment", entry.id, answer.comments && answer.comments[entry.id] || "", "Comment on sort item")}
        </div>
        ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
      </article>
    `;
  }

  function renderMoveMenu(questionDef, entry, currentBucketId) {
    const buckets = [{ id: "", title: "Unsorted" }].concat(questionDef.buckets || []);
    return `
      <details class="ih-move-menu">
        <summary class="ih-move-button" data-action="toggle-move-menu" aria-label="Move sort item" title="Move to column">${moveIcon()}</summary>
        <div class="ih-move-dropdown" role="menu" aria-label="Move to column">
          ${buckets.map((bucket) => {
            const isCurrent = bucket.id === currentBucketId;
            return `<button class="ih-move-option ${isCurrent ? "is-current" : ""}" type="button" role="menuitem" data-action="move-sort-item" data-item-id="${escapeAttr(entry.id)}" data-bucket-id="${escapeAttr(bucket.id)}" ${isCurrent ? `aria-current="true"` : ""}>${escapeHTML(bucket.title)}</button>`;
          }).join("")}
        </div>
      </details>
    `;
  }

  function renderReview(questionDef, answer) {
    return `
      <div class="ih-stack">
        ${answerItems(questionDef, answer).map((entry) => `
          <article class="ih-card ih-review-card">
            <div class="ih-review-row" data-item-id="${escapeAttr(entry.id)}">
              <div class="ih-review-top">
                ${entry.custom ? renderAddedPill() : renderReviewOptions(questionDef, answer, entry)}
                <div class="ih-item-actions">
                  ${entry.custom ? "" : renderCommentButton("item-comment", entry.id, answer.comments && answer.comments[entry.id] || "", "Comment on reviewed item")}
                  ${entry.custom ? `<button class="ih-remove-icon" type="button" data-action="remove-added" data-item-id="${escapeAttr(entry.id)}" aria-label="Remove custom item">${trashIcon()}</button>` : ""}
                </div>
              </div>
              <textarea class="ih-field ih-auto-field" data-input="review-edit" data-item-id="${escapeAttr(entry.id)}" rows="1">${escapeHTML(answer.edits && answer.edits[entry.id] || entry.title)}</textarea>
              ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
      ${questionDef.allowAdd ? renderAddRow("Add another statement or term") : ""}
    `;
  }

  function renderRedline(questionDef, answer) {
    return `
      <div class="ih-redline">
        <div class="ih-card" data-redline>
          <div class="ih-item-top">
            <label class="ih-label">Editable artifact</label>
            ${renderCommentButton("redline-summary", "", answer.summary || "", "Comment on edited artifact")}
          </div>
          <div class="ih-code-editor-host" data-code-editor data-lang="${escapeAttr(questionDef.artifact && questionDef.artifact.lang || questionDef.language || "")}"></div>
          <textarea class="ih-code-fallback ih-auto-field" data-input="redline-content" spellcheck="false" wrap="off">${escapeHTML(answer.content || "")}</textarea>
          <div class="ih-editor-loading" data-editor-loading>Loading syntax editor...</div>
        </div>
      </div>
    `;
  }

  function renderExportStep(instance) {
    const text = buildTextExport(instance.config, instance.state);
    const json = JSON.stringify(buildResult(instance.config, instance.state), null, 2);
    return `
      <section class="ih-step" id="ih-output">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Output</p>
            <h2 class="ih-prompt">Export the answer summary.</h2>
            <p class="ih-help">The text version is the default handoff. JSON is available when the next step benefits from structure.</p>
          </div>
        </div>
        <div class="ih-export">
          <div class="ih-card">
            <div class="ih-item-top" style="margin-bottom:12px">
              <h3 class="ih-item-title">Text</h3>
              <button class="ih-btn ih-btn-primary" type="button" data-action="copy-text">${escapeHTML(instance.config.copyTextLabel)}</button>
            </div>
            <pre class="ih-output" data-export-text>${escapeHTML(text)}</pre>
          </div>
          <div class="ih-card">
            <div class="ih-item-top" style="margin-bottom:12px">
              <h3 class="ih-item-title">JSON</h3>
              <button class="ih-btn" type="button" data-action="copy-json">${escapeHTML(instance.config.copyJsonLabel)}</button>
            </div>
            <pre class="ih-output" data-export-json>${escapeHTML(json)}</pre>
          </div>
        </div>
      </section>
    `;
  }

  function renderRich(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `<p>${escapeHTML(value)}</p>`;
    if (Array.isArray(value)) return value.map(renderRich).join("");
    if (value.view === "frame") {
      const height = value.height ? ` style="height:${escapeAttr(value.height)}"` : "";
      const title = value.title || value.src || "Preview";
      if (value.srcdoc) return `<iframe class="ih-frame" title="${escapeAttr(title)}" srcdoc="${escapeAttr(value.srcdoc)}"${height}></iframe>`;
      return `<iframe class="ih-frame" title="${escapeAttr(title)}" src="${escapeAttr(value.src || "")}"${height}></iframe>`;
    }
    if (value.view === "html") return `<div class="ih-html-preview">${value.markup || ""}</div>`;
    if (value.view === "prosCons") {
      return `
        <div class="ih-pros-cons">
          <div class="ih-pros"><strong>Pros</strong>${renderList(value.pros)}</div>
          <div class="ih-cons"><strong>Cons</strong>${renderList(value.cons)}</div>
        </div>
      `;
    }
    if (value.view === "code") {
      return renderCodeViewer(value);
    }
    return `<p>${escapeHTML(valueToText(value))}</p>`;
  }

  function renderCodeViewer(value) {
    const codeText = valueToText(value.value);
    const lang = value.lang || value.language || "";
    return `
      <div class="ih-code-viewer" data-code-viewer-shell>
        <pre class="ih-code-viewer-fallback"><code>${escapeHTML(codeText)}</code></pre>
        <div class="ih-code-viewer-host" data-code-viewer data-lang="${escapeAttr(lang)}" aria-label="Code preview"></div>
      </div>
    `;
  }

  function renderList(items) {
    const values = asArray(items);
    if (!values.length) return "";
    return `<ul>${values.map((entry) => `<li>${escapeHTML(valueToText(entry))}</li>`).join("")}</ul>`;
  }

  function renderMeta(meta) {
    const values = Array.isArray(meta) ? meta : [];
    if (!values.length) return "";
    return `<div class="ih-meta">${values.map((entry) => `<span class="ih-pill">${escapeHTML(valueToText(entry))}</span>`).join("")}</div>`;
  }

  function renderReviewOptions(questionDef, answer, entry) {
    const selected = answer.states && answer.states[entry.id] || "";
    return `
      <div class="ih-review-options" role="radiogroup" aria-label="Review state for ${escapeAttr(entry.title)}">
        ${questionDef.verbs.map((verb) => {
          const isSelected = selected === verb.id;
          return `<button class="ih-review-option ${isSelected ? "is-selected" : ""}" role="radio" aria-checked="${isSelected ? "true" : "false"}" type="button" data-action="review-state" data-item-id="${escapeAttr(entry.id)}" data-review-state="${escapeAttr(verb.id)}">${escapeHTML(verb.title)}</button>`;
        }).join("")}
      </div>
    `;
  }

  function renderAddedPill() {
    return `<span class="ih-added-pill">added</span>`;
  }

  function renderCommentButton(kind, itemId, value, label) {
    const filled = Boolean(String(value || "").trim());
    const itemAttr = itemId ? ` data-item-id="${escapeAttr(itemId)}"` : "";
    return `<button class="ih-comment-button ${filled ? "has-comment" : ""}" type="button" data-action="open-comment" data-comment-kind="${escapeAttr(kind)}"${itemAttr} aria-label="${escapeAttr(label || "Comment")}" title="${escapeAttr(label || "Comment")}">${commentIcon()}</button>`;
  }

  function renderCommentPopover(instance) {
    const editor = instance.state.commentEditor;
    if (!editor) return "";
    const context = instance.contextByQuestionId(editor.questionId);
    if (!context) return "";
    const value = getCommentValue(context.answer, editor.kind, editor.itemId);
    return `
      <div class="ih-comment-popover-backdrop" data-action="close-comment">
        <section class="ih-comment-popover" role="dialog" aria-modal="true" aria-label="Comment editor" data-action="keep-comment-open">
          <div class="ih-comment-head">
            <h3>Comment</h3>
            <button class="ih-btn" type="button" data-action="close-comment">Done</button>
          </div>
          <textarea class="ih-field ih-auto-field" data-input="comment-modal" placeholder="Write a note for the next agent...">${escapeHTML(value)}</textarea>
        </section>
      </div>
    `;
  }

  function commentIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`;
  }

  function moveIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/></svg>`;
  }

  function trashIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;
  }

  function getCommentValue(answer, kind, itemId) {
    if (!answer) return "";
    if (kind === "redline-summary") return answer.summary || "";
    return answer.comments && answer.comments[itemId] || "";
  }

  function setCommentValue(answer, kind, itemId, value) {
    const textValue = String(value || "");
    if (kind === "redline-summary") {
      answer.summary = textValue;
      return;
    }
    if (!answer.comments) answer.comments = {};
    if (textValue.trim()) answer.comments[itemId] = textValue;
    else delete answer.comments[itemId];
  }

  // App runtime --------------------------------------------------------------

  class InterviewHarnessApp {
    constructor(config) {
      this.config = config;
      this.root = resolveTarget(config.target);
      this.state = createInitialState(config.questions);
      this.state.viewMode = config.pageMode === "auto" ? (config.questions.length <= 3 ? "all" : "paged") : config.pageMode;
      this.saveTimer = null;
      this.chromeFrame = null;
      this.sortables = [];
      this.codeEditors = [];
      this.exportTimer = null;
      this.toastTimer = null;
      this.load();
      this.mount();
    }

    mount() {
      injectStyles();
      this.render();
      this.root.addEventListener("click", (event) => this.onClick(event));
      this.root.addEventListener("input", (event) => this.onInput(event));
      this.root.addEventListener("change", (event) => this.onInput(event));
      this.root.addEventListener("keydown", (event) => this.onKeydown(event));
      this.root.addEventListener("scroll", (event) => {
        if (event.target.closest && event.target.closest(".ih-move-dropdown")) return;
        this.closeMoveMenus();
      }, true);
      global.addEventListener("resize", () => this.closeMoveMenus());
    }

    render() {
      this.destroyEnhancements();
      renderApp(this);
      this.afterRender();
    }

    afterRender() {
      requestAnimationFrame(() => {
        this.root.querySelectorAll("textarea").forEach(autoGrowTextarea);
        this.syncRankDom();
        this.initSortables();
        this.initCodeEditors();
        const comment = this.root.querySelector("[data-input='comment-modal']");
        if (comment) {
          comment.focus();
          autoGrowTextarea(comment);
        }
      });
    }

    viewMode() {
      return this.state.viewMode === "all" ? "all" : "paged";
    }

    currentQuestion() {
      return this.config.questions[this.state.step];
    }

    currentAnswer() {
      const questionDef = this.currentQuestion();
      return questionDef && this.state.answers[questionDef.id];
    }

    contextFromNode(node) {
      const section = node && node.closest && node.closest(".ih-step[data-question-id]");
      if (!section) return { questionDef: this.currentQuestion(), answer: this.currentAnswer(), index: this.state.step };
      return this.contextByQuestionId(section.dataset.questionId);
    }

    contextByQuestionId(questionId) {
      const index = this.config.questions.findIndex((entry) => entry.id === questionId);
      if (index < 0) return null;
      const questionDef = this.config.questions[index];
      return { questionDef, answer: this.state.answers[questionDef.id], index };
    }

    activateContext(context) {
      if (!context) return;
      this.state.step = context.index;
    }

    onClick(event) {
      if (!event.target.closest(".ih-move-menu")) this.closeMoveMenus();
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl || !this.root.contains(actionEl)) return;
      const action = actionEl.dataset.action;
      if (["select-one", "toggle-many"].includes(action) && isFormControl(event.target)) return;

      if (action === "back") return this.go(-1);
      if (action === "next") return this.go(1);
      if (action === "reset") return this.reset();
      if (action === "toggle-mode") return this.toggleMode();
      if (action === "copy-text") return this.copyText();
      if (action === "copy-json") return this.copyJson();
      if (action === "jump") return this.jump(numberOr(actionEl.dataset.step, this.state.step));
      if (action === "open-comment") return this.openComment(actionEl);
      if (action === "close-comment") return this.closeComment();
      if (action === "keep-comment-open") return;
      if (action === "toggle-move-menu") {
        event.preventDefault();
        return this.toggleMoveMenu(actionEl);
      }

      const context = this.contextFromNode(actionEl);
      this.activateContext(context);
      if (action === "select-one") return this.selectOne(actionEl.dataset.itemId, context);
      if (action === "toggle-many") return this.toggleMany(actionEl.dataset.itemId, context);
      if (action === "review-state") return this.setReviewState(actionEl.dataset.itemId, actionEl.dataset.reviewState, context);
      if (action === "move-sort-item") return this.moveSortItem(actionEl, context);
      if (action === "add-item") return this.addItem(context);
      if (action === "remove-added") return this.removeAdded(actionEl.dataset.itemId || numberOr(actionEl.dataset.addedIndex, -1), context);
    }

    onInput(event) {
      const input = event.target.closest("[data-input]");
      if (!input || !this.root.contains(input)) return;
      const kind = input.dataset.input;
      if (kind === "add-text") {
        autoGrowTextarea(input);
        return;
      }
      const context = kind === "comment-modal" && this.state.commentEditor
        ? this.contextByQuestionId(this.state.commentEditor.questionId)
        : this.contextFromNode(input);
      this.activateContext(context);
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || !answer) return;

      if (kind === "text") answer.answer = input.value;
      if (kind === "comment-modal" && this.state.commentEditor) {
        setCommentValue(answer, this.state.commentEditor.kind, this.state.commentEditor.itemId, input.value);
        this.syncOpenCommentButton();
      }
      if (kind === "sort-bucket") this.setSortBucket(input.dataset.itemId, input.value, context);
      if (kind === "review-edit") answer.edits[input.dataset.itemId] = input.value;
      if (kind === "added-title") this.updateAddedTitle(input.dataset.itemId, input.value, context);
      if (kind === "redline-content") answer.content = input.value;

      answer.touched = true;
      autoGrowTextarea(input);
      const immediate = kind === "sort-bucket";
      if (immediate) this.save();
      else this.scheduleSave();
      if (kind === "sort-bucket") this.syncSortDom(context);
      if (immediate) this.refreshExport();
      else this.scheduleExport();
      this.scheduleChrome();
    }

    onKeydown(event) {
      if (event.key === "Escape") {
        if (this.state.commentEditor) this.closeComment();
        else if (this.closeMoveMenus()) event.preventDefault();
      }
      const choice = event.target.closest(".ih-choice[data-action]");
      if (choice && isFormControl(event.target)) return;
      if (!choice || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      choice.click();
    }

    sectionForContext(context) {
      if (!context) return null;
      return this.root.querySelector(`.ih-step[data-question-id="${cssEscape(context.questionDef.id)}"]`);
    }

    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.save();
      }, 180);
    }

    scheduleChrome() {
      if (this.chromeFrame) return;
      this.chromeFrame = requestAnimationFrame(() => {
        this.chromeFrame = null;
        this.refreshChrome();
        this.syncOpenCommentButton();
      });
    }

    scheduleExport() {
      clearTimeout(this.exportTimer);
      this.exportTimer = setTimeout(() => {
        this.exportTimer = null;
        this.refreshExport();
      }, 180);
    }

    refreshExport() {
      const textOutput = this.root.querySelector("[data-export-text]");
      const jsonOutput = this.root.querySelector("[data-export-json]");
      if (textOutput) textOutput.textContent = this.getText();
      if (jsonOutput) jsonOutput.textContent = this.getJSON();
    }

    toggleMode() {
      if (this.config.questions.length <= 1) return;
      this.state.viewMode = this.viewMode() === "all" ? "paged" : "all";
      this.state.commentEditor = null;
      this.save();
      this.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    }

    openComment(button) {
      const context = this.contextFromNode(button);
      if (!context) return;
      this.activateContext(context);
      this.state.commentEditor = {
        questionId: context.questionDef.id,
        kind: button.dataset.commentKind || "item-comment",
        itemId: button.dataset.itemId || ""
      };
      this.save();
      this.render();
    }

    closeComment() {
      this.state.commentEditor = null;
      this.save();
      this.render();
    }

    syncOpenCommentButton() {
      const editor = this.state.commentEditor;
      if (!editor) return;
      const context = this.contextByQuestionId(editor.questionId);
      const section = this.sectionForContext(context);
      if (!context || !section) return;
      section.querySelectorAll("[data-action='open-comment']").forEach((button) => {
        const value = getCommentValue(context.answer, button.dataset.commentKind, button.dataset.itemId || "");
        button.classList.toggle("has-comment", Boolean(String(value || "").trim()));
      });
    }

    destroyEnhancements() {
      this.sortables.forEach((sortable) => {
        try { sortable.destroy(); } catch (_) {}
      });
      this.sortables = [];
      this.codeEditors.forEach((view) => {
        try { view.destroy(); } catch (_) {}
      });
      this.codeEditors = [];
    }

    initSortables() {
      const lists = Array.from(this.root.querySelectorAll("[data-sortable-rank], [data-sortable-sort]"));
      if (!lists.length) return;
      ensureSortable().then((Sortable) => {
        lists.forEach((list) => {
          if (!list.isConnected) return;
          const context = this.contextFromNode(list);
          if (!context) return;
          const common = {
            animation: 150,
            ghostClass: "is-dragging",
            handle: ".ih-grip",
            filter: "textarea, input, select, .ih-comment-button, .ih-move-menu, .ih-remove-icon",
            preventOnFilter: false
          };
          if (list.matches("[data-sortable-rank]") && context.questionDef.type === "rank") {
            const sortable = new Sortable(list, Object.assign({}, common, {
              draggable: ".ih-rank-item",
              onEnd: () => this.updateRankFromDom(list, context)
            }));
            list.dataset.sortableReady = "true";
            this.sortables.push(sortable);
          }
          if (list.matches("[data-sortable-sort]") && context.questionDef.type === "sort") {
            const sortable = new Sortable(list, Object.assign({}, common, {
              group: `ih-sort-${context.questionDef.id}`,
              draggable: ".ih-sort-card",
              onStart: () => list.querySelectorAll(".ih-bucket-empty").forEach((empty) => empty.remove()),
              onEnd: () => this.updateSortFromDom(context)
            }));
            list.dataset.sortableReady = "true";
            this.sortables.push(sortable);
          }
        });
      }).catch(() => {});
    }

    initCodeEditors() {
      const hosts = Array.from(this.root.querySelectorAll("[data-code-editor]"));
      hosts.forEach((host) => {
        const context = this.contextFromNode(host);
        if (!context || context.questionDef.type !== "redline") return;
        const card = host.closest("[data-redline]");
        const fallback = card && card.querySelector("[data-input='redline-content']");
        const loading = card && card.querySelector("[data-editor-loading]");
        loadCodeMirror(host.dataset.lang || "").then(({ EditorView, basicSetup, theme, language }) => {
          if (!host.isConnected) return;
          const doc = fallback ? fallback.value : context.answer.content || "";
          context.answer.content = doc;
          const extensions = [
            basicSetup,
            theme,
            language,
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
              if (!update.docChanged) return;
              context.answer.content = update.state.doc.toString();
              context.answer.touched = true;
              this.scheduleSave();
              this.scheduleExport();
              this.scheduleChrome();
            })
          ].filter(Boolean);
          host.textContent = "";
          host.classList.add("is-ready");
          if (card) card.classList.add("has-editor");
          if (loading) loading.remove();
          const view = new EditorView({
            doc,
            extensions,
            parent: host
          });
          this.codeEditors.push(view);
          if (fallback) fallback.value = doc;
        }).catch(() => {
          if (card) card.classList.add("is-fallback");
          if (host) host.hidden = true;
          if (loading) loading.textContent = "Syntax editor unavailable; using the plain editor.";
          if (fallback) autoGrowTextarea(fallback);
        });
      });

      const viewerHosts = Array.from(this.root.querySelectorAll("[data-code-viewer]"));
      viewerHosts.forEach((host) => {
        const shell = host.closest("[data-code-viewer-shell]");
        const fallback = shell && shell.querySelector(".ih-code-viewer-fallback");
        const doc = fallback ? fallback.textContent || "" : "";
        loadCodeMirror(host.dataset.lang || "").then(({ EditorView, basicSetup, theme, language }) => {
          if (!host.isConnected || !shell) return;
          const extensions = [
            basicSetup,
            theme,
            language,
            EditorView.lineWrapping,
            EditorView.editable.of(false)
          ].filter(Boolean);
          host.textContent = "";
          const view = new EditorView({ doc, extensions, parent: host });
          shell.classList.add("has-editor");
          this.codeEditors.push(view);
        }).catch(() => {});
      });
    }

    updateRankFromDom(list, context) {
      if (!context || context.questionDef.type !== "rank") return;
      context.answer.order = Array.from(list.querySelectorAll(".ih-rank-item[data-item-id]")).map((card) => card.dataset.itemId);
      context.answer.touched = true;
      this.activateContext(context);
      this.save();
      this.syncRankDom(context);
      this.refreshChrome();
      this.refreshExport();
    }

    updateSortFromDom(context) {
      const section = this.sectionForContext(context);
      if (!context || context.questionDef.type !== "sort" || !section) return;
      context.questionDef.items.forEach((entry) => { context.answer.buckets[entry.id] = ""; });
      section.querySelectorAll(".ih-bucket-list[data-bucket-id]").forEach((list) => {
        const bucketId = list.dataset.bucketId || "";
        list.querySelectorAll(".ih-sort-card[data-item-id]").forEach((card) => {
          context.answer.buckets[card.dataset.itemId] = bucketId;
        });
      });
      context.answer.touched = true;
      this.activateContext(context);
      this.save();
      this.syncSortDom(context);
      this.refreshChrome();
      this.refreshExport();
    }

    selectOne(itemId, context) {
      const answer = context && context.answer;
      if (!answer) return;
      answer.selected = itemId;
      answer.touched = true;
      this.save();
      this.refreshChoiceState(context);
      this.refreshChrome();
      this.refreshExport();
    }

    toggleMany(itemId, context) {
      const answer = context && context.answer;
      if (!answer) return;
      const selected = new Set(asArray(answer.selected));
      if (selected.has(itemId)) selected.delete(itemId);
      else selected.add(itemId);
      answer.selected = Array.from(selected);
      answer.touched = true;
      this.save();
      this.refreshChoiceState(context);
      this.refreshChrome();
      this.refreshExport();
    }

    setReviewState(itemId, state, context) {
      const answer = context && context.answer;
      if (!answer) return;
      answer.states[itemId] = state;
      answer.touched = true;
      this.save();
      const row = this.sectionForContext(context) && this.sectionForContext(context).querySelector(`.ih-review-row[data-item-id="${cssEscape(itemId)}"]`);
      if (row) {
        row.querySelectorAll(".ih-review-option").forEach((button) => {
          const selected = button.dataset.reviewState === state;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-checked", selected ? "true" : "false");
        });
      }
      this.refreshChrome();
      this.refreshExport();
    }

    addItem(context) {
      const section = this.sectionForContext(context);
      const input = section && section.querySelector("[data-input='add-text']");
      const title = input && input.value.trim();
      if (!title) return this.toast("Write the item first.");
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || !answer) return;
      const id = uniqueAddedId(questionDef, answer, title);
      answer.added.push({ id, title });
      if (questionDef.type === "many") answer.selected = Array.from(new Set(asArray(answer.selected).concat(id)));
      if (questionDef.type === "review") answer.edits[id] = title;
      answer.touched = true;
      this.save();
      this.render();
    }

    removeAdded(idOrIndex, context) {
      const answer = context && context.answer;
      const questionDef = context && context.questionDef;
      if (!answer || !questionDef) return;
      const index = typeof idOrIndex === "string"
        ? asArray(answer.added).findIndex((entry) => entry.id === idOrIndex)
        : numberOr(idOrIndex, -1);
      if (index < 0) return;
      const removed = answer.added[index];
      answer.added.splice(index, 1);
      if (removed) {
        if (questionDef.type === "many") answer.selected = asArray(answer.selected).filter((id) => id !== removed.id);
        if (answer.comments) delete answer.comments[removed.id];
        if (answer.edits) delete answer.edits[removed.id];
        if (answer.states) delete answer.states[removed.id];
      }
      answer.touched = true;
      this.save();
      this.render();
    }

    updateAddedTitle(itemId, title, context) {
      const answer = context && context.answer;
      const entry = answer && asArray(answer.added).find((candidate) => candidate.id === itemId);
      if (!entry) return;
      entry.title = title;
      if (answer.edits && answer.edits[itemId] !== undefined) answer.edits[itemId] = title;
    }

    setSortBucket(itemId, bucketId, context) {
      const answer = context && context.answer;
      if (!answer || !answer.buckets) return;
      answer.buckets[itemId] = bucketId || "";
      answer.touched = true;
      this.save();
      this.syncSortDom(context);
      this.refreshChrome();
      this.refreshExport();
    }

    moveSortItem(button, context) {
      const menu = button.closest(".ih-move-menu");
      if (menu) menu.open = false;
      this.setSortBucket(button.dataset.itemId, button.dataset.bucketId || "", context);
    }

    toggleMoveMenu(button) {
      const menu = button.closest(".ih-move-menu");
      if (!menu) return;
      const shouldOpen = !menu.open;
      this.closeMoveMenus();
      if (!shouldOpen) return;
      const context = this.contextFromNode(button);
      this.activateContext(context);
      menu.open = true;
      this.positionMoveMenu(menu);
    }

    positionMoveMenu(menu) {
      const button = menu.querySelector(".ih-move-button");
      const dropdown = menu.querySelector(".ih-move-dropdown");
      if (!button || !dropdown) return;
      dropdown.style.visibility = "hidden";
      const gap = 6;
      const margin = 8;
      const buttonRect = button.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const viewportWidth = global.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = global.innerHeight || document.documentElement.clientHeight;
      const left = clamp(buttonRect.right - dropdownRect.width, margin, viewportWidth - dropdownRect.width - margin);
      const top = clamp(buttonRect.bottom + gap, margin, viewportHeight - margin);
      const maxHeight = Math.max(72, viewportHeight - top - margin);
      menu.style.setProperty("--ih-move-left", `${Math.round(left)}px`);
      menu.style.setProperty("--ih-move-top", `${Math.round(top)}px`);
      menu.style.setProperty("--ih-move-max-height", `${Math.round(maxHeight)}px`);
      dropdown.style.visibility = "";
    }

    closeMoveMenus(except) {
      let closed = false;
      this.root.querySelectorAll(".ih-move-menu[open]").forEach((menu) => {
        if (menu === except) return;
        menu.open = false;
        closed = true;
      });
      return closed;
    }

    go(direction) {
      this.jump(this.state.step + direction);
    }

    jump(step) {
      const max = this.config.questions.length;
      this.state.step = clamp(step, 0, max);
      this.save();
      if (this.viewMode() === "all") {
        this.refreshChrome();
        const id = this.state.step >= this.config.questions.length ? "ih-output" : `ih-question-${this.state.step}`;
        const section = this.root.querySelector(`#${cssEscape(id)}`);
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      this.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    }

    refreshChoiceState(context) {
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || !["one", "many"].includes(questionDef.type)) return;
      const section = this.sectionForContext(context);
      if (!section) return;
      const selected = questionDef.type === "many" ? asArray(answer.selected) : [answer.selected];
      section.querySelectorAll(".ih-choice[data-item-id]").forEach((card) => {
        const isSelected = selected.includes(card.dataset.itemId);
        card.classList.toggle("is-selected", isSelected);
        const dot = card.querySelector(".ih-select-dot");
        if (dot) dot.textContent = isSelected ? "✓" : "+";
      });
    }

    syncRankDom(context) {
      if (!context) {
        this.config.questions.forEach((questionDef) => {
          if (questionDef.type === "rank") this.syncRankDom(this.contextByQuestionId(questionDef.id));
        });
        return;
      }
      const questionDef = context.questionDef;
      const answer = context.answer;
      if (!questionDef || questionDef.type !== "rank") return;
      const section = this.sectionForContext(context);
      const list = section && section.querySelector(".ih-rank-list");
      if (!list) return;
      const order = asArray(answer.order);
      order.forEach((id) => {
        const card = list.querySelector(`.ih-rank-item[data-item-id="${cssEscape(id)}"]`);
        if (card) list.appendChild(card);
      });
    }

    syncSortDom(context) {
      if (!context) {
        this.config.questions.forEach((questionDef) => {
          if (questionDef.type === "sort") this.syncSortDom(this.contextByQuestionId(questionDef.id));
        });
        return;
      }
      const questionDef = context.questionDef;
      const answer = context.answer;
      if (!questionDef || questionDef.type !== "sort") return;
      const section = this.sectionForContext(context);
      if (!section) return;
      section.querySelectorAll(".ih-sort-card[data-item-id]").forEach((card) => {
        const bucketId = answer.buckets && answer.buckets[card.dataset.itemId] || "";
        const bucket = section.querySelector(`.ih-bucket[data-bucket-id="${cssEscape(bucketId)}"] .ih-bucket-list`);
        if (bucket && card.parentElement !== bucket) bucket.appendChild(card);
        const select = card.querySelector("[data-input='sort-bucket']");
        if (select) select.value = bucketId;
        card.querySelectorAll("[data-action='move-sort-item']").forEach((button) => {
          const selected = (button.dataset.bucketId || "") === bucketId;
          button.classList.toggle("is-current", selected);
          if (selected) button.setAttribute("aria-current", "true");
          else button.removeAttribute("aria-current");
        });
      });
      section.querySelectorAll(".ih-bucket").forEach((bucket) => {
        const list = bucket.querySelector(".ih-bucket-list");
        if (!list) return;
        list.querySelectorAll(".ih-bucket-empty").forEach((empty) => empty.remove());
        if (!list.querySelector(".ih-sort-card")) {
          const empty = document.createElement("div");
          empty.className = "ih-bucket-empty";
          empty.textContent = bucket.dataset.bucketId ? "Drop items here" : "Everything is classified";
          list.appendChild(empty);
        }
      });
    }

    refreshChrome() {
      this.root.querySelectorAll(".ih-timeline-dot[data-step]").forEach((dot) => {
        const step = numberOr(dot.dataset.step, 0);
        dot.className = step >= this.config.questions.length
          ? [
              "ih-timeline-dot",
              "is-export",
              this.state.step >= this.config.questions.length ? "is-active" : "",
              isInterviewReady(this) ? "is-ready" : "is-waiting"
            ].filter(Boolean).join(" ")
          : `ih-timeline-dot ${timelineState(this, this.config.questions[step], step)}`;
      });
      const textOutput = this.root.querySelector("[data-export-text]");
      const jsonOutput = this.root.querySelector("[data-export-json]");
      if (textOutput) textOutput.textContent = this.getText();
      if (jsonOutput) jsonOutput.textContent = this.getJSON();
    }

    reset() {
      if (!global.confirm("Reset this interview and clear saved answers?")) return;
      const viewMode = this.state.viewMode;
      this.state = createInitialState(this.config.questions);
      this.state.viewMode = viewMode;
      if (this.config.storageKey) {
        try {
          localStorage.removeItem(this.config.storageKey);
        } catch (_) {}
      }
      this.render();
    }

    load() {
      if (!this.config.storageKey) return;
      try {
        const saved = JSON.parse(localStorage.getItem(this.config.storageKey) || "null");
        this.state = mergeState(saved, this.state, this.config.questions);
      } catch (_) {}
    }

    save() {
      if (!this.config.storageKey) return;
      try {
        localStorage.setItem(this.config.storageKey, JSON.stringify(this.state));
      } catch (_) {}
    }

    getResult() {
      return buildResult(this.config, this.state);
    }

    getText() {
      return buildTextExport(this.config, this.state);
    }

    getJSON() {
      return JSON.stringify(this.getResult(), null, 2);
    }

    async copyText() {
      await copyToClipboard(this.getText());
      this.toast("Copied text output.");
    }

    async copyJson() {
      await copyToClipboard(this.getJSON());
      this.toast("Copied JSON output.");
    }

    toast(message) {
      const node = this.root.querySelector(".ih-toast");
      if (!node) return;
      clearTimeout(this.toastTimer);
      node.textContent = message;
      node.classList.add("is-visible");
      this.toastTimer = setTimeout(() => node.classList.remove("is-visible"), 1700);
    }
  }

  // Utilities ----------------------------------------------------------------

  function ensureSortable() {
    if (global.Sortable) return Promise.resolve(global.Sortable);
    if (sortablePromise) return sortablePromise;
    sortablePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SORTABLE_URL;
      script.async = true;
      script.onload = () => {
        if (global.Sortable) resolve(global.Sortable);
        else reject(new Error("SortableJS did not attach to window."));
      };
      script.onerror = () => reject(new Error("SortableJS failed to load."));
      document.head.appendChild(script);
    });
    return sortablePromise;
  }

  async function loadCodeMirror(lang) {
    if (!codeMirrorPromise) codeMirrorPromise = import(CODEMIRROR_URL);
    if (!codeMirrorThemePromise) codeMirrorThemePromise = import(CODEMIRROR_THEME_URL);
    const codeMirror = await codeMirrorPromise;
    let theme = null;
    try {
      const themeModule = await codeMirrorThemePromise;
      theme = themeModule.oneDark || null;
    } catch (_) {
      theme = null;
    }
    const rawKey = normalizeLanguageKey(lang, true);
    const key = normalizeLanguageKey(lang);
    const url = CODEMIRROR_LANGS[key];
    let language = null;
    if (url) {
      try {
        if (!codeMirrorLanguagePromises[url]) codeMirrorLanguagePromises[url] = import(url);
        const module = await codeMirrorLanguagePromises[url];
        language = codeMirrorLanguageExtension(key, rawKey, module);
      } catch (_) {
        language = null;
      }
    }
    return { EditorView: codeMirror.EditorView, basicSetup: codeMirror.basicSetup, theme, language };
  }

  function normalizeLanguageKey(lang, preserveVariant) {
    const key = String(lang || "")
      .toLowerCase()
      .replace(/^text\//, "")
      .replace(/^application\//, "")
      .replace(/^x-/, "")
      .trim();
    if (preserveVariant) return key;
    if (["js", "mjs", "cjs", "javascript", "jsx", "ts", "typescript", "tsx"].includes(key)) return "javascript";
    if (["md", "markdown", "mdx"].includes(key)) return "markdown";
    if (["htm", "html"].includes(key)) return "html";
    if (["json", "jsonc"].includes(key)) return "json";
    return key;
  }

  function codeMirrorLanguageExtension(key, rawKey, module) {
    if (key === "javascript" && module.javascript) {
      return module.javascript({
        jsx: rawKey === "jsx" || rawKey === "tsx",
        typescript: rawKey === "ts" || rawKey === "typescript" || rawKey === "tsx"
      });
    }
    if (key === "markdown" && module.markdown) return module.markdown();
    if (key === "html" && module.html) return module.html();
    if (key === "json" && module.json) return module.json();
    return null;
  }

  function mount(input, target) {
    return new InterviewHarnessApp(normalizeConfig(input, target));
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function resolveTarget(target) {
    if (target && target.nodeType === 1) return target;
    const selector = String(target || `#${DEFAULT_TARGET_ID}`);
    let node = document.querySelector(selector);
    if (!node && selector === `#${DEFAULT_TARGET_ID}`) {
      node = document.createElement("div");
      node.id = DEFAULT_TARGET_ID;
      document.body.appendChild(node);
    }
    if (!node) throw new Error(`Interview Harness target not found: ${selector}`);
    return node;
  }

  async function copyToClipboard(value) {
    if (navigator.clipboard && global.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function nextLabel(instance) {
    if (instance.state.step >= instance.config.questions.length) return "Done";
    if (instance.state.step === instance.config.questions.length - 1) return "Review output";
    return "Next";
  }

  function timelineState(instance, questionDef, index) {
    const answer = instance.state.answers[questionDef.id];
    return [
      index === instance.state.step ? "is-active" : "",
      isQuestionAnswered(questionDef, answer) ? "is-answered" : "is-unanswered"
    ].filter(Boolean).join(" ");
  }

  function isInterviewReady(instance) {
    return instance.config.questions.every((questionDef) => {
      return questionDef.optional || isQuestionAnswered(questionDef, instance.state.answers[questionDef.id]);
    });
  }

  function isQuestionAnswered(questionDef, answer) {
    if (!answer) return false;
    if (questionDef.optional) return true;
    if (questionDef.type === "text") return Boolean(String(answer.answer || "").trim());
    if (questionDef.type === "one") return Boolean(answer.selected);
    if (questionDef.type === "many") return asArray(answer.selected).length > 0;
    if (questionDef.type === "rank") return Boolean(answer.touched) && asArray(answer.order).length >= questionDef.items.length;
    if (questionDef.type === "sort") {
      return questionDef.items.every((entry) => Boolean(answer.buckets && answer.buckets[entry.id]));
    }
    if (questionDef.type === "review") {
      return questionDef.items.every((entry) => Boolean(answer.states && answer.states[entry.id]));
    }
    if (questionDef.type === "redline") return Boolean(answer.touched) && Boolean(String(answer.content || "").trim());
    return true;
  }

  function answerItems(questionDef, answer) {
    const items = asArray(questionDef.items).map((entry) => Object.assign({ custom: false }, entry));
    if (!answer || !answer.added) return items;
    return items.concat(normalizeAddedItems(answer.added).map((entry) => Object.assign({ body: "", meta: null, custom: true }, entry)));
  }

  function itemComments(items, comments) {
    return asArray(items).map((entry) => ({
      id: entry.id,
      title: entry.title,
      comment: comments && comments[entry.id] || ""
    })).filter((entry) => entry.comment);
  }

  function findItem(questionDef, answer, id) {
    const entry = answerItems(questionDef, answer).find((candidate) => candidate.id === id);
    return entry ? { id: entry.id, title: entry.title } : null;
  }

  function normalizeAddedItems(input) {
    return asArray(input).map((entry, index) => {
      if (typeof entry === "string") return { id: slugify(entry) || `added-${index + 1}`, title: entry };
      const raw = Object.assign({}, entry || {});
      const title = String(raw.title || raw.label || raw.name || raw.value || `Added item ${index + 1}`);
      return { id: String(raw.id || slugify(title) || `added-${index + 1}`), title };
    });
  }

  function uniqueAddedId(questionDef, answer, title) {
    const base = slugify(title) || `added-${Date.now()}`;
    const used = new Set(answerItems(questionDef, answer).map((entry) => entry.id));
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function artifactText(artifact) {
    if (!artifact) return "";
    if (typeof artifact === "string") return artifact;
    if (artifact.value !== undefined) return valueToText(artifact.value);
    if (artifact.markup !== undefined) return valueToText(artifact.markup);
    return valueToText(artifact);
  }

  function objectFrom(items, value) {
    const output = {};
    items.forEach((entry) => {
      output[entry.id] = value === "title" ? entry.title : value;
    });
    return output;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === "") return [];
    return [value];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isFormControl(node) {
    return Boolean(node.closest("input, textarea, select, label, button, summary, details"));
  }

  function autoGrowTextarea(node) {
    if (!node || node.tagName !== "TEXTAREA") return;
    if (!node.classList.contains("ih-auto-field")) return;
    node.style.height = "auto";
    node.style.height = `${Math.max(node.scrollHeight, 46)}px`;
  }

  function cssEscape(value) {
    if (global.CSS && typeof global.CSS.escape === "function") return global.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function defaultStorageKey(title) {
    const path = location.pathname || "interview";
    return `interview-harness:${slugify(title)}:${path}`;
  }

  function valueToText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, "&#96;");
  }

  global.InterviewHarness = {
    version: VERSION,
    mount,
    text,
    one,
    many,
    rank,
    sort,
    review,
    redline,
    item,
    frame,
    html,
    prosCons,
    code
  };
})(window);
