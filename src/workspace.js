import { coverage, changes, grade, makeQuiz, unitsOf } from "./knowledge.js";
import { gradeChallenge, makeChallenge } from "./challenge.js";
import { gitSummary, scan, sourceFingerprint } from "./scan.js";
import { randomUUID } from "node:crypto";
import { htmlReport } from "./html-report.js";
import { withState } from "./store.js";

export const operations = {
  scan: ["Index the project", "فهرسة المشروع"],
  changes: ["Inspect changes and OpenCode tool evidence", "عرض التغييرات وأدلة أدوات OpenCode"],
  explain: ["Explain indexed structure for a file or symbol", "شرح البنية المفهرسة لملف أو رمز"],
  walkthrough: ["Show a file's units in source order", "عرض وحدات الملف بترتيب المصدر"],
  quiz: ["Create a source-based structural question", "إنشاء سؤال بنيوي من المصدر"],
  submit: ["Grade a quiz answer by ID", "تقييم إجابة حسب رقم الاختبار"],
  "quiz-open": ["Generate an open reasoning question and rubric", "إنشاء سؤال استدلال مفتوح ومعايير مراجعته"],
  "quiz-respond": ["Save a local answer for human review", "حفظ إجابة محلياً للمراجعة البشرية"],
  "quiz-review": ["Record a rubric-based review of a local answer", "تسجيل مراجعة بشرية لإجابة محلية"],
  assess: ["Generate a model-assisted assessment for a source range", "توليد تقييم بالنموذج لنطاق من الكود"],
  "assess-submit": ["Evaluate a response independently against the source and rubric", "تقييم الإجابة مستقلاً وفق الكود ومعايير التقييم"],
  challenge: ["Generate a bounded behavior challenge for a numeric function", "إنشاء تحدٍ سلوكي محدود لدالة رقمية"],
  "challenge-submit": ["Check a solution against the challenge cases", "التحقق من الحل باستخدام حالات التحدي"],
  coverage: ["Measure assessed and mastered coverage", "قياس التغطية والإتقان"],
  mastery: ["Show each unit's current evidence status", "عرض حالة أدلة كل وحدة"],
  unknown: ["Find units with missing, weak or stale evidence", "عرض الأدلة الناقصة أو الضعيفة أو القديمة"],
  map: ["Show file coverage and import relationships", "عرض تغطية الملفات وعلاقات الاستيراد"],
  debt: ["Measure assessed knowledge debt and assessment coverage", "قياس الدين المعرفي والتغطية"],
  risk: ["Rank unproven units by measured complexity", "ترتيب الوحدات حسب التعقيد المقاس"],
  review: ["Review tracked changes and syntax diagnostics", "مراجعة التغييرات وتشخيص الصياغة"],
  improve: ["Inspect syntax and complexity improvement candidates", "عرض فرص تحسين الصياغة والتعقيد"],
  profile: ["Show the local project assessment history", "عرض تاريخ تقييم المشروع المحلي"],
  learn: ["Prioritize units to review and reassess", "ترتيب الوحدات للمراجعة وإعادة التقييم"],
  retention: ["Show scheduled and overdue reviews", "عرض المراجعات المجدولة والمتأخرة"],
  gate: ["Evaluate an advisory coverage gate", "تقييم بوابة تغطية استشارية"],
  dashboard: ["Summarize indexed code, changes and evidence", "تلخيص الكود والتغييرات والأدلة"],
  report: ["Render the knowledge report as JSON, Markdown, HTML or CSV", "إخراج تقرير المعرفة بصيغ متعددة"],
  export: ["Export this project's local IQ state", "تصدير بيانات المشروع المحلية"],
  clear: ["Delete this project's local IQ data; requires confirm", "حذف بيانات المشروع المحلية بعد التأكيد"],
};

function pick(units, target) {
  if (!target) throw new Error("Provide an indexed file path or unit ID");
  const selection = units.filter((unit) => unit.file === target || unit.id === target);
  if (!selection.length) throw new Error("No indexed unit matches the selection");
  return selection.sort((a, b) => a.start - b.start || b.end - a.end);
}

