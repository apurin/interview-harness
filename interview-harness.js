/*
 * Interview Harness
 * Readable, no-build client-side library for temporary agent-authored interviews.
 */
(function attachInterviewHarness(global) {
  "use strict";

  const VERSION = "0.1.0";
  const STYLE_ID = "interview-harness-styles";
  const DEFAULT_TARGET_ID = "interview-harness";

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
    return question("many", id, prompt, Object.assign({ items }, options || {}));
  }

  function rank(id, prompt, items, options) {
    return question("rank", id, prompt, Object.assign({ items }, options || {}));
  }

  function allocate(id, prompt, total, items, options) {
    return question("allocate", id, prompt, Object.assign({ total, items }, options || {}));
  }

  function sort(id, prompt, buckets, items, options) {
    return question("sort", id, prompt, Object.assign({ buckets, items }, options || {}));
  }

  function review(id, prompt, verbs, items, options) {
    return question("review", id, prompt, Object.assign({ verbs, items }, options || {}));
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

    if (type === "allocate") {
      return Object.assign(base, {
        total: numberOr(raw.total, 10),
        items: normalizeItems(raw.items || raw.options || raw.choices)
      });
    }

    return Object.assign(base, {
      items: normalizeItems(raw.items || raw.options || raw.choices),
      allowAdd: type === "many" ? raw.allowAdd !== false : Boolean(raw.allowAdd)
    });
  }

  function inferQuestionType(raw) {
    if (raw.artifact || raw.content) return "redline";
    if (raw.total !== undefined) return "allocate";
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
    return { step: 0, answers };
  }

  function initialAnswer(questionDef) {
    if (questionDef.type === "text") return { answer: questionDef.defaultValue || "" };
    if (questionDef.type === "one") return { selected: "", comments: {} };
    if (questionDef.type === "many") return { selected: [], comments: {}, added: [] };
    if (questionDef.type === "rank") return { order: questionDef.items.map((entry) => entry.id), comments: {}, comment: "" };
    if (questionDef.type === "allocate") return { points: objectFrom(questionDef.items, 0), comments: {} };
    if (questionDef.type === "sort") return { buckets: objectFrom(questionDef.items, ""), comments: {}, comment: "" };
    if (questionDef.type === "review") return { verdicts: objectFrom(questionDef.items, ""), edits: objectFrom(questionDef.items, "title"), comments: {}, added: [] };
    if (questionDef.type === "redline") return { content: artifactText(questionDef.artifact), comments: {}, summary: "" };
    return { answer: "" };
  }

  function mergeState(saved, current, questions) {
    if (!saved || typeof saved !== "object") return current;
    const next = Object.assign({}, current, { answers: Object.assign({}, current.answers) });
    if (Number.isInteger(saved.step)) next.step = Math.max(0, Math.min(saved.step, questions.length));
    questions.forEach((questionDef) => {
      if (saved.answers && saved.answers[questionDef.id]) {
        next.answers[questionDef.id] = Object.assign({}, next.answers[questionDef.id], saved.answers[questionDef.id]);
      }
    });
    return next;
  }

  function buildResult(config, state) {
    return {
      title: config.title,
      generatedAt: new Date().toISOString(),
      answers: config.questions.map((questionDef, index) => serializeAnswer(questionDef, state.answers[questionDef.id], index))
    };
  }

  function serializeAnswer(questionDef, answer, index) {
    const base = {
      id: questionDef.id,
      type: questionDef.type,
      question: questionDef.prompt,
      position: index + 1
    };

    if (questionDef.type === "text") return Object.assign(base, { answer: answer.answer || "" });

    if (questionDef.type === "one") {
      return Object.assign(base, {
        selected: findItem(questionDef, answer.selected),
        comments: itemComments(questionDef, answer.comments)
      });
    }

    if (questionDef.type === "many") {
      return Object.assign(base, {
        selected: asArray(answer.selected).map((id) => findItem(questionDef, id)).filter(Boolean),
        added: asArray(answer.added),
        comments: itemComments(questionDef, answer.comments)
      });
    }

    if (questionDef.type === "rank") {
      return Object.assign(base, {
        order: asArray(answer.order).map((id) => findItem(questionDef, id)).filter(Boolean),
        comments: itemComments(questionDef, answer.comments),
        overallComment: answer.comment || ""
      });
    }

    if (questionDef.type === "allocate") {
      const allocations = questionDef.items.map((entry) => ({
        id: entry.id,
        title: entry.title,
        points: numberOr(answer.points && answer.points[entry.id], 0),
        comment: (answer.comments && answer.comments[entry.id]) || ""
      }));
      const used = allocations.reduce((sum, entry) => sum + entry.points, 0);
      return Object.assign(base, { total: questionDef.total, used, remaining: questionDef.total - used, allocations });
    }

    if (questionDef.type === "sort") {
      const buckets = {};
      questionDef.buckets.forEach((bucket) => { buckets[bucket.title] = []; });
      const unset = [];
      questionDef.items.forEach((entry) => {
        const bucket = questionDef.buckets.find((candidate) => candidate.id === answer.buckets[entry.id]);
        const payload = { id: entry.id, title: entry.title, comment: (answer.comments && answer.comments[entry.id]) || "" };
        if (bucket) buckets[bucket.title].push(payload);
        else unset.push(payload);
      });
      return Object.assign(base, { buckets, unset, overallComment: answer.comment || "" });
    }

    if (questionDef.type === "review") {
      return Object.assign(base, {
        items: questionDef.items.map((entry) => ({
          id: entry.id,
          original: entry.title,
          verdict: (answer.verdicts && answer.verdicts[entry.id]) || "",
          edited: (answer.edits && answer.edits[entry.id]) || entry.title,
          comment: (answer.comments && answer.comments[entry.id]) || ""
        })),
        added: asArray(answer.added)
      });
    }

    if (questionDef.type === "redline") {
      const lines = String(answer.content || "").split("\n");
      return Object.assign(base, {
        content: answer.content || "",
        lineComments: lines.map((line, lineIndex) => ({
          line: lineIndex + 1,
          text: line,
          comment: answer.comments && answer.comments[lineIndex + 1] || ""
        })).filter((entry) => entry.text.trim() || entry.comment.trim()),
        summary: answer.summary || ""
      });
    }

    return Object.assign(base, { answer });
  }

  function buildTextExport(config, state) {
    const result = buildResult(config, state);
    const lines = [`# ${result.title}`, ""];

    result.answers.forEach((entry) => {
      lines.push(`## ${entry.position}. ${entry.question}`);

      if (entry.type === "text") {
        lines.push(entry.answer ? entry.answer : "No answer provided.");
      }

      if (entry.type === "one") {
        lines.push(entry.selected ? `Selected: ${entry.selected.title}` : "Selected: none");
        appendComments(lines, entry.comments);
      }

      if (entry.type === "many") {
        if (entry.selected.length) {
          lines.push("Selected:");
          entry.selected.forEach((item) => lines.push(`- ${item.title}`));
        } else {
          lines.push("Selected: none");
        }
        if (entry.added.length) {
          lines.push("Added:");
          entry.added.forEach((added) => lines.push(`- ${added.title || added}`));
        }
        appendComments(lines, entry.comments);
      }

      if (entry.type === "rank") {
        lines.push("Order:");
        entry.order.forEach((item, index) => lines.push(`${index + 1}. ${item.title}`));
        appendComments(lines, entry.comments);
        if (entry.overallComment) lines.push(`Overall comment: ${entry.overallComment}`);
      }

      if (entry.type === "allocate") {
        lines.push(`Budget: ${entry.used} of ${entry.total} used, ${entry.remaining} remaining.`);
        entry.allocations.forEach((allocation) => {
          const comment = allocation.comment ? ` Comment: ${allocation.comment}` : "";
          lines.push(`- ${allocation.title}: ${allocation.points}${comment}`);
        });
      }

      if (entry.type === "sort") {
        Object.keys(entry.buckets).forEach((bucket) => {
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
        if (entry.unset.length) {
          lines.push("Unsorted:");
          entry.unset.forEach((item) => lines.push(`- ${item.title}`));
        }
        if (entry.overallComment) lines.push(`Overall comment: ${entry.overallComment}`);
      }

      if (entry.type === "review") {
        entry.items.forEach((item) => {
          lines.push(`- ${item.original}`);
          lines.push(`  Verdict: ${item.verdict || "none"}`);
          if (item.edited && item.edited !== item.original) lines.push(`  Edited: ${item.edited}`);
          if (item.comment) lines.push(`  Comment: ${item.comment}`);
        });
        if (entry.added.length) {
          lines.push("Added:");
          entry.added.forEach((added) => lines.push(`- ${added.title || added}`));
        }
      }

      if (entry.type === "redline") {
        lines.push("Edited artifact:");
        lines.push("```");
        lines.push(entry.content || "");
        lines.push("```");
        if (entry.lineComments.length) {
          lines.push("Line comments:");
          entry.lineComments.forEach((line) => {
            if (line.comment) lines.push(`- Line ${line.line}: ${line.comment}`);
          });
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

  // Rendering and styles -----------------------------------------------------

  const styles = `
    :root {
      color-scheme: light;
      --ih-bg: #f6f7f4;
      --ih-surface: #fffefa;
      --ih-surface-2: #eef3f0;
      --ih-ink: #1f2328;
      --ih-muted: #626a73;
      --ih-line: #d8ddd6;
      --ih-line-strong: #aeb8b1;
      --ih-accent: #2457ff;
      --ih-accent-soft: #e8edff;
      --ih-good: #0d7d48;
      --ih-warn: #9a5d00;
      --ih-danger: #a73535;
      --ih-shadow: 0 18px 42px rgba(31, 35, 40, .1);
      --ih-radius: 8px;
      --ih-max: 1480px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .ih-app, .ih-app * { box-sizing: border-box; }
    .ih-app { min-height: 100vh; background: var(--ih-bg); color: var(--ih-ink); }
    .ih-app button, .ih-app input, .ih-app textarea, .ih-app select { font: inherit; }
    .ih-app button { cursor: pointer; color: inherit; }
    .ih-app button:focus-visible, .ih-app input:focus-visible, .ih-app textarea:focus-visible, .ih-app select:focus-visible {
      outline: 3px solid rgba(36, 87, 255, .35);
      outline-offset: 2px;
    }

    .ih-topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      border-bottom: 1px solid var(--ih-line);
      background: color-mix(in srgb, var(--ih-bg) 90%, transparent);
      backdrop-filter: blur(16px);
    }

    .ih-topbar-inner {
      max-width: var(--ih-max);
      margin: 0 auto;
      padding: 14px clamp(14px, 3vw, 34px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
    }

    .ih-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .ih-mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--ih-ink);
      color: var(--ih-surface);
      font-weight: 850;
      flex: 0 0 auto;
    }
    .ih-title { margin: 0; font-size: clamp(18px, 2vw, 24px); line-height: 1.05; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ih-intro { margin: 3px 0 0; color: var(--ih-muted); font-size: 13px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ih-actions { display: flex; gap: 8px; justify-content: end; flex-wrap: wrap; }

    .ih-progress { max-width: var(--ih-max); margin: 0 auto; padding: 0 clamp(14px, 3vw, 34px) 12px; }
    .ih-progress-track { height: 7px; border-radius: 999px; overflow: hidden; background: var(--ih-line); }
    .ih-progress-fill { height: 100%; width: 0%; border-radius: inherit; background: var(--ih-accent); transition: width .22s ease; }

    .ih-main {
      max-width: var(--ih-max);
      margin: 0 auto;
      padding: clamp(24px, 4vw, 52px) clamp(14px, 3vw, 34px) 118px;
    }

    .ih-step { animation: ihFadeIn .18s ease both; }
    @keyframes ihFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    .ih-question-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
      gap: clamp(18px, 3vw, 34px);
      align-items: end;
      margin-bottom: clamp(18px, 3vw, 32px);
    }
    .ih-kicker { margin: 0 0 10px; color: var(--ih-accent); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 850; }
    .ih-prompt { margin: 0; max-width: 1040px; font-size: clamp(34px, 5.6vw, 76px); line-height: .96; letter-spacing: 0; }
    .ih-help { margin: 14px 0 0; max-width: 820px; color: var(--ih-muted); line-height: 1.52; font-size: clamp(15px, 1.3vw, 18px); }
    .ih-side {
      border: 1px solid var(--ih-line);
      border-radius: var(--ih-radius);
      background: color-mix(in srgb, var(--ih-surface) 78%, transparent);
      padding: 16px;
    }
    .ih-side strong { display: block; font-size: 14px; margin-bottom: 6px; }
    .ih-side p { margin: 0; color: var(--ih-muted); font-size: 13px; line-height: 1.45; }

    .ih-btn {
      min-height: 38px;
      border: 1px solid var(--ih-line);
      border-radius: 999px;
      background: var(--ih-surface);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 13px;
      font-weight: 760;
      font-size: 13px;
    }
    .ih-btn:hover { border-color: var(--ih-line-strong); }
    .ih-btn:disabled { opacity: .45; cursor: not-allowed; }
    .ih-app .ih-btn-primary { background: var(--ih-ink); color: #fff; border-color: var(--ih-ink); box-shadow: var(--ih-shadow); }
    .ih-app .ih-btn-accent { background: var(--ih-accent); color: #fff; border-color: var(--ih-accent); }

    .ih-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 16px; align-items: stretch; }
    .ih-stack { display: grid; gap: 14px; }
    .ih-card {
      border: 1px solid var(--ih-line);
      border-radius: var(--ih-radius);
      background: var(--ih-surface);
      padding: 16px;
      min-width: 0;
      box-shadow: 0 1px 0 rgba(255,255,255,.65) inset;
    }
    .ih-choice {
      text-align: left;
      display: grid;
      gap: 10px;
      min-height: 160px;
      border: 2px solid transparent;
      transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease;
    }
    .ih-choice:hover { transform: translateY(-2px); border-color: var(--ih-line-strong); box-shadow: var(--ih-shadow); }
    .ih-choice.is-selected { border-color: var(--ih-accent); box-shadow: 0 0 0 4px var(--ih-accent-soft); }
    .ih-item-top { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
    .ih-item-title { margin: 0; font-size: clamp(18px, 1.6vw, 23px); line-height: 1.1; letter-spacing: 0; }
    .ih-select-dot {
      width: 34px;
      height: 34px;
      flex: 0 0 auto;
      border: 1px solid var(--ih-line-strong);
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: var(--ih-muted);
      background: white;
      font-weight: 850;
    }
    .ih-choice.is-selected .ih-select-dot { color: white; background: var(--ih-accent); border-color: var(--ih-accent); }
    .ih-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .ih-pill { border: 1px solid var(--ih-line); border-radius: 999px; padding: 4px 8px; color: var(--ih-muted); background: white; font-size: 12px; font-weight: 700; }
    .ih-comment { margin-top: 10px; }
    .ih-field, .ih-comment textarea, .ih-line-comment textarea {
      width: 100%;
      border: 1px solid var(--ih-line);
      border-radius: var(--ih-radius);
      background: #fff;
      color: var(--ih-ink);
      padding: 11px 12px;
      min-height: 46px;
      resize: vertical;
    }
    .ih-field-large { min-height: 180px; }
    .ih-comment textarea { min-height: 72px; background: #fbfcfa; }
    .ih-label { display: block; font-size: 12px; color: var(--ih-muted); font-weight: 760; margin-bottom: 6px; }

    .ih-rich { min-width: 0; color: var(--ih-muted); line-height: 1.45; }
    .ih-rich p { margin: 0; }
    .ih-frame { width: 100%; height: min(54vh, 520px); border: 1px solid var(--ih-line); border-radius: var(--ih-radius); background: white; }
    .ih-html-preview { border: 1px solid var(--ih-line); border-radius: var(--ih-radius); padding: 12px; background: #f8faf7; overflow: auto; }
    .ih-pros-cons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .ih-pros, .ih-cons { border-radius: var(--ih-radius); padding: 12px; border: 1px solid var(--ih-line); background: #fff; }
    .ih-pros strong { color: var(--ih-good); }
    .ih-cons strong { color: var(--ih-danger); }
    .ih-pros ul, .ih-cons ul { margin: 8px 0 0; padding-left: 18px; }
    .ih-code { margin: 0; border-radius: var(--ih-radius); background: #171817; color: #f8f8ef; padding: 14px; overflow: auto; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    .ih-add-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
    .ih-rank-list { display: grid; gap: 10px; counter-reset: rank; }
    .ih-rank-item { counter-increment: rank; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
    .ih-rank-num { width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center; background: var(--ih-accent-soft); color: var(--ih-accent); font-weight: 850; }
    .ih-rank-controls { display: flex; gap: 6px; }
    .ih-icon-btn { width: 34px; height: 34px; border: 1px solid var(--ih-line); border-radius: 999px; background: white; display: grid; place-items: center; font-weight: 850; }

    .ih-allocation-row { display: grid; grid-template-columns: minmax(160px, .8fr) minmax(160px, 1fr) 86px; gap: 14px; align-items: center; }
    .ih-range { width: 100%; accent-color: var(--ih-accent); }
    .ih-number { width: 78px; min-height: 40px; border: 1px solid var(--ih-line); border-radius: var(--ih-radius); padding: 8px; }
    .ih-budget { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px; color: var(--ih-muted); font-weight: 760; }
    .ih-budget strong { color: var(--ih-ink); }

    .ih-sort-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .ih-bucket { border: 1px solid var(--ih-line); border-radius: var(--ih-radius); background: color-mix(in srgb, var(--ih-surface) 78%, var(--ih-surface-2)); padding: 12px; min-height: 150px; }
    .ih-bucket-title { font-weight: 850; margin-bottom: 10px; }
    .ih-chip { border: 1px solid var(--ih-line); border-radius: var(--ih-radius); background: white; padding: 9px 10px; margin-bottom: 8px; font-size: 13px; }
    .ih-select { width: 100%; min-height: 40px; border: 1px solid var(--ih-line); border-radius: var(--ih-radius); background: white; padding: 8px 10px; }

    .ih-review-row { display: grid; grid-template-columns: minmax(180px, .6fr) minmax(240px, 1fr) minmax(220px, .8fr); gap: 12px; align-items: start; }
    .ih-verbs { display: flex; gap: 6px; flex-wrap: wrap; }
    .ih-verb { border: 1px solid var(--ih-line); border-radius: 999px; background: white; padding: 6px 10px; font-size: 12px; font-weight: 760; }
    .ih-verb.is-selected { border-color: var(--ih-accent); background: var(--ih-accent-soft); color: var(--ih-accent); }

    .ih-redline { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 16px; align-items: start; }
    .ih-line-comments { display: grid; gap: 10px; max-height: 68vh; overflow: auto; }
    .ih-line-comment { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 8px; align-items: start; }
    .ih-line-no { padding-top: 10px; color: var(--ih-muted); font: 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: right; }

    .ih-export { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .ih-output { min-height: 420px; max-height: 62vh; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #171817; color: #f8f8ef; border-radius: var(--ih-radius); padding: 16px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    .ih-bottom {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      border-top: 1px solid var(--ih-line);
      background: color-mix(in srgb, var(--ih-bg) 90%, transparent);
      backdrop-filter: blur(16px);
    }
    .ih-bottom-inner {
      max-width: var(--ih-max);
      margin: 0 auto;
      padding: 12px clamp(14px, 3vw, 34px);
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
    }
    .ih-status { color: var(--ih-muted); text-align: center; font-size: 13px; line-height: 1.35; }
    .ih-toast {
      position: fixed;
      right: 20px;
      bottom: 86px;
      z-index: 40;
      background: var(--ih-ink);
      color: var(--ih-surface);
      border-radius: 999px;
      padding: 11px 14px;
      box-shadow: var(--ih-shadow);
      font-weight: 760;
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
    }
    .ih-toast.is-visible { opacity: 1; transform: none; }

    @media (max-width: 900px) {
      .ih-topbar-inner, .ih-bottom-inner, .ih-question-head, .ih-export, .ih-redline { grid-template-columns: 1fr; }
      .ih-actions { justify-content: start; }
      .ih-title, .ih-intro { white-space: normal; }
      .ih-prompt { font-size: clamp(30px, 11vw, 54px); }
      .ih-side { display: none; }
      .ih-pros-cons, .ih-review-row, .ih-allocation-row { grid-template-columns: 1fr; }
      .ih-status { text-align: left; }
    }
  `;

  function renderApp(instance) {
    const totalSteps = instance.config.questions.length + 1;
    const isExport = instance.state.step >= instance.config.questions.length;
    const progress = ((instance.state.step + 1) / totalSteps) * 100;
    const stepHtml = isExport ? renderExportStep(instance) : renderQuestionStep(instance);

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
              <button class="ih-btn ih-btn-primary" type="button" data-action="copy-text">${escapeHTML(instance.config.copyTextLabel)}</button>
              <button class="ih-btn" type="button" data-action="copy-json">${escapeHTML(instance.config.copyJsonLabel)}</button>
              <button class="ih-btn" type="button" data-action="reset">Reset</button>
            </div>
          </div>
          <div class="ih-progress" aria-hidden="true"><div class="ih-progress-track"><div class="ih-progress-fill" style="width:${progress}%"></div></div></div>
        </header>
        <main class="ih-main">${stepHtml}</main>
        <footer class="ih-bottom">
          <div class="ih-bottom-inner">
            <button class="ih-btn" type="button" data-action="back" ${instance.state.step === 0 ? "disabled" : ""}>Back</button>
            <div class="ih-status">${escapeHTML(statusText(instance))}</div>
            <button class="ih-btn ih-btn-primary" type="button" data-action="next">${escapeHTML(nextLabel(instance))}</button>
          </div>
        </footer>
        <div class="ih-toast" role="status" aria-live="polite"></div>
      </div>
    `;
  }

  function renderQuestionStep(instance) {
    const questionDef = instance.config.questions[instance.state.step];
    return `
      <section class="ih-step" data-question-id="${escapeAttr(questionDef.id)}">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Question ${instance.state.step + 1} / ${instance.config.questions.length}</p>
            <h2 class="ih-prompt">${escapeHTML(questionDef.prompt)}</h2>
            ${questionDef.help ? `<p class="ih-help">${escapeHTML(questionDef.help)}</p>` : ""}
          </div>
          <aside class="ih-side">
            <strong>${escapeHTML(sideLabel(questionDef.type))}</strong>
            <p>${escapeHTML(sideText(questionDef.type))}</p>
          </aside>
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
    if (questionDef.type === "allocate") return renderAllocate(questionDef, answer);
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
    const items = questionDef.items.map((entry) => renderChoiceItem(entry, answer, selected.includes(entry.id), multiple)).join("");
    const added = multiple ? renderAddedItems(answer) : "";
    const addRow = multiple && questionDef.allowAdd ? renderAddRow("Add another item") : "";
    return `<div class="${gridClass}">${items}</div>${added}${addRow}`;
  }

  function renderChoiceItem(entry, answer, isSelected, multiple) {
    return `
      <article class="ih-card ih-choice ${isSelected ? "is-selected" : ""}" data-item-id="${escapeAttr(entry.id)}" data-action="${multiple ? "toggle-many" : "select-one"}" tabindex="0">
        <div class="ih-item-top">
          <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
          <span class="ih-select-dot">${isSelected ? "✓" : "+"}</span>
        </div>
        ${renderMeta(entry.meta)}
        ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
        <div class="ih-comment">
          <label class="ih-label" for="comment-${escapeAttr(entry.id)}">Comment</label>
          <textarea id="comment-${escapeAttr(entry.id)}" data-input="item-comment" data-item-id="${escapeAttr(entry.id)}" placeholder="What should the agent know about this item?">${escapeHTML(answer.comments && answer.comments[entry.id] || "")}</textarea>
        </div>
      </article>
    `;
  }

  function renderAddedItems(answer) {
    if (!answer.added || !answer.added.length) return "";
    return `
      <div class="ih-stack" style="margin-top:16px">
        ${answer.added.map((entry, index) => `
          <div class="ih-card">
            <div class="ih-item-top">
              <h3 class="ih-item-title">${escapeHTML(entry.title || entry)}</h3>
              <button class="ih-icon-btn" type="button" data-action="remove-added" data-added-index="${index}" aria-label="Remove added item">×</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderAddRow(label) {
    return `
      <div class="ih-card ih-add-row" style="margin-top:16px">
        <input class="ih-field" data-input="add-text" placeholder="${escapeAttr(label)}">
        <button class="ih-btn ih-btn-accent" type="button" data-action="add-item">Add</button>
      </div>
    `;
  }

  function renderRank(questionDef, answer) {
    const order = asArray(answer.order).filter((id) => questionDef.items.some((entry) => entry.id === id));
    questionDef.items.forEach((entry) => { if (!order.includes(entry.id)) order.push(entry.id); });
    return `
      <div class="ih-rank-list">
        ${order.map((id, index) => {
          const entry = questionDef.items.find((candidate) => candidate.id === id);
          return `
            <article class="ih-card ih-rank-item" draggable="true" data-item-id="${escapeAttr(entry.id)}">
              <div class="ih-rank-num">${index + 1}</div>
              <div>
                <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
                ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
                <div class="ih-comment">
                  <label class="ih-label">Comment</label>
                  <textarea data-input="item-comment" data-item-id="${escapeAttr(entry.id)}" placeholder="Why here?">${escapeHTML(answer.comments && answer.comments[entry.id] || "")}</textarea>
                </div>
              </div>
              <div class="ih-rank-controls">
                <button class="ih-icon-btn" type="button" data-action="rank-up" aria-label="Move up">↑</button>
                <button class="ih-icon-btn" type="button" data-action="rank-down" aria-label="Move down">↓</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <div class="ih-card ih-comment" style="margin-top:16px">
        <label class="ih-label">Overall comment</label>
        <textarea data-input="rank-comment" placeholder="Anything about the order as a whole?">${escapeHTML(answer.comment || "")}</textarea>
      </div>
    `;
  }

  function renderAllocate(questionDef, answer) {
    const used = questionDef.items.reduce((sum, entry) => sum + numberOr(answer.points && answer.points[entry.id], 0), 0);
    const remaining = questionDef.total - used;
    return `
      <div class="ih-budget"><strong>${remaining}</strong> of ${questionDef.total} remaining</div>
      <div class="ih-stack">
        ${questionDef.items.map((entry) => {
          const points = numberOr(answer.points && answer.points[entry.id], 0);
          return `
            <article class="ih-card ih-allocation-row" data-item-id="${escapeAttr(entry.id)}">
              <div>
                <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
                ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
              </div>
              <input class="ih-range" type="range" min="0" max="${questionDef.total}" value="${points}" data-input="allocate" data-item-id="${escapeAttr(entry.id)}">
              <input class="ih-number" type="number" min="0" max="${questionDef.total}" value="${points}" data-input="allocate" data-item-id="${escapeAttr(entry.id)}">
              <div class="ih-comment" style="grid-column:1/-1">
                <label class="ih-label">Comment</label>
                <textarea data-input="item-comment" data-item-id="${escapeAttr(entry.id)}" placeholder="Why this weight?">${escapeHTML(answer.comments && answer.comments[entry.id] || "")}</textarea>
              </div>
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
      <div class="ih-sort-board">
        ${questionDef.buckets.map((bucket) => `
          <section class="ih-bucket">
            <div class="ih-bucket-title">${escapeHTML(bucket.title)}</div>
            ${byBucket[bucket.id].length ? byBucket[bucket.id].map(renderChip).join("") : `<div class="ih-chip">No items yet</div>`}
          </section>
        `).join("")}
        <section class="ih-bucket">
          <div class="ih-bucket-title">Unsorted</div>
          ${unset.length ? unset.map(renderChip).join("") : `<div class="ih-chip">None</div>`}
        </section>
      </div>
      <div class="ih-stack" style="margin-top:16px">
        ${questionDef.items.map((entry) => `
          <article class="ih-card">
            <div class="ih-review-row" style="grid-template-columns:minmax(180px,1fr) minmax(180px,.7fr) minmax(220px,1fr)">
              <div>
                <h3 class="ih-item-title">${escapeHTML(entry.title)}</h3>
                ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
              </div>
              <select class="ih-select" data-input="sort-bucket" data-item-id="${escapeAttr(entry.id)}">
                <option value="">Unsorted</option>
                ${questionDef.buckets.map((bucket) => `<option value="${escapeAttr(bucket.id)}" ${answer.buckets && answer.buckets[entry.id] === bucket.id ? "selected" : ""}>${escapeHTML(bucket.title)}</option>`).join("")}
              </select>
              <textarea data-input="item-comment" data-item-id="${escapeAttr(entry.id)}" placeholder="Comment">${escapeHTML(answer.comments && answer.comments[entry.id] || "")}</textarea>
            </div>
          </article>
        `).join("")}
        <div class="ih-card ih-comment">
          <label class="ih-label">Overall comment</label>
          <textarea data-input="sort-comment" placeholder="Anything about the classification?">${escapeHTML(answer.comment || "")}</textarea>
        </div>
      </div>
    `;
  }

  function renderReview(questionDef, answer) {
    return `
      <div class="ih-stack">
        ${questionDef.items.map((entry) => `
          <article class="ih-card">
            <div class="ih-review-row" data-item-id="${escapeAttr(entry.id)}">
              <div>
                <div class="ih-verbs">
                  ${questionDef.verbs.map((verb) => `<button class="ih-verb ${answer.verdicts && answer.verdicts[entry.id] === verb.id ? "is-selected" : ""}" type="button" data-action="review-verdict" data-item-id="${escapeAttr(entry.id)}" data-verdict="${escapeAttr(verb.id)}">${escapeHTML(verb.title)}</button>`).join("")}
                </div>
              </div>
              <textarea class="ih-field" data-input="review-edit" data-item-id="${escapeAttr(entry.id)}">${escapeHTML(answer.edits && answer.edits[entry.id] || entry.title)}</textarea>
              <textarea class="ih-field" data-input="item-comment" data-item-id="${escapeAttr(entry.id)}" placeholder="Replacement or note">${escapeHTML(answer.comments && answer.comments[entry.id] || "")}</textarea>
            </div>
            ${entry.body ? `<div class="ih-rich" style="margin-top:10px">${renderRich(entry.body)}</div>` : ""}
          </article>
        `).join("")}
      </div>
      ${questionDef.allowAdd ? `${renderAddedItems(answer)}${renderAddRow("Add another statement or term")}` : ""}
    `;
  }

  function renderRedline(questionDef, answer) {
    const lines = String(answer.content || "").split("\n");
    return `
      <div class="ih-redline">
        <div class="ih-card">
          <label class="ih-label">Editable artifact</label>
          <textarea class="ih-field ih-field-large" data-input="redline-content" spellcheck="false">${escapeHTML(answer.content || "")}</textarea>
        </div>
        <div class="ih-card">
          <label class="ih-label">Line comments</label>
          <div class="ih-line-comments">
            ${lines.map((line, index) => `
              <div class="ih-line-comment">
                <div class="ih-line-no">${index + 1}</div>
                <textarea data-input="line-comment" data-line="${index + 1}" placeholder="${escapeAttr(line.trim().slice(0, 70) || "Blank line")}">${escapeHTML(answer.comments && answer.comments[index + 1] || "")}</textarea>
              </div>
            `).join("")}
          </div>
          <div class="ih-comment">
            <label class="ih-label">Overall artifact comment</label>
            <textarea data-input="redline-summary" placeholder="What should the agent do with these edits?">${escapeHTML(answer.summary || "")}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderExportStep(instance) {
    const text = buildTextExport(instance.config, instance.state);
    const json = JSON.stringify(buildResult(instance.config, instance.state), null, 2);
    return `
      <section class="ih-step">
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
              <button class="ih-btn ih-btn-primary" type="button" data-action="copy-text">Copy text</button>
            </div>
            <pre class="ih-output">${escapeHTML(text)}</pre>
          </div>
          <div class="ih-card">
            <div class="ih-item-top" style="margin-bottom:12px">
              <h3 class="ih-item-title">JSON</h3>
              <button class="ih-btn" type="button" data-action="copy-json">Copy JSON</button>
            </div>
            <pre class="ih-output">${escapeHTML(json)}</pre>
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
      return `<pre class="ih-code"><code>${escapeHTML(valueToText(value.value))}</code></pre>`;
    }
    return `<p>${escapeHTML(valueToText(value))}</p>`;
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

  function renderChip(entry) {
    return `<div class="ih-chip">${escapeHTML(entry.title)}</div>`;
  }

  // App runtime --------------------------------------------------------------

  class InterviewHarnessApp {
    constructor(config) {
      this.config = config;
      this.root = resolveTarget(config.target);
      this.state = createInitialState(config.questions);
      this.draggedItemId = "";
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
      this.root.addEventListener("dragstart", (event) => this.onDragStart(event));
      this.root.addEventListener("dragover", (event) => this.onDragOver(event));
      this.root.addEventListener("drop", (event) => this.onDrop(event));
    }

    render() {
      renderApp(this);
    }

    currentQuestion() {
      return this.config.questions[this.state.step];
    }

    currentAnswer() {
      const questionDef = this.currentQuestion();
      return questionDef && this.state.answers[questionDef.id];
    }

    onClick(event) {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl || !this.root.contains(actionEl)) return;
      const action = actionEl.dataset.action;
      if (["select-one", "toggle-many"].includes(action) && isFormControl(event.target)) return;

      if (action === "back") return this.go(-1);
      if (action === "next") return this.go(1);
      if (action === "reset") return this.reset();
      if (action === "copy-text") return this.copyText();
      if (action === "copy-json") return this.copyJson();
      if (action === "select-one") return this.selectOne(actionEl.dataset.itemId);
      if (action === "toggle-many") return this.toggleMany(actionEl.dataset.itemId);
      if (action === "rank-up") return this.moveRank(actionEl.closest("[data-item-id]").dataset.itemId, -1);
      if (action === "rank-down") return this.moveRank(actionEl.closest("[data-item-id]").dataset.itemId, 1);
      if (action === "review-verdict") return this.setReviewVerdict(actionEl.dataset.itemId, actionEl.dataset.verdict);
      if (action === "add-item") return this.addItem();
      if (action === "remove-added") return this.removeAdded(numberOr(actionEl.dataset.addedIndex, -1));
    }

    onInput(event) {
      const input = event.target.closest("[data-input]");
      if (!input || !this.root.contains(input)) return;
      const kind = input.dataset.input;
      const questionDef = this.currentQuestion();
      const answer = this.currentAnswer();
      if (!questionDef || !answer) return;

      if (kind === "text") answer.answer = input.value;
      if (kind === "item-comment") answer.comments[input.dataset.itemId] = input.value;
      if (kind === "rank-comment") answer.comment = input.value;
      if (kind === "sort-comment") answer.comment = input.value;
      if (kind === "sort-bucket") answer.buckets[input.dataset.itemId] = input.value;
      if (kind === "review-edit") answer.edits[input.dataset.itemId] = input.value;
      if (kind === "allocate") answer.points[input.dataset.itemId] = clamp(numberOr(input.value, 0), 0, questionDef.total);
      if (kind === "redline-content") answer.content = input.value;
      if (kind === "line-comment") answer.comments[input.dataset.line] = input.value;
      if (kind === "redline-summary") answer.summary = input.value;

      this.save();
      if (["sort-bucket", "allocate", "redline-content"].includes(kind)) this.render();
    }

    onKeydown(event) {
      const choice = event.target.closest(".ih-choice[data-action]");
      if (!choice || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      choice.click();
    }

    onDragStart(event) {
      const card = event.target.closest(".ih-rank-item[data-item-id]");
      if (!card) return;
      this.draggedItemId = card.dataset.itemId;
      event.dataTransfer.effectAllowed = "move";
    }

    onDragOver(event) {
      if (!this.draggedItemId || !event.target.closest(".ih-rank-item[data-item-id]")) return;
      event.preventDefault();
    }

    onDrop(event) {
      const card = event.target.closest(".ih-rank-item[data-item-id]");
      if (!card || !this.draggedItemId) return;
      event.preventDefault();
      this.moveRankTo(this.draggedItemId, card.dataset.itemId);
      this.draggedItemId = "";
    }

    selectOne(itemId) {
      this.currentAnswer().selected = itemId;
      this.save();
      this.render();
    }

    toggleMany(itemId) {
      const answer = this.currentAnswer();
      const selected = new Set(asArray(answer.selected));
      if (selected.has(itemId)) selected.delete(itemId);
      else selected.add(itemId);
      answer.selected = Array.from(selected);
      this.save();
      this.render();
    }

    moveRank(itemId, direction) {
      const answer = this.currentAnswer();
      const order = asArray(answer.order);
      const index = order.indexOf(itemId);
      const nextIndex = clamp(index + direction, 0, order.length - 1);
      if (index < 0 || index === nextIndex) return;
      order.splice(index, 1);
      order.splice(nextIndex, 0, itemId);
      answer.order = order;
      this.save();
      this.render();
    }

    moveRankTo(itemId, targetId) {
      const answer = this.currentAnswer();
      const order = asArray(answer.order).filter((id) => id !== itemId);
      const targetIndex = order.indexOf(targetId);
      order.splice(targetIndex >= 0 ? targetIndex : order.length, 0, itemId);
      answer.order = order;
      this.save();
      this.render();
    }

    setReviewVerdict(itemId, verdict) {
      this.currentAnswer().verdicts[itemId] = verdict;
      this.save();
      this.render();
    }

    addItem() {
      const input = this.root.querySelector("[data-input='add-text']");
      const title = input && input.value.trim();
      if (!title) return this.toast("Write the item first.");
      this.currentAnswer().added.push({ id: slugify(title) || `added-${Date.now()}`, title });
      this.save();
      this.render();
    }

    removeAdded(index) {
      if (index < 0) return;
      this.currentAnswer().added.splice(index, 1);
      this.save();
      this.render();
    }

    go(direction) {
      const max = this.config.questions.length;
      this.state.step = clamp(this.state.step + direction, 0, max);
      this.save();
      this.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    }

    reset() {
      if (!global.confirm("Reset this interview and clear saved answers?")) return;
      this.state = createInitialState(this.config.questions);
      if (this.config.storageKey) localStorage.removeItem(this.config.storageKey);
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
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.state));
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

  function statusText(instance) {
    if (instance.state.step >= instance.config.questions.length) return "Review and copy the text output, or use JSON for structured handoff.";
    const questionDef = instance.currentQuestion();
    return `${questionDef.type} question · ${instance.state.step + 1} of ${instance.config.questions.length}`;
  }

  function nextLabel(instance) {
    if (instance.state.step >= instance.config.questions.length) return "Done";
    if (instance.state.step === instance.config.questions.length - 1) return "Review output";
    return "Next";
  }

  function sideLabel(type) {
    const labels = {
      text: "Freeform answer",
      one: "Single choice",
      many: "Multiple choice",
      rank: "Ordered preference",
      allocate: "Priority budget",
      sort: "Bucket sort",
      review: "Review and edit",
      redline: "Artifact redline"
    };
    return labels[type] || "Question";
  }

  function sideText(type) {
    const labels = {
      text: "Use this for context, missing details, and open notes.",
      one: "Pick one item. Comment on any option, including non-selected ones.",
      many: "Pick all that apply. Add missing items when the choices are incomplete.",
      rank: "Put the most important item first. Comments explain the ordering.",
      allocate: "Distribute points to show intensity, not just preference.",
      sort: "Classify items so requirements, preferences, and scope boundaries stay distinct.",
      review: "Give each statement a verdict, edit it in place, and leave a note.",
      redline: "Edit the artifact directly and attach comments to specific lines."
    };
    return labels[type] || "Answer in the form that best guides the next agent step.";
  }

  function itemComments(questionDef, comments) {
    return questionDef.items.map((entry) => ({
      id: entry.id,
      title: entry.title,
      comment: comments && comments[entry.id] || ""
    })).filter((entry) => entry.comment);
  }

  function findItem(questionDef, id) {
    const entry = questionDef.items.find((candidate) => candidate.id === id);
    return entry ? { id: entry.id, title: entry.title } : null;
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

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isFormControl(node) {
    return Boolean(node.closest("input, textarea, select, label"));
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
    allocate,
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
