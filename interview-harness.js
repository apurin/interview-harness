/*
 * Interview Harness
 * Readable, no-build client-side library for temporary agent-authored interviews.
 */
(function attachInterviewHarness(global) {
  "use strict";

  const VERSION = "1.1.1";
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

  const tagged = (key, value) => (config) => Object.assign({ [key]: value }, config || {});
  const text = tagged("type", "text");
  const choice = tagged("type", "choice");
  const evaluation = tagged("type", "evaluation");
  const rank = tagged("type", "rank");
  const bucket = tagged("type", "bucket");
  const classify = tagged("type", "classify");
  const edit = tagged("type", "edit");
  const frame = tagged("view", "frame");
  const html = tagged("view", "html");
  const code = tagged("view", "code");

  function option(config) {
    return Object.assign({}, config || {});
  }

  function feature(config) {
    return Object.assign({}, config || {});
  }

  const questionNormalizers = {
    text: (raw) => ({
      placeholder: String(raw.placeholder || ""),
      multiline: raw.multiline !== false,
      defaultValue: valueToText(raw.defaultValue || raw.value || "")
    }),
    choice: (raw) => ({
      select: normalizeChoiceSelect(raw.select),
      cardsPerRow: normalizeCardsPerRow(raw.cardsPerRow),
      options: normalizeOptions(raw.options)
    }),
    evaluation: (raw) => ({
      select: "one",
      options: normalizeOptions(raw.options || raw.columns),
      rows: normalizeEvaluationRows(raw.rows || raw.features || raw.criteria)
    }),
    rank: (raw) => ({ options: normalizeOptions(raw.options) }),
    bucket: (raw) => ({
      buckets: normalizeBuckets(raw.buckets || ["yes", "maybe", "no"]),
      options: normalizeOptions(raw.options)
    }),
    classify: (raw) => ({
      states: normalizeBuckets(raw.states || ["keep", "edit", "remove"]),
      options: normalizeOptions(raw.options)
    }),
    edit: (raw) => ({
      artifact: normalizeArtifact(raw.artifact || raw.body || raw.content || raw.value || ""),
      language: raw.language || ""
    })
  };

  // Normalization ------------------------------------------------------------

  function normalizeConfig(input, target) {
    const config = Object.assign({}, input || {});
    config.target = target || config.target || `#${DEFAULT_TARGET_ID}`;
    config.title = String(config.title || "Interview");
    config.intro = String(config.intro || "");
    config.questions = asArray(config.questions).map(normalizeQuestion);
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
        placeholder: "",
        multiline: true
      };
    }

    const raw = Object.assign({}, input || {});
    const prompt = String(raw.prompt || raw.question || raw.title || `Question ${index + 1}`);
    const type = String(raw.type || inferQuestionType(raw)).toLowerCase();
    const id = String(raw.id || slugify(prompt) || `q${index + 1}`);
    const normalize = questionNormalizers[type] || questionNormalizers.rank;
    return Object.assign({ type, id, prompt }, normalize(raw));
  }

  function inferQuestionType(raw) {
    if (raw.artifact || raw.content) return "edit";
    if (raw.rows || raw.features || raw.criteria || raw.columns) return "evaluation";
    if (raw.buckets) return "bucket";
    if (raw.states) return "classify";
    if (raw.options || raw.select) return "choice";
    return "text";
  }

  function normalizeChoiceSelect(select) {
    return select === "many" ? "many" : "one";
  }

  function normalizeCardsPerRow(value) {
    if (value === undefined || value === null || value === "" || value === "auto") return "auto";
    const numeric = Number(value);
    return [1, 2, 3, 4].includes(numeric) ? numeric : "auto";
  }

  function normalizeOptions(input) {
    return asArray(input).map((entry, index) => normalizeOption(entry, index));
  }

  function normalizeOption(entry, index) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      const title = String(entry);
      return { id: slugify(title) || `option-${index + 1}`, title, body: "" };
    }

    const raw = Object.assign({}, entry || {});
    const title = String(raw.title || raw.label || raw.name || raw.id || `Option ${index + 1}`);
    return {
      id: String(raw.id || slugify(title) || `option-${index + 1}`),
      title,
      body: raw.body || raw.detail || raw.description || raw.preview || "",
      tags: raw.tags || null
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

  function normalizeEvaluationRows(input) {
    return asArray(input).map((entry, index) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        const title = String(entry);
        return { id: slugify(title) || `feature-${index + 1}`, title, body: "", cells: {}, group: "" };
      }

      const raw = Object.assign({}, entry || {});
      const title = String(raw.title || raw.label || raw.name || raw.id || `Feature ${index + 1}`);
      return {
        id: String(raw.id || slugify(title) || `feature-${index + 1}`),
        title,
        body: raw.body || raw.detail || raw.description || "",
        group: raw.group || raw.section || "",
        cells: normalizeEvaluationCells(raw.cells || raw.values || raw.options || {})
      };
    });
  }

  function normalizeEvaluationCells(input) {
    if (Array.isArray(input)) {
      return Object.fromEntries(input.map((entry) => {
        const raw = Object.assign({}, entry || {});
        const id = String(raw.option || raw.optionId || raw.column || raw.id || "");
        return id ? [id, normalizeEvaluationCell(raw)] : null;
      }).filter(Boolean));
    }
    return Object.fromEntries(Object.entries(safeObject(input)).map(([key, value]) => [key, normalizeEvaluationCell(value)]));
  }

  function normalizeEvaluationCell(input) {
    if (input === undefined || input === null || input === "") return { icon: "", text: "", detail: "" };
    if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
      const text = String(input);
      return isEvaluationIcon(text) ? { icon: text, text: "", detail: "" } : { icon: "", text, detail: "" };
    }
    const raw = Object.assign({}, input || {});
    const icon = raw.icon || raw.status || raw.value || "";
    return {
      icon: isEvaluationIcon(icon) ? String(icon) : "",
      text: valueToText(raw.text || raw.label || raw.title || (isEvaluationIcon(icon) ? "" : icon)),
      detail: valueToText(raw.detail || raw.description || raw.note || raw.tooltip || "")
    };
  }

  function normalizeArtifact(input) {
    if (typeof input === "string") return { view: "code", lang: "", value: input };
    if (input && input.view === "code") return input;
    if (input && input.value !== undefined) return Object.assign({ view: "code", lang: "" }, input);
    return { view: "code", lang: "", value: valueToText(input) };
  }

  // State and export logic ---------------------------------------------------

  const initialAnswers = {
    text: (questionDef) => ({ answer: questionDef.defaultValue || "" }),
    choice: (questionDef) => questionDef.select === "many"
      ? { selected: [], comments: {}, added: [] }
      : { selected: "", comments: {} },
    evaluation: (_questionDef) => ({ selected: "", optionComments: {}, rowComments: {}, touched: false }),
    rank: (questionDef) => ({ order: optionIds(questionDef.options), comments: {}, touched: false }),
    bucket: (questionDef) => ({ buckets: objectFrom(questionDef.options, ""), comments: {} }),
    classify: (questionDef) => ({
      states: objectFrom(questionDef.options, ""),
      edits: objectFrom(questionDef.options, "title"),
      comments: {},
      added: []
    }),
    edit: (questionDef) => ({ content: artifactText(questionDef.artifact), summary: "", touched: false })
  };

  const answerHydrators = {
    choice(questionDef, answer, saved) {
      if (questionDef.select !== "many") return;
      answer.selected = asArray(saved.selected);
      answer.added = normalizeAddedOptions(saved.added);
      answer.touched = Boolean(answer.selected.length || answer.added.length || commentCount(answer));
    },
    evaluation(questionDef, answer, saved) {
      answer.optionComments = safeObject(saved.optionComments);
      answer.rowComments = safeObject(saved.rowComments);
      answer.selected = String(Array.isArray(saved.selected) ? saved.selected[0] || "" : saved.selected || "");
      answer.touched = Boolean(
        saved.touched ||
        answer.selected ||
        commentCount({ comments: answer.optionComments }) ||
        commentCount({ comments: answer.rowComments })
      );
    },
    rank(questionDef, answer, saved) {
      answer.order = orderedKnownIds(saved.order, questionDef.options);
      answer.touched = Boolean(saved.touched || commentCount(answer) || orderChanged(questionDef, saved.order));
    },
    bucket(questionDef, answer, saved, initial) {
      answer.buckets = Object.assign({}, initial.buckets, safeObject(saved.buckets));
      answer.touched = Boolean(Object.values(answer.buckets).some(Boolean) || commentCount(answer));
    },
    classify(questionDef, answer, saved, initial) {
      answer.states = Object.assign({}, initial.states, safeObject(saved.states));
      answer.edits = Object.assign({}, initial.edits, safeObject(saved.edits));
      answer.added = normalizeAddedOptions(saved.added);
      answer.added.forEach((entry) => {
        if (answer.edits[entry.id] === undefined) answer.edits[entry.id] = entry.title;
      });
      answer.touched = Boolean(
        answer.added.length ||
        Object.values(answer.states).some(Boolean) ||
        commentCount(answer) ||
        questionDef.options.some((entry) => answer.edits[entry.id] && answer.edits[entry.id] !== entry.title)
      );
    },
    edit(questionDef, answer, saved) {
      answer.summary = String(saved.summary || "");
      answer.touched = Boolean(saved.touched || saved.summary || String(answer.content || "") !== artifactText(questionDef.artifact));
    }
  };

  function createInitialState(questions) {
    const answers = Object.fromEntries(questions.map((questionDef) => [questionDef.id, initialAnswer(questionDef)]));
    return { version: VERSION, step: 0, viewMode: "paged", commentEditor: null, detailPopover: null, answers };
  }

  function initialAnswer(questionDef) {
    const build = initialAnswers[questionDef.type];
    return build ? build(questionDef) : { answer: "" };
  }

  function mergeState(saved, current, questions) {
    if (!saved || typeof saved !== "object") return current;
    const next = Object.assign({}, current, {
      version: VERSION,
      viewMode: saved.viewMode === "all" || saved.viewMode === "paged" ? saved.viewMode : current.viewMode,
      commentEditor: null,
      detailPopover: null,
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
    const savedAnswer = safeObject(saved);
    const answer = Object.assign({}, initial, savedAnswer);
    if (initial.comments) answer.comments = Object.assign({}, initial.comments, safeObject(savedAnswer.comments));
    if (initial.optionComments) answer.optionComments = Object.assign({}, initial.optionComments, safeObject(savedAnswer.optionComments));
    if (initial.rowComments) answer.rowComments = Object.assign({}, initial.rowComments, safeObject(savedAnswer.rowComments));
    const hydrate = answerHydrators[questionDef.type];
    if (hydrate) hydrate(questionDef, answer, savedAnswer, initial);
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

  const answerSerializers = {
    text: serializeTextAnswer,
    choice: serializeChoiceAnswer,
    evaluation: serializeEvaluationAnswer,
    rank: serializeRankAnswer,
    bucket: serializeBucketAnswer,
    classify: serializeClassifyAnswer,
    edit: serializeEditAnswer
  };

  function serializeAnswer(questionDef, answer, index) {
    if (!answer || !isAnswerChanged(questionDef, answer)) return null;
    const base = {
      id: questionDef.id,
      type: questionDef.type,
      question: questionDef.prompt,
      position: index + 1
    };
    const serialize = answerSerializers[questionDef.type];
    return Object.assign(base, serialize ? serialize(questionDef, answer) : { answer });
  }

  function serializeTextAnswer(_questionDef, answer) {
    return { answer: answer.answer || "" };
  }

  function serializeChoiceAnswer(questionDef, answer) {
    const comments = optionComments(answerOptions(questionDef, answer), answer.comments);
    const payload = { select: questionDef.select };
    if (questionDef.select === "many") {
      const selectedIds = asArray(answer.selected);
      const selected = selectedIds.map((id) => findOption(questionDef, answer, id)).filter(Boolean);
      const added = asArray(answer.added)
        .filter((entry) => entry.title || selectedIds.includes(entry.id) || optionComment(answer, entry.id))
        .map((entry) => {
          const optionPayload = { id: entry.id, title: entry.title, selected: selectedIds.includes(entry.id) };
          const comment = optionComment(answer, entry.id);
          if (comment) optionPayload.comment = comment;
          return optionPayload;
        });
      if (selected.length) payload.selected = selected;
      if (added.length) payload.added = added;
    } else if (answer.selected) {
      payload.selected = findOption(questionDef, answer, answer.selected);
    }
    if (comments.length) payload.comments = comments;
    return payload;
  }

  function serializeEvaluationAnswer(questionDef, answer) {
    const selected = answer.selected ? evaluationOptionPayload(questionDef, answer.selected) : null;
    const payload = {};
    const optionCommentsList = optionComments(questionDef.options, answer.optionComments);
    const rowCommentsList = evaluationRowComments(questionDef.rows, answer.rowComments);
    if (selected) payload.selected = selected;
    if (optionCommentsList.length) payload.optionComments = optionCommentsList;
    if (rowCommentsList.length) payload.rowComments = rowCommentsList;
    return payload;
  }

  function serializeRankAnswer(questionDef, answer) {
    const order = asArray(answer.order);
    const comments = optionComments(answerOptions(questionDef, answer), answer.comments);
    const payload = {};
    if (orderChanged(questionDef, order)) payload.order = order.map((id) => findOption(questionDef, answer, id)).filter(Boolean);
    if (comments.length) payload.comments = comments;
    return payload;
  }

  function serializeBucketAnswer(questionDef, answer) {
    const buckets = {};
    questionDef.buckets.forEach((bucket) => { buckets[bucket.title] = []; });
    const unset = [];
    questionDef.options.forEach((entry) => {
      const bucket = questionDef.buckets.find((candidate) => candidate.id === answer.buckets[entry.id]);
      const comment = optionComment(answer, entry.id);
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
    return payload;
  }

  function serializeClassifyAnswer(questionDef, answer) {
    const options = answerOptions(questionDef, answer).map((entry) => {
      const state = answer.states && answer.states[entry.id] || "";
      const edited = answer.edits && answer.edits[entry.id] || entry.title;
      const comment = optionComment(answer, entry.id);
      if (!entry.custom && !state && !comment && edited === entry.title) return null;
      const payload = { id: entry.id, title: entry.title };
      if (entry.custom) payload.added = edited;
      if (state) payload.state = state;
      if (!entry.custom && edited !== entry.title) payload.edited = edited;
      if (comment) payload.comment = comment;
      return payload;
    }).filter(Boolean);
    return { options };
  }

  function serializeEditAnswer(questionDef, answer) {
    const output = { summary: answer.summary || "" };
    if (String(answer.content || "") !== artifactText(questionDef.artifact)) output.content = answer.content || "";
    return output;
  }

  const textExporters = {
    text: appendTextAnswer,
    choice: appendChoiceAnswer,
    evaluation: appendEvaluationAnswer,
    rank: appendRankAnswer,
    bucket: appendBucketAnswer,
    classify: appendClassifyAnswer,
    edit: appendEditAnswer
  };

  function buildTextExport(config, state) {
    const result = buildResult(config, state);
    const lines = [`# ${result.title}`, ""];
    if (!result.answers.length) {
      lines.push("No user changes yet.");
      return lines.join("\n").trim() + "\n";
    }

    result.answers.forEach((entry) => {
      lines.push(`## ${entry.position}. ${entry.question}`);
      const append = textExporters[entry.type];
      if (append) append(lines, entry);
      lines.push("");
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function appendTextAnswer(lines, entry) {
    lines.push(entry.answer ? entry.answer : "No answer provided.");
  }

  function appendChoiceAnswer(lines, entry) {
    if (entry.select === "many" && entry.selected && entry.selected.length) {
      lines.push("Selected:");
      entry.selected.forEach((option) => lines.push(`- ${option.title}`));
    }
    if (entry.select === "one" && entry.selected) lines.push(`Selected: ${entry.selected.title}`);
    if (entry.added && entry.added.length) {
      lines.push("Added custom options:");
      entry.added.forEach((added) => {
        const selected = added.selected ? "selected" : "not selected";
        const comment = added.comment ? ` Comment: ${added.comment}` : "";
        lines.push(`- ${added.title || added} (${selected})${comment}`);
      });
    }
    appendComments(lines, entry.comments || []);
  }

  function appendEvaluationAnswer(lines, entry) {
    if (entry.selected) lines.push(`Selected: ${entry.selected.title}`);
    appendComments(lines, entry.optionComments || [], "Column comments:");
    appendComments(lines, entry.rowComments || [], "Feature row comments:");
  }

  function appendRankAnswer(lines, entry) {
    if (entry.order && entry.order.length) {
      lines.push("Order:");
      entry.order.forEach((option, index) => lines.push(`${index + 1}. ${option.title}`));
    }
    appendComments(lines, entry.comments || []);
  }

  function appendBucketAnswer(lines, entry) {
    Object.keys(entry.buckets || {}).forEach((bucket) => {
      lines.push(`${bucket}:`);
      if (entry.buckets[bucket].length) {
        entry.buckets[bucket].forEach((option) => {
          const comment = option.comment ? ` Comment: ${option.comment}` : "";
          lines.push(`- ${option.title}${comment}`);
        });
      } else {
        lines.push("- none");
      }
    });
    if (entry.unset && entry.unset.length) {
      lines.push("Unsorted:");
      entry.unset.forEach((option) => lines.push(`- ${option.title}`));
    }
  }

  function appendClassifyAnswer(lines, entry) {
    entry.options.forEach((option) => {
      const label = option.added || option.title || "Custom option";
      lines.push(`- ${label}`);
      if (option.state) lines.push(`  State: ${option.state}`);
      if (option.edited) lines.push(`  Edited: ${option.edited}`);
      if (option.comment) lines.push(`  Comment: ${option.comment}`);
    });
  }

  function appendEditAnswer(lines, entry) {
    if (entry.content !== undefined) {
      lines.push("Edited artifact:");
      lines.push("```");
      lines.push(entry.content || "");
      lines.push("```");
    }
    if (entry.summary) lines.push(`Overall comment: ${entry.summary}`);
  }

  function appendComments(lines, comments, heading) {
    const filled = comments.filter((entry) => entry.comment);
    if (!filled.length) return;
    lines.push(heading || "Comments:");
    filled.forEach((entry) => lines.push(`- ${entry.title}: ${entry.comment}`));
  }

  const answerChangeChecks = {
    text: (_questionDef, answer) => Boolean(String(answer.answer || "").trim()),
    choice(questionDef, answer) {
      return questionDef.select === "many"
        ? Boolean(asArray(answer.selected).length || asArray(answer.added).length || optionComments(answerOptions(questionDef, answer), answer.comments).length)
        : Boolean(answer.selected || optionComments(answerOptions(questionDef, answer), answer.comments).length);
    },
    evaluation(questionDef, answer) {
      return Boolean(
        answer.selected ||
        optionComments(questionDef.options, answer.optionComments).length ||
        evaluationRowComments(questionDef.rows, answer.rowComments).length
      );
    },
    rank: (questionDef, answer) => Boolean(orderChanged(questionDef, answer.order) || optionComments(questionDef.options, answer.comments).length),
    bucket: (questionDef, answer) => Boolean(
      Object.values(safeObject(answer.buckets)).some(Boolean) ||
      optionComments(questionDef.options, answer.comments).length
    ),
    classify(questionDef, answer) {
      return answerOptions(questionDef, answer).some((entry) => {
        const edited = answer.edits && answer.edits[entry.id] || entry.title;
        const state = answer.states && answer.states[entry.id] || "";
        return Boolean(entry.custom || state || optionComment(answer, entry.id) || edited !== entry.title);
      });
    },
    edit: (questionDef, answer) => Boolean(String(answer.content || "") !== artifactText(questionDef.artifact) || answer.summary)
  };

  function isAnswerChanged(questionDef, answer) {
    const check = answer && answerChangeChecks[questionDef.type];
    return Boolean(check && check(questionDef, answer));
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
    .ih-export-note { margin: 10px 0 0; max-width: 900px; color: var(--ih-muted); line-height: 1.5; font-size: clamp(14px, 1vw, 16px); }

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
    .ih-grid[data-cards-per-row] {
      column-width: auto;
      display: grid;
      gap: 14px;
    }
    .ih-grid[data-cards-per-row="1"] { grid-template-columns: minmax(0, 1fr); }
    .ih-grid[data-cards-per-row="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ih-grid[data-cards-per-row="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ih-grid[data-cards-per-row="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .ih-grid > .ih-card {
      width: 100%;
      margin: 0 0 14px;
      break-inside: avoid;
    }
    .ih-grid[data-cards-per-row] > .ih-card {
      margin: 0;
      break-inside: auto;
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
    .ih-option-top { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
    .ih-option-actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .ih-option-title { margin: 0; font-size: clamp(16px, 1.25vw, 20px); line-height: 1.18; letter-spacing: 0; }
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
    .ih-tags { display: flex; flex-wrap: wrap; gap: 6px; }
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
    .ih-frame-shell { overflow: hidden; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-frame-bar { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 4px 3px 9px; border-bottom: 1px solid var(--ih-line); background: color-mix(in srgb, var(--ih-surface) 74%, var(--ih-surface-2)); }
    .ih-frame-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ih-muted); font-size: 11px; font-weight: 760; line-height: 1.1; }
    .ih-frame-open { flex: 0 0 auto; width: 24px; min-height: 22px; display: inline-grid; place-items: center; border: 0; border-radius: 6px; padding: 0; background: var(--ih-surface); color: var(--ih-accent); text-decoration: none; font: inherit; line-height: 1; cursor: pointer; }
    .ih-frame-open:hover { background: var(--ih-accent-soft); color: var(--ih-accent); }
    .ih-frame-open svg { width: 14px; height: 14px; }
    .ih-frame { display: block; width: 100%; height: min(54vh, 520px); border: 0; background: var(--ih-surface-2); }
    .ih-html-preview { overflow: auto; }
    .ih-html-preview > * + * { margin-top: 9px; }
    .ih-html-preview figure { margin: 0; display: grid; gap: 6px; }
    .ih-html-preview img { display: block; width: 100%; max-height: 240px; object-fit: cover; border: 0; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-html-preview figcaption { color: var(--ih-muted); font-size: 12px; }
    .ih-html-preview table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ih-html-preview th, .ih-html-preview td { border-bottom: 0; padding: 6px 7px; text-align: left; vertical-align: top; }
    .ih-html-preview th { color: var(--ih-ink); font-weight: 850; }
    .ih-html-preview .ih-mini-callout { border-left: 0; padding: 8px 10px; background: var(--ih-surface-2); color: var(--ih-ink); }
    .ih-evaluation-board {
      --ih-evaluation-column-width: 238px;
      min-width: 0;
      border-radius: var(--ih-radius);
      background: color-mix(in srgb, var(--ih-surface) 72%, var(--ih-surface-2));
      overflow: visible;
    }
    .ih-evaluation-head { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 14px; border-bottom: 1px solid color-mix(in srgb, var(--ih-line) 80%, transparent); }
    .ih-evaluation-note { margin: 0; color: var(--ih-muted); font-size: 13px; line-height: 1.4; max-width: 760px; }
    .ih-evaluation-header-frame {
      position: sticky;
      top: 0;
      z-index: 12;
      max-width: 100%;
      overflow: hidden;
      background: var(--ih-surface);
    }
    .ih-evaluation-frame {
      overflow-x: auto;
      max-width: 100%;
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
    }
    .ih-evaluation-table {
      width: max(100%, calc(430px + (var(--ih-evaluation-option-count, 3) * var(--ih-evaluation-column-width))));
      min-width: calc(430px + (var(--ih-evaluation-option-count, 3) * var(--ih-evaluation-column-width)));
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }
    .ih-evaluation-feature-col { width: 430px; }
    .ih-evaluation-option-col { width: var(--ih-evaluation-column-width); }
    .ih-evaluation-table th, .ih-evaluation-table td { border-bottom: 1px solid color-mix(in srgb, var(--ih-line) 72%, transparent); border-right: 1px solid color-mix(in srgb, var(--ih-line) 48%, transparent); padding: 11px 12px; text-align: left; vertical-align: top; }
    .ih-evaluation-table td { vertical-align: middle; }
    .ih-evaluation-table th:last-child, .ih-evaluation-table td:last-child { border-right: 0; }
    .ih-evaluation-table thead th { background: var(--ih-surface); padding: 10px; }
    .ih-evaluation-table thead th.is-selected { background: var(--ih-accent); color: var(--ih-accent-ink); }
    .ih-evaluation-table td.is-selected { background: color-mix(in srgb, var(--ih-accent) 7%, var(--ih-surface)); }
    .ih-evaluation-table thead th:first-child, .ih-evaluation-table tbody th { position: sticky; left: 0; z-index: 4; box-shadow: 1px 0 0 color-mix(in srgb, var(--ih-line) 56%, transparent); }
    .ih-evaluation-table tbody th:not(.ih-evaluation-group-cell) { z-index: 2; }
    .ih-evaluation-feature-head { color: var(--ih-muted); }
    .ih-evaluation-table thead th[data-action] { cursor: pointer; }
    .ih-evaluation-table thead th[data-action]:focus-visible { outline: 3px solid var(--ih-accent-soft); outline-offset: -3px; }
    .ih-evaluation-column { min-width: 0; width: 100%; display: grid; gap: 6px; color: inherit; }
    .ih-evaluation-column-main { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
    .ih-evaluation-column-actions { display: inline-flex; align-items: center; gap: 2px; }
    .ih-evaluation-column-title { min-width: 0; font-size: 14px; font-weight: 850; line-height: 1.18; overflow-wrap: normal; word-break: normal; hyphens: auto; }
    .ih-evaluation-column-tags { min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .ih-evaluation-column-tag { max-width: 100%; border-radius: 999px; background: color-mix(in srgb, var(--ih-ink) 8%, transparent); color: currentColor; opacity: .74; padding: 3px 6px; font-size: 10px; font-weight: 760; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ih-evaluation-group-row th { background: color-mix(in srgb, var(--ih-ink) 6%, var(--ih-surface-2)); color: var(--ih-accent); font-size: 12px; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; padding: 8px 12px; }
    .ih-evaluation-group-row td { background: color-mix(in srgb, var(--ih-ink) 4%, var(--ih-surface-2)); padding: 8px 0; }
    .ih-evaluation-group-cell { z-index: 3; }
    .ih-evaluation-table tbody th { background: color-mix(in srgb, var(--ih-surface) 80%, var(--ih-bg)); }
    .ih-evaluation-row-title { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; color: var(--ih-ink); font-size: 14px; font-weight: 850; line-height: 1.2; }
    .ih-evaluation-table tbody th p { margin: 6px 0 0; color: var(--ih-muted); font-size: 12px; line-height: 1.35; font-weight: 500; }
    .ih-evaluation-cell-shell { width: 100%; min-height: 30px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .ih-evaluation-cell { min-height: 30px; display: inline-flex; align-items: center; gap: 6px; color: var(--ih-ink); font-size: 12px; font-weight: 850; line-height: 1.25; max-width: 100%; overflow-wrap: normal; word-break: normal; }
    .ih-evaluation-cell svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto; }
    .ih-evaluation-cell[data-icon="yes"] { color: color-mix(in srgb, var(--ih-good) 78%, var(--ih-muted)); }
    .ih-evaluation-cell[data-icon="no"] { color: var(--ih-danger); }
    .ih-evaluation-cell[data-icon="partial"] { color: var(--ih-muted); }
    .ih-evaluation-cell[data-icon="warn"] { color: color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)); }
    .ih-evaluation-cell[data-icon="unknown"] { color: var(--ih-muted); }
    .ih-evaluation-cell[data-icon="best"] { color: #ffd966; font-weight: 950; }
    .ih-evaluation-cell[data-icon="best"] svg {
      width: 19px;
      height: 19px;
      fill: #ffd23f;
      stroke: #5a3d00;
      stroke-width: 1.35;
      filter: drop-shadow(0 0 8px rgb(255 210 63 / 46%));
    }
    .ih-evaluation-detail-button {
      width: 22px;
      height: 22px;
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: color-mix(in srgb, var(--ih-muted) 82%, var(--ih-surface));
      padding: 0;
      cursor: help;
    }
    .ih-evaluation-detail-button svg {
      width: 17px;
      height: 17px;
      fill: currentColor;
      display: block;
    }
    .ih-evaluation-table td.is-selected .ih-evaluation-detail-button { color: color-mix(in srgb, var(--ih-accent) 58%, var(--ih-muted)); }
    .ih-evaluation-table thead .ih-evaluation-detail-button { width: 20px; height: 20px; color: currentColor; opacity: .62; }
    .ih-evaluation-table thead .ih-evaluation-detail-button svg { width: 15px; height: 15px; }
    .ih-evaluation-table thead th.is-selected .ih-evaluation-detail-button { color: currentColor; opacity: .76; }
    .ih-evaluation-detail-button:hover { color: var(--ih-muted); }
    .ih-evaluation-table thead .ih-evaluation-detail-button:hover { color: currentColor; opacity: 1; }
    .ih-add-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: start; margin-top: 14px; }
    .ih-add-row textarea { min-height: 70px; }
    .ih-add-row .ih-btn { justify-self: start; }
    .ih-compact-list { display: grid; gap: 8px; }
    .ih-rank-option, .ih-bucket-card {
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
    .ih-rank-option .ih-option-title, .ih-bucket-card .ih-option-title { font-size: 14px; line-height: 1.25; }
    .ih-rank-option .ih-rich, .ih-bucket-card .ih-rich { font-size: 12px; line-height: 1.35; }
    .ih-bucket-card > .ih-option-title { grid-column: 2; grid-row: 1; align-self: center; }
    .ih-rank-option > .ih-option-title { grid-column: 2; grid-row: 1; }
    .ih-bucket-card > .ih-bucket-actions { grid-column: 3; grid-row: 1; align-self: center; justify-self: end; display: inline-flex; align-items: center; gap: 6px; }
    .ih-rank-option > .ih-comment-button { grid-column: 3; grid-row: 1; justify-self: end; }
    .ih-rank-option > .ih-rich, .ih-bucket-card > .ih-rich { grid-column: 1 / -1; grid-row: 2; }
    .ih-rank-option.is-dragging, .ih-bucket-card.is-dragging { opacity: .55; }
    .ih-rank-option.is-drop-target, .ih-bucket.is-drop-target { box-shadow: 0 0 0 3px var(--ih-accent-soft); }
    .ih-rank-option { grid-template-columns: 20px minmax(0, 1fr) auto; align-items: start; }
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
    .ih-bucket-frame { --ih-bucket-column-width: min(420px, calc(100vw - 64px)); overflow-x: auto; padding-bottom: 4px; overscroll-behavior-x: contain; }
    .ih-bucket-board { display: flex; align-items: stretch; gap: 12px; min-width: max-content; }
    .ih-bucket { width: var(--ih-bucket-column-width); flex: 0 0 var(--ih-bucket-column-width); display: grid; grid-template-rows: auto minmax(128px, 1fr); border: 0; border-radius: var(--ih-radius); background: color-mix(in srgb, var(--ih-surface) 74%, var(--ih-surface-2)); padding: 10px; min-height: 180px; }
    .ih-bucket-title { font-weight: 850; margin-bottom: 8px; font-size: 14px; }
    .ih-bucket-list { display: grid; gap: 7px; min-height: 128px; align-content: start; }
    .ih-bucket-empty { color: var(--ih-muted); font-size: 12px; padding: 7px 0; }
    .ih-classify-card { display: grid; gap: 10px; }
    .ih-classify-row { display: grid; gap: 9px; }
    .ih-classify-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ih-classify-states {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      border-radius: 999px;
      background: var(--ih-surface-2);
      padding: 4px;
    }
    .ih-app .ih-classify-state, .ih-app .ih-added-pill { font-size: 12px; font-weight: 850; line-height: 1; }
    .ih-classify-state {
      min-height: 30px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      padding: 0 10px;
      color: var(--ih-muted);
      white-space: nowrap;
      transition: background-color .14s ease, color .14s ease, box-shadow .14s ease;
    }
    .ih-classify-state:hover { background: color-mix(in srgb, var(--ih-accent) 14%, var(--ih-surface)); color: var(--ih-ink); }
    .ih-classify-state.is-selected { color: var(--ih-accent-ink); background: var(--ih-accent); box-shadow: 0 1px 4px rgb(8 14 13 / 18%); }
    .ih-added-pill { min-height: 30px; border-radius: 999px; display: inline-grid; place-items: center; padding: 0 12px; background: var(--ih-surface-2); color: var(--ih-muted); }

    .ih-edit { display: grid; gap: 10px; }
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
    [data-edit].has-editor .ih-code-editor-host { display: block; }
    [data-edit].has-editor .ih-code-fallback { display: none; }
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
    .ih-evaluation-tooltip {
      position: fixed;
      z-index: 70;
      width: var(--ih-tooltip-width, 340px);
      left: var(--ih-tooltip-left, 12px);
      top: var(--ih-tooltip-top, 12px);
      border: 1px solid var(--ih-line-strong);
      border-radius: 8px;
      background: var(--ih-code-bg);
      color: var(--ih-code-ink);
      box-shadow: var(--ih-shadow);
      padding: 9px 10px;
      pointer-events: none;
    }
    .ih-evaluation-tooltip.is-above { transform: translateY(-100%); }
    .ih-evaluation-tooltip::before {
      content: "";
      position: absolute;
      left: var(--ih-tooltip-arrow, 18px);
      width: 10px;
      height: 10px;
      background: var(--ih-code-bg);
      border: 1px solid var(--ih-line-strong);
      transform: translateX(-50%) rotate(45deg);
    }
    .ih-evaluation-tooltip.is-below::before { top: -6px; border-right: 0; border-bottom: 0; }
    .ih-evaluation-tooltip.is-above::before { bottom: -6px; border-left: 0; border-top: 0; }
    .ih-evaluation-tooltip-title { margin: 0 0 4px; color: var(--ih-accent); font-size: 11px; font-weight: 850; line-height: 1.2; }
    .ih-evaluation-tooltip-body { margin: 0; font-size: 12px; font-weight: 650; line-height: 1.42; white-space: pre-wrap; }

    @media (max-width: 900px) {
      .ih-topbar-inner, .ih-export { grid-template-columns: 1fr; }
      .ih-actions { justify-content: start; }
      .ih-title, .ih-intro { white-space: normal; }
      .ih-prompt { font-size: clamp(22px, 6vw, 32px); }
      .ih-grid[data-cards-per-row="3"], .ih-grid[data-cards-per-row="4"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ih-evaluation-board { --ih-evaluation-column-width: 220px; }
      .ih-bottom-inner { align-items: stretch; }
    }
    @media (max-width: 680px) {
      .ih-grid[data-cards-per-row] { grid-template-columns: minmax(0, 1fr); }
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
          </div>
        </div>
        ${renderQuestionBody(questionDef, instance.state.answers[questionDef.id])}
      </section>
    `;
  }

  const questionRenderers = {
    text: renderText,
    choice: renderChoice,
    evaluation: renderEvaluation,
    rank: renderRank,
    bucket: renderBucket,
    classify: renderClassify,
    edit: renderEdit
  };

  function renderQuestionBody(questionDef, answer) {
    return (questionRenderers[questionDef.type] || renderText)(questionDef, answer);
  }

  function renderText(questionDef, answer) {
    const tag = questionDef.multiline ? "textarea" : "input";
    const className = questionDef.multiline ? "ih-field ih-field-large" : "ih-field";
    if (tag === "input") {
      return `<input class="${className}" data-input="text" value="${escapeAttr(answer.answer || "")}" placeholder="${escapeAttr(questionDef.placeholder || "")}">`;
    }
    return `<textarea class="${className}" data-input="text" placeholder="${escapeAttr(questionDef.placeholder || "")}">${escapeHTML(answer.answer || "")}</textarea>`;
  }

  function renderChoice(questionDef, answer) {
    const multiple = questionDef.select === "many";
    const selected = multiple ? asArray(answer.selected) : [answer.selected];
    const useGrid = questionDef.cardsPerRow !== "auto" || questionDef.options.some((entry) => entry.body);
    const gridClass = useGrid ? "ih-grid" : "ih-stack";
    const layoutAttr = questionDef.cardsPerRow === "auto" ? "" : ` data-cards-per-row="${escapeAttr(questionDef.cardsPerRow)}"`;
    const options = answerOptions(questionDef, answer).map((entry) => renderChoiceOption(entry, answer, selected.includes(entry.id))).join("");
    const addRow = multiple ? renderAddRow("Add another option") : "";
    return `<div class="${gridClass}"${layoutAttr}>${options}</div>${addRow}`;
  }

  function renderChoiceOption(entry, answer, isSelected) {
    const action = entry.custom ? "" : ` data-action="choose-option" tabindex="0"`;
    return `
      <article class="ih-card ih-choice ${isSelected ? "is-selected" : ""}" data-option-id="${escapeAttr(entry.id)}"${action}>
        <div class="ih-option-top">
          ${entry.custom ? `<textarea class="ih-field ih-custom-title ih-auto-field" data-input="added-title" data-option-id="${escapeAttr(entry.id)}" rows="2" aria-label="Custom option text">${escapeHTML(entry.title)}</textarea>` : `<h3 class="ih-option-title">${escapeHTML(entry.title)}</h3>`}
          <div class="ih-option-actions">
            ${entry.custom ? "" : renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on option")}
            ${entry.custom ? `<button class="ih-remove-icon" type="button" data-action="remove-added" data-option-id="${escapeAttr(entry.id)}" aria-label="Remove custom option">${trashIcon()}</button>` : ""}
            ${entry.custom ? "" : `<span class="ih-select-dot">${isSelected ? "✓" : "+"}</span>`}
          </div>
        </div>
        ${renderTags(entry.tags)}
        ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
      </article>
    `;
  }

  function renderAddRow(label) {
    return `
      <div class="ih-card ih-add-row">
        <textarea class="ih-field ih-add-custom ih-auto-field" data-input="add-text" rows="2" placeholder="${escapeAttr(label)}"></textarea>
        <button class="ih-btn ih-btn-accent" type="button" data-action="add-option">Add option</button>
      </div>
    `;
  }

  function renderEvaluation(questionDef, answer) {
    const selectedIds = asArray(answer.selected ? [answer.selected] : []);
    const body = [];
    let previousGroup = null;
    questionDef.rows.forEach((row) => {
      if (row.group && row.group !== previousGroup) {
        body.push(`<tr class="ih-evaluation-group-row"><th class="ih-evaluation-group-cell">${escapeHTML(row.group)}</th><td colspan="${questionDef.options.length}"></td></tr>`);
        previousGroup = row.group;
      }
      body.push(renderEvaluationRow(questionDef, answer, row, selectedIds));
    });
    return `
      <div class="ih-evaluation-board">
        <div class="ih-evaluation-head">
          <p class="ih-evaluation-note">Select one column. Comment on columns or feature rows when the comparison needs clarification.</p>
        </div>
        <div class="ih-evaluation-header-frame" data-evaluation-header-frame>
          <table class="ih-evaluation-table" style="--ih-evaluation-option-count: ${questionDef.options.length}">
            <colgroup>
              <col class="ih-evaluation-feature-col">
              ${questionDef.options.map(() => `<col class="ih-evaluation-option-col">`).join("")}
            </colgroup>
            <thead>
              <tr>
                <th class="ih-evaluation-feature-head" aria-label="Rows"></th>
                ${questionDef.options.map((entry) => renderEvaluationColumn(questionDef, answer, entry, selectedIds.includes(entry.id))).join("")}
              </tr>
            </thead>
          </table>
        </div>
        <div class="ih-evaluation-frame" tabindex="0" aria-label="Evaluation table">
          <table class="ih-evaluation-table" style="--ih-evaluation-option-count: ${questionDef.options.length}">
            <colgroup>
              <col class="ih-evaluation-feature-col">
              ${questionDef.options.map(() => `<col class="ih-evaluation-option-col">`).join("")}
            </colgroup>
            <tbody>${body.join("")}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderEvaluationColumn(questionDef, answer, entry, isSelected) {
    const bodyText = richPlainText(entry.body);
    return `
      <th class="${isSelected ? "is-selected" : ""}" data-action="choose-evaluation-option" data-option-id="${escapeAttr(entry.id)}" tabindex="0" role="button" aria-pressed="${isSelected ? "true" : "false"}">
        <div class="ih-evaluation-column ${isSelected ? "is-selected" : ""}">
          <div class="ih-evaluation-column-main">
            <span class="ih-evaluation-column-title">${escapeHTML(entry.title)}</span>
            <span class="ih-evaluation-column-actions">
              ${bodyText ? `<span class="ih-evaluation-detail-button" data-detail-title="${escapeAttr(entry.title)}" data-detail="${escapeAttr(bodyText)}" aria-label="Details for ${escapeAttr(entry.title)}">${infoIcon()}</span>` : ""}
              ${renderCommentButton("evaluation-option-comment", entry.id, answer.optionComments && answer.optionComments[entry.id], "Comment on column option")}
            </span>
          </div>
          ${renderEvaluationColumnTags(entry.tags)}
        </div>
      </th>
    `;
  }

  function renderEvaluationColumnTags(tags) {
    const values = Array.isArray(tags) ? tags.slice(0, 3) : [];
    if (!values.length) return "";
    return `<span class="ih-evaluation-column-tags">${values.map((entry) => `<span class="ih-evaluation-column-tag">${escapeHTML(valueToText(entry))}</span>`).join("")}</span>`;
  }

  function renderEvaluationRow(questionDef, answer, row, selectedIds) {
    return `
      <tr>
        <th>
          <div class="ih-evaluation-row-title">
            <span>${escapeHTML(row.title)}</span>
            ${renderCommentButton("evaluation-row-comment", row.id, answer.rowComments && answer.rowComments[row.id], "Comment on feature row")}
          </div>
          ${row.body ? `<p>${escapeHTML(richPlainText(row.body))}</p>` : ""}
        </th>
        ${questionDef.options.map((optionDef) => {
          const cell = row.cells && row.cells[optionDef.id] || {};
          return `<td class="${selectedIds.includes(optionDef.id) ? "is-selected" : ""}">${renderEvaluationCell(cell)}</td>`;
        }).join("")}
      </tr>
    `;
  }

  function renderEvaluationCell(cell) {
    const icon = isEvaluationIcon(cell && cell.icon) ? cell.icon : "";
    const text = cell && cell.text ? cell.text : evaluationIconLabel(icon);
    const detail = cell && cell.detail ? String(cell.detail) : "";
    const label = text || evaluationIconLabel(icon) || "value";
    const value = icon || text
      ? `<span class="ih-evaluation-cell" data-icon="${escapeAttr(icon)}">${icon ? evaluationIcon(icon) : ""}${text ? `<span>${escapeHTML(text)}</span>` : ""}</span>`
      : `<span class="ih-evaluation-cell">-</span>`;
    if (!detail) return value;
    return `
      <span class="ih-evaluation-cell-shell">
        ${value}
        <span class="ih-evaluation-detail-button" data-detail-title="${escapeAttr(label)}" data-detail="${escapeAttr(detail)}" aria-label="Details for ${escapeAttr(label)}">${infoIcon()}</span>
      </span>
    `;
  }

  function renderRank(questionDef, answer) {
    const order = asArray(answer.order).filter((id) => questionDef.options.some((entry) => entry.id === id));
    questionDef.options.forEach((entry) => { if (!order.includes(entry.id)) order.push(entry.id); });
    return `
      <div class="ih-rank-list ih-compact-list" data-sortable-rank>
        ${order.map((id) => {
          const entry = questionDef.options.find((candidate) => candidate.id === id);
          return `
            <article class="ih-rank-option" data-option-id="${escapeAttr(entry.id)}">
              <button class="ih-grip" type="button" aria-label="Drag to reorder"></button>
              <h3 class="ih-option-title">${escapeHTML(entry.title)}</h3>
              ${renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on rank option")}
              ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderBucket(questionDef, answer) {
    const byBucket = {};
    questionDef.buckets.forEach((bucket) => { byBucket[bucket.id] = []; });
    const unset = [];
    questionDef.options.forEach((entry) => {
      const bucketId = answer.buckets && answer.buckets[entry.id] || "";
      if (byBucket[bucketId]) byBucket[bucketId].push(entry);
      else unset.push(entry);
    });

    return `
      <div class="ih-bucket-frame" tabindex="0" aria-label="Buckets">
        <div class="ih-bucket-board">
          <section class="ih-bucket" data-bucket-id="">
            <div class="ih-bucket-title">Unsorted</div>
            <div class="ih-bucket-list" data-sortable-bucket data-bucket-id="">
              ${unset.length ? unset.map((entry) => renderBucketCard(questionDef, answer, entry)).join("") : `<div class="ih-bucket-empty">Everything is bucketed</div>`}
            </div>
          </section>
          ${questionDef.buckets.map((bucket) => `
            <section class="ih-bucket" data-bucket-id="${escapeAttr(bucket.id)}">
              <div class="ih-bucket-title">${escapeHTML(bucket.title)}</div>
              <div class="ih-bucket-list" data-sortable-bucket data-bucket-id="${escapeAttr(bucket.id)}">
                ${byBucket[bucket.id].length ? byBucket[bucket.id].map((entry) => renderBucketCard(questionDef, answer, entry)).join("") : `<div class="ih-bucket-empty">Drop options here</div>`}
              </div>
            </section>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderBucketCard(questionDef, answer, entry) {
    const currentBucketId = answer.buckets && answer.buckets[entry.id] || "";
    return `
      <article class="ih-bucket-card" data-option-id="${escapeAttr(entry.id)}">
        <button class="ih-grip" type="button" aria-label="Drag to bucket"></button>
        <h3 class="ih-option-title">${escapeHTML(entry.title)}</h3>
        <div class="ih-bucket-actions">
          ${renderMoveMenu(questionDef, entry, currentBucketId)}
          ${renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on bucket option")}
        </div>
        ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
      </article>
    `;
  }

  function renderMoveMenu(questionDef, entry, currentBucketId) {
    const buckets = [{ id: "", title: "Unsorted" }].concat(questionDef.buckets || []);
    return `
      <details class="ih-move-menu">
        <summary class="ih-move-button" data-action="toggle-move-menu" aria-label="Move bucket option" title="Move to bucket">${moveIcon()}</summary>
        <div class="ih-move-dropdown" role="menu" aria-label="Move to bucket">
          ${buckets.map((bucket) => {
            const isCurrent = bucket.id === currentBucketId;
            return `<button class="ih-move-option ${isCurrent ? "is-current" : ""}" type="button" role="menuitem" data-action="move-bucket-option" data-option-id="${escapeAttr(entry.id)}" data-bucket-id="${escapeAttr(bucket.id)}" ${isCurrent ? `aria-current="true"` : ""}>${escapeHTML(bucket.title)}</button>`;
          }).join("")}
        </div>
      </details>
    `;
  }

  function renderClassify(questionDef, answer) {
    return `
      <div class="ih-stack">
        ${answerOptions(questionDef, answer).map((entry) => `
          <article class="ih-card ih-classify-card">
            <div class="ih-classify-row" data-option-id="${escapeAttr(entry.id)}">
              <div class="ih-classify-top">
                ${entry.custom ? renderAddedPill() : renderClassifyStates(questionDef, answer, entry)}
                <div class="ih-option-actions">
                  ${entry.custom ? "" : renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on classified option")}
                  ${entry.custom ? `<button class="ih-remove-icon" type="button" data-action="remove-added" data-option-id="${escapeAttr(entry.id)}" aria-label="Remove custom option">${trashIcon()}</button>` : ""}
                </div>
              </div>
              <textarea class="ih-field ih-auto-field" data-input="classify-edit" data-option-id="${escapeAttr(entry.id)}" rows="1">${escapeHTML(answer.edits && answer.edits[entry.id] || entry.title)}</textarea>
              ${entry.body ? `<div class="ih-rich">${renderRich(entry.body)}</div>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
      ${renderAddRow("Add another option")}
    `;
  }

  function renderEdit(questionDef, answer) {
    return `
      <div class="ih-edit">
        <div class="ih-card" data-edit>
          <div class="ih-option-top">
            <label class="ih-label">Editable artifact</label>
            ${renderCommentButton("edit-summary", "", answer.summary || "", "Comment on edited artifact")}
          </div>
          <div class="ih-code-editor-host" data-code-editor data-lang="${escapeAttr(questionDef.artifact && questionDef.artifact.lang || questionDef.language || "")}"></div>
          <textarea class="ih-code-fallback ih-auto-field" data-input="edit-content" spellcheck="false" wrap="off">${escapeHTML(answer.content || "")}</textarea>
          <div class="ih-editor-loading" data-editor-loading>Loading syntax editor...</div>
        </div>
      </div>
    `;
  }

  function renderExportStep(instance) {
    const text = instance.getText();
    const json = instance.getJSON();
    return `
      <section class="ih-step" id="ih-output">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Output</p>
            <h2 class="ih-prompt">Export the answer summary.</h2>
            <p class="ih-export-note">The text version is the default handoff. JSON is available when the next step benefits from structure.</p>
          </div>
        </div>
        <div class="ih-export">
          <div class="ih-card">
            <div class="ih-option-top" style="margin-bottom:12px">
              <h3 class="ih-option-title">Text</h3>
              <button class="ih-btn ih-btn-primary" type="button" data-action="copy-text">${escapeHTML(instance.config.copyTextLabel)}</button>
            </div>
            <pre class="ih-output" data-export-text>${escapeHTML(text)}</pre>
          </div>
          <div class="ih-card">
            <div class="ih-option-top" style="margin-bottom:12px">
              <h3 class="ih-option-title">JSON</h3>
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
      const sourceName = value.fileName || value.filename || frameSourceName(value.src) || title;
      const openButton = value.src
        ? `<a class="ih-frame-open" href="${escapeAttr(value.src)}" target="_blank" rel="noopener" aria-label="Open ${escapeAttr(sourceName)} in a new tab" title="Open ${escapeAttr(sourceName)} in a new tab">${externalLinkIcon()}</a>`
        : value.srcdoc
          ? `<a class="ih-frame-open" href="about:blank" target="_blank" rel="noopener" data-frame-srcdoc="${escapeAttr(value.srcdoc)}" aria-label="Open ${escapeAttr(sourceName)} in a new tab" title="Open ${escapeAttr(sourceName)} in a new tab">${externalLinkIcon()}</a>`
          : "";
      const bar = `
        <div class="ih-frame-bar">
          <span class="ih-frame-name" title="${escapeAttr(sourceName)}">${escapeHTML(sourceName)}</span>
          ${openButton}
        </div>`;
      const iframe = value.srcdoc
        ? `<iframe class="ih-frame" title="${escapeAttr(title)}" srcdoc="${escapeAttr(value.srcdoc)}"${height}></iframe>`
        : `<iframe class="ih-frame" title="${escapeAttr(title)}" src="${escapeAttr(value.src || "")}"${height}></iframe>`;
      return `<div class="ih-frame-shell">${bar}${iframe}</div>`;
    }
    if (value.view === "html") return `<div class="ih-html-preview">${value.markup || ""}</div>`;
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

  function renderList(entries) {
    const values = asArray(entries);
    if (!values.length) return "";
    return `<ul>${values.map((entry) => `<li>${escapeHTML(valueToText(entry))}</li>`).join("")}</ul>`;
  }

  function renderTags(tags) {
    const values = Array.isArray(tags) ? tags : [];
    if (!values.length) return "";
    return `<div class="ih-tags">${values.map((entry) => `<span class="ih-pill">${escapeHTML(valueToText(entry))}</span>`).join("")}</div>`;
  }

  function renderClassifyStates(questionDef, answer, entry) {
    const selected = answer.states && answer.states[entry.id] || "";
    return `
      <div class="ih-classify-states" role="radiogroup" aria-label="Classify state for ${escapeAttr(entry.title)}">
        ${questionDef.states.map((state) => {
          const isSelected = selected === state.id;
          return `<button class="ih-classify-state ${isSelected ? "is-selected" : ""}" role="radio" aria-checked="${isSelected ? "true" : "false"}" type="button" data-action="classify-state" data-option-id="${escapeAttr(entry.id)}" data-classify-state="${escapeAttr(state.id)}">${escapeHTML(state.title)}</button>`;
        }).join("")}
      </div>
    `;
  }

  function renderAddedPill() {
    return `<span class="ih-added-pill">added</span>`;
  }

  function renderCommentButton(kind, optionId, value, label) {
    const filled = Boolean(String(value || "").trim());
    const optionAttr = optionId ? ` data-option-id="${escapeAttr(optionId)}"` : "";
    return `<button class="ih-comment-button ${filled ? "has-comment" : ""}" type="button" data-action="open-comment" data-comment-kind="${escapeAttr(kind)}"${optionAttr} aria-label="${escapeAttr(label || "Comment")}" title="${escapeAttr(label || "Comment")}">${commentIcon()}</button>`;
  }

  function renderCommentPopover(instance) {
    const editor = instance.state.commentEditor;
    if (!editor) return "";
    const context = instance.contextByQuestionId(editor.questionId);
    if (!context) return "";
    const value = getCommentValue(context.answer, editor.kind, editor.optionId);
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

  function externalLinkIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
  }

  function infoIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm-1.05 6.75h2.1v6h-2.1v-6Zm0-3h2.1v2h-2.1v-2Z"/></svg>`;
  }

  function trashIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;
  }

  function evaluationIcon(icon) {
    const icons = {
      yes: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
      no: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
      partial: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14" opacity=".35"/></svg>`,
      unknown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 9a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.3-1.6 2.5"/><path d="M12 18h.01"/></svg>`,
      warn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 8v6"/><path d="M12 17h.01"/></svg>`,
      best: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>`
    };
    return icons[icon] || "";
  }

  function evaluationIconLabel(icon) {
    const labels = {
      yes: "Yes",
      no: "No",
      partial: "Partial",
      unknown: "Unknown",
      warn: "Risk",
      best: "Best"
    };
    return labels[icon] || "";
  }

  function getCommentValue(answer, kind, optionId) {
    if (!answer) return "";
    if (kind === "evaluation-option-comment") return answer.optionComments && answer.optionComments[optionId] || "";
    if (kind === "evaluation-row-comment") return answer.rowComments && answer.rowComments[optionId] || "";
    if (kind === "edit-summary") return answer.summary || "";
    return optionComment(answer, optionId);
  }

  function setCommentValue(answer, kind, optionId, value) {
    const textValue = String(value || "");
    if (kind === "evaluation-option-comment") {
      if (!answer.optionComments) answer.optionComments = {};
      if (textValue.trim()) answer.optionComments[optionId] = textValue;
      else delete answer.optionComments[optionId];
      return;
    }
    if (kind === "evaluation-row-comment") {
      if (!answer.rowComments) answer.rowComments = {};
      if (textValue.trim()) answer.rowComments[optionId] = textValue;
      else delete answer.rowComments[optionId];
      return;
    }
    if (kind === "edit-summary") {
      answer.summary = textValue;
      return;
    }
    if (!answer.comments) answer.comments = {};
    if (textValue.trim()) answer.comments[optionId] = textValue;
    else delete answer.comments[optionId];
  }

  // App runtime --------------------------------------------------------------

  class InterviewHarnessApp {
    constructor(config) {
      this.config = config;
      this.root = resolveTarget(config.target);
      this.state = createInitialState(config.questions);
      this.state.viewMode = initialViewMode(config.questions);
      this.saveTimer = null;
      this.chromeFrame = null;
      this.sortables = [];
      this.codeEditors = [];
      this.frameObjectUrls = [];
      this.evaluationScrollCleanups = [];
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
      this.root.addEventListener("mouseover", (event) => this.onMouseover(event));
      this.root.addEventListener("mousemove", (event) => this.onMousemove(event));
      this.root.addEventListener("mouseout", (event) => this.onMouseout(event));
      this.root.addEventListener("scroll", (event) => {
        if (event.target.closest && event.target.closest(".ih-move-dropdown")) return;
        this.closeMoveMenus();
        if (this.state.detailPopover) this.closeDetail();
      }, true);
      global.addEventListener("resize", () => {
        this.closeMoveMenus();
        if (this.state.detailPopover) this.closeDetail();
      });
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
        this.initFrameLinks();
        this.initEvaluationHeaderScroll();
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
      if (event.target.closest(".ih-evaluation-detail-button")) return;
      if (!event.target.closest(".ih-move-menu")) this.closeMoveMenus();
      const linkEl = event.target.closest("a[href]");
      if (linkEl && this.root.contains(linkEl)) return;
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl || !this.root.contains(actionEl)) return;
      const action = actionEl.dataset.action;
      if (action === "choose-option" && isFormControl(event.target)) return;

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
      if (action === "choose-option") return this.chooseOption(actionEl.dataset.optionId, context);
      if (action === "choose-evaluation-option") return this.chooseEvaluationOption(actionEl.dataset.optionId, context);
      if (action === "classify-state") return this.setClassifyState(actionEl.dataset.optionId, actionEl.dataset.classifyState, context);
      if (action === "move-bucket-option") return this.moveBucketOption(actionEl, context);
      if (action === "add-option") return this.addOption(context);
      if (action === "remove-added") return this.removeAdded(actionEl.dataset.optionId || numberOr(actionEl.dataset.addedIndex, -1), context);
    }

    onMouseover(event) {
      const button = event.target.closest(".ih-evaluation-detail-button");
      if (!button || !this.root.contains(button)) return;
      if (button.contains(event.relatedTarget)) return;
      this.showEvaluationDetail(button);
    }

    onMousemove(event) {
      if (!this.state.detailPopover) return;
      if (event.target.closest(".ih-evaluation-detail-button")) return;
      this.closeDetail();
    }

    onMouseout(event) {
      if (!this.state.detailPopover) return;
      const source = event.target.closest(".ih-evaluation-detail-button");
      if (!source || !this.root.contains(source)) return;
      const related = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".ih-evaluation-detail-button");
      if (related && this.root.contains(related)) return;
      this.closeDetail();
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
        setCommentValue(answer, this.state.commentEditor.kind, this.state.commentEditor.optionId, input.value);
        this.syncOpenCommentButton();
      }
      if (kind === "classify-edit") answer.edits[input.dataset.optionId] = input.value;
      if (kind === "added-title") this.updateAddedTitle(input.dataset.optionId, input.value, context);
      if (kind === "edit-content") answer.content = input.value;

      autoGrowTextarea(input);
      this.markChanged(answer, true);
    }

    onKeydown(event) {
      if (event.key === "Escape") {
        if (this.state.detailPopover) this.closeDetail();
        else if (this.state.commentEditor) this.closeComment();
        else if (this.closeMoveMenus()) event.preventDefault();
      }
      const choice = event.target.closest(".ih-choice[data-action]");
      if (choice && isFormControl(event.target)) return;
      const evaluation = event.target.closest("[data-action='choose-evaluation-option']");
      if ((!choice && !evaluation) || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      (choice || evaluation).click();
    }

    sectionForContext(context) {
      if (!context) return null;
      return this.root.querySelector(`.ih-step[data-question-id="${cssEscape(context.questionDef.id)}"]`);
    }

    markChanged(answer, deferred) {
      if (answer) answer.touched = true;
      if (deferred) {
        this.scheduleSave();
        this.scheduleExport();
        this.scheduleChrome();
        return;
      }
      this.save();
      this.refreshChrome();
    }

    saveChanged(answer) {
      if (answer) answer.touched = true;
      this.save();
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
      this.state.detailPopover = null;
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
        kind: button.dataset.commentKind || "option-comment",
        optionId: button.dataset.optionId || ""
      };
      this.state.detailPopover = null;
      this.save();
      this.render();
    }

    closeComment() {
      this.state.commentEditor = null;
      this.save();
      this.render();
    }

    showEvaluationDetail(button) {
      const title = button.dataset.detailTitle || "Detail";
      const detail = button.dataset.detail || "";
      if (!detail) return;
      const position = this.evaluationTooltipPosition(button);
      this.state.commentEditor = null;
      this.state.detailPopover = {
        title,
        detail,
        left: position.left,
        top: position.top,
        width: position.width,
        arrow: position.arrow,
        placement: position.placement
      };
      this.renderDetailTooltip();
    }

    closeDetail() {
      this.state.detailPopover = null;
      const tooltip = this.root.querySelector(".ih-evaluation-tooltip");
      if (tooltip) tooltip.remove();
    }

    evaluationTooltipPosition(button) {
      const rect = button.getBoundingClientRect();
      const viewportWidth = global.innerWidth || document.documentElement.clientWidth || 360;
      const viewportHeight = global.innerHeight || document.documentElement.clientHeight || 640;
      const margin = 12;
      const gap = 8;
      const width = Math.max(180, Math.min(340, viewportWidth - margin * 2));
      const center = rect.left + rect.width / 2;
      const left = clamp(center - width / 2, margin, viewportWidth - width - margin);
      const hasBelowRoom = viewportHeight - rect.bottom >= 140 || rect.bottom < rect.top;
      const placement = hasBelowRoom ? "below" : "above";
      const top = placement === "above"
        ? clamp(rect.top - gap, margin, viewportHeight - margin)
        : clamp(rect.bottom + gap, margin, viewportHeight - margin);
      return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        arrow: Math.round(clamp(center - left, 14, width - 14)),
        placement
      };
    }

    renderDetailTooltip() {
      const detail = this.state.detailPopover;
      if (!detail) return this.closeDetail();
      let tooltip = this.root.querySelector(".ih-evaluation-tooltip");
      if (!tooltip) {
        tooltip = document.createElement("aside");
        tooltip.className = "ih-evaluation-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.tabIndex = -1;
        this.root.querySelector(".ih-app")?.appendChild(tooltip);
      }
      tooltip.className = `ih-evaluation-tooltip is-${detail.placement === "above" ? "above" : "below"}`;
      tooltip.style.setProperty("--ih-tooltip-left", `${numberOr(detail.left, 12)}px`);
      tooltip.style.setProperty("--ih-tooltip-top", `${numberOr(detail.top, 12)}px`);
      tooltip.style.setProperty("--ih-tooltip-width", `${numberOr(detail.width, 340)}px`);
      tooltip.style.setProperty("--ih-tooltip-arrow", `${numberOr(detail.arrow, 18)}px`);
      tooltip.replaceChildren();
      if (detail.title) {
        const title = document.createElement("p");
        title.className = "ih-evaluation-tooltip-title";
        title.textContent = detail.title;
        tooltip.appendChild(title);
      }
      const body = document.createElement("p");
      body.className = "ih-evaluation-tooltip-body";
      body.textContent = detail.detail || "";
      tooltip.appendChild(body);
    }

    syncOpenCommentButton() {
      const editor = this.state.commentEditor;
      if (!editor) return;
      const context = this.contextByQuestionId(editor.questionId);
      const section = this.sectionForContext(context);
      if (!context || !section) return;
      section.querySelectorAll("[data-action='open-comment']").forEach((button) => {
        const value = getCommentValue(context.answer, button.dataset.commentKind, button.dataset.optionId || "");
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
      this.evaluationScrollCleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
      this.evaluationScrollCleanups = [];
      this.frameObjectUrls.forEach((url) => {
        try { global.URL.revokeObjectURL(url); } catch (_) {}
      });
      this.frameObjectUrls = [];
    }

    initEvaluationHeaderScroll() {
      this.root.querySelectorAll(".ih-evaluation-board").forEach((board) => {
        const frame = board.querySelector(".ih-evaluation-frame");
        const header = board.querySelector("[data-evaluation-header-frame]");
        if (!frame || !header) return;
        const sync = () => { header.scrollLeft = frame.scrollLeft; };
        frame.addEventListener("scroll", sync, { passive: true });
        this.evaluationScrollCleanups.push(() => frame.removeEventListener("scroll", sync));
        sync();
      });
    }

    initFrameLinks() {
      this.root.querySelectorAll("[data-frame-srcdoc]").forEach((link) => {
        const srcdoc = link.dataset.frameSrcdoc || "";
        if (!srcdoc) return;
        let url = "";
        try {
          if (global.Blob && global.URL && global.URL.createObjectURL) {
            url = global.URL.createObjectURL(new global.Blob([srcdoc], { type: "text/html;charset=utf-8" }));
            this.frameObjectUrls.push(url);
          }
        } catch (_) {}
        link.href = url || `data:text/html;charset=utf-8,${encodeURIComponent(srcdoc)}`;
      });
    }

    initSortables() {
      const lists = Array.from(this.root.querySelectorAll("[data-sortable-rank], [data-sortable-bucket]"));
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
              draggable: ".ih-rank-option",
              onEnd: () => this.updateRankFromDom(list, context)
            }));
            list.dataset.sortableReady = "true";
            this.sortables.push(sortable);
          }
          if (list.matches("[data-sortable-bucket]") && context.questionDef.type === "bucket") {
            const sortable = new Sortable(list, Object.assign({}, common, {
              group: `ih-bucket-${context.questionDef.id}`,
              draggable: ".ih-bucket-card",
              onStart: () => list.querySelectorAll(".ih-bucket-empty").forEach((empty) => empty.remove()),
              onEnd: () => this.updateBucketFromDom(context)
            }));
            list.dataset.sortableReady = "true";
            this.sortables.push(sortable);
          }
        });
      }).catch(() => {});
    }

    initCodeEditors() {
      this.root.querySelectorAll("[data-code-editor]").forEach((host) => this.initCodeEditor(host));
      this.root.querySelectorAll("[data-code-viewer]").forEach((host) => this.initCodeViewer(host));
    }

    initCodeEditor(host) {
      const context = this.contextFromNode(host);
      if (!context || context.questionDef.type !== "edit") return;
      const card = host.closest("[data-edit]");
      const fallback = card && card.querySelector("[data-input='edit-content']");
      const loading = card && card.querySelector("[data-editor-loading]");
      const doc = fallback ? fallback.value : context.answer.content || "";
      context.answer.content = doc;
      createCodeMirrorView(host, {
        doc,
        lang: host.dataset.lang || "",
        onChange: (value) => {
          context.answer.content = value;
          this.markChanged(context.answer, true);
        }
      }).then((view) => {
        if (!view) return;
        host.classList.add("is-ready");
        if (card) card.classList.add("has-editor");
        if (loading) loading.remove();
        this.codeEditors.push(view);
        if (fallback) fallback.value = doc;
      }).catch(() => {
        if (card) card.classList.add("is-fallback");
        if (host) host.hidden = true;
        if (loading) loading.textContent = "Syntax editor unavailable; using the plain editor.";
        if (fallback) autoGrowTextarea(fallback);
      });
    }

    initCodeViewer(host) {
      const shell = host.closest("[data-code-viewer-shell]");
      if (!shell) return;
      const fallback = shell.querySelector(".ih-code-viewer-fallback");
      const doc = fallback ? fallback.textContent || "" : "";
      createCodeMirrorView(host, { doc, lang: host.dataset.lang || "", readOnly: true }).then((view) => {
        if (!view) return;
        shell.classList.add("has-editor");
        this.codeEditors.push(view);
      }).catch(() => {});
    }

    updateRankFromDom(list, context) {
      if (!context || context.questionDef.type !== "rank") return;
      context.answer.order = Array.from(list.querySelectorAll(".ih-rank-option[data-option-id]")).map((card) => card.dataset.optionId);
      this.activateContext(context);
      this.syncRankDom(context);
      this.markChanged(context.answer);
    }

    updateBucketFromDom(context) {
      const section = this.sectionForContext(context);
      if (!context || context.questionDef.type !== "bucket" || !section) return;
      context.questionDef.options.forEach((entry) => { context.answer.buckets[entry.id] = ""; });
      section.querySelectorAll(".ih-bucket-list[data-bucket-id]").forEach((list) => {
        const bucketId = list.dataset.bucketId || "";
        list.querySelectorAll(".ih-bucket-card[data-option-id]").forEach((card) => {
          context.answer.buckets[card.dataset.optionId] = bucketId;
        });
      });
      this.activateContext(context);
      this.syncBucketDom(context);
      this.markChanged(context.answer);
    }

    chooseOption(optionId, context) {
      const answer = context && context.answer;
      const questionDef = context && context.questionDef;
      if (!answer || !questionDef) return;
      if (questionDef.select === "many") {
        const selected = new Set(asArray(answer.selected));
        if (selected.has(optionId)) selected.delete(optionId);
        else selected.add(optionId);
        answer.selected = Array.from(selected);
      } else {
        answer.selected = optionId;
      }
      this.refreshChoiceState(context);
      this.markChanged(answer);
    }

    chooseEvaluationOption(optionId, context) {
      const answer = context && context.answer;
      const questionDef = context && context.questionDef;
      if (!answer || !questionDef || questionDef.type !== "evaluation") return;
      answer.selected = optionId;
      this.refreshEvaluationState(context);
      this.markChanged(answer);
    }

    setClassifyState(optionId, state, context) {
      const answer = context && context.answer;
      if (!answer) return;
      answer.states[optionId] = state;
      const row = this.sectionForContext(context) && this.sectionForContext(context).querySelector(`.ih-classify-row[data-option-id="${cssEscape(optionId)}"]`);
      if (row) {
        row.querySelectorAll(".ih-classify-state").forEach((button) => {
          const selected = button.dataset.classifyState === state;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-checked", selected ? "true" : "false");
        });
      }
      this.markChanged(answer);
    }

    addOption(context) {
      const section = this.sectionForContext(context);
      const input = section && section.querySelector("[data-input='add-text']");
      const title = input && input.value.trim();
      if (!title) return this.toast("Write the option first.");
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || !answer) return;
      const id = uniqueAddedId(questionDef, answer, title);
      answer.added.push({ id, title });
      if (questionDef.type === "choice" && questionDef.select === "many") answer.selected = Array.from(new Set(asArray(answer.selected).concat(id)));
      if (questionDef.type === "classify") answer.edits[id] = title;
      this.saveChanged(answer);
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
        if (questionDef.type === "choice" && questionDef.select === "many") answer.selected = asArray(answer.selected).filter((id) => id !== removed.id);
        if (answer.comments) delete answer.comments[removed.id];
        if (answer.edits) delete answer.edits[removed.id];
        if (answer.states) delete answer.states[removed.id];
      }
      this.saveChanged(answer);
      this.render();
    }

    updateAddedTitle(optionId, title, context) {
      const answer = context && context.answer;
      const entry = answer && asArray(answer.added).find((candidate) => candidate.id === optionId);
      if (!entry) return;
      entry.title = title;
      if (answer.edits && answer.edits[optionId] !== undefined) answer.edits[optionId] = title;
    }

    setBucket(optionId, bucketId, context) {
      const answer = context && context.answer;
      if (!answer || !answer.buckets) return;
      answer.buckets[optionId] = bucketId || "";
      this.syncBucketDom(context);
      this.markChanged(answer);
    }

    moveBucketOption(button, context) {
      const menu = button.closest(".ih-move-menu");
      if (menu) menu.open = false;
      this.setBucket(button.dataset.optionId, button.dataset.bucketId || "", context);
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
      if (!questionDef || questionDef.type !== "choice") return;
      const section = this.sectionForContext(context);
      if (!section) return;
      const selected = questionDef.select === "many" ? asArray(answer.selected) : [answer.selected];
      section.querySelectorAll(".ih-choice[data-option-id]").forEach((card) => {
        const isSelected = selected.includes(card.dataset.optionId);
        card.classList.toggle("is-selected", isSelected);
        const dot = card.querySelector(".ih-select-dot");
        if (dot) dot.textContent = isSelected ? "✓" : "+";
      });
    }

    refreshEvaluationState(context) {
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || questionDef.type !== "evaluation") return;
      const section = this.sectionForContext(context);
      if (!section) return;
      const selected = asArray(answer.selected ? [answer.selected] : []);
      section.querySelectorAll(".ih-evaluation-table thead th[data-option-id]").forEach((head) => {
        const isSelected = selected.includes(head.dataset.optionId);
        head.classList.toggle("is-selected", isSelected);
        head.setAttribute("aria-pressed", isSelected ? "true" : "false");
        const column = head.querySelector(".ih-evaluation-column");
        if (column) column.classList.toggle("is-selected", isSelected);
      });
      section.querySelectorAll(".ih-evaluation-table td").forEach((cell) => {
        const cellIndex = cell.cellIndex - 1;
        const option = questionDef.options[cellIndex];
        cell.classList.toggle("is-selected", Boolean(option && selected.includes(option.id)));
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
        const card = list.querySelector(`.ih-rank-option[data-option-id="${cssEscape(id)}"]`);
        if (card) list.appendChild(card);
      });
    }

    syncBucketDom(context) {
      if (!context) {
        this.config.questions.forEach((questionDef) => {
          if (questionDef.type === "bucket") this.syncBucketDom(this.contextByQuestionId(questionDef.id));
        });
        return;
      }
      const questionDef = context.questionDef;
      const answer = context.answer;
      if (!questionDef || questionDef.type !== "bucket") return;
      const section = this.sectionForContext(context);
      if (!section) return;
      section.querySelectorAll(".ih-bucket-card[data-option-id]").forEach((card) => {
        const bucketId = answer.buckets && answer.buckets[card.dataset.optionId] || "";
        const bucket = section.querySelector(`.ih-bucket[data-bucket-id="${cssEscape(bucketId)}"] .ih-bucket-list`);
        if (bucket && card.parentElement !== bucket) bucket.appendChild(card);
        card.querySelectorAll("[data-action='move-bucket-option']").forEach((button) => {
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
        if (!list.querySelector(".ih-bucket-card")) {
          const empty = document.createElement("div");
          empty.className = "ih-bucket-empty";
          empty.textContent = bucket.dataset.bucketId ? "Drop options here" : "Everything is bucketed";
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
      this.refreshExport();
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

  async function createCodeMirrorView(host, options) {
    const { EditorView, basicSetup, theme, language } = await loadCodeMirror(options.lang || "");
    if (!host.isConnected) return null;
    host.textContent = "";
    return new EditorView({
      doc: options.doc || "",
      extensions: codeMirrorExtensions(EditorView, basicSetup, theme, language, options),
      parent: host
    });
  }

  function codeMirrorExtensions(EditorView, basicSetup, theme, language, options) {
    const extensions = [basicSetup, theme, language, EditorView.lineWrapping];
    if (options.readOnly) extensions.push(EditorView.editable.of(false));
    if (options.onChange) {
      extensions.push(EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString(), update);
      }));
    }
    return extensions.filter(Boolean);
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

  function initialViewMode(questions) {
    return questions.length <= 3 ? "all" : "paged";
  }

  function timelineState(instance, questionDef, index) {
    const answer = instance.state.answers[questionDef.id];
    return [
      index === instance.state.step ? "is-active" : "",
      isQuestionAnswered(questionDef, answer) ? "is-answered" : "is-unanswered"
    ].filter(Boolean).join(" ");
  }

  function isInterviewReady(instance) {
    return instance.config.questions.every((questionDef) => isQuestionAnswered(questionDef, instance.state.answers[questionDef.id]));
  }

  const questionAnsweredChecks = {
    text: (_questionDef, answer) => Boolean(String(answer.answer || "").trim()),
    choice: (questionDef, answer) => questionDef.select === "many" ? asArray(answer.selected).length > 0 : Boolean(answer.selected),
    evaluation: (_questionDef, answer) => Boolean(answer.selected),
    rank: (questionDef, answer) => Boolean(answer.touched) && asArray(answer.order).length >= questionDef.options.length,
    bucket: (questionDef, answer) => questionDef.options.every((entry) => Boolean(answer.buckets && answer.buckets[entry.id])),
    classify: (questionDef, answer) => questionDef.options.every((entry) => Boolean(answer.states && answer.states[entry.id])),
    edit: (_questionDef, answer) => Boolean(answer.touched) && Boolean(String(answer.content || "").trim())
  };

  function isQuestionAnswered(questionDef, answer) {
    if (!answer) return false;
    const check = questionAnsweredChecks[questionDef.type];
    return check ? check(questionDef, answer) : true;
  }

  function isEvaluationIcon(value) {
    return ["yes", "no", "partial", "unknown", "warn", "best"].includes(String(value || ""));
  }

  function evaluationOptionPayload(questionDef, id) {
    const entry = questionDef.options.find((candidate) => candidate.id === id);
    return entry ? { id: entry.id, title: entry.title } : null;
  }

  function evaluationRowComments(rows, comments) {
    return asArray(rows).map((entry) => ({
      id: entry.id,
      title: entry.title,
      comment: comments && comments[entry.id] || ""
    })).filter((entry) => entry.comment);
  }

  function answerOptions(questionDef, answer) {
    const options = asArray(questionDef.options).map((entry) => Object.assign({ custom: false }, entry));
    if (!answer || !answer.added) return options;
    return options.concat(normalizeAddedOptions(answer.added).map((entry) => Object.assign({ body: "", tags: null, custom: true }, entry)));
  }

  function optionIds(options) {
    return asArray(options).map((entry) => entry.id);
  }

  function orderedKnownIds(order, options) {
    const known = new Set(optionIds(options));
    const output = asArray(order).filter((id) => known.has(id));
    options.forEach((entry) => { if (!output.includes(entry.id)) output.push(entry.id); });
    return output;
  }

  function orderChanged(questionDef, order) {
    return asArray(order).join("|") !== optionIds(questionDef.options).join("|");
  }

  function optionComment(answer, optionId) {
    return answer && answer.comments && answer.comments[optionId] || "";
  }

  function commentCount(answer) {
    return Object.keys(safeObject(answer && answer.comments)).length;
  }

  function optionComments(options, comments) {
    return asArray(options).map((entry) => ({
      id: entry.id,
      title: entry.title,
      comment: comments && comments[entry.id] || ""
    })).filter((entry) => entry.comment);
  }

  function findOption(questionDef, answer, id) {
    const entry = answerOptions(questionDef, answer).find((candidate) => candidate.id === id);
    return entry ? { id: entry.id, title: entry.title } : null;
  }

  function normalizeAddedOptions(input) {
    return asArray(input).map((entry, index) => {
      if (typeof entry === "string") return { id: slugify(entry) || `added-${index + 1}`, title: entry };
      const raw = Object.assign({}, entry || {});
      const title = String(raw.title || raw.label || raw.name || raw.value || `Added option ${index + 1}`);
      return { id: String(raw.id || slugify(title) || `added-${index + 1}`), title };
    });
  }

  function uniqueAddedId(questionDef, answer, title) {
    const base = slugify(title) || `added-${Date.now()}`;
    const used = new Set(answerOptions(questionDef, answer).map((entry) => entry.id));
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

  function objectFrom(options, value) {
    return Object.fromEntries(options.map((entry) => [entry.id, value === "title" ? entry.title : value]));
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === "") return [];
    return [value];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function frameSourceName(src) {
    const source = String(src || "").trim();
    if (!source) return "";
    const clean = source.split("#")[0].split("?")[0].replace(/\/+$/, "");
    const segment = clean.split(/[\\/]/).pop() || source;
    try {
      return decodeURIComponent(segment);
    } catch (error) {
      return segment;
    }
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

  function richPlainText(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(richPlainText).filter(Boolean).join(" ");
    if (value.markup !== undefined) return String(value.markup).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (value.value !== undefined) return valueToText(value.value);
    return valueToText(value);
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
    choice,
    evaluation,
    rank,
    bucket,
    classify,
    edit,
    option,
    feature,
    frame,
    html,
    code
  };
})(window);
