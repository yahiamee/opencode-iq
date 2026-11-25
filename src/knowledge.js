import { randomUUID } from "node:crypto";
import { digest } from "./scan.js";

export const statuses = ["mastered", "partial", "insufficient", "unassessed", "reassessment"];
const day = 86_400_000;

export function unitsOf(index) {
  return Object.values(index.files).flatMap((file) => {
    const seen = new Set([file.name]);
    const pending = [...index.dependencies[file.name]];
    while (pending.length) {
      const dep = pending.pop();
      if (seen.has(dep)) continue;
      seen.add(dep);
      pending.push(...index.dependencies[dep]);
    }
    seen.delete(file.name);
    const dependencies = [...seen].sort().map((name) => [name, index.files[name].hash]);
    return file.units.map((unit) => ({
      ...unit, file: file.name, language: file.language, analysis: file.analysis,
      revision: digest(JSON.stringify([unit.hash, file.hash, dependencies])),
    }));
  });
}

function evidenceFor(unit, history, now) {
  const current = history.filter((item) => item.revision === unit.revision);
  const last = current.at(-1);
  if (!last) return { ...unit, status: history.length ? "reassessment" : "unassessed" };
  const due = last.time + (last.correct ? (last.level >= 2 ? 14 : 3) : 1) * day;
  const recent = current.slice(-4);
  const score = recent.filter((item) => item.correct).length / recent.length;
  const practical = recent.some((item) => item.practical && item.correct);
  const structural = new Set(recent.filter((item) => !item.practical && item.correct).map((item) => item.level));
  return {
    ...unit, score, due, assessedAt: last.time, attempts: current.length, practical,
    status: due <= now ? "reassessment" : score === 0 ? "insufficient" : practical && structural.size >= 2 && score >= 0.75 ? "mastered" : "partial",
  };
}

export function coverage(index, attempts, now = Date.now()) {
  const history = Map.groupBy(attempts, (item) => item.unit);
  const units = unitsOf(index).map((unit) => evidenceFor(unit, history.get(unit.id) ?? [], now));
  const byFile = Map.groupBy(units, (unit) => unit.file);
  const emptyCounts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const counts = { ...emptyCounts };
  const files = Object.values(index.files).map((file) => {
    const totals = { ...emptyCounts };
    const available = byFile.get(file.name).sort((a, b) => a.end - a.start - (b.end - b.start) || Number(a.kind === "file") - Number(b.kind === "file"));
    for (const line of file.lines) {
      const unit = available.find(({ start, end }) => start <= line && line <= end);
      totals[unit.status]++;
    }
    for (const status of statuses) counts[status] += totals[status];
    return { file: file.name, language: file.language, analysis: file.analysis, lines: file.lines.length, statuses: totals, syntaxErrors: file.syntaxErrors };
  });
  const totalLines = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const assessed = units.filter(({ status }) => ["mastered", "partial", "insufficient"].includes(status));
  const weight = (items) => items.reduce((sum, unit) => sum + unit.complexity, 0);
  const assessedWeight = weight(assessed);
  const evidenceConfidence = assessed.length ? assessed.reduce((sum, unit) => (
    sum + Math.min(unit.attempts, 4) / 4 * (unit.practical ? 0.8 : 0.4)
  ), 0) / assessed.length : null;
  return {
    totalLines, lines: counts, files, units,
    assessmentCoverage: units.length ? assessed.length / units.length : null,
    masteryCoverage: totalLines ? counts.mastered / totalLines : null,
    weightedMastery: units.length ? weight(assessed.filter((unit) => unit.status === "mastered")) / weight(units) : null,
    debtIndex: assessedWeight ? 100 * assessed.reduce((sum, unit) => sum + unit.complexity * (1 - unit.score), 0) / assessedWeight : null,
    evidenceConfidence,
  };
}

export function makeQuiz(index, attempts, target) {
  const candidates = unitsOf(index).filter((unit) => (unit.kind === "function" || (unit.analysis === "text" && unit.end >= 1)) && (!target || unit.id === target || unit.file === target));
  const history = Map.groupBy(attempts, (item) => item.unit);
  candidates.sort((a, b) => (history.get(a.id)?.length ?? 0) - (history.get(b.id)?.length ?? 0) || b.complexity - a.complexity);
  const unit = candidates[0];
  if (!unit) throw new Error("No indexed function or text-mode source file matches the selection");
  const last = (history.get(unit.id) ?? []).filter((item) => item.revision === unit.revision).at(-1);
  const level = last?.correct ? (last.level === 1 ? 2 : last.level === 2 ? 3 : 2) : 1;
  const variants = {
    1: ["How many parameters are declared by this function?", unit.parameters],
    2: ["How many decision points does this function contain? Count if, loops, catch, case, ternary and short-circuit operators. Exclude nested functions.", unit.complexity - 1],
    3: ["How many source lines span this function, including its first and last lines?", unit.end - unit.start + 1],
  };
  const textMode = unit.analysis === "text";
  const [question, answer] = textMode ? ["How many nonblank lines does this file contain?", index.files[unit.file].lines.length] : variants[level];
  return { id: randomUUID(), unit: unit.id, revision: unit.revision, question, answer, level: textMode ? 0 : level, file: unit.file, start: unit.start, end: unit.end };
}

export function grade(index, quiz, answer, time = Date.now()) {
  if (!quiz) throw new Error("Quiz is missing or already submitted");
  if (!/^\d{1,9}$/.test(answer)) throw new Error("Provide a non-negative integer answer");
  if (!unitsOf(index).some((unit) => unit.id === quiz.unit && unit.revision === quiz.revision)) {
    throw new Error("The assessed code or its dependencies changed. Generate another quiz.");
  }
  return { quiz: quiz.id, unit: quiz.unit, revision: quiz.revision, level: quiz.level, correct: Number(answer) === quiz.answer, time };
}

export function changes(previous, current, observed) {
  const result = [];
  for (const name of [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort()) {
    const before = previous[name];
    const after = current[name];
    if (before?.hash === after?.hash) continue;
    const evidence = observed.findLast((item) => item.name === name && item.before === (before?.hash ?? null) && item.after === (after?.hash ?? null));
    result.push({ name, kind: !before ? "created" : !after ? "deleted" : "modified", origin: evidence ? "opencode-tool-observed" : "unknown", evidence });
  }
  const creations = Map.groupBy(result.filter((item) => item.kind === "created"), ({ name }) => current[name].hash);
  const deletions = Map.groupBy(result.filter((item) => item.kind === "deleted"), ({ name }) => previous[name].hash);
  const removed = new Set();
  for (const [hash, added] of creations) {
    const deleted = deletions.get(hash);
    if (added.length !== 1 || deleted?.length !== 1) continue;
    const [newEntry] = added;
    const [oldEntry] = deleted;
    newEntry.kind = "renamed";
    newEntry.from = oldEntry.name;
    newEntry.match = "identical-content";
    if (!newEntry.evidence || newEntry.evidence.call !== oldEntry.evidence?.call || newEntry.evidence.session !== oldEntry.evidence?.session) {
      newEntry.origin = "unknown";
      delete newEntry.evidence;
    }
    removed.add(oldEntry);
  }
  return result.filter((item) => !removed.has(item));
}