function explanation(index, unit) {
  if (unit.analysis === "text") return {
    id: unit.id, file: unit.file, start: unit.start, end: unit.end, language: unit.language, analysis: unit.analysis, status: unit.status,
    description: `${unit.file} is indexed in text mode with ${index.files[unit.file].lines.length} nonblank lines. Language identification is based on the extension or script header. Syntax, symbols and imports were not parsed.`,
  };
  const { returns, loops, calls, throws, awaits, branches } = unit.facts;
  return {
    id: unit.id, file: unit.file, start: unit.start, end: unit.end,
    description: `${unit.name} is indexed as a ${unit.kind} spanning lines ${unit.start}–${unit.end}. Its own scope contains ${branches} decision points, ${loops} loops, ${calls} calls, ${returns} return statements, ${throws} throws and ${awaits} awaits.`,
    language: unit.language, analysis: unit.analysis, complexity: unit.complexity, parameters: unit.parameters, status: unit.status,
    imports: index.files[unit.file].imports, dependencies: index.dependencies[unit.file],
  };
}

export async function modelExcerpt(root, index, target) {
  const range = Object.hasOwn(index.files, target) ? null : /^(.*):(\d+)-(\d+)$/.exec(target);
  const file = range?.[1] ?? target;
  if (!Object.hasOwn(index.files, file) || /(?:^|[\/_.-])(?:credentials?|secrets?|passwords?|private[_-]?keys?)(?:[\/_.-]|$)/i.test(file)) {
    throw new Error("Choose an indexed source path that is eligible for model sharing");
  }
  const indexed = index.files[file];
  const source = await sourceFingerprint(root, file);
  if (source?.hash !== indexed.hash) throw new Error("Source changed during explanation. Try again.");
  const rows = source.bytes.toString("utf8").split(/\r\n|[\r\n\u2028\u2029]/);
  const first = range ? Number(range[2]) : 1;
  const last = range ? Number(range[3]) : indexed.units.at(-1).end;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || first > last || last > indexed.units.at(-1).end) {
    throw new Error("Choose a valid inclusive line range within the file");
  }
  const lines = [];
  let remaining = 12_000;
  for (let line = first; line <= last && lines.length < 100; line++) {
    const row = { line, text: rows[line - 1] };
    remaining -= JSON.stringify(row).length + 1;
    if (remaining < 0) break;
    lines.push(row);
  }
  if (!lines.length) throw new Error("The first source line exceeds the sharing limit");
  return { source: { file, language: indexed.language, lines, truncated: lines.at(-1).line < last } };
}

function renderReport(metrics, format) {
  if (!format || format === "json") return metrics;
  const csv = (field) => `"${String(field).replace(/^[=+\-@\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  if (format === "csv") {
    const columns = Object.keys(metrics.lines);
    return [["file", "lines", ...columns], ...metrics.files.map(({ file, lines, statuses }) => [file, lines, ...columns.map((key) => statuses[key])])]
      .map((row) => row.map(csv).join(",")).join("\r\n");
  }
  if (format === "md" || format === "markdown") return `# OpenCode IQ\n\n| Status | Lines |\n| --- | ---: |\n${Object.entries(metrics.lines).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}`;
  if (format === "html") return htmlReport(metrics);
  throw new Error("Supported formats are json, markdown, html and csv");
}

