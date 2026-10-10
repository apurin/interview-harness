/*
 * Interview Harness
 * Readable, no-build client-side library for temporary agent-authored interviews.
 */
(function attachInterviewHarness(global) {
  "use strict";

  const VERSION = "6.0.1";
  const STYLE_ID = "interview-harness-styles";
  const DEFAULT_TARGET_ID = "interview-harness";
  const THEME_STORAGE_KEY = "interview-harness:theme";
  const THEME_WINDOW_NAME_PREFIX = "__IH_THEME__:";
  const COLUMN_WIDTHS = ["narrow", "medium", "wide"];
  const FLOW_LABEL_LINE_CHARS = 28;
  const FLOW_LABEL_POSITIONS = [0.5, 0.46, 0.54, 0.42, 0.58, 0.38, 0.62, 0.34, 0.66, 0.3, 0.7, 0.26, 0.74, 0.22, 0.78, 0.18, 0.82];
  const SORTABLE_URL = "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js";
  const VIS_NETWORK_URL = "https://cdn.jsdelivr.net/npm/vis-network@10.1.0/standalone/umd/vis-network.min.js";
  const LINES_AND_ARROWS_URL = "https://cdn.jsdelivr.net/npm/lines-and-arrows@0.15.0/dist/lines-and-arrows.auto.min.js";
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
  const MARKED_URL = "https://cdn.jsdelivr.net/npm/marked@18.0.5/lib/marked.umd.js";
  let sortablePromise = null;
  let visNetworkPromise = null;
  let linesAndArrowsPromise = null;
  let codeMirrorPromise = null;
  let codeMirrorThemePromise = null;
  let markedPromise = null;
  const codeMirrorLanguagePromises = {};

  const questionNormalizers = {
    choice: normalizeChoiceQuestion,
    compare: (raw) => ({
      type: "evaluation",
      select: "one",
      columnWidth: normalizeColumnWidth(raw.columnWidth, `${raw.sourcePath}.columnWidth`),
      options: normalizeCards(raw.cards, raw.id, raw.sourcePath),
      rows: normalizeCriteria(raw.criteria, raw.id, raw.sourcePath, asArray(raw.cards).length)
    }),
    categorize: normalizeCategorizeQuestion,
    flow: (raw) => ({
      connections: normalizeFlowConnections(raw.connections, true, raw.sourcePath)
    }),
    sequence: (raw) => ({
      source: requiredString(raw.source, `${raw.sourcePath}.source`)
    }),
    edit: (raw) => ({
      artifact: { view: "code", lang: String(raw.language || ""), value: String(raw.value || "") },
      language: String(raw.language || "")
    })
  };

  function normalizeChoiceQuestion(raw) {
    if (raw.multiple !== undefined && typeof raw.multiple !== "boolean") throw new TypeError(`${raw.sourcePath}.multiple must be a boolean.`);
    const options = normalizeCards(raw.cards, raw.id, raw.sourcePath);
    const layout = cardLayout(options, raw.previewFrame);
    const defaultColumnWidth = layout === 2 ? "medium" : layout === 1 ? "wide" : "narrow";
    return {
      select: raw.multiple === true ? "many" : "one",
      columnWidth: normalizeColumnWidth(raw.columnWidth, `${raw.sourcePath}.columnWidth`, defaultColumnWidth),
      options
    };
  }

  function normalizeCategorizeQuestion(raw) {
    if (raw.ordered !== undefined && typeof raw.ordered !== "boolean") throw new TypeError(`${raw.sourcePath}.ordered must be a boolean.`);
    const question = {
      type: "bucket",
      columnWidth: normalizeColumnWidth(raw.columnWidth, `${raw.sourcePath}.columnWidth`),
      buckets: normalizeCategories(raw.categories, raw.id, raw.sourcePath),
      options: normalizeCards(raw.cards, raw.id, raw.sourcePath)
    };
    // Omit the default so unordered questions keep their config fingerprint and saved answers.
    if (raw.ordered) question.ordered = true;
    return question;
  }

  // Normalization ------------------------------------------------------------

  function normalizeConfig(input) {
    const raw = requireObject(input, "interview");
    const problems = [];
    collectProblem(problems, () => assertKnownFields(raw, ["title", "markdownIntro", "questions"], "interview"));
    const title = collectProblem(problems, () => requiredString(raw.title, "interview.title"));
    const questions = (collectProblem(problems, () => requireArray(raw.questions, "interview.questions", true)) || [])
      .map((question, index) => collectProblem(problems, () => normalizeQuestion(question, index)));
    const intro = collectProblem(problems, () => optionalString(raw.markdownIntro, "interview.markdownIntro"));
    throwProblems(problems);
    return {
      target: `#${DEFAULT_TARGET_ID}`,
      title,
      intro,
      questions,
      storageKey: defaultStorageKey(title),
      copyTextLabel: "Copy text",
      fingerprint: configFingerprint({ title, questions })
    };
  }

  function normalizeQuestion(input, index) {
    const path = `interview.questions[${index}]`;
    const raw = requireObject(input, path);
    const type = requiredString(raw.type, `${path}.type`).toLowerCase();
    const allowed = {
      choice: ["type", "prompt", "multiple", "columnWidth", "previewFrame", "cards"],
      compare: ["type", "prompt", "columnWidth", "previewFrame", "cards", "criteria"],
      categorize: ["type", "prompt", "ordered", "columnWidth", "previewFrame", "categories", "cards"],
      flow: ["type", "prompt", "connections"],
      sequence: ["type", "prompt", "source"],
      edit: ["type", "prompt", "value", "language"]
    }[type];
    if (!allowed) throw new TypeError(`${path}.type must be choice, compare, categorize, flow, sequence, or edit.`);
    const problems = [];
    collectProblem(problems, () => assertKnownFields(raw, allowed, path));
    const id = `q${index + 1}`;
    raw.id = id;
    raw.sourcePath = path;
    raw.previewFrame = collectProblem(problems, () => normalizePreviewFrame(raw.previewFrame, `${path}.previewFrame`));
    const prompt = collectProblem(problems, () => requiredString(raw.prompt, `${path}.prompt`));
    const normalize = questionNormalizers[type];
    const normalized = collectProblem(problems, () => normalize(raw));
    throwProblems(problems);
    const previewFrame = raw.previewFrame ? { previewFrame: raw.previewFrame } : {};
    return Object.assign({ type: normalized.type || type, id, prompt }, previewFrame, normalized);
  }

  function normalizeCards(input, questionId, sourcePath) {
    return requireArray(input, `${sourcePath}.cards`, true).map((entry, index) => {
      const path = `${sourcePath}.cards[${index}]`;
      const raw = requireObject(entry, path);
      assertKnownFields(raw, ["title", "markdown", "markdownTooltip", "htmlPreview", "tags"], path);
      const htmlPreview = optionalString(raw.htmlPreview, `${path}.htmlPreview`);
      const tags = raw.tags === undefined ? [] : requireArray(raw.tags, `${path}.tags`).map((tag, tagIndex) => requiredString(tag, `${path}.tags[${tagIndex}]`));
      const previewType = !htmlPreview ? "none" : htmlPreview.startsWith("file:") ? "file" : "inline";
      if (previewType === "file" && !htmlPreview.slice("file:".length).trim()) throw new TypeError(`${path}.htmlPreview must include a filename after file:.`);
      return {
        id: `${questionId}-card${index + 1}`,
        title: requiredString(raw.title, `${path}.title`),
        markdown: optionalString(raw.markdown, `${path}.markdown`),
        markdownTooltip: optionalString(raw.markdownTooltip, `${path}.markdownTooltip`),
        htmlPreview,
        previewType,
        tags
      };
    });
  }

  function normalizeCategories(input, questionId, sourcePath) {
    return requireArray(input, `${sourcePath}.categories`, true).map((title, index) => {
      return { id: `${questionId}-category${index + 1}`, title: requiredString(title, `${sourcePath}.categories[${index}]`) };
    });
  }

  function normalizeCriteria(input, questionId, sourcePath, cardCount) {
    return requireArray(input, `${sourcePath}.criteria`, true).map((entry, index) => {
      const path = `${sourcePath}.criteria[${index}]`;
      const raw = requireObject(entry, path);
      assertKnownFields(raw, ["title", "markdownTooltip", "group", "values"], path);
      const values = requireArray(raw.values, `${path}.values`);
      if (values.length !== cardCount) throw new TypeError(`${path}.values must contain one value for each card (${cardCount}).`);
      return {
        id: `${questionId}-criterion${index + 1}`,
        title: requiredString(raw.title, `${path}.title`),
        markdownTooltip: optionalString(raw.markdownTooltip, `${path}.markdownTooltip`),
        group: optionalString(raw.group, `${path}.group`),
        cells: Object.fromEntries(values.map((value, valueIndex) => [`${questionId}-card${valueIndex + 1}`, normalizeComparisonValue(value, `${path}.values[${valueIndex}]`)]))
      };
    });
  }

  function normalizeComparisonValue(input, path) {
    if (input === undefined || input === null) return { icon: "", text: "", detail: "" };
    if (["string", "number", "boolean"].includes(typeof input)) return { icon: "", text: String(input), detail: "" };
    const raw = requireObject(input, path);
    assertKnownFields(raw, ["markdown", "markdownTooltip", "status"], path);
    const status = optionalString(raw.status, `${path}.status`);
    if (status && !["yes", "no", "partial", "unknown", "warning", "best"].includes(status)) throw new TypeError(`${path}.status must be yes, no, partial, unknown, warning, or best.`);
    return {
      icon: status === "warning" ? "warn" : status,
      text: optionalString(raw.markdown, `${path}.markdown`),
      detail: optionalString(raw.markdownTooltip, `${path}.markdownTooltip`)
    };
  }

  function normalizeFlowConnections(input, strict, sourcePath) {
    const connections = [];
    const usedConnections = new Set();
    const basePath = sourcePath ? `${sourcePath}.connections` : "flow.connections";
    const source = strict ? requireArray(input, basePath, true) : asArray(input);
    source.forEach((entry, index) => {
      const entryPath = `${basePath}[${index}]`;
      const raw = strict ? requireObject(entry, entryPath) : Object.assign({}, entry || {});
      if (strict) assertKnownFields(raw, ["from", "to", "label"], entryPath);
      const from = strict ? requiredString(raw.from, `${entryPath}.from`) : String(raw.from || "").trim();
      const to = strict ? requiredString(raw.to, `${entryPath}.to`) : String(raw.to || "").trim();
      if (!from || !to) {
        if (strict) throw new TypeError("Flow connections require non-empty from and to names.");
        return;
      }
      const key = flowConnectionKey(from, to);
      if (usedConnections.has(key)) {
        if (strict) throw new TypeError(`Flow connections must be unique by direction: ${from} → ${to}`);
        return;
      }
      usedConnections.add(key);
      const connection = { from, to };
      const label = strict ? optionalString(raw.label, `${entryPath}.label`).trim() : String(raw.label || raw.name || "").trim();
      const comment = strict ? "" : String(raw.comment || "");
      if (label) connection.label = label;
      if (comment) connection.comment = comment;
      connections.push(connection);
    });
    return connections;
  }

  function normalizeFlowNodes(input, connections) {
    const nodes = [];
    const used = new Set();
    const add = (entry) => {
      const raw = typeof entry === "string" ? { name: entry } : Object.assign({}, entry || {});
      const name = String(raw.name || raw.title || raw.label || "").trim();
      if (!name || used.has(name)) return;
      used.add(name);
      const node = { name };
      const comment = String(raw.comment || "");
      if (comment) node.comment = comment;
      nodes.push(node);
    };
    asArray(input).forEach(add);
    asArray(connections).forEach((connection) => {
      add(connection.from);
      add(connection.to);
    });
    return nodes;
  }

  function initialFlowAnswer(questionDef) {
    const connections = normalizeFlowConnections(questionDef.connections, false);
    return {
      nodes: normalizeFlowNodes([], connections),
      connections,
      comment: "",
      positions: {},
      selected: null,
      adding: false,
      viewed: false,
      confirmed: false,
      updated: false,
      touched: false
    };
  }

  function initialSequenceAnswer(questionDef) {
    return {
      source: questionDef.source,
      comment: "",
      confirmed: false,
      touched: false
    };
  }

  // State and export logic ---------------------------------------------------

  const initialAnswers = {
    choice: (questionDef) => ({ selected: questionDef.select === "many" ? [] : "", comments: {}, added: [] }),
    evaluation: (_questionDef) => ({ selected: "", optionComments: {}, rowComments: {}, touched: false }),
    bucket: (questionDef) => ({ buckets: objectFrom(questionDef.options, ""), order: questionDef.options.map((entry) => entry.id), comments: {} }),
    flow: initialFlowAnswer,
    sequence: initialSequenceAnswer,
    edit: (questionDef) => ({ content: artifactText(questionDef.artifact), summary: "", touched: false })
  };

  const answerHydrators = {
    choice(questionDef, answer, saved) {
      answer.selected = questionDef.select === "many" ? asArray(saved.selected) : String(asArray(saved.selected)[0] || "");
      answer.added = normalizeAddedOptions(saved.added);
      answer.touched = Boolean(asArray(answer.selected).length || answer.added.length || commentCount(answer));
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
    bucket(questionDef, answer, saved, initial) {
      answer.buckets = Object.assign({}, initial.buckets, safeObject(saved.buckets));
      answer.order = normalizeBucketOrder(questionDef, saved.order);
      answer.touched = Boolean(Object.values(answer.buckets).some(Boolean) || commentCount(answer));
    },
    flow(questionDef, answer, saved, initial) {
      const connections = Array.isArray(saved.connections)
        ? normalizeFlowConnections(saved.connections, false)
        : initial.connections;
      answer.connections = connections;
      answer.nodes = Array.isArray(saved.nodes)
        ? normalizeFlowNodes(saved.nodes, connections)
        : normalizeFlowNodes(initial.nodes, connections);
      answer.comment = String(saved.comment || "");
      answer.positions = normalizeFlowPositions(saved.positions, answer.nodes);
      answer.selected = normalizeFlowSelection(saved.selected, answer);
      answer.adding = false;
      answer.viewed = Boolean(saved.viewed);
      answer.updated = saved.updated === undefined
        ? isFlowStructurallyChanged(questionDef, answer)
        : Boolean(saved.updated);
      answer.confirmed = Boolean(saved.confirmed || answer.updated);
      answer.touched = Boolean(saved.touched || answer.confirmed || isFlowChanged(questionDef, answer));
    },
    sequence(questionDef, answer, saved, initial) {
      answer.source = typeof saved.source === "string" && saved.source.trim()
        ? saved.source
        : initial.source;
      answer.comment = String(saved.comment || "");
      answer.confirmed = Boolean(saved.confirmed);
      answer.touched = Boolean(saved.touched || answer.confirmed || answer.comment);
    },
    edit(questionDef, answer, saved) {
      answer.summary = String(saved.summary || "");
      answer.touched = Boolean(saved.touched || saved.summary || String(answer.content || "") !== artifactText(questionDef.artifact));
    }
  };

  function createInitialState(config) {
    const answers = Object.fromEntries(config.questions.map((questionDef) => [questionDef.id, initialAnswer(questionDef)]));
    return { version: VERSION, fingerprint: config.fingerprint, step: 0, viewMode: "paged", bucketViews: {}, columnWidths: {}, commentEditor: null, detailPopover: null, answers, closingNote: "" };
  }

  function initialAnswer(questionDef) {
    return initialAnswers[questionDef.type](questionDef);
  }

  function mergeState(saved, current, questions) {
    if (!saved || typeof saved !== "object") return current;
    if (saved.fingerprint !== current.fingerprint) return current;
    const next = Object.assign({}, current, {
      version: VERSION,
      viewMode: saved.viewMode === "all" || saved.viewMode === "paged" ? saved.viewMode : current.viewMode,
      bucketViews: Object.fromEntries(questions
        .filter((questionDef) => questionDef.type === "bucket" && safeObject(saved.bucketViews)[questionDef.id] === "table")
        .map((questionDef) => [questionDef.id, "table"])),
      columnWidths: Object.fromEntries(questions
        .filter(isColumnWidthQuestion)
        .map((questionDef) => [questionDef.id, columnWidthValue(safeObject(saved.columnWidths)[questionDef.id])])
        .filter((entry) => entry[1])),
      commentEditor: null,
      detailPopover: null,
      answers: Object.assign({}, current.answers),
      closingNote: typeof saved.closingNote === "string" ? saved.closingNote : current.closingNote
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
    answerHydrators[questionDef.type](questionDef, answer, savedAnswer, initial);
    return answer;
  }

  const textExporters = {
    choice: appendChoiceAnswer,
    evaluation: appendEvaluationAnswer,
    bucket: appendBucketAnswer,
    flow: appendFlowAnswer,
    sequence: appendSequenceAnswer,
    edit: appendEditAnswer
  };

  function buildTextExport(config, state) {
    const lines = [`# ${config.title}`, ""];
    const closingNote = String(state.closingNote || "").trim();
    let changed = false;
    config.questions.forEach((questionDef, index) => {
      const answer = state.answers[questionDef.id];
      if (!isAnswerChanged(questionDef, answer)) return;
      changed = true;
      lines.push(`## ${index + 1}. ${questionDef.prompt}`);
      textExporters[questionDef.type](lines, questionDef, answer);
      lines.push("");
    });
    if (!changed && !closingNote) lines.push("No user changes yet.");
    if (closingNote) lines.push("## Not covered by the questions", closingNote);

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function appendChoiceAnswer(lines, questionDef, answer) {
    const selectedIds = asArray(answer.selected);
    const selectedTitle = (option) => `${option.title}${option.custom ? " (added by user)" : ""}`;
    if (questionDef.select === "many" && selectedIds.length) {
      lines.push("Selected:");
      selectedIds.map((id) => findOption(questionDef, answer, id)).filter(Boolean)
        .forEach((option) => lines.push(`- ${selectedTitle(option)}`));
    }
    if (questionDef.select === "one" && answer.selected) {
      const selected = findOption(questionDef, answer, answer.selected);
      if (selected) lines.push(`Selected: ${selectedTitle(selected)}`);
    }
    const added = asArray(answer.added).filter((entry) => entry.title || selectedIds.includes(entry.id) || optionComment(answer, entry.id));
    if (added.length) {
      lines.push("Added custom options:");
      added.forEach((entry) => {
        const selected = selectedIds.includes(entry.id) ? "selected" : "not selected";
        const comment = optionComment(answer, entry.id);
        lines.push(`- ${entry.title} (${selected})${comment ? ` Comment: ${comment}` : ""}`);
      });
    }
    appendComments(lines, optionComments(answerOptions(questionDef, answer), answer.comments));
  }

  function appendEvaluationAnswer(lines, questionDef, answer) {
    const selected = questionDef.options.find((entry) => entry.id === answer.selected);
    if (selected) lines.push(`Selected: ${selected.title}`);
    appendComments(lines, optionComments(questionDef.options, answer.optionComments), "Column comments:");
    appendComments(lines, evaluationRowComments(questionDef.rows, answer.rowComments), "Criterion comments:");
  }

  function appendBucketAnswer(lines, questionDef, answer) {
    const groups = bucketGroups(questionDef, answer);
    questionDef.buckets.forEach((bucket) => {
      const options = questionDef.ordered
        ? groups.get(bucket.id)
        : questionDef.options.filter((entry) => answer.buckets[entry.id] === bucket.id);
      if (!options.length) return;
      lines.push(`${bucket.title}:`);
      options.forEach((entry, index) => {
        const comment = optionComment(answer, entry.id);
        const marker = questionDef.ordered ? `${index + 1}.` : "-";
        lines.push(`${marker} ${entry.title}${comment ? ` Comment: ${comment}` : ""}`);
      });
    });
    const unset = questionDef.options.filter((entry) => !answer.buckets[entry.id] && optionComment(answer, entry.id));
    if (unset.length) {
      lines.push("Unsorted:");
      unset.forEach((entry) => lines.push(`- ${entry.title}`));
    }
  }

  function appendEditAnswer(lines, questionDef, answer) {
    if (String(answer.content || "") !== artifactText(questionDef.artifact)) {
      lines.push("Edited artifact:");
      lines.push("```");
      lines.push(answer.content || "");
      lines.push("```");
    }
    if (answer.summary) lines.push(`Overall comment: ${answer.summary}`);
  }

  function appendFlowAnswer(lines, questionDef, answer) {
    const nodes = normalizeFlowNodes(answer.nodes, answer.connections);
    const connections = normalizeFlowConnections(answer.connections, false);
    if (answer.confirmed) {
      const connected = new Set();
      connections.forEach((connection) => {
        connected.add(connection.from);
        connected.add(connection.to);
      });
      lines.push(answer.updated ? "Status: Updated." : "Status: Confirmed unchanged.");
      lines.push("Final flow:");
      lines.push("```plantuml");
      lines.push("@startuml");
      nodes.filter((node) => !connected.has(node.name))
        .forEach((node) => lines.push(`node "${flowExportText(node.name)}"`));
      connections.forEach((connection) => {
        const label = connection.label ? ` : ${flowExportText(connection.label)}` : "";
        lines.push(`"${flowExportText(connection.from)}" --> "${flowExportText(connection.to)}"${label}`);
      });
      lines.push("@enduml");
      lines.push("```");
    }
    if (answer.comment) lines.push(`Overall comment: ${answer.comment}`);
    const comments = [];
    nodes.filter((node) => node.comment).forEach((node) => {
      comments.push(`- Node "${node.name}": ${node.comment}`);
    });
    connections.filter((connection) => connection.comment).forEach((connection) => {
      comments.push(`- Connection "${connection.from}" --> "${connection.to}": ${connection.comment}`);
    });
    if (comments.length) {
      lines.push("Comments:");
      lines.push(...comments);
    }
  }

  function appendSequenceAnswer(lines, questionDef, answer) {
    if (answer.confirmed) {
      lines.push(isSequenceChanged(questionDef, answer) ? "Status: Updated." : "Status: Confirmed unchanged.");
      lines.push("Final sequence:");
      lines.push("```lines-and-arrows");
      lines.push(normalizeSequenceSource(answer.source));
      lines.push("```");
    }
    if (answer.comment) lines.push(`Overall comment: ${answer.comment}`);
  }

  function appendComments(lines, comments, heading) {
    if (!comments.length) return;
    lines.push(heading || "Comments:");
    comments.forEach((entry) => lines.push(`- ${entry.title}: ${entry.comment}`));
  }

  const answerChangeChecks = {
    choice(questionDef, answer) {
      return Boolean(asArray(answer.selected).length || asArray(answer.added).length || optionComments(answerOptions(questionDef, answer), answer.comments).length);
    },
    evaluation(questionDef, answer) {
      return Boolean(
        answer.selected ||
        optionComments(questionDef.options, answer.optionComments).length ||
        evaluationRowComments(questionDef.rows, answer.rowComments).length
      );
    },
    bucket: (questionDef, answer) => Boolean(
      Object.values(safeObject(answer.buckets)).some(Boolean) ||
      optionComments(questionDef.options, answer.comments).length
    ),
    flow: (questionDef, answer) => Boolean(answer.confirmed || isFlowChanged(questionDef, answer)),
    sequence: (_questionDef, answer) => Boolean(answer.confirmed || answer.comment),
    edit: (questionDef, answer) => Boolean(String(answer.content || "") !== artifactText(questionDef.artifact) || answer.summary)
  };

  function isAnswerChanged(questionDef, answer) {
    return Boolean(answer && answerChangeChecks[questionDef.type](questionDef, answer));
  }

  // Rendering and styles -----------------------------------------------------

  const styles = `
    :root {
      color-scheme: light;
      --ih-bg: #f4f7f5;
      --ih-surface: #ffffff;
      --ih-surface-2: #e9f0ec;
      --ih-ink: #183027;
      --ih-muted: #60746a;
      --ih-line: #d5e0da;
      --ih-line-strong: #9aada3;
      --ih-accent: #18765a;
      --ih-accent-ink: #f5fff9;
      --ih-accent-soft: rgb(24 118 90 / 13%);
      --ih-good: #267c5d;
      --ih-visited: #a5b5ac;
      --ih-warn: #92702a;
      --ih-warn-soft: rgb(146 112 42 / 16%);
      --ih-danger: #ad5753;
      --ih-best: #18765a;
      --ih-best-ink: #0f4635;
      --ih-shadow: 0 14px 34px rgb(38 72 57 / 10%);
      --ih-radius: 15px;
      --ih-mark-radius: 14px;
      --ih-code-bg: #f1f6f3;
      --ih-code-ink: #183027;
      --ih-flow-node: #ffffff;
      --ih-flow-node-hover: #e9f0ec;
      --ih-flow-edge: #789187;
      --ih-flow-label-bg: #f1f6f3;
      --ih-max: 1480px;
      --ih-choice-column-width: 430px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    html[data-ih-theme="dark"] {
      color-scheme: dark;
      --ih-bg: #14201b;
      --ih-surface: #1d2b25;
      --ih-surface-2: #293b33;
      --ih-ink: #eff7f2;
      --ih-muted: #a9bbb1;
      --ih-line: #344b40;
      --ih-line-strong: #60776c;
      --ih-accent: #74d2ad;
      --ih-accent-ink: #0e2a1f;
      --ih-accent-soft: rgb(116 210 173 / 16%);
      --ih-good: #74d2ad;
      --ih-visited: #53665d;
      --ih-warn: #d8b56c;
      --ih-warn-soft: rgb(216 181 108 / 20%);
      --ih-danger: #e5978e;
      --ih-best: #8cdbbc;
      --ih-best-ink: #163f31;
      --ih-shadow: 0 18px 42px rgb(0 0 0 / 24%);
      --ih-code-bg: #101914;
      --ih-code-ink: #edf8f1;
      --ih-flow-node: #293b33;
      --ih-flow-node-hover: #344b40;
      --ih-flow-edge: #6c8579;
      --ih-flow-label-bg: #101914;
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
    .ih-intro > :first-child { margin-top: 0; }
    .ih-intro > :last-child { margin-bottom: 0; }
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
    .ih-timeline-dot.is-partial { background: var(--ih-visited); }
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
    .ih-question-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: end;
      margin-bottom: clamp(16px, 2.4vw, 24px);
    }
    .ih-question-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 10px; }
    .ih-question-head > div { min-width: 0; }
    .ih-kicker { margin: 0 0 8px; color: var(--ih-accent); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 850; }
    .ih-prompt { margin: 0; max-width: 980px; font-size: clamp(22px, 2.5vw, 34px); line-height: 1.12; letter-spacing: 0; }
    .ih-export-note, .ih-question-note { margin: 10px 0 0; max-width: 900px; color: var(--ih-muted); line-height: 1.5; font-size: clamp(14px, 1vw, 16px); }
    .ih-closing-note { display: grid; gap: 6px; margin-bottom: 14px; }
    .ih-closing-note-help { margin: 0 0 6px; color: var(--ih-muted); line-height: 1.45; font-size: 14px; }
    .ih-closing-note .ih-field { min-height: 88px; }

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
    .ih-choice.is-selected,
    .ih-choice.is-selected:hover {
      box-shadow:
        0 0 0 2px color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        0 0 14px rgb(242 193 78 / 28%);
    }
    .ih-option-top { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
    .ih-option-actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .ih-option-title { margin: 0; font-size: clamp(16px, 1.25vw, 20px); line-height: 1.18; letter-spacing: 0; }
    .ih-icon-btn, .ih-comment-button, .ih-move-button, .ih-remove-icon {
      width: 26px;
      height: 26px;
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
    .ih-move-button svg, .ih-remove-icon svg { width: 18px; height: 18px; }
    .ih-move-button svg { fill: currentColor; display: block; }
    .ih-app .ih-comment-button, .ih-evaluation-detail-button {
      width: 26px;
      height: 26px;
      background: transparent;
      color: color-mix(in srgb, var(--ih-muted) 82%, var(--ih-surface));
    }
    .ih-app .ih-comment-button {
      padding: 2px;
    }
    .ih-app .ih-comment-button svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
      display: block;
    }
    .ih-evaluation-detail-button svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
      display: block;
    }
    .ih-app .ih-comment-button:hover, .ih-evaluation-detail-button:hover { color: color-mix(in srgb, var(--ih-accent) 56%, var(--ih-muted)); }
    .ih-app .ih-comment-button.has-comment { color: color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)); background: transparent; }
    .ih-app .ih-comment-button.has-comment svg { filter: drop-shadow(0 0 5px rgb(242 193 78 / 30%)); }
    .ih-app .ih-comment-button.has-comment:hover { color: color-mix(in srgb, var(--ih-warn) 84%, var(--ih-ink)); }
    .ih-move-menu { display: inline-grid; }
    .ih-move-menu[open] { z-index: 70; }
    .ih-move-button { list-style: none; border-color: transparent; background: transparent; color: color-mix(in srgb, var(--ih-muted) 82%, var(--ih-surface)); }
    .ih-move-button::-webkit-details-marker { display: none; }
    .ih-move-button::marker { content: ""; }
    .ih-move-button:hover, .ih-move-menu[open] .ih-move-button { background: transparent; color: color-mix(in srgb, var(--ih-accent) 56%, var(--ih-muted)); }
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
    .ih-markdown > :first-child { margin-top: 0; }
    .ih-markdown > :last-child { margin-bottom: 0; }
    .ih-markdown p, .ih-markdown ul, .ih-markdown ol, .ih-markdown pre, .ih-markdown blockquote { margin-block: .5em; }
    .ih-markdown ul, .ih-markdown ol { padding-left: 1.35em; }
    .ih-markdown code { font: .92em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .ih-markdown pre { overflow: auto; padding: 8px; border-radius: var(--ih-radius); background: var(--ih-code-bg); color: var(--ih-code-ink); }
    .ih-markdown a { color: var(--ih-accent); }
    .ih-frame-shell { overflow: hidden; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-frame-bar { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 4px 3px 9px; border-bottom: 1px solid var(--ih-line); background: color-mix(in srgb, var(--ih-surface) 74%, var(--ih-surface-2)); }
    .ih-frame-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ih-muted); font-size: 11px; font-weight: 760; line-height: 1.1; }
    .ih-frame-open { flex: 0 0 auto; width: 24px; min-height: 22px; display: inline-grid; place-items: center; border: 0; border-radius: 6px; padding: 0; background: var(--ih-surface); color: var(--ih-accent); text-decoration: none; font: inherit; line-height: 1; cursor: pointer; }
    .ih-frame-open:hover { background: var(--ih-accent-soft); color: var(--ih-accent); }
    .ih-frame-open svg { width: 14px; height: 14px; }
    .ih-frame { display: block; width: 100%; height: min(54vh, 520px); border: 0; background: var(--ih-surface-2); }
    .ih-frame-shell.is-phone { overflow: visible; display: grid; gap: 10px; background: transparent; }
    .ih-frame-shell.is-phone > .ih-frame-bar { border-bottom: 0; border-radius: var(--ih-radius); }
    .ih-phone-fit { min-width: 0; width: 100%; display: flex; justify-content: center; }
    .ih-phone { flex: 0 0 auto; align-self: flex-start; padding: 10px; border: 1px solid var(--ih-line-strong); border-radius: 50px; background: #15191a; box-shadow: var(--ih-shadow); transform: scale(var(--ih-phone-scale, 1)); transform-origin: top center; }
    .ih-phone > iframe { display: block; width: 390px; height: 780px; border: 0; border-radius: 40px; background: #fff; }
    .ih-bucket-board:has(.is-dragging) iframe { pointer-events: none; }
    .ih-html-preview { overflow: auto; }
    .ih-html-preview > svg { display: block; width: 100%; height: auto; }
    .ih-html-preview > * + * { margin-top: 9px; }
    .ih-html-preview figure { margin: 0; display: grid; gap: 6px; }
    .ih-html-preview img { display: block; width: 100%; max-height: 240px; object-fit: cover; border: 0; border-radius: var(--ih-radius); background: var(--ih-surface-2); }
    .ih-html-preview figcaption { color: var(--ih-muted); font-size: 12px; }
    .ih-html-preview table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ih-html-preview th, .ih-html-preview td { border-bottom: 0; padding: 6px 7px; text-align: left; vertical-align: top; }
    .ih-html-preview th { color: var(--ih-ink); font-weight: 850; }
    .ih-html-preview .ih-mini-callout { border-left: 0; padding: 8px 10px; background: var(--ih-surface-2); color: var(--ih-ink); }
    .ih-evaluation-board {
      --ih-evaluation-column-width: 220px;
      --ih-column-fade: color-mix(in srgb, var(--ih-surface) 88%, var(--ih-bg));
      container-type: inline-size;
      min-width: 0;
      border-radius: var(--ih-radius);
      background: color-mix(in srgb, var(--ih-surface) 72%, var(--ih-surface-2));
      overflow: visible;
    }
    .ih-evaluation-board[data-column-width="medium"] { --ih-evaluation-column-width: 460px; }
    .ih-evaluation-board[data-column-width="wide"] { --ih-evaluation-column-width: 680px; }
    .ih-evaluation-board[data-preview-frame="phone"][data-column-width="narrow"] { --ih-evaluation-column-width: 440px; }
    .ih-evaluation-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 14px; border-bottom: 1px solid color-mix(in srgb, var(--ih-line) 80%, transparent); }
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
      --ih-evaluation-feature-width: clamp(240px, min(28cqw, calc(100cqw - (var(--ih-evaluation-option-count, 3) * var(--ih-evaluation-column-width)))), 430px);
      width: max(100%, calc(var(--ih-evaluation-feature-width) + (var(--ih-evaluation-option-count, 3) * var(--ih-evaluation-column-width))));
      min-width: calc(var(--ih-evaluation-feature-width) + (var(--ih-evaluation-option-count, 3) * var(--ih-evaluation-column-width)));
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }
    .ih-evaluation-feature-col { width: var(--ih-evaluation-feature-width); }
    .ih-evaluation-table th, .ih-evaluation-table td { border-bottom: 1px solid color-mix(in srgb, var(--ih-line) 72%, transparent); border-right: 1px solid color-mix(in srgb, var(--ih-line) 48%, transparent); padding: 11px 12px; text-align: left; vertical-align: top; }
    .ih-evaluation-table td { vertical-align: middle; }
    .ih-evaluation-table th:last-child, .ih-evaluation-table td:last-child { border-right: 0; }
    .ih-evaluation-table thead th { background: var(--ih-surface); padding: 10px; }
    .ih-evaluation-table thead th.is-selected {
      background: var(--ih-surface);
      color: var(--ih-ink);
      box-shadow:
        inset 2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        inset -2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        inset 0 2px 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        0 0 12px rgb(242 193 78 / 22%);
    }
    .ih-evaluation-table td.is-selected {
      box-shadow:
        inset 2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        inset -2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted));
    }
    .ih-evaluation-table tbody tr:last-child td.is-selected {
      box-shadow:
        inset 2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        inset -2px 0 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted)),
        inset 0 -2px 0 color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted));
    }
    .ih-evaluation-table thead th:first-child, .ih-evaluation-table tbody th { position: sticky; left: 0; z-index: 4; box-shadow: 1px 0 0 color-mix(in srgb, var(--ih-line) 56%, transparent); }
    .ih-evaluation-table tbody th:not(.ih-evaluation-group-cell) { z-index: 2; }
    .ih-evaluation-feature-head { color: var(--ih-muted); }
    .ih-evaluation-table thead th[data-action] { cursor: pointer; }
    .ih-evaluation-table thead th[data-action]:focus-visible { outline: 3px solid var(--ih-accent-soft); outline-offset: -3px; }
    .ih-evaluation-table tbody td[data-action="choose-evaluation-option"] { cursor: pointer; }
    .ih-evaluation-table tbody td[data-action="choose-evaluation-option"]:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--ih-warn) 54%, transparent);
      outline-offset: -3px;
    }
    .ih-evaluation-column { min-width: 0; width: 100%; display: grid; gap: 6px; color: inherit; }
    .ih-evaluation-column-actions { min-height: 26px; display: flex; align-items: start; justify-content: space-between; gap: 8px; }
    .ih-evaluation-column-title { min-width: 0; font-size: 14px; font-weight: 850; line-height: 1.18; overflow-wrap: normal; word-break: normal; hyphens: auto; }
    .ih-evaluation-column-markdown { color: var(--ih-muted); font-size: 11px; font-weight: 600; line-height: 1.35; }
    .ih-evaluation-column-tags { min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .ih-evaluation-column-tag { max-width: 100%; border-radius: 999px; background: color-mix(in srgb, var(--ih-ink) 8%, transparent); color: currentColor; opacity: .74; padding: 3px 6px; font-size: 10px; font-weight: 760; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ih-evaluation-group-row th { background: color-mix(in srgb, var(--ih-ink) 6%, var(--ih-surface-2)); color: var(--ih-accent); font-size: 12px; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; padding: 8px 12px; }
    .ih-evaluation-group-row td { background: color-mix(in srgb, var(--ih-ink) 4%, var(--ih-surface-2)); padding: 8px 0; }
    .ih-evaluation-group-cell { z-index: 3; }
    .ih-evaluation-table tbody th { background: color-mix(in srgb, var(--ih-surface) 80%, var(--ih-bg)); }
    .ih-evaluation-row-title { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; color: var(--ih-ink); font-size: 14px; font-weight: 850; line-height: 1.2; }
    .ih-evaluation-row-title .ih-comment-button { align-self: start; }
    .ih-evaluation-table tbody th p { margin: 6px 0 0; color: var(--ih-muted); font-size: 12px; line-height: 1.35; font-weight: 500; }
    .ih-evaluation-cell-shell { position: relative; width: 100%; min-height: 30px; display: block; padding-right: 24px; }
    .ih-evaluation-cell-shell > .ih-evaluation-detail-button { position: absolute; top: 50%; right: 2px; width: 20px; height: 20px; opacity: .7; transform: translateY(-50%); }
    .ih-evaluation-cell { min-height: 30px; display: inline-flex; align-items: center; gap: 6px; color: var(--ih-ink); font-size: 12px; font-weight: 850; line-height: 1.25; max-width: 100%; overflow-wrap: normal; word-break: normal; }
    .ih-evaluation-cell svg { width: 16px; height: 16px; fill: currentColor; stroke: none; flex: 0 0 auto; }
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
    }
    .ih-evaluation-detail-button {
      width: 26px;
      height: 26px;
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
      fill: currentColor;
      display: block;
    }
    .ih-evaluation-table td.is-selected .ih-evaluation-detail-button { color: color-mix(in srgb, var(--ih-warn) 58%, var(--ih-muted)); }
    .ih-evaluation-table thead .ih-evaluation-detail-button,
    .ih-evaluation-table thead .ih-comment-button { color: currentColor; opacity: .62; }
    .ih-evaluation-table thead th.is-selected .ih-evaluation-detail-button,
    .ih-evaluation-table thead th.is-selected .ih-comment-button { color: currentColor; opacity: .76; }
    .ih-evaluation-table thead .ih-evaluation-detail-button:hover,
    .ih-evaluation-table thead .ih-comment-button:hover { color: currentColor; opacity: 1; }
    .ih-evaluation-table thead .ih-comment-button.has-comment,
    .ih-evaluation-table thead th.is-selected .ih-comment-button.has-comment {
      color: color-mix(in srgb, var(--ih-warn) 72%, var(--ih-muted));
      opacity: 1;
    }
    .ih-evaluation-table thead .ih-comment-button.has-comment:hover,
    .ih-evaluation-table thead th.is-selected .ih-comment-button.has-comment:hover {
      color: color-mix(in srgb, var(--ih-warn) 84%, var(--ih-ink));
      opacity: 1;
    }
    .ih-add-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: start; margin-top: 14px; }
    .ih-add-row textarea { min-height: 70px; }
    .ih-add-row .ih-btn { justify-self: start; }
    .ih-bucket-card {
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
    .ih-bucket-card .ih-option-title { font-size: 14px; line-height: 1.25; }
    .ih-bucket-card .ih-rich { font-size: 12px; line-height: 1.35; }
    .ih-bucket-card > .ih-option-title { grid-column: 2; grid-row: 1; align-self: center; }
    .ih-bucket-card > .ih-bucket-actions { grid-column: 3; grid-row: 1; align-self: center; justify-self: end; display: inline-flex; align-items: center; gap: 6px; }
    .ih-bucket-card-content { grid-column: 1 / -1; grid-row: 2; min-width: 0; width: 100%; display: grid; gap: 8px; }
    .ih-bucket-card.is-dragging { opacity: .55; }
    .ih-bucket-position {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      border-radius: 999px;
      background: var(--ih-accent-soft);
      color: var(--ih-accent);
      padding: 0 6px;
      font-size: 12px;
      font-weight: 850;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      vertical-align: 1px;
    }
    .ih-bucket-position[hidden] { display: none; }
    .ih-bucket.is-drop-target { box-shadow: 0 0 0 3px var(--ih-accent-soft); }
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
    .ih-bucket-overflow { --ih-bucket-column-width: 220px; --ih-column-fade: var(--ih-bg); }
    .ih-bucket-overflow[data-column-width="medium"] { --ih-bucket-column-width: min(600px, calc(100vw - 64px)); }
    .ih-bucket-overflow[data-column-width="wide"] { --ih-bucket-column-width: min(780px, calc(100vw - 64px)); }
    .ih-bucket-overflow > .ih-column-hints { margin-bottom: 8px; }
    .ih-bucket-frame { overflow-x: auto; padding-bottom: 4px; overscroll-behavior-x: contain; }
    .ih-bucket-board { display: flex; align-items: stretch; gap: 12px; min-width: calc((var(--ih-bucket-count, 1) * var(--ih-bucket-column-width)) + ((var(--ih-bucket-count, 1) - 1) * 12px)); }
    .ih-bucket { flex: 1 0 var(--ih-bucket-column-width); min-width: 0; display: grid; grid-template-rows: auto minmax(128px, 1fr); border: 0; border-radius: var(--ih-radius); background: color-mix(in srgb, var(--ih-surface) 74%, var(--ih-surface-2)); padding: 10px; min-height: 180px; }
    .ih-bucket-title { font-weight: 850; margin-bottom: 8px; font-size: 14px; }
    .ih-bucket-list { display: grid; gap: 7px; min-height: 128px; align-content: start; }
    .ih-bucket-empty { color: var(--ih-muted); font-size: 12px; padding: 7px 0; }
    .ih-bucket-view-toolbar { display: flex; justify-content: end; align-self: end; }
    .ih-column-edges { position: relative; }
    .ih-column-edges::before,
    .ih-column-edges::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 13;
      width: 56px;
      pointer-events: none;
      opacity: 0;
      transition: opacity .16s ease;
    }
    .ih-column-edges::before { left: var(--ih-column-edge-start, 0px); background: linear-gradient(to right, color-mix(in srgb, var(--ih-ink) 14%, transparent), transparent 8px), linear-gradient(to right, var(--ih-column-fade), transparent); }
    .ih-column-edges::after { right: 0; background: linear-gradient(to left, color-mix(in srgb, var(--ih-ink) 14%, transparent), transparent 8px), linear-gradient(to left, var(--ih-column-fade), transparent); }
    .ih-column-edges.is-overflow-start::before,
    .ih-column-edges.is-overflow-end::after { opacity: 1; }
    .ih-column-hints { display: flex; flex-wrap: wrap; justify-content: end; gap: 6px; }
    .ih-column-hints:not(:has(.ih-column-hint:not([hidden]))) { display: none; }
    .ih-app .ih-column-hint {
      min-height: 28px;
      border: 0;
      border-radius: 999px;
      background: var(--ih-accent-soft);
      color: var(--ih-accent);
      padding: 4px 11px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .ih-app .ih-column-hint:hover { background: color-mix(in srgb, var(--ih-accent) 24%, transparent); }
    .ih-column-hint[hidden] { display: none; }
    .ih-column-width-control { display: inline-flex; align-items: center; gap: 8px; }
    .ih-column-width-label { color: var(--ih-muted); font-size: 12px; font-weight: 760; }
    .ih-column-width-options {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border-radius: 999px;
      background: var(--ih-surface-2);
      padding: 3px;
    }
    .ih-app .ih-column-width-option {
      width: 34px;
      height: 32px;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--ih-muted);
      padding: 7px;
    }
    .ih-column-width-option svg { display: block; width: 20px; height: 20px; }
    .ih-column-width-option:hover { color: var(--ih-ink); }
    .ih-column-width-option.is-selected { background: var(--ih-accent); color: var(--ih-accent-ink); }
    .ih-bucket-view-options,
    .ih-bucket-state-options {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;
      max-width: 100%;
      border-radius: 999px;
      background: var(--ih-surface-2);
      padding: 3px;
    }
    .ih-app .ih-bucket-view-option,
    .ih-app .ih-bucket-state-option {
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--ih-muted);
      padding: 6px 10px;
      font-size: 10px;
      font-weight: 760;
      line-height: 1.2;
      white-space: nowrap;
    }
    .ih-app .ih-bucket-view-option { font-size: 12px; padding: 7px 12px; }
    .ih-bucket-view-option:hover,
    .ih-bucket-state-option:hover { color: var(--ih-ink); }
    .ih-bucket-view-option.is-selected,
    .ih-bucket-state-option.is-selected {
      background: var(--ih-accent);
      color: var(--ih-accent-ink);
    }
    .ih-bucket-table { display: grid; gap: 8px; }
    .ih-bucket-table-card { display: grid; gap: 9px; }
    .ih-bucket-table-heading {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }
    .ih-bucket-table-heading .ih-tags { justify-content: end; }
    .ih-bucket-table-card .ih-option-title { font-size: 14px; line-height: 1.25; }
    .ih-bucket-table-controls {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }
    .ih-bucket-state-options { width: max-content; }
    .ih-bucket-table-actions {
      display: inline-flex;
      align-items: center;
      justify-self: end;
      gap: 6px;
    }
    .ih-bucket-table-content { min-width: 0; display: grid; gap: 8px; }
    .ih-bucket-table.is-ordered { gap: 18px; }
    .ih-bucket-table-list { display: grid; gap: 8px; }
    .ih-bucket-reorder { display: inline-flex; align-items: center; gap: 2px; }
    .ih-bucket-reorder[hidden] { display: none; }
    .ih-app .ih-bucket-reorder-button { background: transparent; color: color-mix(in srgb, var(--ih-muted) 82%, var(--ih-surface)); }
    .ih-bucket-reorder-button svg { width: 18px; height: 18px; display: block; }
    .ih-app .ih-bucket-reorder-button:hover:not(:disabled) { color: color-mix(in srgb, var(--ih-accent) 56%, var(--ih-muted)); }
    .ih-bucket-reorder-button:disabled { opacity: .38; cursor: not-allowed; }
    .ih-bucket-table-content .ih-rich { font-size: 12px; line-height: 1.35; }
    .ih-flow { padding: 0; overflow: hidden; }
    .ih-flow-toolbar { display: grid; gap: 8px; padding: 11px 12px; border-bottom: 1px solid var(--ih-line); background: var(--ih-surface-2); }
    .ih-flow-toolbar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; }
    .ih-flow-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: 0 0 auto; }
    .ih-flow-response-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 8px; margin-left: auto; }
    .ih-flow-danger { color: var(--ih-danger); }
    .ih-flow-danger .ih-shortcut-key { margin-left: 1px; }
    .ih-flow-history-button { width: 32px; height: 32px; background: transparent; }
    .ih-flow-history-button svg { width: 20px; height: 20px; display: block; }
    .ih-flow-history-button:hover:not(:disabled) { background: transparent; color: color-mix(in srgb, var(--ih-accent) 56%, var(--ih-muted)); }
    .ih-flow-history-button:disabled { opacity: .38; cursor: not-allowed; }
    .ih-flow-tip { margin: 0; color: var(--ih-muted); font-size: 12px; line-height: 1.4; }
    .ih-flow-tip .ih-shortcut-key { display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; vertical-align: 1px; }
    .ih-flow .ih-shortcut-key { display: inline-flex; align-items: center; justify-content: center; }
    .ih-flow-key-glyph { display: inline-block; font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif; }
    .ih-flow-canvas {
      position: relative;
      width: 100%;
      height: min(58vh, 620px);
      min-height: 460px;
      background:
        linear-gradient(rgb(255 255 255 / 2%) 1px, transparent 1px),
        linear-gradient(90deg, rgb(255 255 255 / 2%) 1px, transparent 1px),
        var(--ih-code-bg);
      background-size: 24px 24px;
    }
    .ih-flow-canvas canvas { outline: 0; }
    .ih-flow-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ih-muted); font-size: 13px; }
    .ih-flow-selection { min-height: 64px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--ih-line); background: var(--ih-surface-2); }
    .ih-flow-selection-empty { grid-column: 1 / -1; margin: 0; color: var(--ih-muted); font-size: 13px; }
    .ih-flow-selected-value { min-width: 0; }
    .ih-flow-selection-actions { display: inline-flex; align-items: center; gap: 8px; }
    .ih-sequence { padding: 0; overflow: hidden; }
    .ih-sequence-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px; border-bottom: 1px solid var(--ih-line); background: var(--ih-surface-2); }
    .ih-sequence-status { margin: 0; color: var(--ih-muted); font-size: 13px; line-height: 1.4; }
    .ih-sequence-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .ih-sequence-editor { min-height: 360px; background: var(--ih-code-bg); }
    .ih-sequence-editor lines-and-arrows { display: block; width: 100%; min-height: 360px; }
    .ih-sequence-loading { min-height: 360px; display: grid; place-items: center; color: var(--ih-muted); font-size: 13px; }
    .ih-sequence-error { margin: 0; padding: 10px 12px; border-top: 1px solid var(--ih-line); color: var(--ih-danger); background: var(--ih-surface-2); font-size: 13px; }
    .ih-sequence-fallback { min-height: 360px; border: 0; border-top: 1px solid var(--ih-line); border-radius: 0; }
    .ih-edit { display: grid; gap: 10px; }
    .ih-code-editor-host, .ih-code-fallback {
      min-height: 440px;
      border: 0;
      border-radius: var(--ih-radius);
      background: var(--ih-code-bg);
      color: var(--ih-code-ink);
      overflow: hidden;
    }
    .ih-code-editor-host { display: none; }
    .ih-code-editor-host .cm-editor { min-height: 440px; }
    .ih-code-editor-host .cm-editor { font-size: 13px; }
    .ih-code-editor-host .cm-scroller { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.55; }
    .ih-code-fallback { display: block; width: 100%; padding: 12px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize: vertical; white-space: pre; }
    .ih-sequence-fallback[hidden] { display: none; }
    [data-edit].has-editor .ih-code-editor-host { display: block; }
    [data-edit].has-editor .ih-code-fallback { display: none; }
    .ih-editor-loading { color: var(--ih-muted); font-size: 13px; padding: 12px 0 0; }

    .ih-output { min-height: 420px; max-height: 62vh; overflow: auto; white-space: pre-wrap; word-break: break-word; background: var(--ih-code-bg); color: var(--ih-code-ink); border-radius: var(--ih-radius); padding: 16px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .ih-mount-error { display: grid; gap: 14px; max-width: 980px; }
    .ih-mount-error .ih-question-head { margin-bottom: 4px; }
    .ih-mount-error .ih-option-top { align-items: center; }
    .ih-mount-error-list { margin: 12px 0 0; padding-left: 20px; display: grid; gap: 8px; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .ih-mount-error-list li::marker { color: var(--ih-danger); }
    .ih-mount-error-report { min-height: 0; margin: 12px 0 0; }

    .ih-bottom { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; border-top: 0; background: color-mix(in srgb, var(--ih-bg) 92%, transparent); box-shadow: 0 -1px 0 rgb(255 255 255 / 4%), 0 -12px 28px rgb(8 14 13 / 16%); backdrop-filter: blur(16px); }
    .ih-bottom-inner { max-width: var(--ih-max); margin: 0 auto; padding: 11px clamp(14px, 3vw, 34px); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .ih-toast { position: fixed; right: 20px; bottom: 78px; z-index: 60; background: var(--ih-ink); color: var(--ih-surface); border-radius: 999px; padding: 11px 14px; box-shadow: var(--ih-shadow); font-weight: 760; opacity: 0; transform: translateY(10px); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .ih-toast.is-visible { opacity: 1; transform: none; }

    .ih-comment-popover-backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(8 14 13 / 60%); display: grid; place-items: center; padding: 18px; }
    .ih-comment-popover { width: min(720px, 100%); border: 0; border-radius: var(--ih-radius); background: var(--ih-surface); box-shadow: var(--ih-shadow); padding: 14px; }
    .ih-comment-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
    .ih-comment-head h3 { margin: 0; font-size: 16px; }
    .ih-shortcut-key { min-width: 24px; border-radius: 4px; background: color-mix(in srgb, var(--ih-ink) 10%, transparent); padding: 2px 5px; font: 10px/1.1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-transform: uppercase; }
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
    .ih-evaluation-tooltip-body { margin: 0; font-size: 12px; font-weight: 650; line-height: 1.42; }

    /* Mint Air -------------------------------------------------------------- */

    .ih-app { min-height: 100dvh; }
    .ih-topbar {
      border-bottom: 1px solid transparent;
      background: var(--ih-surface);
      box-shadow: none;
      backdrop-filter: none;
    }
    .ih-topbar-inner { padding-block: 15px; align-items: center; }
    .ih-brand { align-items: center; }
    .ih-mark {
      border: 1px solid color-mix(in srgb, var(--ih-accent) 32%, var(--ih-line));
      background: var(--ih-accent-soft);
      color: var(--ih-accent);
    }
    .ih-title { font-weight: 720; letter-spacing: -.025em; }
    .ih-actions { align-items: center; }
    .ih-theme-switch {
      display: inline-flex;
      gap: 3px;
      padding: 3px;
      border-radius: 12px;
      background: var(--ih-surface-2);
    }
    .ih-theme-option {
      min-height: 30px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--ih-muted);
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 750;
    }
    .ih-theme-option[aria-pressed="true"] {
      background: var(--ih-surface);
      color: var(--ih-ink);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--ih-ink) 9%, transparent);
    }
    .ih-btn {
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: var(--ih-surface);
      box-shadow: none;
    }
    .ih-btn:hover {
      border-color: var(--ih-line-strong);
      background: var(--ih-surface-2);
    }

    .ih-timeline { padding-bottom: 13px; }
    .ih-timeline-list { gap: 12px; counter-reset: ih-step; }
    .ih-timeline-list::before { left: 16px; right: 16px; height: 1px; background: var(--ih-line); }
    .ih-timeline-dot {
      width: 28px;
      height: 28px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: var(--ih-surface);
      color: var(--ih-muted);
      counter-increment: ih-step;
    }
    .ih-timeline-dot::after {
      content: counter(ih-step);
      display: grid;
      place-items: center;
      height: 100%;
      font-size: 10px;
      font-weight: 760;
    }
    .ih-timeline-dot.is-unanswered:not(.is-active):not(.is-partial) {
      background: color-mix(in srgb, var(--ih-accent) 5%, var(--ih-surface-2));
      color: var(--ih-muted);
    }
    .ih-timeline-dot.is-partial {
      border-color: var(--ih-visited);
      background: var(--ih-surface);
      color: var(--ih-visited);
    }
    .ih-timeline-dot.is-answered:not(.is-active) {
      border-color: var(--ih-good);
      background: var(--ih-surface);
      color: var(--ih-good);
    }
    .ih-timeline-dot.is-export::after { content: "✓"; font-size: 13px; font-weight: 750; }
    .ih-timeline-dot.is-export.is-waiting:not(.is-active),
    .ih-timeline-dot.is-export.is-ready:not(.is-active) {
      border-color: transparent;
      background: color-mix(in srgb, var(--ih-accent) 5%, var(--ih-surface-2));
      color: var(--ih-muted);
    }
    .ih-timeline-dot.is-active,
    .ih-timeline-dot.is-export.is-active {
      border-color: var(--ih-accent);
      background: var(--ih-accent);
      color: var(--ih-accent-ink);
      box-shadow: none;
      transform: scale(1.06);
    }

    .ih-main { padding-top: clamp(28px, 4vw, 52px); }
    .ih-kicker { color: var(--ih-muted); letter-spacing: .04em; text-transform: none; }
    .ih-prompt { max-width: 960px; font-size: clamp(26px, 2.8vw, 38px); letter-spacing: -.035em; }
    .ih-grid { column-width: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .ih-grid[data-column-width="narrow"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ih-grid[data-column-width="medium"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ih-grid[data-column-width="wide"] { grid-template-columns: minmax(0, 1fr); }
    .ih-grid > .ih-card { height: 100%; margin: 0; }
    .ih-card {
      border: 1px solid transparent;
      background: var(--ih-surface);
      box-shadow: 0 7px 22px rgb(38 72 57 / 7%);
    }
    html[data-ih-theme="dark"] .ih-card { box-shadow: 0 8px 26px rgb(0 0 0 / 16%); }
    .ih-choice { min-height: 210px; transition: border-color .14s ease, box-shadow .14s ease, background .14s ease; }
    .ih-choice:hover { border-color: var(--ih-line-strong); box-shadow: var(--ih-shadow); }
    .ih-choice.is-selected,
    .ih-choice.is-selected:hover {
      border: 1px solid var(--ih-accent);
      background: color-mix(in srgb, var(--ih-accent) 6%, var(--ih-surface));
      box-shadow: 0 0 0 2px var(--ih-accent-soft);
    }
    .ih-option-title { font-size: clamp(18px, 1.45vw, 22px); letter-spacing: -.025em; }
    .ih-pill { border-radius: 999px; background: var(--ih-surface-2); color: var(--ih-muted); }
    .ih-icon-btn,
    .ih-comment-button,
    .ih-move-button,
    .ih-remove-icon { border-radius: 999px; }
    .ih-bottom {
      border-top: 1px solid transparent;
      background: var(--ih-surface);
      box-shadow: none;
      backdrop-filter: none;
    }

    .ih-evaluation-board { background: color-mix(in srgb, var(--ih-surface) 88%, var(--ih-bg)); }
    .ih-evaluation-head { border-bottom-color: var(--ih-line); }
    .ih-evaluation-table th,
    .ih-evaluation-table td {
      border-bottom-color: color-mix(in srgb, var(--ih-line) 78%, transparent);
      border-right-color: color-mix(in srgb, var(--ih-line) 62%, transparent);
    }
    .ih-evaluation-table thead th.is-selected {
      background: color-mix(in srgb, var(--ih-accent) 7%, var(--ih-surface));
      color: var(--ih-ink);
      box-shadow:
        inset 1px 0 0 var(--ih-accent),
        inset -1px 0 0 var(--ih-accent),
        inset 0 1px 0 var(--ih-accent),
        0 0 12px var(--ih-accent-soft);
    }
    .ih-evaluation-table td.is-selected {
      background: color-mix(in srgb, var(--ih-accent) 4%, transparent);
      box-shadow: inset 1px 0 0 var(--ih-accent), inset -1px 0 0 var(--ih-accent);
    }
    .ih-evaluation-table tbody tr:last-child td.is-selected {
      box-shadow:
        inset 1px 0 0 var(--ih-accent),
        inset -1px 0 0 var(--ih-accent),
        inset 0 -1px 0 var(--ih-accent);
    }
    .ih-evaluation-cell[data-icon="yes"] { color: var(--ih-good); }
    .ih-evaluation-cell[data-icon="no"] { color: var(--ih-danger); }
    .ih-evaluation-cell[data-icon="partial"],
    .ih-evaluation-cell[data-icon="unknown"] { color: var(--ih-muted); }
    .ih-evaluation-cell[data-icon="warn"] { color: var(--ih-warn); }
    .ih-evaluation-cell[data-icon="best"] { color: var(--ih-best); font-weight: 850; }
    .ih-evaluation-cell[data-icon="best"] svg {
      fill: var(--ih-best);
      stroke: var(--ih-best-ink);
      stroke-width: 1.1;
    }

    .ih-flow,
    .ih-flow-toolbar,
    .ih-flow-selection { background: var(--ih-surface); }
    .ih-sequence,
    .ih-sequence-toolbar { background: var(--ih-surface); }
    .ih-flow-canvas {
      background:
        linear-gradient(color-mix(in srgb, var(--ih-line) 52%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--ih-line) 52%, transparent) 1px, transparent 1px),
        var(--ih-code-bg);
      background-size: 24px 24px;
    }
    .ih-flow-selected-value { background: var(--ih-surface-2); color: var(--ih-ink); }
    .ih-code-editor-host,
    .ih-code-fallback,
    .ih-output {
      border: 1px solid var(--ih-line);
      background: var(--ih-code-bg);
      color: var(--ih-code-ink);
    }
    .ih-code-editor-host .cm-editor { background: var(--ih-code-bg); color: var(--ih-code-ink); }
    .ih-code-editor-host .cm-gutters {
      border-right-color: var(--ih-line);
      background: var(--ih-surface-2);
      color: var(--ih-muted);
    }
    .ih-code-editor-host .cm-activeLine,
    .ih-code-editor-host .cm-activeLineGutter { background: var(--ih-accent-soft); }

    @media (max-width: 900px) {
      .ih-topbar-inner { grid-template-columns: 1fr; }
      .ih-actions { justify-content: start; }
      .ih-title, .ih-intro { white-space: normal; }
      .ih-prompt { font-size: clamp(22px, 6vw, 32px); }
      .ih-grid[data-cards-per-row="3"], .ih-grid[data-cards-per-row="4"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ih-bottom-inner { align-items: stretch; }
      .ih-flow-toolbar-row { align-items: start; }
    }
    @media (max-width: 820px) {
      .ih-grid { grid-template-columns: 1fr; }
      .ih-choice { min-height: 0; }
    }
    @media (max-width: 680px) {
      .ih-question-head { grid-template-columns: minmax(0, 1fr); align-items: start; }
      .ih-question-tools { justify-content: start; }
      .ih-evaluation-head { grid-template-columns: minmax(0, 1fr); }
      .ih-column-hints { justify-content: start; }
      .ih-grid[data-column-width] { grid-template-columns: minmax(0, 1fr); }
      .ih-flow-selection { grid-template-columns: minmax(0, 1fr); }
      .ih-flow-selection-actions { justify-self: start; }
      .ih-flow-canvas { min-height: 400px; height: 60vh; }
    }
  `;

  function renderApp(instance) {
    const viewMode = instance.viewMode();
    const isExport = instance.state.step >= instance.config.questions.length;
    const canToggleMode = instance.config.questions.length > 1;
    const themeSwitch = `
      <div class="ih-theme-switch" role="group" aria-label="Color theme">
        <button class="ih-theme-option" type="button" data-action="set-theme" data-theme="light" aria-pressed="${instance.theme === "light" ? "true" : "false"}">Light</button>
        <button class="ih-theme-option" type="button" data-action="set-theme" data-theme="dark" aria-pressed="${instance.theme === "dark" ? "true" : "false"}">Dark</button>
      </div>`;
    const modeToggle = canToggleMode
      ? `<button class="ih-btn ih-mode-toggle" type="button" data-action="toggle-mode">${viewMode === "all" ? "One per page" : "All questions"}</button>`
      : "";
    const stepHtml = viewMode === "all"
      ? renderAllQuestions(instance)
      : isExport ? renderExportStep(instance) : renderQuestionStep(instance, instance.config.questions[instance.state.step], instance.state.step);

    instance.root.innerHTML = `
      <div class="ih-app" data-ih-theme="${escapeAttr(instance.theme)}">
        <header class="ih-topbar">
          <div class="ih-topbar-inner">
            <div class="ih-brand">
              <div class="ih-mark">IH</div>
              <div>
                <h1 class="ih-title">${escapeHTML(instance.config.title)}</h1>
                ${instance.config.intro ? `<div class="ih-intro ih-markdown">${renderMarkdown(instance.config.intro)}</div>` : ""}
              </div>
            </div>
            <div class="ih-actions">
              ${themeSwitch}
              ${modeToggle}
              <button class="ih-btn" type="button" data-action="reset">Reset</button>
            </div>
          </div>
          ${renderTimeline(instance)}
        </header>
        <main class="ih-main ${viewMode === "all" ? "is-all" : ""}">${stepHtml}</main>
        ${viewMode === "paged" ? `<footer class="ih-bottom">
          <div class="ih-bottom-inner">
            <button class="ih-btn" type="button" data-action="back" ${instance.state.step === 0 ? "disabled" : ""}>Back <kbd class="ih-shortcut-key">[</kbd></button>
            <button class="ih-btn" type="button" data-action="next">${escapeHTML(nextLabel(instance))} <kbd class="ih-shortcut-key">]</kbd></button>
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
    const bucketView = questionDef.type === "bucket" ? instance.bucketView(questionDef.id) : "";
    const bucketViewSwitch = questionDef.type === "bucket" ? renderBucketViewSwitch(bucketView) : "";
    const columnWidthControl = shouldRenderColumnWidthControl(questionDef, bucketView)
      ? renderColumnWidthControl(instance.columnWidth(questionDef.id), questionDef.type)
      : "";
    const questionTools = bucketViewSwitch || columnWidthControl
      ? `<div class="ih-question-tools">${bucketViewSwitch}${columnWidthControl}</div>`
      : "";
    const orderNote = questionDef.type === "bucket" && questionDef.ordered
      ? `<p class="ih-question-note">${bucketView === "table" ? "Use the arrows to set the order within a category." : "Drag cards to set their order within a column."}</p>`
      : "";
    return `
      <section class="ih-step" id="ih-question-${index}" data-question-id="${escapeAttr(questionDef.id)}" data-question-index="${index}">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Question ${index + 1} / ${instance.config.questions.length}</p>
            <h2 class="ih-prompt">${escapeHTML(questionDef.prompt)}</h2>
            ${orderNote}
          </div>
          ${questionTools}
        </div>
        ${renderQuestionBody(questionDef, instance.state.answers[questionDef.id], instance)}
      </section>
    `;
  }

  const questionRenderers = {
    choice: renderChoice,
    evaluation: renderEvaluation,
    bucket: renderBucket,
    flow: renderFlow,
    sequence: renderSequence,
    edit: renderEdit
  };

  function renderQuestionBody(questionDef, answer, instance) {
    return questionRenderers[questionDef.type](questionDef, answer, instance);
  }

  function renderChoice(questionDef, answer, instance) {
    const multiple = questionDef.select === "many";
    const selected = multiple ? asArray(answer.selected) : [answer.selected];
    const layout = cardLayout(questionDef.options, questionDef.previewFrame);
    const gridClass = layout === "stack" ? "ih-stack" : "ih-grid";
    const layoutAttr = Number.isInteger(layout) ? ` data-cards-per-row="${layout}"` : "";
    const widthAttr = gridClass === "ih-grid" ? ` data-column-width="${escapeAttr(instance.columnWidth(questionDef.id))}"` : "";
    const options = answerOptions(questionDef, answer).map((entry) => renderChoiceOption(entry, answer, selected.includes(entry.id), questionDef.previewFrame)).join("");
    const addRow = renderAddRow(multiple ? "Add another option" : "Add your own option");
    return `<div class="${gridClass}"${layoutAttr}${widthAttr}>${options}</div>${addRow}`;
  }

  function renderChoiceOption(entry, answer, isSelected, previewFrame) {
    return `
      <article class="ih-card ih-choice ${isSelected ? "is-selected" : ""}" data-option-id="${escapeAttr(entry.id)}" data-action="choose-option" tabindex="0">
        <div class="ih-option-top">
          ${entry.custom ? `<textarea class="ih-field ih-custom-title ih-auto-field" data-input="added-title" data-option-id="${escapeAttr(entry.id)}" rows="2" aria-label="Custom option text">${escapeHTML(entry.title)}</textarea>` : `<h3 class="ih-option-title">${escapeHTML(entry.title)}</h3>`}
          <div class="ih-option-actions">
            ${entry.custom ? "" : renderTooltipButton(entry.title, entry.markdownTooltip)}
            ${entry.custom ? "" : renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on option")}
            ${entry.custom ? `<button class="ih-remove-icon" type="button" data-action="remove-added" data-option-id="${escapeAttr(entry.id)}" aria-label="Remove custom option">${trashIcon()}</button>` : ""}
          </div>
        </div>
        ${renderTags(entry.custom ? ["Your option"] : entry.tags)}
        ${renderCardContent(entry, previewFrame)}
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

  function renderEvaluation(questionDef, answer, instance) {
    const selectedIds = asArray(answer.selected ? [answer.selected] : []);
    const body = [];
    if (questionDef.previewFrame && questionDef.options.some((entry) => entry.htmlPreview)) body.push(renderEvaluationPreviewRow(questionDef, selectedIds));
    let previousGroup = null;
    questionDef.rows.forEach((row) => {
      if (row.group && row.group !== previousGroup) {
        body.push(renderEvaluationGroupRow(questionDef, row, selectedIds));
        previousGroup = row.group;
      }
      body.push(renderEvaluationRow(questionDef, answer, row, selectedIds));
    });
    return `
      <div class="ih-evaluation-board"${renderColumnFrameAttrs(questionDef, instance)}${questionDef.previewFrame ? ` data-preview-frame="${escapeAttr(questionDef.previewFrame)}"` : ""}>
        <div class="ih-evaluation-head">
          <p class="ih-evaluation-note">Select one column. Comment on columns or criteria when the comparison needs clarification.</p>
          ${renderColumnHints()}
        </div>
        <div class="ih-column-edges">
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
          <div class="ih-evaluation-frame" data-column-frame tabindex="0" aria-label="Evaluation table">
            <table class="ih-evaluation-table" style="--ih-evaluation-option-count: ${questionDef.options.length}">
              <colgroup>
                <col class="ih-evaluation-feature-col">
                ${questionDef.options.map(() => `<col class="ih-evaluation-option-col">`).join("")}
              </colgroup>
              <tbody>${body.join("")}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderEvaluationGroupRow(questionDef, row, selectedIds) {
    const cells = questionDef.options.map((optionDef) => {
      return `<td${renderEvaluationCellAttrs(optionDef, selectedIds, `Select ${optionDef.title} column`)}></td>`;
    }).join("");
    return `<tr class="ih-evaluation-group-row"><th class="ih-evaluation-group-cell">${escapeHTML(row.group)}</th>${cells}</tr>`;
  }

  // Phone previews are too tall for the sticky column header, so they get the first body row.
  function renderEvaluationPreviewRow(questionDef, selectedIds) {
    const cells = questionDef.options.map((optionDef) => {
      return `<td${renderEvaluationCellAttrs(optionDef, selectedIds, `Select ${optionDef.title} column`)}>${renderCardContent(Object.assign({}, optionDef, { markdown: "" }), questionDef.previewFrame)}</td>`;
    }).join("");
    return `<tr class="ih-evaluation-preview-row"><th><div class="ih-evaluation-row-title"><span>Preview</span></div></th>${cells}</tr>`;
  }

  function renderEvaluationCellAttrs(optionDef, selectedIds, label) {
    const isSelected = selectedIds.includes(optionDef.id);
    const classAttr = isSelected ? ` class="is-selected"` : "";
    return `${classAttr} data-action="choose-evaluation-option" data-option-id="${escapeAttr(optionDef.id)}" tabindex="0" role="button" aria-pressed="${isSelected ? "true" : "false"}" aria-label="${escapeAttr(label)}"`;
  }

  function renderEvaluationColumn(questionDef, answer, entry, isSelected) {
    return `
      <th class="${isSelected ? "is-selected" : ""}" data-action="choose-evaluation-option" data-option-id="${escapeAttr(entry.id)}" tabindex="0" role="button" aria-pressed="${isSelected ? "true" : "false"}">
        <div class="ih-evaluation-column ${isSelected ? "is-selected" : ""}">
          <span class="ih-evaluation-column-actions">
            ${renderCommentButton("evaluation-option-comment", entry.id, answer.optionComments && answer.optionComments[entry.id], "Comment on column option")}
            ${renderTooltipButton(entry.title, entry.markdownTooltip)}
          </span>
          <span class="ih-evaluation-column-title">${escapeHTML(entry.title)}</span>
          ${renderEvaluationColumnTags(entry.tags)}
          ${entry.markdown ? `<span class="ih-evaluation-column-markdown ih-markdown">${renderMarkdown(entry.markdown)}</span>` : ""}
          ${entry.htmlPreview && !questionDef.previewFrame ? renderCardContent(Object.assign({}, entry, { markdown: "" })) : ""}
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
            <span class="ih-option-actions">
              ${renderTooltipButton(row.title, row.markdownTooltip)}
              ${renderCommentButton("evaluation-row-comment", row.id, answer.rowComments && answer.rowComments[row.id], "Comment on comparison criterion")}
            </span>
          </div>
        </th>
        ${questionDef.options.map((optionDef) => {
          const cell = row.cells && row.cells[optionDef.id] || {};
          return `<td${renderEvaluationCellAttrs(optionDef, selectedIds, `Select ${optionDef.title} column for ${row.title}`)}>${renderEvaluationCell(cell)}</td>`;
        }).join("")}
      </tr>
    `;
  }

  function renderEvaluationCell(cell) {
    const icon = isEvaluationIcon(cell && cell.icon) ? cell.icon : "";
    const text = cell && cell.text ? cell.text : "";
    const detail = cell && cell.detail ? String(cell.detail) : "";
    const label = plainMarkdown(text) || evaluationIconLabel(icon) || "value";
    const value = icon || text
      ? `<span class="ih-evaluation-cell" data-icon="${escapeAttr(icon)}">${icon ? evaluationIcon(icon) : ""}${text ? `<span class="ih-markdown">${renderMarkdown(text)}</span>` : icon ? `<span>${escapeHTML(evaluationIconLabel(icon))}</span>` : ""}</span>`
      : `<span class="ih-evaluation-cell">-</span>`;
    if (!detail) return value;
    return `
      <span class="ih-evaluation-cell-shell">
        ${value}
        ${renderTooltipButton(label, detail)}
      </span>
    `;
  }

  function renderBucket(questionDef, answer, instance) {
    const view = instance.bucketView(questionDef.id);
    return view === "table" ? renderBucketTable(questionDef, answer) : renderBucketBoard(questionDef, answer, instance);
  }

  function renderBucketViewSwitch(view) {
    return `
      <div class="ih-bucket-view-toolbar">
        <div class="ih-bucket-view-options" role="group" aria-label="Bucket visualization">
          <button class="ih-bucket-view-option ${view === "board" ? "is-selected" : ""}" type="button" data-action="set-bucket-view" data-bucket-view="board" aria-pressed="${view === "board" ? "true" : "false"}">Board</button>
          <button class="ih-bucket-view-option ${view === "table" ? "is-selected" : ""}" type="button" data-action="set-bucket-view" data-bucket-view="table" aria-pressed="${view === "table" ? "true" : "false"}">Table</button>
        </div>
      </div>
    `;
  }

  function renderColumnWidthControl(width, questionType) {
    const choiceLabels = { narrow: "Three columns", medium: "Two columns", wide: "One column" };
    return `
      <div class="ih-column-width-control">
        <span class="ih-column-width-label">Width</span>
        <div class="ih-column-width-options" role="group" aria-label="Column width">
          ${COLUMN_WIDTHS.map((entry) => {
            const selected = entry === width;
            const label = questionType === "choice"
              ? choiceLabels[entry]
              : `${entry[0].toUpperCase()}${entry.slice(1)} columns`;
            return `<button class="ih-column-width-option ${selected ? "is-selected" : ""}" type="button" data-action="set-column-width" data-column-width="${entry}" aria-label="${label}" title="${label}" aria-pressed="${selected ? "true" : "false"}">${columnWidthIcon(entry)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderColumnFrameAttrs(questionDef, instance) {
    const width = instance.columnWidth(questionDef.id);
    const fit = width !== "narrow" && !instance.hasColumnWidthChoice(questionDef.id);
    return ` data-column-overflow data-column-width="${escapeAttr(width)}"${fit ? ` data-column-fit="${escapeAttr(width)}"` : ""}`;
  }

  function renderColumnHints() {
    return `
      <div class="ih-column-hints">
        <button class="ih-column-hint" type="button" data-action="scroll-columns" data-direction="-1" hidden></button>
        <button class="ih-column-hint" type="button" data-action="scroll-columns" data-direction="1" hidden></button>
      </div>
    `;
  }

  function renderBucketBoard(questionDef, answer, instance) {
    const groups = bucketGroups(questionDef, answer);
    const unset = groups.get("");

    return `
      <div class="ih-bucket-overflow"${renderColumnFrameAttrs(questionDef, instance)} style="--ih-bucket-count: ${questionDef.buckets.length + 1}">
        ${renderColumnHints()}
        <div class="ih-column-edges">
          <div class="ih-bucket-frame" data-column-frame tabindex="0" aria-label="Buckets">
            <div class="ih-bucket-board">
              <section class="ih-bucket" data-bucket-id="">
                <div class="ih-bucket-title">Unsorted</div>
                <div class="ih-bucket-list" data-sortable-bucket data-bucket-id="">
                  ${unset.length ? unset.map((entry) => renderBucketCard(questionDef, answer, entry, 0)).join("") : `<div class="ih-bucket-empty">${bucketEmptyText("", "board")}</div>`}
                </div>
              </section>
              ${questionDef.buckets.map((bucket) => `
                <section class="ih-bucket" data-bucket-id="${escapeAttr(bucket.id)}">
                  <div class="ih-bucket-title">${escapeHTML(bucket.title)}</div>
                  <div class="ih-bucket-list" data-sortable-bucket data-bucket-id="${escapeAttr(bucket.id)}">
                    ${groups.get(bucket.id).length ? groups.get(bucket.id).map((entry, index) => renderBucketCard(questionDef, answer, entry, index + 1)).join("") : `<div class="ih-bucket-empty">${bucketEmptyText(bucket.id, "board")}</div>`}
                  </div>
                </section>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBucketTable(questionDef, answer) {
    if (questionDef.ordered) return renderOrderedBucketTable(questionDef, answer);
    return `
      <div class="ih-bucket-table" role="list" aria-label="Table view">
        ${questionDef.options.map((entry) => renderBucketTableCard(questionDef, answer, entry)).join("")}
      </div>
    `;
  }

  function renderOrderedBucketTable(questionDef, answer) {
    const groups = bucketGroups(questionDef, answer);
    return `
      <div class="ih-bucket-table is-ordered" aria-label="Table view">
        ${[{ id: "", title: "Unsorted" }].concat(questionDef.buckets).map((bucket) => {
          const entries = groups.get(bucket.id);
          return `
            <section class="ih-bucket-table-group">
              <div class="ih-bucket-title">${escapeHTML(bucket.title)}</div>
              <div class="ih-bucket-table-list" role="list" aria-label="${escapeAttr(bucket.title)}" data-bucket-id="${escapeAttr(bucket.id)}">
                ${entries.length ? entries.map((entry, index) => renderBucketTableCard(questionDef, answer, entry, bucket.id ? index + 1 : 0, entries.length)).join("") : `<div class="ih-bucket-empty">${bucketEmptyText(bucket.id, "table")}</div>`}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderBucketTableCard(questionDef, answer, entry, position, count) {
    const currentBucketId = answer.buckets && answer.buckets[entry.id] || "";
    return `
      <article class="ih-card ih-bucket-table-card" role="listitem" data-option-id="${escapeAttr(entry.id)}">
        <div class="ih-bucket-table-heading">
          <h3 class="ih-option-title">${renderBucketPosition(questionDef, position)}${escapeHTML(entry.title)}</h3>
          ${renderTags(entry.tags)}
        </div>
        <div class="ih-bucket-table-controls">
          ${renderBucketStateOptions(questionDef, entry, currentBucketId)}
          <div class="ih-bucket-table-actions">
            ${questionDef.ordered ? renderBucketReorder(entry, position, count) : ""}
            ${renderTooltipButton(entry.title, entry.markdownTooltip)}
            ${renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on bucket option")}
          </div>
        </div>
        <div class="ih-bucket-table-content">
          ${renderCardContent(entry, questionDef.previewFrame)}
        </div>
      </article>
    `;
  }

  function renderBucketStateOptions(questionDef, entry, currentBucketId) {
    const buckets = [{ id: "", title: "Unsorted" }].concat(questionDef.buckets || []);
    return `
      <div class="ih-bucket-state-options" role="group" aria-label="Set status for ${escapeAttr(entry.title)}">
        ${buckets.map((bucket) => {
          const isCurrent = bucket.id === currentBucketId;
          return `<button class="ih-bucket-state-option ${isCurrent ? "is-selected" : ""}" type="button" data-action="move-bucket-option" data-option-id="${escapeAttr(entry.id)}" data-bucket-id="${escapeAttr(bucket.id)}" aria-pressed="${isCurrent ? "true" : "false"}">${escapeHTML(bucket.title)}</button>`;
        }).join("")}
      </div>
    `;
  }

  function renderBucketPosition(questionDef, position) {
    if (!questionDef.ordered) return "";
    return `<span class="ih-bucket-position" data-bucket-position ${position ? "" : "hidden"}>${position || ""}</span> `;
  }

  function renderBucketReorder(entry, position, count) {
    return `
      <span class="ih-bucket-reorder" data-bucket-reorder ${position ? "" : "hidden"}>
        <button class="ih-icon-btn ih-bucket-reorder-button" type="button" data-action="reorder-bucket-option" data-option-id="${escapeAttr(entry.id)}" data-direction="up" aria-label="Move ${escapeAttr(entry.title)} up" title="Move up" ${position > 1 ? "" : "disabled"}>${arrowIcon("up")}</button>
        <button class="ih-icon-btn ih-bucket-reorder-button" type="button" data-action="reorder-bucket-option" data-option-id="${escapeAttr(entry.id)}" data-direction="down" aria-label="Move ${escapeAttr(entry.title)} down" title="Move down" ${position && position < count ? "" : "disabled"}>${arrowIcon("down")}</button>
      </span>
    `;
  }

  function syncBucketCardPosition(card, position, count) {
    const label = card.querySelector("[data-bucket-position]");
    if (label) {
      label.hidden = !position;
      label.textContent = position ? String(position) : "";
    }
    const reorder = card.querySelector("[data-bucket-reorder]");
    if (reorder) reorder.hidden = !position;
    card.querySelectorAll("[data-action='reorder-bucket-option']").forEach((button) => {
      button.disabled = button.dataset.direction === "up" ? position <= 1 : !position || position >= count;
    });
  }

  function renderBucketCard(questionDef, answer, entry, position) {
    const currentBucketId = answer.buckets && answer.buckets[entry.id] || "";
    return `
      <article class="ih-bucket-card" data-option-id="${escapeAttr(entry.id)}">
        <button class="ih-grip" type="button" aria-label="Drag to bucket"></button>
        <h3 class="ih-option-title">${renderBucketPosition(questionDef, position)}${escapeHTML(entry.title)}</h3>
        <div class="ih-bucket-actions">
          ${renderMoveMenu(questionDef, entry, currentBucketId)}
          ${renderTooltipButton(entry.title, entry.markdownTooltip)}
          ${renderCommentButton("option-comment", entry.id, optionComment(answer, entry.id), "Comment on bucket option")}
        </div>
        <div class="ih-bucket-card-content">
          ${renderTags(entry.tags)}
          ${renderCardContent(entry, questionDef.previewFrame)}
        </div>
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

  function renderFlow(questionDef, answer, instance) {
    const selected = normalizeFlowSelection(answer.selected, answer);
    const hasSelection = Boolean(selected);
    const deleteHint = ` <kbd class="ih-shortcut-key"><span class="ih-flow-key-glyph">⌫</span></kbd>`;
    const history = instance ? instance.flowHistoryFor(questionDef.id) : { undo: [], redo: [] };
    return `
      <div class="ih-card ih-flow" data-flow>
        <div class="ih-flow-toolbar">
          <div class="ih-flow-toolbar-row">
            <div class="ih-flow-actions">
              <button class="ih-btn" type="button" data-action="flow-show-add">Add</button>
              <button class="ih-btn ih-flow-danger" type="button" data-action="flow-delete" ${hasSelection ? "" : "disabled"}>Delete${deleteHint}</button>
              <button class="ih-icon-btn ih-flow-history-button" type="button" data-action="flow-undo" aria-label="Undo" title="Undo (Command-Z)" ${history.undo.length ? "" : "disabled"}>${undoIcon()}</button>
              <button class="ih-icon-btn ih-flow-history-button" type="button" data-action="flow-redo" aria-label="Redo" title="Redo (Shift-Command-Z)" ${history.redo.length ? "" : "disabled"}>${redoIcon()}</button>
              <button class="ih-btn" type="button" data-action="flow-arrange">Arrange</button>
            </div>
            <div class="ih-flow-response-actions">
              ${answer.confirmed ? "" : `<button class="ih-btn" type="button" data-action="flow-confirm">Confirm as is</button>`}
              ${renderCommentButton("flow-comment", "", answer.comment || "", "Comment on flow")}
            </div>
          </div>
          <p class="ih-flow-tip">Drag nodes to move them. Hold <kbd class="ih-shortcut-key"><span class="ih-flow-key-glyph">⌘</span></kbd> while dragging between nodes to connect them.</p>
        </div>
        <div class="ih-flow-canvas" data-flow-editor data-question-id="${escapeAttr(questionDef.id)}">
          <span class="ih-flow-loading">Loading flow editor...</span>
        </div>
        <div class="ih-flow-selection" data-flow-selection>
          ${renderFlowSelection(answer)}
        </div>
      </div>
    `;
  }

  function renderFlowSelection(answer) {
    if (answer.adding) {
      return `
        <input class="ih-field ih-flow-selected-value" data-input="flow-new-node" placeholder="New node name" aria-label="New node name">
        <div class="ih-flow-selection-actions">
          <button class="ih-btn ih-btn-accent" type="button" data-action="flow-commit-add">Add</button>
          <button class="ih-btn" type="button" data-action="flow-cancel-add">Cancel</button>
        </div>
      `;
    }
    const selected = normalizeFlowSelection(answer.selected, answer);
    if (!selected) return `<p class="ih-flow-selection-empty">Select a node or connection.</p>`;
    if (selected.kind === "node") {
      const node = flowNodeByName(answer, selected.name);
      if (!node) return `<p class="ih-flow-selection-empty">Select a node or connection.</p>`;
      return `
        <input class="ih-field ih-flow-selected-value" data-input="flow-selected-value" data-flow-kind="node" value="${escapeAttr(node.name)}" aria-label="Node name">
        ${renderCommentButton("flow-node-comment", node.name, node.comment || "", `Comment on ${node.name}`)}
      `;
    }
    const connection = flowConnectionByKey(answer, selected.key);
    if (!connection) return `<p class="ih-flow-selection-empty">Select a node or connection.</p>`;
    return `
      <input class="ih-field ih-flow-selected-value" data-input="flow-selected-value" data-flow-kind="connection" value="${escapeAttr(connection.label || "")}" placeholder="Connection name (optional)" aria-label="Connection name from ${escapeAttr(connection.from)} to ${escapeAttr(connection.to)}">
      ${renderCommentButton("flow-connection-comment", selected.key, connection.comment || "", `Comment on connection from ${connection.from} to ${connection.to}`)}
    `;
  }

  function renderSequence(questionDef, answer) {
    const updated = isSequenceChanged(questionDef, answer);
    const status = answer.confirmed
      ? updated ? "Sequence updated." : "Sequence confirmed as proposed."
      : "Correct the sequence visually, or confirm the proposal.";
    return `
      <div class="ih-card ih-sequence" data-sequence>
        <div class="ih-sequence-toolbar">
          <p class="ih-sequence-status" data-sequence-status>${escapeHTML(status)}</p>
          <div class="ih-sequence-actions" data-sequence-actions>
            ${answer.confirmed ? "" : `<button class="ih-btn" type="button" data-action="sequence-confirm">Confirm as proposed</button>`}
            ${renderCommentButton("sequence-comment", "", answer.comment || "", "Comment on sequence")}
          </div>
        </div>
        <div class="ih-sequence-editor" data-sequence-editor>
          <span class="ih-sequence-loading">Loading sequence editor...</span>
        </div>
        <p class="ih-sequence-error" data-sequence-error hidden></p>
        <textarea class="ih-code-fallback ih-sequence-fallback" data-input="sequence-source" spellcheck="false" wrap="off" hidden>${escapeHTML(answer.source || "")}</textarea>
      </div>
    `;
  }

  function renderExportStep(instance) {
    const text = instance.getText();
    return `
      <section class="ih-step" id="ih-output">
        <div class="ih-question-head">
          <div>
            <p class="ih-kicker">Output</p>
            <h2 class="ih-prompt">Export the answer summary.</h2>
            <p class="ih-export-note">Copy the answer summary for the next agent.</p>
          </div>
        </div>
        <div class="ih-card ih-closing-note">
          <h3 class="ih-option-title"><label for="ih-closing-note">Anything the questions didn't cover?</label></h3>
          <p class="ih-closing-note-help" id="ih-closing-note-help">Constraints, must-haves, or anything you expected to be asked.</p>
          <textarea class="ih-field ih-auto-field" id="ih-closing-note" data-input="closing-note" rows="3" aria-describedby="ih-closing-note-help">${escapeHTML(instance.state.closingNote || "")}</textarea>
        </div>
        <div class="ih-card">
          <div class="ih-option-top" style="margin-bottom:12px">
            <h3 class="ih-option-title">Answer summary</h3>
            <button class="ih-btn ih-btn-primary" type="button" data-action="copy-text">${escapeHTML(instance.config.copyTextLabel)}</button>
          </div>
          <pre class="ih-output" data-export-text>${escapeHTML(text)}</pre>
        </div>
      </section>
    `;
  }

  function renderMountError(theme, problems, report) {
    return `
      <div class="ih-app" data-ih-theme="${escapeAttr(theme)}">
        <main class="ih-main">
          <section class="ih-step ih-mount-error" role="alert">
            <div class="ih-question-head">
              <div>
                <p class="ih-kicker">Interview Harness ${escapeHTML(VERSION)}</p>
                <h1 class="ih-prompt">This interview can't open</h1>
                <p class="ih-export-note">Copy the report and send it to the agent that generated this interview.</p>
              </div>
            </div>
            <div class="ih-card">
              <h2 class="ih-option-title">${problems.length === 1 ? "1 problem" : `${problems.length} problems`}</h2>
              <ul class="ih-mount-error-list">${problems.map((problem) => `<li>${escapeHTML(problem)}</li>`).join("")}</ul>
            </div>
            <div class="ih-card">
              <div class="ih-option-top">
                <h2 class="ih-option-title">Report</h2>
                <button class="ih-btn ih-btn-primary" type="button" data-action="copy-error-report">Copy report</button>
              </div>
              <pre class="ih-output ih-mount-error-report" data-error-report>${escapeHTML(report)}</pre>
            </div>
          </section>
        </main>
        <div class="ih-toast" role="status" aria-live="polite"></div>
      </div>
    `;
  }

  function cardLayout(cards, previewFrame) {
    if (previewFrame && cards.some((card) => card.previewType !== "none")) return 3;
    if (cards.some((card) => card.previewType === "file")) return 1;
    if (cards.some((card) => card.previewType === "inline")) return 2;
    return cards.some((card) => card.markdown) ? "auto" : "stack";
  }

  function columnFrameView(frame) {
    const rect = frame.getBoundingClientRect();
    const left = rect.left + frame.clientLeft;
    const row = frame.querySelector(".ih-evaluation-table > tbody > tr");
    const rowHead = row && row.querySelector(":scope > th");
    return {
      left: rowHead ? rowHead.getBoundingClientRect().right : left,
      right: left + frame.clientWidth,
      columns: Array.from(row ? row.querySelectorAll(":scope > td") : frame.querySelectorAll(".ih-bucket-board > .ih-bucket"))
    };
  }

  function isColumnWidthQuestion(questionDef) {
    return Boolean(questionDef && ["choice", "evaluation", "bucket"].includes(questionDef.type));
  }

  function shouldRenderColumnWidthControl(questionDef, bucketView) {
    if (!isColumnWidthQuestion(questionDef)) return false;
    if (questionDef.type === "bucket") return bucketView !== "table";
    if (questionDef.type === "evaluation") return questionDef.options.length > 1;
    const layout = cardLayout(questionDef.options, questionDef.previewFrame);
    return questionDef.options.length > 1 && layout !== "stack" && layout !== 1;
  }

  function renderCardContent(card, previewFrame) {
    const parts = [];
    if (card.markdown) parts.push(`<div class="ih-rich ih-markdown">${renderMarkdown(card.markdown)}</div>`);
    if (card.previewType === "inline") parts.push(previewFrame ? renderSrcdocPreview(card) : `<div class="ih-html-preview">${card.htmlPreview}</div>`);
    if (card.previewType === "file") parts.push(renderFilePreview(card, previewFrame));
    return parts.join("");
  }

  function renderFilePreview(card, previewFrame) {
    const src = card.htmlPreview.slice("file:".length).trim();
    const sourceName = frameSourceName(src) || card.title;
    const frame = `<iframe class="ih-frame" title="${escapeAttr(card.title)}" src="${escapeAttr(src)}"></iframe>`;
    return `<div class="ih-frame-shell${previewFrame ? " is-phone" : ""}">
      <div class="ih-frame-bar">
        <span class="ih-frame-name" title="${escapeAttr(sourceName)}">${escapeHTML(sourceName)}</span>
        <a class="ih-frame-open" href="${escapeAttr(src)}" target="_blank" rel="noopener" aria-label="Open ${escapeAttr(sourceName)} in a new tab" title="Open ${escapeAttr(sourceName)} in a new tab">${externalLinkIcon()}</a>
      </div>
      ${previewFrame ? renderPhoneFrame(frame) : frame}
    </div>`;
  }

  function renderSrcdocPreview(card) {
    const html = /^\s*<!doctype/i.test(card.htmlPreview) ? card.htmlPreview : `<!doctype html>${card.htmlPreview}`;
    return renderPhoneFrame(`<iframe title="${escapeAttr(card.title)}" srcdoc="${escapeAttr(html)}"></iframe>`);
  }

  function renderPhoneFrame(iframe) {
    return `<div class="ih-phone-fit"><div class="ih-phone">${iframe}</div></div>`;
  }

  function renderTooltipButton(title, markdown) {
    if (!markdown) return "";
    return `<button class="ih-evaluation-detail-button" type="button" data-detail-title="${escapeAttr(title)}" data-detail="${escapeAttr(markdown)}" aria-label="Details for ${escapeAttr(title)}">${infoIcon()}</button>`;
  }

  function renderMarkdown(value) {
    const source = String(value || "");
    if (!source) return "";
    if (!global.marked || typeof global.marked.parse !== "function") return `<p>${escapeHTML(source).replace(/\n/g, "<br>")}</p>`;
    return sanitizeMarkdownHTML(global.marked.parse(source, { async: false, gfm: true, breaks: false }));
  }

  function sanitizeMarkdownHTML(markup) {
    const template = document.createElement("template");
    template.innerHTML = String(markup || "");
    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, button, textarea, select").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "style" || name === "srcdoc") node.removeAttribute(attribute.name);
        if ((name === "href" || name === "src") && !safeMarkdownURL(attribute.value, name)) node.removeAttribute(attribute.name);
      });
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    return template.innerHTML;
  }

  function safeMarkdownURL(value, attribute) {
    const source = String(value || "").trim().toLowerCase();
    if (!source || source.startsWith("#") || source.startsWith("./") || source.startsWith("../") || source.startsWith("/")) return true;
    if (source.startsWith("https:") || source.startsWith("http:") || source.startsWith("mailto:")) return true;
    return attribute === "src" && source.startsWith("data:image/");
  }

  function plainMarkdown(value) {
    return String(value || "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_>#~-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderTags(tags) {
    const values = Array.isArray(tags) ? tags : [];
    if (!values.length) return "";
    return `<div class="ih-tags">${values.map((entry) => `<span class="ih-pill">${escapeHTML(valueToText(entry))}</span>`).join("")}</div>`;
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
            <button class="ih-btn" type="button" data-action="close-comment">Done <kbd class="ih-shortcut-key">Esc</kbd></button>
          </div>
          <textarea class="ih-field ih-auto-field" data-input="comment-modal" placeholder="Write a note for the next agent...">${escapeHTML(value)}</textarea>
        </section>
      </div>
    `;
  }

  function commentIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M18 3a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-4.724l-4.762 2.857a1 1 0 0 1-1.508-.743L7 21v-2H6a4 4 0 0 1-3.995-3.8L2 15V7a4 4 0 0 1 4-4zm-4 9H8a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2m2-4H8a1 1 0 1 0 0 2h8a1 1 0 0 0 0-2"/></svg>`;
  }

  function undoIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 14-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>`;
  }

  function redoIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 4-4-4-4"/><path d="M19 10H8a4 4 0 0 0 0 8h1"/></svg>`;
  }

  function moveIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.707 3.293a1 1 0 0 1 .083 1.32l-.083.094L5.415 6H10a1 1 0 0 1 .117 1.993L10 8H5.415l1.292 1.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083l-3-3a1.008 1.008 0 0 1-.097-.112l-.071-.11l-.054-.114l-.035-.105l-.025-.118l-.007-.058L2 7l.003-.075l.017-.126l.03-.111l.044-.111l.052-.098l.064-.092l.083-.094l3-3a1 1 0 0 1 1.414 0"/><path d="m18.613 3.21l.094.083l3 3a.927.927 0 0 1 .097.112l.071.11l.054.114l.035.105l.03.148L22 7l-.003.075l-.017.126l-.03.111l-.044.111l-.052.098l-.074.104l-.073.082l-3 3a1 1 0 0 1-1.497-1.32l.083-.094L18.585 8H14a1 1 0 0 1-.117-1.993L14 6h4.585l-1.292-1.293a1 1 0 0 1-.083-1.32l.083-.094a1 1 0 0 1 1.32-.083"/><path d="M18 13H6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3"/></svg>`;
  }

  function arrowIcon(direction) {
    const path = direction === "up" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6";
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  }

  function externalLinkIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 5a1 1 0 0 1 0 2H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6a1 1 0 0 1 2 0v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zm3-2h5l.075.003l.126.017l.111.03l.111.044l.098.052l.096.067l.09.08q.054.053.097.112l.071.11l.054.114l.035.105l.03.148l.006.118v5a1 1 0 0 1-2 0V6.414l-7.293 7.293a1 1 0 0 1-1.414-1.414L17.58 5H15a1 1 0 0 1 0-2"/></svg>`;
  }

  function infoIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1-19.995.324L2 12l.004-.28C2.152 6.327 6.57 2 12 2m0 9h-1l-.117.007a1 1 0 0 0 0 1.986L11 13v3l.007.117a1 1 0 0 0 .876.876L12 17h1l.117-.007a1 1 0 0 0 .876-.876L14 16l-.007-.117a1 1 0 0 0-.764-.857l-.112-.02L13 15v-3l-.007-.117a1 1 0 0 0-.876-.876zm.01-3l-.127.007a1 1 0 0 0 0 1.986L12 10l.127-.007a1 1 0 0 0 0-1.986z"/></svg>`;
  }

  function trashIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M19 2H5a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3m-9.387 6.21l.094.083L12 10.585l2.293-2.292a1 1 0 0 1 1.497 1.32l-.083.094L13.415 12l2.292 2.293a1 1 0 0 1-1.32 1.497l-.094-.083L12 13.415l-2.293 2.292a1 1 0 0 1-1.497-1.32l.083-.094L10.585 12L8.293 9.707a1 1 0 0 1 1.32-1.497"/></svg>`;
  }

  function columnWidthIcon(width) {
    const columns = width === "wide" ? 1 : width === "medium" ? 2 : 3;
    const gap = 2;
    const available = 20 - ((columns - 1) * gap);
    const columnWidth = available / columns;
    const rects = Array.from({ length: columns }, (_, index) => {
      const x = 2 + (index * (columnWidth + gap));
      return `<rect x="${x}" y="5" width="${columnWidth}" height="14" rx="1.5"/>`;
    }).join("");
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${rects}</svg>`;
  }

  function evaluationIcon(icon) {
    const icons = {
      yes: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2c-.218 0-.432.002-.642.005l-.616.017l-.299.013l-.579.034l-.553.046c-4.785.464-6.732 2.411-7.196 7.196l-.046.553l-.034.579l-.013.299l-.017.616L2 12l.005.642l.017.616l.013.299l.034.579l.046.553c.464 4.785 2.411 6.732 7.196 7.196l.553.046l.579.034l.299.013l.616.017L12 22l.642-.005l.616-.017l.299-.013l.579-.034l.553-.046c4.785-.464 6.732-2.411 7.196-7.196l.046-.553l.034-.579l.013-.299l.017-.616L22 12l-.005-.642l-.017-.616l-.013-.299l-.034-.579l-.046-.553c-.464-4.785-2.411-6.732-7.196-7.196l-.553-.046l-.579-.034l-.299-.013l-.616-.017L12 2m2.293 7.293a1 1 0 0 1 1.497 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-2-2a1 1 0 0 1 1.32-1.497l.094.083L11 12.585z"/></svg>`,
      no: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M17 3.34a10 10 0 1 1-14.995 8.984L2 12l.005-.324A10 10 0 0 1 17 3.34m-6.489 5.8a1 1 0 0 0-1.218 1.567L10.585 12l-1.292 1.293l-.083.094a1 1 0 0 0 1.497 1.32L12 13.415l1.293 1.292l.094.083a1 1 0 0 0 1.32-1.497L13.415 12l1.292-1.293l.083-.094a1 1 0 0 0-1.497-1.32L12 10.585l-1.293-1.292z"/></svg>`,
      partial: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 1a.993.993 0 0 1 .823.443l.067.116l2.852 5.781l6.38.925c.741.108 1.08.94.703 1.526l-.07.095l-.078.086l-4.624 4.499l1.09 6.355a1.001 1.001 0 0 1-1.249 1.135l-.101-.035l-.101-.046l-5.693-3l-5.706 3c-.105.055-.212.09-.32.106l-.106.01a1.003 1.003 0 0 1-1.038-1.06l.013-.11l1.09-6.355l-4.623-4.5a1.001 1.001 0 0 1 .328-1.647l.113-.036l.114-.023l6.379-.925l2.853-5.78a.968.968 0 0 1 .904-.56M12 4.274V16.75a1 1 0 0 1 .239.029l.115.036l.112.05l4.363 2.299l-.836-4.873a1 1 0 0 1 .136-.696l.07-.099l.082-.09l3.546-3.453l-4.891-.708a1 1 0 0 1-.62-.344l-.073-.097l-.06-.106z"/></svg>`,
      unknown: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M10.425 1.414a3.33 3.33 0 0 1 3.026-.097l.19.097l6.775 3.995l.096.063l.092.077l.107.075a3.224 3.224 0 0 1 1.266 2.188l.018.202l.005.204v7.284c0 1.106-.57 2.129-1.454 2.693l-.17.1l-6.803 4.302c-.918.504-2.019.535-3.004.068l-.196-.1l-6.695-4.237a3.225 3.225 0 0 1-1.671-2.619L2 15.502V8.217c0-1.106.57-2.128 1.476-2.705zm1.575 13.586a1 1 0 0 0-.993.883L11 16l.007.127a1 1 0 0 0 1.986 0L13 16.01l-.007-.127A1 1 0 0 0 12 15m1.368-6.673a2.98 2.98 0 0 0-3.631.728a1 1 0 0 0 1.44 1.383l.171-.18a.98.98 0 0 1 1.11-.15a1 1 0 0 1-.34 1.886l-.232.012a1 1 0 0 0 .111 1.994a3 3 0 0 0 1.371-5.673"/></svg>`,
      warn: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 1.67c.955 0 1.845.467 2.39 1.247l.105.16l8.114 13.548a2.914 2.914 0 0 1-2.307 4.363l-.195.008H3.882a2.914 2.914 0 0 1-2.582-4.2l.099-.185l8.11-13.538A2.914 2.914 0 0 1 12 1.67m.01 13.33l-.127.007a1 1 0 0 0 0 1.986L12 17l.127-.007a1 1 0 0 0 0-1.986zM12 8a1 1 0 0 0-.993.883L11 9v4l.007.117a1 1 0 0 0 1.986 0L13 13V9l-.007-.117A1 1 0 0 0 12 8"/></svg>`,
      best: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m8.243 7.34l-6.38.925l-.113.023a1 1 0 0 0-.44 1.684l4.622 4.499l-1.09 6.355l-.013.11a1 1 0 0 0 1.464.944l5.706-3l5.693 3l.1.046a1 1 0 0 0 1.352-1.1l-1.091-6.355l4.624-4.5l.078-.085a1 1 0 0 0-.633-1.62l-6.38-.926l-2.852-5.78a1 1 0 0 0-1.794 0z"/></svg>`
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
    if (kind === "sequence-comment") return answer.comment || "";
    if (kind === "flow-comment") return answer.comment || "";
    if (kind === "flow-node-comment") {
      const node = flowNodeByName(answer, optionId);
      return node && node.comment || "";
    }
    if (kind === "flow-connection-comment") {
      const connection = flowConnectionByKey(answer, optionId);
      return connection && connection.comment || "";
    }
    if (kind === "evaluation-option-comment") return answer.optionComments && answer.optionComments[optionId] || "";
    if (kind === "evaluation-row-comment") return answer.rowComments && answer.rowComments[optionId] || "";
    if (kind === "edit-summary") return answer.summary || "";
    return optionComment(answer, optionId);
  }

  function setCommentValue(answer, kind, optionId, value) {
    const textValue = String(value || "");
    if (kind === "sequence-comment") {
      answer.comment = textValue;
      return;
    }
    if (kind === "flow-comment") {
      answer.comment = textValue;
      return;
    }
    if (kind === "flow-node-comment") {
      const node = flowNodeByName(answer, optionId);
      if (!node) return;
      if (textValue.trim()) node.comment = textValue;
      else delete node.comment;
      return;
    }
    if (kind === "flow-connection-comment") {
      const connection = flowConnectionByKey(answer, optionId);
      if (!connection) return;
      if (textValue.trim()) connection.comment = textValue;
      else delete connection.comment;
      return;
    }
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
      this.state = createInitialState(config);
      this.state.viewMode = initialViewMode(config.questions);
      this.theme = readSharedTheme();
      this.saveTimer = null;
      this.chromeFrame = null;
      this.sortables = [];
      this.flowEditors = [];
      this.flowHistories = new Map();
      this.flowViewCleanups = [];
      this.sequenceCleanups = [];
      this.codeEditors = [];
      this.frameObjectUrls = [];
      this.columnFrameCleanups = [];
      this.phoneFrameObserver = null;
      this.exportTimer = null;
      this.toastTimer = null;
      this.onDocumentKeydown = (event) => this.onKeydown(event);
      this.onThemeStorage = (event) => {
        if (event.key !== THEME_STORAGE_KEY) return;
        this.setTheme(readSharedTheme(), false);
      };
      this.load();
      this.mount();
      ensureMarked().then(() => {
        if (this.root.isConnected) this.render();
      }).catch(() => {});
    }

    mount() {
      applyThemeToDocument(this.theme);
      injectStyles();
      this.render();
      this.root.addEventListener("click", (event) => this.onClick(event));
      this.root.addEventListener("input", (event) => this.onInput(event));
      this.root.addEventListener("change", (event) => this.onInput(event));
      this.root.addEventListener("focusout", (event) => this.onFocusout(event));
      global.document.addEventListener("keydown", this.onDocumentKeydown);
      global.addEventListener("storage", this.onThemeStorage);
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
      this.finishFlowHistoryTransactions();
      this.destroyEnhancements();
      renderApp(this);
      this.afterRender();
    }

    afterRender() {
      requestAnimationFrame(() => {
        this.root.querySelectorAll("textarea").forEach(autoGrowTextarea);
        this.initFrameLinks();
        this.initPhoneFrames();
        this.initColumnFrames();
        this.initSortables();
        this.initFlowEditors();
        this.initSequenceEditors();
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

    bucketView(questionId) {
      return safeObject(this.state.bucketViews)[questionId] === "table" ? "table" : "board";
    }

    columnWidth(questionId) {
      const context = this.contextByQuestionId(questionId);
      return columnWidthValue(safeObject(this.state.columnWidths)[questionId])
        || context && context.questionDef.columnWidth
        || "narrow";
    }

    hasColumnWidthChoice(questionId) {
      return Boolean(columnWidthValue(safeObject(this.state.columnWidths)[questionId]));
    }

    setTheme(theme, persist = true) {
      const nextTheme = normalizeTheme(theme) || "light";
      const changed = nextTheme !== this.theme;
      this.theme = nextTheme;
      applyThemeToDocument(nextTheme);
      if (persist) persistSharedTheme(nextTheme);
      if (changed && this.root.isConnected) this.render();
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
      if (action === "set-theme") return this.setTheme(actionEl.dataset.theme);
      if (action === "toggle-mode") return this.toggleMode();
      if (action === "copy-text") return this.copyText();
      if (action === "jump") return this.jump(numberOr(actionEl.dataset.step, this.state.step));
      if (action === "open-comment") return this.openComment(actionEl);
      if (action === "close-comment") return this.closeComment();
      if (action === "keep-comment-open") return;
      if (action === "toggle-move-menu") {
        event.preventDefault();
        return this.toggleMoveMenu(actionEl);
      }
      if (action === "scroll-columns") return this.scrollColumns(actionEl);

      const context = this.contextFromNode(actionEl);
      this.activateContext(context);
      if (action === "set-bucket-view") return this.setBucketView(actionEl.dataset.bucketView, context);
      if (action === "set-column-width") return this.setColumnWidth(actionEl.dataset.columnWidth, context);
      if (action === "choose-option") return this.chooseOption(actionEl.dataset.optionId, context);
      if (action === "choose-evaluation-option") return this.chooseEvaluationOption(actionEl.dataset.optionId, context);
      if (action === "move-bucket-option") return this.moveBucketOption(actionEl, context);
      if (action === "reorder-bucket-option") return this.reorderBucketOption(actionEl, context);
      if (action === "add-option") return this.addOption(context);
      if (action === "remove-added") return this.removeAdded(actionEl.dataset.optionId || numberOr(actionEl.dataset.addedIndex, -1), context);
      if (action === "flow-show-add") return this.showFlowAdd(context);
      if (action === "flow-cancel-add") return this.hideFlowAdd(context);
      if (action === "flow-commit-add") return this.addFlowNode(context);
      if (action === "flow-confirm") return this.confirmFlow(context);
      if (action === "flow-delete") return this.deleteFlowSelection(context);
      if (action === "flow-undo") return this.undoFlow(context);
      if (action === "flow-redo") return this.redoFlow(context);
      if (action === "flow-arrange") return this.arrangeFlow(context);
      if (action === "sequence-confirm") return this.confirmSequence(context);
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
      if (kind === "flow-new-node") return;
      if (kind === "closing-note") {
        this.state.closingNote = input.value;
        this.state.step = this.config.questions.length;
        autoGrowTextarea(input);
        this.markChanged(null, true);
        return;
      }
      const context = kind === "comment-modal" && this.state.commentEditor
        ? this.contextByQuestionId(this.state.commentEditor.questionId)
        : this.contextFromNode(input);
      this.activateContext(context);
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || !answer) return;

      if (kind === "flow-selected-value") {
        if (input.dataset.flowKind === "connection") {
          const selected = normalizeFlowSelection(answer.selected, answer);
          this.beginFlowHistoryTransaction(context, `connection-label:${selected && selected.key || ""}`);
          this.updateFlowSelectedValue(input, context);
          if (event.type === "change") this.finishFlowHistoryTransaction(context);
        } else if (event.type === "change") {
          this.updateFlowSelectedValue(input, context);
        }
        return;
      }

      if (kind === "comment-modal" && this.state.commentEditor) {
        if (questionDef.type === "flow") {
          const editor = this.state.commentEditor;
          this.beginFlowHistoryTransaction(context, `comment:${editor.kind}:${editor.optionId}`);
        }
        setCommentValue(answer, this.state.commentEditor.kind, this.state.commentEditor.optionId, input.value);
        this.syncOpenCommentButton();
      }
      if (kind === "added-title") this.updateAddedTitle(input.dataset.optionId, input.value, context);
      if (kind === "edit-content") answer.content = input.value;
      if (kind === "sequence-source") {
        answer.source = input.value;
        const validation = validateSequenceSource(answer.source);
        answer.confirmed = validation.valid;
        this.refreshSequenceFallbackError(input, validation);
        this.refreshSequenceResponse(context);
      }

      autoGrowTextarea(input);
      this.markChanged(answer, true);
    }

    onFocusout(event) {
      const input = event.target.closest && event.target.closest("[data-input='flow-selected-value'][data-flow-kind='connection']");
      if (!input || !this.root.contains(input)) return;
      this.finishFlowHistoryTransaction(this.contextFromNode(input));
    }

    onKeydown(event) {
      if (event.composedPath && event.composedPath().some((node) => node && node.tagName === "LINES-AND-ARROWS")) return;
      const flowInput = event.target && event.target.closest && event.target.closest("[data-input='flow-selected-value'], [data-input='flow-new-node']");
      if (flowInput && event.key === "Enter") {
        event.preventDefault();
        if (flowInput.dataset.input === "flow-new-node") {
          const section = flowInput.closest(".ih-step[data-question-id]");
          const button = section && section.querySelector("[data-action='flow-commit-add']");
          if (button) button.click();
        } else {
          if (flowInput.dataset.flowKind === "node") this.updateFlowSelectedValue(flowInput, this.contextFromNode(flowInput));
          if (flowInput.isConnected) flowInput.blur();
        }
        return;
      }
      if (flowInput && flowInput.dataset.input === "flow-new-node" && event.key === "Escape") {
        event.preventDefault();
        this.hideFlowAdd(this.contextFromNode(flowInput));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z" && !isTextEntryControl(event.target)) {
        const context = this.contextFromNode(event.target);
        if (context && context.questionDef.type === "flow") {
          event.preventDefault();
          if (event.shiftKey) this.redoFlow(context);
          else this.undoFlow(context);
          return;
        }
      }
      if (["Delete", "Backspace"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !isTextEntryControl(event.target)) {
        const context = this.contextFromNode(event.target);
        const selected = context && context.questionDef.type === "flow"
          ? normalizeFlowSelection(context.answer.selected, context.answer)
          : null;
        if (selected) {
          event.preventDefault();
          this.deleteFlowSelection(context);
          return;
        }
      }
      if (event.key === "Escape") {
        if (this.state.detailPopover) this.closeDetail();
        else if (this.state.commentEditor) this.closeComment();
        else if (this.closeMoveMenus()) event.preventDefault();
      }
      if (this.handlePageShortcut(event)) return;
      const target = event.target && event.target.closest ? event.target : null;
      const insideRoot = target && this.root.contains(target);
      const choice = insideRoot ? target.closest(".ih-choice[data-action]") : null;
      if (choice && isFormControl(event.target)) return;
      const evaluation = insideRoot ? target.closest("[data-action='choose-evaluation-option']") : null;
      if ((!choice && !evaluation) || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      (choice || evaluation).click();
    }

    handlePageShortcut(event) {
      if (this.viewMode() !== "paged" || this.state.commentEditor || this.state.detailPopover) return false;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTextEntryControl(event.target)) return false;
      if (event.key === "[") {
        if (this.state.step <= 0) return false;
        event.preventDefault();
        this.go(-1);
        return true;
      }
      if (event.key === "]") {
        event.preventDefault();
        this.go(1);
        return true;
      }
      return false;
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
      if (textOutput) textOutput.textContent = this.getText();
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

    setBucketView(view, context) {
      if (!context || context.questionDef.type !== "bucket") return;
      this.state.bucketViews = Object.assign({}, safeObject(this.state.bucketViews));
      if (view === "table") this.state.bucketViews[context.questionDef.id] = "table";
      else delete this.state.bucketViews[context.questionDef.id];
      this.state.commentEditor = null;
      this.state.detailPopover = null;
      this.save();
      this.render();
    }

    setColumnWidth(width, context) {
      const nextWidth = columnWidthValue(width);
      if (!context || !isColumnWidthQuestion(context.questionDef) || !nextWidth) return;
      this.state.columnWidths = Object.assign({}, safeObject(this.state.columnWidths), {
        [context.questionDef.id]: nextWidth
      });
      this.state.commentEditor = null;
      this.state.detailPopover = null;
      this.save();
      this.render();
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
      this.root.querySelector(".ih-comment-popover-backdrop")?.remove();
      this.root.querySelector(".ih-app")?.insertAdjacentHTML("beforeend", renderCommentPopover(this));
      const comment = this.root.querySelector("[data-input='comment-modal']");
      if (comment) {
        comment.focus();
        autoGrowTextarea(comment);
      }
    }

    closeComment() {
      const editor = this.state.commentEditor;
      const context = editor && this.contextByQuestionId(editor.questionId);
      if (context && context.questionDef.type === "flow") this.finishFlowHistoryTransaction(context);
      this.state.commentEditor = null;
      this.save();
      this.root.querySelector(".ih-comment-popover-backdrop")?.remove();
      this.syncOpenCommentButton();
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
      const body = document.createElement("div");
      body.className = "ih-evaluation-tooltip-body";
      body.innerHTML = renderMarkdown(detail.detail || "");
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
      this.flowEditors.forEach((editor) => {
        if (!editor.skipRemember) this.rememberFlowPositions(editor);
        try { if (editor.cleanup) editor.cleanup(); } catch (_) {}
        try { editor.network.destroy(); } catch (_) {}
      });
      this.flowEditors = [];
      this.flowViewCleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
      this.flowViewCleanups = [];
      this.sequenceCleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
      this.sequenceCleanups = [];
      this.codeEditors.forEach((view) => {
        try { view.destroy(); } catch (_) {}
      });
      this.codeEditors = [];
      this.columnFrameCleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) {}
      });
      this.columnFrameCleanups = [];
      if (this.phoneFrameObserver) this.phoneFrameObserver.disconnect();
      this.phoneFrameObserver = null;
      this.frameObjectUrls.forEach((url) => {
        try { global.URL.revokeObjectURL(url); } catch (_) {}
      });
      this.frameObjectUrls = [];
    }

    initColumnFrames() {
      this.root.querySelectorAll("[data-column-overflow]").forEach((board) => {
        const frame = board.querySelector("[data-column-frame]");
        if (!frame) return;
        const update = () => this.updateColumnOverflow(board);
        const refit = () => {
          this.fitColumns(board);
          update();
        };
        frame.addEventListener("scroll", update, { passive: true });
        global.addEventListener("resize", refit);
        this.columnFrameCleanups.push(() => {
          frame.removeEventListener("scroll", update);
          global.removeEventListener("resize", refit);
        });
        refit();
      });
    }

    initPhoneFrames() {
      const fits = Array.from(this.root.querySelectorAll(".ih-phone-fit"));
      if (!fits.length) return;
      // Scale the fixed-size phone down to its container; the iframe keeps its 390px viewport.
      const fit = (element) => {
        const phone = element.firstElementChild;
        const scale = Math.min(1, element.clientWidth / phone.offsetWidth) || 1;
        element.style.setProperty("--ih-phone-scale", String(scale));
        element.style.height = scale < 1 ? `${phone.offsetHeight * scale}px` : "";
      };
      fits.forEach(fit);
      if (!global.ResizeObserver) return;
      this.phoneFrameObserver = new global.ResizeObserver((entries) => entries.forEach((entry) => fit(entry.target)));
      fits.forEach((element) => this.phoneFrameObserver.observe(element));
    }

    fitColumns(board) {
      const preset = board.dataset.columnFit;
      const frame = board.querySelector("[data-column-frame]");
      if (!preset || !frame) return;
      const overflows = () => frame.scrollWidth > frame.clientWidth + 1;
      board.dataset.columnWidth = preset;
      if (overflows()) {
        board.dataset.columnWidth = "narrow";
        if (overflows()) board.dataset.columnWidth = preset;
      }
      const section = board.closest(".ih-step");
      if (!section) return;
      section.querySelectorAll("[data-action='set-column-width']").forEach((button) => {
        const selected = button.dataset.columnWidth === board.dataset.columnWidth;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }

    updateColumnOverflow(board) {
      const frame = board.querySelector("[data-column-frame]");
      const edges = board.querySelector(".ih-column-edges");
      const header = board.querySelector("[data-evaluation-header-frame]");
      if (!frame || !edges) return;
      if (header) header.scrollLeft = frame.scrollLeft;
      const view = columnFrameView(frame);
      const before = view.columns.filter((column) => column.getBoundingClientRect().left < view.left - 2).length;
      const after = view.columns.filter((column) => column.getBoundingClientRect().right > view.right + 2).length;
      edges.style.setProperty("--ih-column-edge-start", `${Math.round(view.left - frame.getBoundingClientRect().left)}px`);
      edges.classList.toggle("is-overflow-start", before > 0);
      edges.classList.toggle("is-overflow-end", after > 0);
      board.querySelectorAll("[data-action='scroll-columns']").forEach((hint) => {
        const toStart = hint.dataset.direction === "-1";
        const count = toStart ? before : after;
        const label = `${count} more ${count === 1 ? "column" : "columns"}`;
        hint.hidden = count === 0;
        hint.textContent = toStart ? `← ${label}` : `${label} →`;
        hint.setAttribute("aria-label", `${label} to the ${toStart ? "left" : "right"}`);
      });
    }

    scrollColumns(hint) {
      const board = hint.closest("[data-column-overflow]");
      const frame = board && board.querySelector("[data-column-frame]");
      if (!frame) return;
      const view = columnFrameView(frame);
      if (hint.dataset.direction === "-1") {
        const previous = view.columns.filter((column) => column.getBoundingClientRect().left < view.left - 2).pop();
        if (previous) frame.scrollBy({ left: previous.getBoundingClientRect().right - view.right, behavior: "smooth" });
      } else {
        const next = view.columns.find((column) => column.getBoundingClientRect().right > view.right + 2);
        if (next) frame.scrollBy({ left: next.getBoundingClientRect().left - view.left, behavior: "smooth" });
      }
    }

    revealEvaluationOption(context, optionId) {
      const section = this.sectionForContext(context);
      const frame = section && section.querySelector(".ih-evaluation-frame");
      if (!frame) return;
      const view = columnFrameView(frame);
      const column = view.columns.find((cell) => cell.dataset.optionId === optionId);
      if (!column) return;
      const rect = column.getBoundingClientRect();
      const delta = rect.left < view.left - 1
        ? rect.left - view.left
        : rect.right > view.right + 1 ? Math.min(rect.right - view.right, rect.left - view.left) : 0;
      if (delta) frame.scrollBy({ left: delta, behavior: "smooth" });
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
      const lists = Array.from(this.root.querySelectorAll("[data-sortable-bucket]"));
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

    initFlowEditors() {
      const hosts = Array.from(this.root.querySelectorAll("[data-flow-editor]"));
      if (!hosts.length) return;
      ensureVisNetwork().then((vis) => {
        hosts.forEach((host) => {
          // Two renders before the first frame queue two initialisations for the same host.
          if (host.isConnected && !this.flowEditors.some((editor) => editor.host === host)) this.initFlowEditor(host, vis);
        });
      }).catch(() => {
        hosts.forEach((host) => {
          if (host.isConnected) host.innerHTML = `<span class="ih-flow-loading">Flow editor unavailable.</span>`;
        });
      });
    }

    initFlowEditor(host, vis) {
      const context = this.contextFromNode(host);
      if (!context || context.questionDef.type !== "flow") return;
      const answer = context.answer;
      host.textContent = "";
      const flowNodes = normalizeFlowNodes(answer.nodes, answer.connections);
      answer.positions = normalizeFlowPositions(answer.positions, flowNodes);
      const shouldAutoArrange = flowNodes.length > 0 && Object.keys(answer.positions).length === 0;
      if (!shouldAutoArrange) {
        const fallbackPositions = defaultFlowPositions(flowNodes, answer.connections);
        flowNodes.forEach((node) => {
          if (!answer.positions[node.name]) answer.positions[node.name] = fallbackPositions[node.name];
        });
      }
      const flowTheme = flowVisualTheme(host);
      const flowConnections = normalizeFlowConnections(answer.connections, false);
      const levels = shouldAutoArrange ? flowLevels(flowNodes, flowConnections) : {};
      const spacing = flowLayoutSpacing(flowConnections);
      const nodes = new vis.DataSet(flowNodes.map((node) => flowVisNodeRecord(node, answer.positions[node.name], flowTheme, levels[node.name])));
      const edges = new vis.DataSet(flowConnections.map((connection) => flowVisConnectionRecord(connection, flowConnections, flowTheme)));
      const network = new vis.Network(host, { nodes, edges }, {
        autoResize: true,
        nodes: {
          shape: "box",
          margin: { top: 12, right: 15, bottom: 12, left: 15 },
          widthConstraint: { minimum: 126, maximum: 190 },
          font: { color: flowTheme.ink, size: 13, face: "Inter, system-ui, sans-serif", multi: false },
          shapeProperties: { borderRadius: 4 },
          chosen: { node: true, label: false }
        },
        edges: {
          selectionWidth: 2.4,
          hoverWidth: 1.5,
          chosen: { edge: true, label: false }
        },
        layout: {
          hierarchical: {
            enabled: shouldAutoArrange,
            direction: "UD",
            sortMethod: "directed",
            levelSeparation: spacing.levelSeparation,
            nodeSpacing: spacing.nodeSpacing,
            treeSpacing: spacing.treeSpacing,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true
          }
        },
        physics: false,
        interaction: { hover: true, multiselect: false, dragNodes: true, dragView: true, zoomView: true },
        manipulation: {
          enabled: false,
          addNode: false,
          addEdge: (data, callback) => {
            const from = String(data.from || "");
            const to = String(data.to || "");
            if (!from || !to) return callback(null);
            if (from === to) {
              callback(null);
              answer.adding = false;
              answer.selected = { kind: "node", name: from };
              this.activateContext(context);
              this.save();
              setTimeout(() => {
                if (!host.isConnected) return;
                network.selectNodes([from], false);
                this.refreshFlowSelection(context);
              }, 0);
              return;
            }
            const key = flowConnectionKey(from, to);
            if (flowConnectionByKey(answer, key)) {
              callback(null);
              this.toast("Those nodes are already connected.");
              return;
            }
            this.recordFlowHistory(context);
            const connection = { from, to };
            answer.connections.push(connection);
            const reciprocal = flowReciprocalConnection(answer.connections, connection);
            if (reciprocal) edges.update(flowVisConnectionRecord(reciprocal, answer.connections, flowTheme));
            answer.adding = false;
            answer.selected = { kind: "connection", key };
            callback(flowVisConnectionRecord(connection, answer.connections, flowTheme));
            this.activateContext(context);
            this.markChanged(answer);
            setTimeout(() => {
              if (!host.isConnected) return;
              routeFlowEdges(network, edges, answer.connections, host);
              network.selectEdges([key]);
              this.refreshFlowSelection(context);
            }, 0);
          },
          editEdge: false,
          deleteNode: false,
          deleteEdge: false,
          controlNodeStyle: {
            shape: "dot",
            size: 7,
            color: { background: flowTheme.accent, border: flowTheme.accentInk },
            borderWidth: 2
          }
        }
      });
      let connecting = false;
      const pointerEventName = global.PointerEvent ? "pointerdown" : "mousedown";
      const pointerUpEventName = global.PointerEvent ? "pointerup" : "mouseup";
      const startConnection = (event) => {
        if (!event.metaKey || event.button !== 0) return;
        const bounds = host.getBoundingClientRect();
        const nodeId = network.getNodeAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
        if (!nodeId) return;
        connecting = true;
        network.addEdgeMode();
      };
      const finishConnection = () => {
        if (!connecting) return;
        setTimeout(() => {
          network.disableEditMode();
          connecting = false;
        }, 0);
      };
      host.addEventListener(pointerEventName, startConnection, true);
      global.addEventListener(pointerUpEventName, finishConnection, true);
      const editor = {
        questionId: context.questionDef.id,
        network,
        nodes,
        edges,
        host,
        cleanup: () => {
          host.removeEventListener(pointerEventName, startConnection, true);
          global.removeEventListener(pointerUpEventName, finishConnection, true);
        }
      };
      this.flowEditors.push(editor);
      network.on("afterDrawing", (ctx) => drawFlowLabels(ctx, network, edges, answer.connections, flowTheme, host));
      network.on("click", (params) => {
        answer.adding = false;
        if (params.nodes.length) answer.selected = { kind: "node", name: String(params.nodes[0]) };
        else if (params.edges.length) answer.selected = { kind: "connection", key: String(params.edges[0]) };
        else answer.selected = null;
        this.activateContext(context);
        this.save();
        this.refreshFlowSelection(context);
      });
      network.on("dragEnd", (params) => {
        if (connecting || !params.nodes.length) return;
        answer.positions = Object.assign({}, safeObject(answer.positions), network.getPositions(params.nodes.map(String)));
        routeFlowEdges(network, edges, answer.connections, host);
        this.save();
      });
      const finishInitialDrawing = () => {
        routeFlowEdges(network, edges, answer.connections, host);
        network.fit({ animation: { duration: 320, easingFunction: "easeInOutQuad" } });
        const selected = normalizeFlowSelection(answer.selected, answer);
        if (selected && selected.kind === "node") network.selectNodes([selected.name], false);
        if (selected && selected.kind === "connection") network.selectEdges([selected.key]);
        this.trackFlowView(host, context);
      };
      network.once("afterDrawing", () => {
        if (shouldAutoArrange) {
          answer.positions = normalizeFlowPositions(network.getPositions(), flowNodes);
          network.setOptions({ layout: { improvedLayout: false, hierarchical: { enabled: false } } });
          setTimeout(() => {
            if (!host.isConnected) return;
            network.setOptions({ physics: { enabled: false } });
            network.stopSimulation();
            Object.entries(answer.positions).forEach(([nodeId, position]) => network.moveNode(nodeId, position.x, position.y));
            network.storePositions();
            this.save();
            finishInitialDrawing();
          }, 0);
          return;
        }
        finishInitialDrawing();
      });
    }

    trackFlowView(host, context) {
      if (!host || !context || context.questionDef.type !== "flow" || context.answer.viewed) return;
      let visible = false;
      let timer = null;
      let observer = null;
      let stopped = false;
      const stopTimer = () => {
        clearTimeout(timer);
        timer = null;
      };
      const updateTimer = () => {
        if (stopped || context.answer.viewed) return stopTimer();
        if (!visible || global.document.visibilityState !== "visible") return stopTimer();
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          if (stopped || !visible || global.document.visibilityState !== "visible") return;
          context.answer.viewed = true;
          cleanup();
          this.save();
          this.refreshChrome();
        }, 5000);
      };
      const onVisibilityChange = () => updateTimer();
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        stopTimer();
        if (observer) observer.disconnect();
        global.document.removeEventListener("visibilitychange", onVisibilityChange);
      };
      global.document.addEventListener("visibilitychange", onVisibilityChange);
      if (global.IntersectionObserver) {
        observer = new global.IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          visible = Boolean(entry && entry.isIntersecting && entry.intersectionRatio >= 0.5);
          updateTimer();
        }, { threshold: [0, 0.5] });
        observer.observe(host);
      } else {
        visible = true;
        updateTimer();
      }
      this.flowViewCleanups.push(cleanup);
    }

    flowEditorFor(questionId) {
      return this.flowEditors.find((editor) => editor.questionId === questionId) || null;
    }

    flowHistoryFor(questionId) {
      if (!this.flowHistories.has(questionId)) {
        this.flowHistories.set(questionId, { undo: [], redo: [], transaction: null });
      }
      return this.flowHistories.get(questionId);
    }

    finishFlowHistoryTransactions() {
      this.flowHistories.forEach((history, questionId) => {
        if (history.transaction) this.finishFlowHistoryTransaction(this.contextByQuestionId(questionId));
      });
    }

    pushFlowUndoSnapshot(history, snapshot) {
      const previous = history.undo[history.undo.length - 1];
      if (!previous || !sameFlowHistorySnapshot(previous, snapshot)) {
        history.undo.push(cloneFlowHistorySnapshot(snapshot));
        if (history.undo.length > 100) history.undo.shift();
      }
    }

    beginFlowHistoryTransaction(context, key) {
      if (!context || context.questionDef.type !== "flow") return;
      const history = this.flowHistoryFor(context.questionDef.id);
      if (history.transaction && history.transaction.key === key) return;
      if (history.transaction) this.finishFlowHistoryTransaction(context);
      history.transaction = { key, snapshot: flowHistorySnapshot(context.answer) };
    }

    finishFlowHistoryTransaction(context) {
      if (!context || context.questionDef.type !== "flow") return;
      const history = this.flowHistoryFor(context.questionDef.id);
      const transaction = history.transaction;
      if (!transaction) return;
      history.transaction = null;
      const current = flowHistorySnapshot(context.answer);
      if (!sameFlowHistorySnapshot(transaction.snapshot, current)) {
        this.pushFlowUndoSnapshot(history, transaction.snapshot);
        history.redo = [];
      }
      this.refreshFlowToolbar(context);
    }

    recordFlowHistory(context, kind) {
      if (!context || context.questionDef.type !== "flow") return;
      this.finishFlowHistoryTransaction(context);
      const history = this.flowHistoryFor(context.questionDef.id);
      this.pushFlowUndoSnapshot(history, flowHistorySnapshot(context.answer));
      history.redo = [];
      context.answer.confirmed = true;
      if (kind !== "confirm") context.answer.updated = true;
      context.answer.touched = true;
      this.refreshFlowToolbar(context);
    }

    restoreFlowHistorySnapshot(context, snapshot) {
      const answer = context.answer;
      const positions = safeObject(answer.positions);
      answer.nodes = cloneFlowHistorySnapshot(snapshot.nodes);
      answer.connections = cloneFlowHistorySnapshot(snapshot.connections);
      answer.comment = String(snapshot.comment || "");
      answer.positions = normalizeFlowPositions(positions, answer.nodes);
      answer.selected = null;
      answer.adding = false;
      answer.confirmed = Boolean(snapshot.confirmed);
      answer.updated = Boolean(snapshot.updated);
      answer.touched = Boolean(answer.confirmed || isFlowChanged(context.questionDef, answer));
    }

    undoFlow(context) {
      if (!context || context.questionDef.type !== "flow") return;
      this.finishFlowHistoryTransaction(context);
      const history = this.flowHistoryFor(context.questionDef.id);
      if (!history.undo.length) return;
      const current = flowHistorySnapshot(context.answer);
      const previous = history.undo.pop();
      history.redo.push(cloneFlowHistorySnapshot(current));
      this.restoreFlowHistorySnapshot(context, previous);
      this.activateContext(context);
      this.save();
      this.render();
    }

    redoFlow(context) {
      if (!context || context.questionDef.type !== "flow") return;
      this.finishFlowHistoryTransaction(context);
      const history = this.flowHistoryFor(context.questionDef.id);
      if (!history.redo.length) return;
      const current = flowHistorySnapshot(context.answer);
      const next = history.redo.pop();
      this.pushFlowUndoSnapshot(history, current);
      this.restoreFlowHistorySnapshot(context, next);
      this.activateContext(context);
      this.save();
      this.render();
    }

    rememberFlowPositions(editor) {
      if (!editor) return;
      const context = this.contextByQuestionId(editor.questionId);
      if (!context || context.questionDef.type !== "flow") return;
      try {
        const positions = Object.assign({}, safeObject(context.answer.positions), editor.network.getPositions());
        context.answer.positions = normalizeFlowPositions(positions, context.answer.nodes);
      } catch (_) {}
    }

    refreshFlowSelection(context) {
      const section = this.sectionForContext(context);
      if (!section || !context || context.questionDef.type !== "flow") return;
      this.finishFlowHistoryTransaction(context);
      const selection = section.querySelector("[data-flow-selection]");
      if (selection) selection.innerHTML = renderFlowSelection(context.answer);
      this.refreshFlowToolbar(context);
    }

    refreshFlowToolbar(context) {
      const section = this.sectionForContext(context);
      if (!section || !context || context.questionDef.type !== "flow") return;
      const remove = section.querySelector("[data-action='flow-delete']");
      if (remove) {
        const selected = normalizeFlowSelection(context.answer.selected, context.answer);
        remove.disabled = !selected;
        remove.innerHTML = `Delete <kbd class="ih-shortcut-key"><span class="ih-flow-key-glyph">⌫</span></kbd>`;
      }
      const history = this.flowHistoryFor(context.questionDef.id);
      const undo = section.querySelector("[data-action='flow-undo']");
      const redo = section.querySelector("[data-action='flow-redo']");
      if (undo) undo.disabled = !history.undo.length;
      if (redo) redo.disabled = !history.redo.length;
      const confirm = section.querySelector("[data-action='flow-confirm']");
      if (confirm && context.answer.confirmed) confirm.remove();
    }

    confirmFlow(context) {
      if (!context || context.questionDef.type !== "flow" || context.answer.confirmed) return;
      this.recordFlowHistory(context, "confirm");
      this.activateContext(context);
      this.save();
      this.render();
    }

    showFlowAdd(context) {
      const section = this.sectionForContext(context);
      if (!section || !context) return;
      context.answer.adding = true;
      context.answer.selected = null;
      const editor = this.flowEditorFor(context.questionDef.id);
      if (editor) editor.network.unselectAll();
      this.refreshFlowSelection(context);
      const input = section.querySelector("[data-input='flow-new-node']");
      if (input) input.focus();
    }

    hideFlowAdd(context) {
      const section = this.sectionForContext(context);
      if (!section || !context) return;
      context.answer.adding = false;
      this.refreshFlowSelection(context);
    }

    addFlowNode(context) {
      const section = this.sectionForContext(context);
      const input = section && section.querySelector("[data-input='flow-new-node']");
      const name = input && input.value.trim();
      if (!name) return this.toast("Write the node name first.");
      if (flowNodeByName(context.answer, name)) return this.toast("That node name is already used.");
      this.recordFlowHistory(context);
      this.rememberFlowPositions(this.flowEditorFor(context.questionDef.id));
      const positions = Object.values(safeObject(context.answer.positions));
      const newPosition = positions.length
        ? {
            x: Math.max(...positions.map((position) => position.x)) + 190,
            y: positions.reduce((sum, position) => sum + position.y / positions.length, 0)
          }
        : { x: 0, y: 0 };
      context.answer.nodes.push({ name });
      context.answer.positions[name] = newPosition;
      context.answer.selected = { kind: "node", name };
      context.answer.adding = false;
      this.activateContext(context);
      this.saveChanged(context.answer);
      this.render();
    }

    deleteFlowSelection(context) {
      const answer = context && context.answer;
      const selected = answer && normalizeFlowSelection(answer.selected, answer);
      if (!selected) return;
      this.rememberFlowPositions(this.flowEditorFor(context.questionDef.id));
      if (selected.kind === "node") {
        const attached = answer.connections.filter((connection) => connection.from === selected.name || connection.to === selected.name);
        if (attached.length && !global.confirm(`Delete ${selected.name} and ${attached.length} connected ${attached.length === 1 ? "connection" : "connections"}?`)) return;
        this.recordFlowHistory(context);
        answer.nodes = answer.nodes.filter((node) => node.name !== selected.name);
        answer.connections = answer.connections.filter((connection) => connection.from !== selected.name && connection.to !== selected.name);
        delete answer.positions[selected.name];
      } else {
        this.recordFlowHistory(context);
        answer.connections = answer.connections.filter((connection) => flowConnectionKey(connection.from, connection.to) !== selected.key);
      }
      answer.selected = null;
      this.activateContext(context);
      this.saveChanged(answer);
      this.render();
    }

    arrangeFlow(context) {
      if (!context) return;
      const editor = this.flowEditorFor(context.questionDef.id);
      if (editor) editor.skipRemember = true;
      context.answer.positions = {};
      this.save();
      this.render();
    }

    updateFlowSelectedValue(input, context) {
      const answer = context && context.answer;
      const selected = answer && normalizeFlowSelection(answer.selected, answer);
      if (!selected) return;
      const value = input.value.trim();
      if (selected.kind === "connection") {
        const connection = flowConnectionByKey(answer, selected.key);
        if (!connection) return;
        if (value) connection.label = value;
        else delete connection.label;
        answer.confirmed = true;
        answer.updated = true;
        const editor = this.flowEditorFor(context.questionDef.id);
        if (editor) editor.network.redraw();
        this.markChanged(answer, true);
        this.refreshFlowToolbar(context);
        return;
      }
      const node = flowNodeByName(answer, selected.name);
      if (!node) return;
      if (!value) {
        input.value = node.name;
        return this.toast("A node needs a name.");
      }
      if (value !== node.name && flowNodeByName(answer, value)) {
        input.value = node.name;
        return this.toast("That node name is already used.");
      }
      if (value === node.name) return;
      this.recordFlowHistory(context);
      this.rememberFlowPositions(this.flowEditorFor(context.questionDef.id));
      const previous = node.name;
      node.name = value;
      if (answer.positions[previous]) {
        answer.positions[value] = answer.positions[previous];
        delete answer.positions[previous];
      }
      answer.connections.forEach((connection) => {
        if (connection.from === previous) connection.from = value;
        if (connection.to === previous) connection.to = value;
      });
      answer.selected = { kind: "node", name: value };
      this.activateContext(context);
      this.saveChanged(answer);
      this.render();
    }

    initSequenceEditors() {
      const hosts = Array.from(this.root.querySelectorAll("[data-sequence-editor]"));
      if (!hosts.length) return;
      ensureLinesAndArrows().then(() => {
        hosts.forEach((host) => {
          if (host.isConnected) this.initSequenceEditor(host);
        });
      }).catch((error) => {
        hosts.forEach((host) => {
          if (host.isConnected) this.showSequenceFallback(host, error);
        });
      });
    }

    initSequenceEditor(host) {
      const context = this.contextFromNode(host);
      if (!context || context.questionDef.type !== "sequence") return;
      const diagram = document.createElement("lines-and-arrows");
      diagram.setAttribute("mode", "edit");
      diagram.setAttribute("theme", this.theme);
      diagram.setAttribute("branding", "true");
      diagram.setAttribute("copy-source", "false");
      diagram.setAttribute("canvas-background", "transparent");
      diagram.setAttribute("label", context.questionDef.prompt);
      let active = true;
      const cleanup = () => {
        if (!active) return;
        active = false;
        diagram.removeEventListener("la-change", onChange);
        diagram.removeEventListener("la-error", onError);
      };
      const onChange = (event) => {
        const source = event && event.detail && event.detail.source;
        if (typeof source !== "string" || !source.trim()) return;
        context.answer.source = source;
        context.answer.confirmed = true;
        this.activateContext(context);
        this.refreshSequenceResponse(context);
        this.markChanged(context.answer, true);
      };
      const onError = (event) => {
        const detail = event && event.detail;
        const error = detail && (detail.error || detail.message) || detail || new Error("Lines & Arrows could not render this source.");
        cleanup();
        this.showSequenceFallback(host, error);
      };
      diagram.addEventListener("la-change", onChange);
      diagram.addEventListener("la-error", onError);
      host.replaceChildren(diagram);
      try {
        let canonicalSource = normalizeSequenceSource(context.questionDef.canonicalSource);
        if (!canonicalSource) {
          diagram.source = context.questionDef.source;
          canonicalSource = normalizeSequenceSource(diagram.source);
          if (!canonicalSource) throw new Error("The proposed sequence source is empty.");
          Object.defineProperty(context.questionDef, "canonicalSource", {
            configurable: true,
            writable: true,
            value: canonicalSource
          });
        }
        const matchesAuthoredSource = normalizeSequenceSource(context.answer.source) === normalizeSequenceSource(context.questionDef.source);
        diagram.source = matchesAuthoredSource ? canonicalSource : context.answer.source;
        const currentSource = normalizeSequenceSource(diagram.source);
        if (!currentSource) throw new Error("The sequence source is empty.");
        context.answer.source = matchesAuthoredSource ? canonicalSource : currentSource;
      } catch (error) {
        cleanup();
        this.showSequenceFallback(host, error);
        return;
      }
      this.refreshSequenceResponse(context);
      this.scheduleExport();
      this.sequenceCleanups.push(cleanup);
    }

    showSequenceFallback(host, error) {
      const context = this.contextFromNode(host);
      const card = host.closest("[data-sequence]");
      const fallback = card && card.querySelector("[data-input='sequence-source']");
      const errorNode = card && card.querySelector("[data-sequence-error]");
      host.hidden = true;
      if (fallback) {
        fallback.hidden = false;
        fallback.value = context && context.answer && context.answer.source || fallback.value;
      }
      if (errorNode) {
        const message = error && error.message ? ` ${error.message}` : "";
        const fallbackMessage = `Visual sequence editor unavailable; using the source editor.${message}`;
        errorNode.dataset.fallbackMessage = fallbackMessage;
        errorNode.textContent = fallbackMessage;
        errorNode.hidden = false;
      }
      const validation = validateSequenceSource(context && context.answer && context.answer.source);
      if (context && !validation.valid) {
        context.answer.confirmed = false;
        this.refreshSequenceResponse(context);
        if (fallback) this.refreshSequenceFallbackError(fallback, validation);
        this.save();
        this.scheduleExport();
      }
    }

    refreshSequenceFallbackError(input, validation) {
      const card = input && input.closest("[data-sequence]");
      const errorNode = card && card.querySelector("[data-sequence-error]");
      if (!errorNode) return;
      const fallbackMessage = errorNode.dataset.fallbackMessage || "Using the sequence source editor.";
      errorNode.textContent = validation.valid
        ? fallbackMessage
        : `${fallbackMessage} ${validation.message}`;
      errorNode.hidden = false;
    }

    confirmSequence(context) {
      if (!context || context.questionDef.type !== "sequence") return;
      const validation = validateSequenceSource(context.answer.source);
      if (!validation.valid) {
        context.answer.confirmed = false;
        this.refreshSequenceResponse(context);
        const section = this.sectionForContext(context);
        const input = section && section.querySelector("[data-input='sequence-source']");
        if (input && !input.hidden) this.refreshSequenceFallbackError(input, validation);
        return this.toast(validation.message);
      }
      context.answer.confirmed = true;
      this.activateContext(context);
      this.refreshSequenceResponse(context);
      this.markChanged(context.answer);
    }

    refreshSequenceResponse(context) {
      if (!context || context.questionDef.type !== "sequence") return;
      const section = this.sectionForContext(context);
      if (!section) return;
      const status = section.querySelector("[data-sequence-status]");
      if (status) {
        status.textContent = context.answer.confirmed
          ? isSequenceChanged(context.questionDef, context.answer) ? "Sequence updated." : "Sequence confirmed as proposed."
          : "Correct the sequence visually, or confirm the proposal.";
      }
      const actions = section.querySelector("[data-sequence-actions]");
      const confirm = actions && actions.querySelector("[data-action='sequence-confirm']");
      if (context.answer.confirmed) {
        confirm?.remove();
      } else if (actions && !confirm) {
        const button = document.createElement("button");
        button.className = "ih-btn";
        button.type = "button";
        button.dataset.action = "sequence-confirm";
        button.textContent = "Confirm as proposed";
        actions.prepend(button);
      }
    }

    initCodeEditors() {
      this.root.querySelectorAll("[data-code-editor]").forEach((host) => this.initCodeEditor(host));
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

    updateBucketFromDom(context) {
      const section = this.sectionForContext(context);
      if (!context || context.questionDef.type !== "bucket" || !section) return;
      const order = [];
      context.questionDef.options.forEach((entry) => { context.answer.buckets[entry.id] = ""; });
      section.querySelectorAll(".ih-bucket-list[data-bucket-id]").forEach((list) => {
        const bucketId = list.dataset.bucketId || "";
        list.querySelectorAll(".ih-bucket-card[data-option-id]").forEach((card) => {
          context.answer.buckets[card.dataset.optionId] = bucketId;
          order.push(card.dataset.optionId);
        });
      });
      context.answer.order = normalizeBucketOrder(context.questionDef, order);
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
        answer.selected = answer.selected === optionId ? "" : optionId;
      }
      this.refreshChoiceState(context);
      this.markChanged(answer);
    }

    chooseEvaluationOption(optionId, context) {
      const answer = context && context.answer;
      const questionDef = context && context.questionDef;
      if (!answer || !questionDef || questionDef.type !== "evaluation") return;
      answer.selected = answer.selected === optionId ? "" : optionId;
      this.refreshEvaluationState(context);
      if (answer.selected) this.revealEvaluationOption(context, answer.selected);
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
      if (questionDef.type === "choice" && questionDef.select === "one") answer.selected = id;
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
        if (questionDef.type === "choice" && questionDef.select === "one" && answer.selected === removed.id) answer.selected = "";
        if (answer.comments) delete answer.comments[removed.id];
      }
      this.saveChanged(answer);
      this.render();
    }

    updateAddedTitle(optionId, title, context) {
      const answer = context && context.answer;
      const entry = answer && asArray(answer.added).find((candidate) => candidate.id === optionId);
      if (!entry) return;
      entry.title = title;
    }

    setBucket(optionId, bucketId, context) {
      const answer = context && context.answer;
      if (!answer || !answer.buckets) return;
      if ((answer.buckets[optionId] || "") !== (bucketId || "")) {
        answer.order = normalizeBucketOrder(context.questionDef, answer.order).filter((id) => id !== optionId).concat(optionId);
      }
      answer.buckets[optionId] = bucketId || "";
      this.syncBucketDom(context);
      this.markChanged(answer);
    }

    reorderBucketOption(button, context) {
      const questionDef = context && context.questionDef;
      const answer = context && context.answer;
      if (!questionDef || questionDef.type !== "bucket" || !answer) return;
      const optionId = button.dataset.optionId;
      const siblings = (bucketGroups(questionDef, answer).get(answer.buckets[optionId] || "") || []).map((entry) => entry.id);
      const index = siblings.indexOf(optionId);
      const neighbor = siblings[button.dataset.direction === "up" ? index - 1 : index + 1];
      if (index < 0 || !neighbor) return;
      const order = normalizeBucketOrder(questionDef, answer.order);
      const from = order.indexOf(optionId);
      const to = order.indexOf(neighbor);
      order[from] = neighbor;
      order[to] = optionId;
      answer.order = order;
      this.syncBucketDom(context);
      this.markChanged(answer);
      const card = button.closest(".ih-bucket-table-card");
      const focusTarget = button.disabled && card ? card.querySelector("[data-action='reorder-bucket-option']:not(:disabled)") : button;
      if (focusTarget) focusTarget.focus();
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
      section.querySelectorAll(".ih-evaluation-table td[data-option-id]").forEach((cell) => {
        const isSelected = selected.includes(cell.dataset.optionId);
        cell.classList.toggle("is-selected", isSelected);
        cell.setAttribute("aria-pressed", isSelected ? "true" : "false");
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
      section.querySelectorAll(".ih-bucket-card[data-option-id], .ih-bucket-table-card[data-option-id]").forEach((card) => {
        const bucketId = answer.buckets && answer.buckets[card.dataset.optionId] || "";
        card.querySelectorAll("[data-action='move-bucket-option']").forEach((button) => {
          const selected = (button.dataset.bucketId || "") === bucketId;
          button.classList.toggle("is-current", selected);
          button.classList.toggle("is-selected", selected);
          if (button.classList.contains("ih-bucket-state-option")) {
            button.setAttribute("aria-pressed", selected ? "true" : "false");
            button.removeAttribute("aria-current");
          } else if (selected) button.setAttribute("aria-current", "true");
          else button.removeAttribute("aria-current");
        });
      });
      const groups = bucketGroups(questionDef, answer);
      section.querySelectorAll(".ih-bucket-list[data-bucket-id], .ih-bucket-table-list[data-bucket-id]").forEach((list) => {
        const bucketId = list.dataset.bucketId || "";
        const view = list.classList.contains("ih-bucket-list") ? "board" : "table";
        const cardClass = view === "board" ? "ih-bucket-card" : "ih-bucket-table-card";
        const cards = (groups.get(bucketId) || [])
          .map((entry) => section.querySelector(`.${cardClass}[data-option-id="${cssEscape(entry.id)}"]`))
          .filter(Boolean);
        list.querySelectorAll(".ih-bucket-empty").forEach((empty) => empty.remove());
        cards.forEach((card, index) => {
          if (list.children[index] !== card) list.insertBefore(card, list.children[index] || null);
          syncBucketCardPosition(card, bucketId ? index + 1 : 0, cards.length);
        });
        if (!cards.length) {
          const empty = document.createElement("div");
          empty.className = "ih-bucket-empty";
          empty.textContent = bucketEmptyText(bucketId, view);
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
      const bucketViews = this.state.bucketViews;
      const columnWidths = this.state.columnWidths;
      this.state = createInitialState(this.config);
      this.state.viewMode = viewMode;
      this.state.bucketViews = bucketViews;
      this.state.columnWidths = columnWidths;
      this.flowHistories.clear();
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

    getText() {
      return buildTextExport(this.config, this.state);
    }

    async copyText() {
      await copyToClipboard(this.getText());
      this.toast("Copied text output.");
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

  function ensureMarked() {
    if (global.marked && typeof global.marked.parse === "function") return Promise.resolve(global.marked);
    if (markedPromise) return markedPromise;
    markedPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MARKED_URL;
      script.async = true;
      script.onload = () => global.marked ? resolve(global.marked) : reject(new Error("Marked did not attach to window."));
      script.onerror = () => reject(new Error("Marked failed to load."));
      document.head.appendChild(script);
    });
    return markedPromise;
  }

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

  function ensureVisNetwork() {
    if (global.vis && global.vis.Network && global.vis.DataSet) return Promise.resolve(global.vis);
    if (visNetworkPromise) return visNetworkPromise;
    visNetworkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = VIS_NETWORK_URL;
      script.async = true;
      script.onload = () => {
        if (global.vis && global.vis.Network && global.vis.DataSet) resolve(global.vis);
        else reject(new Error("vis-network did not attach to window."));
      };
      script.onerror = () => reject(new Error("vis-network failed to load."));
      document.head.appendChild(script);
    });
    return visNetworkPromise;
  }

  function ensureLinesAndArrows() {
    if (global.customElements && global.customElements.get("lines-and-arrows")) return Promise.resolve();
    if (linesAndArrowsPromise) return linesAndArrowsPromise;
    linesAndArrowsPromise = import(LINES_AND_ARROWS_URL).then(async () => {
      if (!global.customElements) throw new Error("Custom elements are unavailable.");
      await global.customElements.whenDefined("lines-and-arrows");
      if (!global.customElements.get("lines-and-arrows")) throw new Error("Lines & Arrows did not register its editor.");
    });
    return linesAndArrowsPromise;
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
    const colorScheme = global.getComputedStyle ? global.getComputedStyle(host).colorScheme : "dark";
    const editorTheme = /\bdark\b/.test(colorScheme) || !/\blight\b/.test(colorScheme) ? theme : null;
    host.textContent = "";
    return new EditorView({
      doc: options.doc || "",
      extensions: codeMirrorExtensions(EditorView, basicSetup, editorTheme, language, options),
      parent: host
    });
  }

  function codeMirrorExtensions(EditorView, basicSetup, theme, language, options) {
    const extensions = [basicSetup, theme, language, EditorView.lineWrapping];
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

  function mount(input) {
    try {
      return new InterviewHarnessApp(normalizeConfig(input));
    } catch (error) {
      console.error(error);
      showMountError(error);
      throw error;
    }
  }

  function showMountError(error) {
    try {
      const problems = errorProblems(error);
      const report = [
        `The interview page failed to open. Interview Harness ${VERSION} reported:`,
        ...problems.map((problem) => `- ${problem}`),
        "Fix the interview file and send it again."
      ].join("\n");
      const theme = readSharedTheme();
      applyThemeToDocument(theme);
      injectStyles();
      const root = resolveTarget(`#${DEFAULT_TARGET_ID}`);
      root.innerHTML = renderMountError(theme, problems, report);
      let toastTimer = null;
      const toast = (message) => {
        const node = root.querySelector(".ih-toast");
        clearTimeout(toastTimer);
        node.textContent = message;
        node.classList.add("is-visible");
        toastTimer = setTimeout(() => node.classList.remove("is-visible"), 1700);
      };
      root.querySelector("[data-action='copy-error-report']").addEventListener("click", () => {
        copyToClipboard(report).then(() => toast("Copied report."), () => {
          global.getSelection().selectAllChildren(root.querySelector("[data-error-report]"));
          toast("Copy blocked. Report text selected.");
        });
      });
    } catch (_) {}
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
    const answered = isQuestionAnswered(questionDef, answer);
    return [
      index === instance.state.step ? "is-active" : "",
      answered ? "is-answered" : "is-unanswered",
      !answered && questionDef.type === "flow" && answer && answer.viewed ? "is-partial" : ""
    ].filter(Boolean).join(" ");
  }

  function isInterviewReady(instance) {
    return instance.config.questions.every((questionDef) => isQuestionAnswered(questionDef, instance.state.answers[questionDef.id]));
  }

  const questionAnsweredChecks = {
    choice: (questionDef, answer) => questionDef.select === "many" ? asArray(answer.selected).length > 0 : Boolean(answer.selected),
    evaluation: (_questionDef, answer) => Boolean(answer.selected),
    bucket: (questionDef, answer) => questionDef.options.every((entry) => Boolean(
      answer.buckets && answer.buckets[entry.id] || String(optionComment(answer, entry.id)).trim()
    )),
    flow: (_questionDef, answer) => Boolean(answer.confirmed),
    sequence: (_questionDef, answer) => Boolean(answer.confirmed),
    edit: (_questionDef, answer) => Boolean(answer.touched) && Boolean(String(answer.content || "").trim())
  };

  function isQuestionAnswered(questionDef, answer) {
    if (!answer) return false;
    return questionAnsweredChecks[questionDef.type](questionDef, answer);
  }

  function isEvaluationIcon(value) {
    return ["yes", "no", "partial", "unknown", "warn", "best"].includes(String(value || ""));
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
    return options.concat(normalizeAddedOptions(answer.added).map((entry) => Object.assign({ markdown: "", markdownTooltip: "", htmlPreview: "", previewType: "none", tags: [], custom: true }, entry)));
  }

  function normalizeBucketOrder(questionDef, order) {
    const ids = questionDef.options.map((entry) => entry.id);
    const kept = Array.from(new Set(asArray(order))).filter((id) => ids.includes(id));
    return kept.concat(ids.filter((id) => !kept.includes(id)));
  }

  function bucketGroups(questionDef, answer) {
    const groups = new Map([["", []]].concat(questionDef.buckets.map((bucket) => [bucket.id, []])));
    normalizeBucketOrder(questionDef, answer.order).forEach((id) => {
      const bucketId = answer.buckets && answer.buckets[id] || "";
      (groups.get(bucketId) || groups.get("")).push(questionDef.options.find((entry) => entry.id === id));
    });
    return groups;
  }

  function bucketEmptyText(bucketId, view) {
    if (!bucketId) return "Everything is bucketed";
    return view === "table" ? "No options yet" : "Drop options here";
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
    return entry ? { id: entry.id, title: entry.title, custom: entry.custom } : null;
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

  function flowConnectionKey(from, to) {
    return JSON.stringify([String(from || ""), String(to || "")]);
  }

  function flowNodeByName(answer, name) {
    return asArray(answer && answer.nodes).find((node) => node && node.name === name) || null;
  }

  function flowConnectionByKey(answer, key) {
    return asArray(answer && answer.connections).find((connection) => flowConnectionKey(connection.from, connection.to) === key) || null;
  }

  function normalizeFlowSelection(input, answer) {
    const selected = safeObject(input);
    if (selected.kind === "node" && flowNodeByName(answer, selected.name)) {
      return { kind: "node", name: selected.name };
    }
    if (selected.kind === "connection" && flowConnectionByKey(answer, selected.key)) {
      return { kind: "connection", key: selected.key };
    }
    return null;
  }

  function flowSemanticSnapshot(answer) {
    const nodes = normalizeFlowNodes(answer && answer.nodes, answer && answer.connections)
      .map((node) => ({ name: node.name, comment: node.comment || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const connections = normalizeFlowConnections(answer && answer.connections, false)
      .map((connection) => ({
        from: connection.from,
        to: connection.to,
        label: connection.label || "",
        comment: connection.comment || ""
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { nodes, connections, comment: String(answer && answer.comment || "") };
  }

  function flowHistorySnapshot(answer) {
    return {
      nodes: normalizeFlowNodes(answer && answer.nodes, answer && answer.connections)
        .map((node) => Object.assign({ name: node.name }, node.comment ? { comment: node.comment } : {})),
      connections: normalizeFlowConnections(answer && answer.connections, false)
        .map((connection) => Object.assign(
          { from: connection.from, to: connection.to },
          connection.label ? { label: connection.label } : {},
          connection.comment ? { comment: connection.comment } : {}
        )),
      comment: String(answer && answer.comment || ""),
      confirmed: Boolean(answer && answer.confirmed),
      updated: Boolean(answer && answer.updated)
    };
  }

  function cloneFlowHistorySnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function sameFlowHistorySnapshot(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function flowStructureSnapshot(answer) {
    const nodes = normalizeFlowNodes(answer && answer.nodes, answer && answer.connections)
      .map((node) => node.name)
      .sort((a, b) => a.localeCompare(b));
    const connections = normalizeFlowConnections(answer && answer.connections, false)
      .map((connection) => ({
        from: connection.from,
        to: connection.to,
        label: connection.label || ""
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { nodes, connections };
  }

  function isFlowChanged(questionDef, answer) {
    return JSON.stringify(flowSemanticSnapshot(answer)) !== JSON.stringify(flowSemanticSnapshot(initialFlowAnswer(questionDef)));
  }

  function isFlowStructurallyChanged(questionDef, answer) {
    return JSON.stringify(flowStructureSnapshot(answer)) !== JSON.stringify(flowStructureSnapshot(initialFlowAnswer(questionDef)));
  }

  function normalizeSequenceSource(value) {
    return String(value || "").replace(/\r\n?/g, "\n").trim();
  }

  function validateSequenceSource(value) {
    const source = normalizeSequenceSource(value);
    if (!source) return { valid: false, message: "Sequence source is required." };
    if (!global.customElements || !global.customElements.get("lines-and-arrows")) {
      return { valid: true };
    }
    try {
      const probe = global.document.createElement("lines-and-arrows");
      probe.source = source;
      if (!normalizeSequenceSource(probe.source)) {
        return { valid: false, message: "Sequence source is required." };
      }
      return { valid: true };
    } catch (error) {
      const message = error && error.message ? error.message : "The sequence source is invalid.";
      return { valid: false, message };
    }
  }

  function isSequenceChanged(questionDef, answer) {
    const baseline = questionDef && (questionDef.canonicalSource || questionDef.source);
    return normalizeSequenceSource(answer && answer.source) !== normalizeSequenceSource(baseline);
  }

  function normalizeFlowPositions(input, nodes) {
    const source = safeObject(input);
    const positions = {};
    asArray(nodes).forEach((node) => {
      const position = safeObject(source[node.name]);
      const x = Number(position.x);
      const y = Number(position.y);
      if (Number.isFinite(x) && Number.isFinite(y)) positions[node.name] = { x, y };
    });
    return positions;
  }

  function flowLevels(nodes, connections) {
    const names = asArray(nodes).map((node) => node.name);
    const known = new Set(names);
    const incoming = Object.fromEntries(names.map((name) => [name, 0]));
    const outgoing = Object.fromEntries(names.map((name) => [name, []]));
    asArray(connections).forEach((connection) => {
      if (!known.has(connection.from) || !known.has(connection.to) || connection.from === connection.to) return;
      incoming[connection.to] += 1;
      outgoing[connection.from].push(connection.to);
    });
    // Depth-first order from the entry nodes; edges that point back up this order close a cycle and do not push levels down.
    const order = [];
    const visited = new Set();
    const visit = (name) => {
      visited.add(name);
      outgoing[name].forEach((target) => {
        if (!visited.has(target)) visit(target);
      });
      order.unshift(name);
    };
    names.filter((name) => incoming[name] === 0).concat(names).forEach((name) => {
      if (!visited.has(name)) visit(name);
    });
    const rank = Object.fromEntries(order.map((name, index) => [name, index]));
    const levels = Object.fromEntries(names.map((name) => [name, 0]));
    order.forEach((name) => {
      outgoing[name].forEach((target) => {
        if (rank[target] > rank[name]) levels[target] = Math.max(levels[target], levels[name] + 1);
      });
    });
    return levels;
  }

  function defaultFlowPositions(nodes, connections) {
    const names = asArray(nodes).map((node) => node.name);
    const levels = flowLevels(nodes, connections);
    const groups = {};
    names.forEach((name) => {
      const level = levels[name];
      if (!groups[level]) groups[level] = [];
      groups[level].push(name);
    });
    const positions = {};
    Object.entries(groups).forEach(([level, entries]) => {
      entries.forEach((name, index) => {
        positions[name] = {
          x: (index - (entries.length - 1) / 2) * 190,
          y: Number(level) * 110
        };
      });
    });
    return positions;
  }

  function flowDisplayLabel(value) {
    const words = String(value || "").split(/\s+/).filter(Boolean);
    const text = words.join(" ");
    if (text.length <= FLOW_LABEL_LINE_CHARS) return text;
    const lineCount = Math.ceil(text.length / FLOW_LABEL_LINE_CHARS);
    for (let width = Math.ceil(text.length / lineCount); ; width += 1) {
      const lines = [];
      words.forEach((word) => {
        const last = lines.length - 1;
        if (last >= 0 && lines[last].length + 1 + word.length <= width) lines[last] += ` ${word}`;
        else lines.push(word);
      });
      if (lines.length <= lineCount || width >= FLOW_LABEL_LINE_CHARS) return lines.join("\n");
    }
  }

  function flowLayoutSpacing(connections) {
    const labels = asArray(connections).filter((connection) => connection.label)
      .map((connection) => ({ connection, lines: flowDisplayLabel(connection.label).split("\n") }));
    const labelWidth = (label) => 6.2 * Math.max(...label.lines.map((line) => line.length));
    let fanWidth = 0;
    ["from", "to"].forEach((end) => {
      const groups = {};
      labels.forEach((label) => {
        const name = label.connection[end];
        groups[name] = (groups[name] || []).concat(labelWidth(label));
      });
      Object.values(groups).filter((widths) => widths.length > 1).forEach((widths) => {
        fanWidth = Math.max(fanWidth, ...widths);
      });
    });
    const lineCount = Math.max(0, ...labels.map((label) => label.lines.length));
    const nodeSpacing = Math.round(Math.min(360, Math.max(210, 2 * fanWidth + 28)));
    return {
      levelSeparation: 120 + 14 * Math.max(0, lineCount - 2),
      nodeSpacing,
      treeSpacing: nodeSpacing + 30
    };
  }

  function flowExportText(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s*\n\s*/g, " ");
  }

  function flowVisualTheme(host) {
    const styles = host && global.getComputedStyle
      ? global.getComputedStyle(host.closest(".ih-app") || host)
      : null;
    const value = (name, fallback) => styles && styles.getPropertyValue(name).trim() || fallback;
    return {
      ink: value("--ih-ink", "#eef1ec"),
      muted: value("--ih-muted", "#dfe8e3"),
      accent: value("--ih-accent", "#8dd7bd"),
      accentInk: value("--ih-accent-ink", "#14231e"),
      warn: value("--ih-warn", "#f2c14e"),
      warnSoft: value("--ih-warn-soft", "rgba(242,193,78,.3)"),
      node: value("--ih-flow-node", "#3d4744"),
      nodeHover: value("--ih-flow-node-hover", "#46524f"),
      edge: value("--ih-flow-edge", "#71817b"),
      labelBackground: value("--ih-flow-label-bg", "#202625")
    };
  }

  function flowVisNodeRecord(node, position, theme, level) {
    const colors = theme || flowVisualTheme(null);
    const comment = String(node.comment || "");
    const highlighted = Boolean(comment.trim());
    const record = {
      id: node.name,
      label: node.name,
      comment,
      shape: "box",
      color: {
        background: colors.node,
        border: highlighted ? colors.warn : colors.edge,
        highlight: { background: colors.nodeHover, border: colors.accent },
        hover: { background: colors.nodeHover, border: colors.accent }
      },
      borderWidth: highlighted ? 3 : 1.5,
      shadow: highlighted ? { enabled: true, color: colors.warnSoft, size: 16, x: 0, y: 0 } : false
    };
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      record.x = position.x;
      record.y = position.y;
    }
    if (Number.isFinite(level)) record.level = level;
    return record;
  }

  function flowReciprocalConnection(connections, connection) {
    return asArray(connections).find((candidate) => candidate !== connection && candidate.from === connection.to && candidate.to === connection.from) || null;
  }

  function flowVisConnectionRecord(connection, connections, theme) {
    const colors = theme || flowVisualTheme(null);
    const comment = String(connection.comment || "");
    const highlighted = Boolean(comment.trim());
    return {
      id: flowConnectionKey(connection.from, connection.to),
      from: connection.from,
      to: connection.to,
      comment,
      arrows: { to: { enabled: true, scaleFactor: 0.82 } },
      color: {
        color: highlighted ? colors.warn : colors.edge,
        highlight: colors.accent,
        hover: colors.accent,
        inherit: false
      },
      width: 1.7,
      dashes: false,
      smooth: flowSmoothOptions(connection, connections)[0]
    };
  }

  // The first option is the default curve; with the edge's end positions, wider curves follow as alternatives.
  function flowSmoothOptions(connection, connections, from, to) {
    const length = from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
    // The curvedCW/curvedCCW roundness that bends the edge about `bulge` pixels away from a straight line.
    const roundness = (bulge) => {
      for (let step = 1; step < 20; step += 1) {
        if (0.25 * (1 + step / 20) * length * Math.sin(step / 40 * Math.PI) >= bulge) return step / 20;
      }
      return 1;
    };
    if (flowReciprocalConnection(connections, connection)) {
      return (length ? [20, 45, 70].map(roundness) : [0.3]).map((value) => ({ enabled: true, type: "curvedCW", roundness: value }));
    }
    return [{ enabled: true, type: "cubicBezier", forceDirection: "vertical", roundness: 0.42 }].concat(
      (length ? [50, 90, 130] : []).map(roundness).flatMap((value) => ["curvedCW", "curvedCCW"].map((type) => ({ enabled: true, type, roundness: value })))
    );
  }

  // Same curves vis-network draws for the smooth options above, so labels and routing can follow an edge.
  function flowEdgePoint(from, to, smooth, t) {
    const u = 1 - t;
    if (smooth.type === "cubicBezier") {
      const bend = smooth.roundness * (to.y - from.y);
      return {
        x: (u * u * u + 3 * u * u * t) * from.x + (3 * u * t * t + t * t * t) * to.x,
        y: u * u * u * from.y + 3 * u * u * t * (from.y + bend) + 3 * u * t * t * (to.y - bend) + t * t * t * to.y
      };
    }
    const factor = 0.5 + 0.5 * smooth.roundness;
    const radius = Math.hypot(to.x - from.x, to.y - from.y);
    const angle = Math.atan2(from.y - to.y, to.x - from.x) + (smooth.type === "curvedCW" ? factor : 1 - factor) * Math.PI;
    const via = { x: from.x + factor * radius * Math.sin(angle), y: from.y + factor * radius * Math.cos(angle) };
    return {
      x: u * u * from.x + 2 * u * t * via.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * via.y + t * t * to.y
    };
  }

  function flowNodeBoxes(network, margin) {
    const boxes = {};
    Object.keys(network.getPositions()).forEach((name) => {
      const box = network.getBoundingBox(name);
      boxes[name] = { left: box.left - margin, top: box.top - margin, right: box.right + margin, bottom: box.bottom + margin };
    });
    return boxes;
  }

  function flowBoxesOverlap(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }

  // The area network.fit() shows: the nodes' bounds plus vis-network's 10% margin, widened to the canvas shape.
  function flowFitBox(network, host) {
    const boxes = Object.values(flowNodeBoxes(network, 0));
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!boxes.length || !width || !height) return null;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    const scale = Math.min(1, width / (1.1 * Math.max(1, right - left)), height / (1.1 * Math.max(1, bottom - top)));
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    return { left: x - width / scale / 2, top: y - height / scale / 2, right: x + width / scale / 2, bottom: y + height / scale / 2 };
  }

  function flowOutside(box, point) {
    return Boolean(box) && (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom);
  }

  function flowCurvePoints(from, to, smooth) {
    const points = [];
    for (let step = 1; step < 20; step += 1) points.push(flowEdgePoint(from, to, smooth, step / 20));
    return points;
  }

  function flowPolylineCrossings(a, b) {
    const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    let crossings = 0;
    for (let i = 1; i < a.length; i += 1) {
      for (let j = 1; j < b.length; j += 1) {
        if (side(a[i - 1], a[i], b[j - 1]) !== side(a[i - 1], a[i], b[j]) && side(b[j - 1], b[j], a[i - 1]) !== side(b[j - 1], b[j], a[i])) crossings += 1;
      }
    }
    return crossings;
  }

  // Keep each edge clear of the nodes it does not connect. When the default curve passes through one, use the wider
  // curve on either side that passes through the fewest nodes, stays in view and crosses the fewest other edges.
  function routeFlowEdges(network, edges, connections, host) {
    const positions = network.getPositions();
    const boxes = flowNodeBoxes(network, 8);
    const view = flowFitBox(network, host);
    const valid = asArray(connections).filter((connection) => positions[connection.from] && positions[connection.to]
      && edges.get(flowConnectionKey(connection.from, connection.to)));
    const curves = {};
    valid.forEach((connection) => {
      const id = flowConnectionKey(connection.from, connection.to);
      curves[id] = flowCurvePoints(positions[connection.from], positions[connection.to], edges.get(id).smooth);
    });
    const updates = valid.map((connection) => {
      const id = flowConnectionKey(connection.from, connection.to);
      const from = positions[connection.from];
      const to = positions[connection.to];
      const obstacles = Object.keys(boxes).filter((name) => name !== connection.from && name !== connection.to).map((name) => boxes[name]);
      const blocked = (points) => points.filter((point) => flowOutside(view, point)
        || obstacles.some((box) => point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom)).length;
      const options = flowSmoothOptions(connection, connections, from, to);
      let best = null;
      options.some((smooth, index) => {
        const points = flowCurvePoints(from, to, smooth);
        let score = blocked(points);
        if (index === 0 && score === 0) {
          best = { smooth };
          return true;
        }
        Object.keys(curves).forEach((other) => {
          if (other !== id) score += flowPolylineCrossings(points, curves[other]);
        });
        if (!best || score < best.score) best = { smooth, score };
        return false;
      });
      return { id, smooth: best.smooth };
    });
    edges.update(updates);
  }

  // vis-network always centres an edge label on the curve midpoint; this draws labels instead and slides each one
  // along its edge, centred on it or beside it, until it clears the nodes and the labels already placed.
  function drawFlowLabels(ctx, network, edges, connections, theme, host) {
    const positions = network.getPositions();
    const boxes = flowNodeBoxes(network, 4);
    const view = flowFitBox(network, host);
    const taken = Object.keys(boxes).map((name) => boxes[name]);
    const lineHeight = 13;
    ctx.save();
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelled = asArray(connections).filter((connection) => connection.label && positions[connection.from] && positions[connection.to]);
    const length = (connection) => Math.hypot(positions[connection.to].x - positions[connection.from].x, positions[connection.to].y - positions[connection.from].y);
    // Short edges have the least room to move a label, so they choose first.
    labelled.sort((a, b) => length(a) - length(b)).forEach((connection) => {
      const edge = edges.get(flowConnectionKey(connection.from, connection.to));
      const from = positions[connection.from];
      const to = positions[connection.to];
      if (!edge) return;
      const lines = flowDisplayLabel(connection.label).split("\n");
      const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 8;
      const height = lines.length * lineHeight + 4;
      const curved = edge.smooth.type !== "cubicBezier";
      let best = null;
      FLOW_LABEL_POSITIONS.some((t) => {
        const point = flowEdgePoint(from, to, edge.smooth, t);
        const ahead = flowEdgePoint(from, to, edge.smooth, t + 0.02);
        // Beside a steep stretch means left or right of it; beside a flat stretch means above or below it.
        const steep = Math.abs(ahead.y - point.y) >= Math.abs(ahead.x - point.x);
        const bend = steep ? point.x - (from.x + (to.x - from.x) * t) : point.y - (from.y + (to.y - from.y) * t);
        const outside = bend >= 0 ? 1 : -1;
        // A curved edge (reciprocal or routed around a node) keeps its label on the outside of its bend.
        const sides = curved ? [outside, 0, -outside] : [0, outside, -outside];
        return sides.some((side) => {
          const x = point.x + (steep ? side * (width / 2 + 4) : 0);
          const y = point.y + (steep ? 0 : side * (height / 2 + 4));
          const box = { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
          const collisions = taken.filter((other) => flowBoxesOverlap(box, other)).length
            + (flowOutside(view, { x: box.left, y: box.top }) || flowOutside(view, { x: box.right, y: box.bottom }) ? 1 : 0);
          if (!best || collisions < best.collisions) best = { x, box, collisions };
          return collisions === 0;
        });
      });
      taken.push(best.box);
      ctx.fillStyle = theme.labelBackground;
      ctx.fillRect(best.box.left, best.box.top, width, height);
      ctx.fillStyle = theme.muted;
      lines.forEach((line, index) => ctx.fillText(line, best.x, best.box.top + 2 + lineHeight * (index + 0.5)));
    });
    ctx.restore();
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

  function requireObject(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
    return Object.assign({}, value);
  }

  function requireArray(value, path, nonEmpty) {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
    if (nonEmpty && value.length === 0) throw new TypeError(`${path} must not be empty.`);
    return value;
  }

  function requiredString(value, path) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be a non-empty string.`);
    return value.trim();
  }

  function optionalString(value, path) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") throw new TypeError(`${path} must be a string.`);
    return value;
  }

  function columnWidthValue(value) {
    const width = typeof value === "string" ? value.trim().toLowerCase() : "";
    return COLUMN_WIDTHS.includes(width) ? width : "";
  }

  function normalizeColumnWidth(value, path, fallback = "narrow") {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string") throw new TypeError(`${path} must be narrow, medium, or wide.`);
    const width = columnWidthValue(value);
    if (!width) throw new TypeError(`${path} must be narrow, medium, or wide.`);
    return width;
  }

  function normalizePreviewFrame(value, path) {
    if (value === undefined || value === null) return "";
    if (value !== "phone") throw new TypeError(`${path} must be phone.`);
    return value;
  }

  function assertKnownFields(value, allowed, path) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new TypeError(`${path} contains unknown ${unknown.length === 1 ? "field" : "fields"}: ${unknown.join(", ")}.`);
  }

  function collectProblem(problems, check) {
    try {
      return check();
    } catch (error) {
      problems.push(...errorProblems(error));
      return undefined;
    }
  }

  function throwProblems(problems) {
    if (problems.length) throw Object.assign(new TypeError(problems.join("\n")), { problems });
  }

  function errorProblems(error) {
    if (error && Array.isArray(error.problems)) return error.problems;
    return [String((error && error.message) || error)];
  }

  function configFingerprint(value) {
    const source = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `v4-${(hash >>> 0).toString(36)}`;
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
    return Boolean(node && node.closest && node.closest("input, textarea, select, label, button, summary, details, [contenteditable='true'], .cm-editor, .cm-content"));
  }

  function isTextEntryControl(node) {
    return Boolean(node && node.closest && node.closest("input, textarea, select, [contenteditable='true'], .cm-editor, .cm-content"));
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

  function normalizeTheme(value) {
    const theme = String(value || "").toLowerCase();
    return theme === "light" || theme === "dark" ? theme : "";
  }

  function parseThemePreference(value) {
    if (!value) return null;
    const legacyTheme = normalizeTheme(value);
    if (legacyTheme) return { theme: legacyTheme, updatedAt: 0 };
    try {
      const parsed = JSON.parse(value);
      const theme = normalizeTheme(parsed && parsed.theme);
      if (!theme) return null;
      return { theme, updatedAt: Math.max(0, Number(parsed.updatedAt) || 0) };
    } catch (_) {
      return null;
    }
  }

  function windowNameThemePreference() {
    const marker = String(global.name || "")
      .split("|")
      .find((part) => part.startsWith(THEME_WINDOW_NAME_PREFIX));
    if (!marker) return null;
    const [themeValue, updatedAtValue] = marker.slice(THEME_WINDOW_NAME_PREFIX.length).split(":");
    const theme = normalizeTheme(themeValue);
    if (!theme) return null;
    return { theme, updatedAt: Math.max(0, Number(updatedAtValue) || 0) };
  }

  function readSharedTheme() {
    const preferences = [];
    try {
      const stored = parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
      if (stored) preferences.push(stored);
    } catch (_) {}
    const carried = windowNameThemePreference();
    if (carried) preferences.push(carried);
    preferences.sort((left, right) => right.updatedAt - left.updatedAt);
    return preferences[0] ? preferences[0].theme : "light";
  }

  function persistSharedTheme(theme) {
    const preference = { theme: normalizeTheme(theme) || "light", updatedAt: Date.now() };
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
    } catch (_) {}
    try {
      const nameParts = String(global.name || "")
        .split("|")
        .filter((part) => part && !part.startsWith(THEME_WINDOW_NAME_PREFIX));
      nameParts.push(`${THEME_WINDOW_NAME_PREFIX}${preference.theme}:${preference.updatedAt}`);
      global.name = nameParts.join("|");
    } catch (_) {}
  }

  function applyThemeToDocument(theme) {
    document.documentElement.dataset.ihTheme = normalizeTheme(theme) || "light";
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
    mount
  };
})(window);