export async function run(root, name, args = "", options = {}) {
  if (!Object.hasOwn(operations, name)) throw new Error("Unknown IQ operation");
  if (["assess", "assess-submit"].includes(name)) throw new Error("Use this assessment command inside OpenCode with source sharing enabled");
  const target = args.trim();
  return withState(root, async (state, directory) => {
    if (name === "clear") {
      if (target !== "confirm") throw new Error("Use clear confirm to delete this project's local data");
      return { output: { deleted: true }, remove: true };
    }
    if (name === "export") return { output: state, save: false };
    const previous = state.index?.files ?? {};
    const scanStartedAt = new Date().toISOString();
    const index = await scan(directory, previous, options);
    const observations = state.observed.filter((item) => !state.indexedAt || item.time >= state.indexedAt);
    const delta = state.index ? changes(previous, index.files, observations) : [];
    if (delta.length) state.changes = delta;
    state.index = index;
    state.indexedAt = scanStartedAt;
    if (name === "scan") return { output: { files: Object.keys(index.files).length, parsed: index.parsed, reused: index.reused, changes: delta } };
    if (name === "changes") return { output: { changes: state.changes, git: await gitSummary(directory, options.signal), observed: state.observed } };
    if (name === "quiz") {
      const quiz = makeQuiz(index, state.attempts, target);
      state.quizzes = [...state.quizzes.slice(-99), quiz];
      const { answer, revision, ...output } = quiz;
      return { output };
    }
    if (name === "submit") {
      const [id, answer, ...extra] = target.split(/\s+/);
      if (!answer || extra.length) throw new Error("Usage: submit <quiz-id> <answer>");
      const quiz = state.quizzes.find((item) => item.id === id);
      const result = grade(index, quiz, answer);
      state.attempts.push(result);
      state.quizzes = state.quizzes.filter((item) => item.id !== id);
      const guidance = {
        0: "Count each line with visible nonwhitespace characters. In text mode, comment lines are included.",
        1: "Find the parameter list in the function declaration. Count declared parameters, including those with defaults.",
        2: "Trace each explicit decision in this function. For example, an if followed by a ternary gives two decision points.",
        3: "Locate the first and last lines of the function. Subtract the first line number from the last, then add one.",
      };
      return { output: { ...result, feedback: result.correct ? "Correct" : `Expected ${quiz.answer}. ${guidance[quiz.level]}`, next: `quiz ${quiz.unit}` } };
    }
    if (["quiz-open", "quiz-respond", "quiz-review"].includes(name)) {
      if (options.host) throw new Error("Use the local CLI for open responses and human review");
      state.openAssessments ??= [];
      if (name === "quiz-open") {
        const unit = unitsOf(index).find((item) => item.id === target && (item.kind === "function" || (item.analysis === "text" && item.end >= 1)));
        if (!unit) throw new Error("Select a function ID or a text-mode source path from the walkthrough or mastery output");
        const question = {
          id: randomUUID(), unit: unit.id, revision: unit.revision, file: unit.file, start: unit.start, end: unit.end,
          prompt: `Explain how ${unit.name} processes its inputs and produces a result. Trace one representative input and one boundary or failure case. Cite the relevant lines.`,
          rubric: ["Input and output contract", "Correct execution trace", "Boundary or failure reasoning", "Source citations"],
        };
        state.openAssessments = [...state.openAssessments.slice(-49), question];
        return { output: question };
      }
      const separator = target.search(/\s/);
      const assessment = state.openAssessments.find(({ id }) => id === target.split(/\s+/, 1)[0]);
      if (assessment && name === "quiz-review" && separator < 0) return { output: assessment, save: false };
      if (!assessment || assessment.review) throw new Error("Assessment is missing or already reviewed");
      if (!unitsOf(index).some((unit) => unit.id === assessment.unit && unit.revision === assessment.revision)) throw new Error("The assessed revision has changed");
      if (name === "quiz-respond") {
        const answer = separator >= 0 && target.slice(separator).trim();
        if (!answer || answer.length > 6000 || assessment.answer) throw new Error("Submit a single response between 1 and 6,000 characters");
        assessment.answer = answer;
        return { output: { id: assessment.id, reviewPending: true } };
      }
      const review = separator >= 0 && /^([0-2])\s+([0-2])\s+([0-2])\s+([0-2])\s+([\s\S]{1,3000})$/.exec(target.slice(separator).trim());
      if (!assessment.answer || !review) throw new Error("Use quiz-review <id> <four scores from 0 to 2> <feedback> after the answer is submitted");
      assessment.review = { scores: review.slice(1, 5).map(Number), feedback: review[5], time: Date.now(), source: "human-entered" };
      return { output: { id: assessment.id, ...assessment.review } };
    }
    if (name === "challenge") {
      const unit = unitsOf(index).find((item) => item.id === target && item.kind === "function");
      if (!unit) throw new Error("Select a function ID from the walkthrough or mastery output");
      const challenge = await makeChallenge(directory, unit);
      state.challenges = [...(state.challenges ?? []).slice(-29), challenge];
      const { cases, revision, ...output } = challenge;
      return { output };
    }
    if (name === "challenge-submit") {
      const separator = target.search(/\s/);
      if (separator < 0) throw new Error("Usage: challenge-submit <challenge-id> <function source>");
      const id = target.slice(0, separator);
      const challenge = state.challenges?.find((item) => item.id === id);
      if (!challenge) throw new Error("Challenge is missing or already submitted");
      if (!unitsOf(index).some((item) => item.id === challenge.unit && item.revision === challenge.revision)) {
        throw new Error("The reference code changed. Generate another challenge.");
      }
      const result = await gradeChallenge(challenge, target.slice(separator).trim());
      state.challenges = state.challenges.filter((item) => item.id !== id);
      state.attempts.push({ unit: challenge.unit, revision: challenge.revision, level: 4, practical: true, correct: result.correct, time: Date.now() });
      return { output: { ...result, challenge: id, feedback: result.correct ? "Matches the reference on the sampled integer domain" : "Review edge cases for negative, zero and positive inputs before trying again." } };
    }
    const metrics = coverage(index, state.attempts);
    const { files, units, ...summary } = metrics;
    const ranked = units.filter((unit) => unit.status !== "mastered").sort((a, b) => b.complexity - a.complexity);
    let output;
    switch (name) {
      case "explain": {
        if (target.startsWith("--model ")) {
          if (!options.host || !options.shareSource) throw new Error("Model explanations require OpenCode with shareReports and shareSource enabled");
          output = await modelExcerpt(directory, index, target.slice(8).trim());
          break;
        }
        const showLines = target.startsWith("--lines ");
        if (showLines && options.host) throw new Error("Line-by-line source stays in the local CLI");
        const selection = pick(units, showLines ? target.slice(8).trim() : target);
        output = [];
        for (const unit of selection) {
          const detail = explanation(index, unit);
          if (showLines) {
            const source = await sourceFingerprint(directory, unit.file);
            if (source?.hash !== index.files[unit.file].hash) throw new Error("Source changed during explanation. Try again.");
            const end = Math.min(unit.end, unit.start + 119);
            detail.lines = source.bytes.toString("utf8").split(/\r\n|[\r\n\u2028\u2029]/).slice(unit.start - 1, end)
              .map((text, offset) => ({ line: unit.start + offset, text, scope: units.filter((nested) => nested.file === unit.file && nested.kind !== "file" && nested.start <= unit.start + offset && nested.end >= unit.start + offset).at(-1)?.name }));
            detail.truncated = end < unit.end;
          }
          output.push(detail);
        }
        break;
      }
      case "walkthrough": output = pick(units, target).map((unit) => ({ ...unit, ...explanation(index, unit) })); break;
      case "coverage": output = summary; break;
      case "mastery": output = target ? pick(units, target) : units; break;
      case "unknown": output = ranked.filter((unit) => unit.status !== "partial"); break;
      case "map": output = { files, dependencies: index.dependencies }; break;
      case "debt": output = { debtIndex: summary.debtIndex, assessmentCoverage: summary.assessmentCoverage, weight: "AST decision complexity" }; break;
      case "risk": output = ranked.slice(0, 30); break;
      case "learn": output = ranked.slice(0, 10).map((unit) => ({ ...unit, next: unit.kind === "function" ? `quiz ${unit.id}` : `walkthrough ${unit.file}` })); break;
      case "retention": output = units.filter((unit) => unit.due).sort((a, b) => a.due - b.due); break;
      case "profile": output = { ...summary, attempts: state.attempts, openReviews: (state.openAssessments ?? []).map(({ id, unit, review }) => ({ id, unit, review: review && { scores: review.scores, time: review.time } })), modelReviews: (state.modelAssessments ?? []).filter(({ review }) => review).map(({ id, file, review }) => ({ id, file, review })) }; break;
      case "review": output = { changes: state.changes, git: await gitSummary(directory, options.signal), diagnostics: files.filter((file) => file.syntaxErrors > 0) }; break;
      case "improve": output = {
        syntax: files.filter((file) => file.syntaxErrors > 0),
        complexity: units.filter((unit) => unit.kind === "function" && unit.complexity >= 10).sort((a, b) => b.complexity - a.complexity)
          .map((unit) => ({ ...unit, recommendation: "Review whether independent branches can be isolated and verify existing behavior with regression tests." })),
      }; break;
      case "gate": {
        const minimum = target ? Number(target) : 0.8;
        if (!Number.isFinite(minimum) || minimum <= 0 || minimum > 1) throw new Error("Coverage threshold must be greater than 0 and at most 1");
        output = { advisory: true, passed: summary.masteryCoverage !== null && summary.masteryCoverage >= minimum, minimum, coverage: summary.masteryCoverage, assessmentCoverage: summary.assessmentCoverage };
        break;
      }
      case "dashboard": output = { ...summary, fileCount: files.length, functionCount: units.filter((unit) => unit.kind === "function").length, attempts: state.attempts.length, changes: state.changes.length }; break;
      case "report": output = renderReport(metrics, target); break;
      default: throw new Error("Unknown IQ operation");
    }
    return { output };
  }, options);
}
