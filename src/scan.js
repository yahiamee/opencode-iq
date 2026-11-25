import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const extensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const nonSource = /\.(?:mdx?|rst|txt|adoc|pdf|json|ya?ml|toml|ini|lock|log|csv|tsv|pem|key|pfx|crt)$/i;
const nonSourceName = /^(?:readme|license|licence|copying|notice|changelog|authors)(?:\.|$)/i;
const languages = {
  py: "Python", rs: "Rust", go: "Go", java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", cs: "C#", fs: "F#", fsx: "F#",
  c: "C", h: "C/C++", cc: "C++", cpp: "C++", hpp: "C++", swift: "Swift", m: "Objective-C", rb: "Ruby", php: "PHP", lua: "Lua",
  sh: "Shell", bash: "Shell", ps1: "PowerShell", sql: "SQL", zig: "Zig", dart: "Dart", r: "R", jl: "Julia", ex: "Elixir", exs: "Elixir",
  erl: "Erlang", hs: "Haskell", ml: "OCaml", clj: "Clojure", lisp: "Lisp", elm: "Elm", nim: "Nim", cob: "COBOL", f90: "Fortran",
  html: "HTML", css: "CSS", vue: "Vue", svelte: "Svelte", sol: "Solidity", v: "Verilog", vhd: "VHDL", asm: "Assembly",
};
const excluded = new Set(["node_modules", "vendor", "dist", "build", "coverage"]);
const maxBytes = 1024 * 1024;
const maxFiles = 20_000;
const maxSourceBytes = 128 * maxBytes;
export const digest = (value) => createHash("sha256").update(value).digest("hex");

function eligible(path) {
  const parts = path.split("/");
  return parts.every((part) => part && !part.startsWith(".") && !excluded.has(part.toLowerCase())) &&
    !nonSource.test(path) && !nonSourceName.test(parts.at(-1)) && !/(?:\.d\.[cm]?ts|\.min\.js|\.generated\.[^.]+)$/i.test(path);
}

export async function sourceFingerprint(root, path) {
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (isAbsolute(relativePath)) return;
  const name = relativePath.split(sep).join("/");
  if (!eligible(name)) return;
  try {
    const file = await lstat(absolute);
    if (!file.isFile() || file.size > maxBytes || await realpath(absolute) !== absolute) return;
    const bytes = await readFile(absolute);
    if (bytes.length <= maxBytes && !bytes.includes(0)) {
      try {
        const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!/[\u0001-\u0008\u000b\u000e-\u001f]/.test(source)) return { name, bytes, hash: digest(bytes) };
      } catch {
        // Files that are not valid UTF-8 do not enter the text index.
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }
}

async function candidates(root, signal) {
  try {
    const { stdout } = await exec("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], {
      maxBuffer: 16 * 1024 * 1024, timeout: 10_000, windowsHide: true, signal,
    });
    return [...new Set(stdout.split("\0"))].filter(eligible).sort();
  } catch (error) {
    if (error.code !== "ENOENT" && !String(error.stderr).includes("not a git repository")) throw error;
  }
  const result = [];
  async function walk(prefix) {
    signal?.throwIfAborted();
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || excluded.has(entry.name.toLowerCase())) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      if (entry.isFile() && eligible(path)) result.push(path);
      if (result.length > maxFiles) throw new Error(`Scan exceeds ${maxFiles} eligible files`);
    }
  }
  await walk("");
  return result.sort();
}

function analyze(ts, name, bytes, hash) {
  const source = ts.createSourceFile(name, bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
  const units = [];
  const imports = new Set();
  const line = (position) => source.getLineAndCharacterOfPosition(position).line + 1;
  const lineCount = source.text.length ? line(source.text.length - 1) : 0;
  const eligibleLines = new Set();
  const counts = new Map();
  const emptyFacts = { returns: 0, loops: 0, calls: 0, throws: 0, awaits: 0, branches: 0 };
  const fileFacts = { ...emptyFacts };
  function visit(node, parent) {
    let owner = parent;
    const kind = ts.isClassLike(node) ? "class" : ts.isInterfaceDeclaration(node) ? "interface" :
      ts.isFunctionLike(node) && node.body ? "function" : undefined;
    if (kind) {
      const label = node.name?.getText(source) ?? node.parent?.name?.getText(source) ?? "anonymous";
      const base = `${parent?.id ?? name}::${kind}:${label}`;
      const count = (counts.get(base) ?? 0) + 1;
      counts.set(base, count);
      owner = {
        id: count === 1 ? base : `${base}#${count}`, name: label, kind,
        start: line(node.getStart(source)), end: line(node.end - 1),
        hash: digest(node.getText(source)), complexity: 1,
        parameters: node.parameters?.length,
        facts: { ...emptyFacts },
      };
      units.push(owner);
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }
    const facts = owner?.facts ?? fileFacts;
    if (ts.isReturnStatement(node)) facts.returns++;
    if (ts.isThrowStatement(node)) facts.throws++;
    if (ts.isAwaitExpression(node)) facts.awaits++;
    if (ts.isIterationStatement(node, false)) facts.loops++;
    if (ts.isCallExpression(node)) facts.calls++;
    if (ts.isIfStatement(node) || ts.isIterationStatement(node, false) || ts.isCatchClause(node) ||
        ts.isConditionalExpression(node) || ts.isCaseClause(node) ||
        (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind))) {
      facts.branches++;
      if (owner) owner.complexity++;
    }
    const children = node.getChildren(source);
    if (children.length === 0 && node.kind !== ts.SyntaxKind.EndOfFileToken && node.end > node.getStart(source)) {
      for (let n = line(node.getStart(source)); n <= line(node.end - 1); n++) eligibleLines.add(n);
    }
    for (const child of children) visit(child, owner);
  }
  visit(source);
  units.push({ id: name, name, kind: "file", start: 1, end: lineCount, hash, complexity: 1 + fileFacts.branches, facts: fileFacts });
  const language = /\.[cm]?tsx?$/i.test(name) ? "TypeScript" : "JavaScript";
  return { name, hash, imports: [...imports], units, lines: [...eligibleLines].sort((a, b) => a - b), syntaxErrors: source.parseDiagnostics.length, parser: 3, analysis: "ast", language };
}

function analyzeText({ name, bytes, hash }) {
  const text = bytes.toString("utf8");
  const rows = text.split(/\r\n|[\r\n\u2028\u2029]/);
  if (rows.at(-1) === "") rows.pop();
  const type = extname(name).slice(1).toLowerCase();
  const language = Object.hasOwn(languages, type) ? languages[type] : /^#!/.test(text) ? "Script" : "Unknown";
  const lines = rows.flatMap((row, i) => row.trim() ? [i + 1] : []);
  const units = [{ id: name, name, kind: "file", hash, start: 1, end: rows.length, complexity: 1 }];
  return { name, hash, lines, units, imports: [], syntaxErrors: null, parser: 3, analysis: "text", language };
}

export async function scan(root, before = {}, { signal } = {}) {
  const { default: ts } = await import("typescript");
  root = await realpath(root);
  const paths = await candidates(root, signal);
  if (paths.length > maxFiles) throw new Error(`Scan exceeds ${maxFiles} eligible files`);
  const entries = [];
  let reused = 0;
  let bytes = 0;
  for (const path of paths) {
    signal?.throwIfAborted();
    const current = await sourceFingerprint(root, path);
    if (!current) continue;
    bytes += current.bytes.length;
    if (bytes > maxSourceBytes) throw new Error(`Scan exceeds ${maxSourceBytes / maxBytes} MiB of source`);
    const last = Object.hasOwn(before, path) ? before[path] : undefined;
    const unchanged = last?.hash === current.hash && last.parser === 3;
    if (unchanged) reused++;
    const ast = extensions.has(extname(path).toLowerCase());
    entries.push([path, unchanged ? last : ast ? analyze(ts, path, current.bytes, current.hash) : analyzeText(current)]);
  }
  const files = Object.fromEntries(entries);
  const dependencies = Object.fromEntries(entries.map(([path, file]) => [path, file.imports.flatMap((specifier) => {
    if (!specifier.startsWith(".")) return [];
    const base = relative(root, resolve(root, dirname(path), specifier)).split(sep).join("/");
    const stem = base.replace(/\.[cm]?jsx?$/, "");
    const choices = [base, ...[...extensions].flatMap((extension) => [stem + extension, `${base}/index${extension}`])];
    return [choices.find((candidate) => Object.hasOwn(files, candidate))].filter(Boolean);
  })]));
  return { files, dependencies, reused, parsed: entries.length - reused };
}

export async function gitSummary(root, signal) {
  try {
    const { stdout } = await exec("git", ["-C", root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--numstat", "-z", "HEAD", "--", "."], {
      maxBuffer: 16 * 1024 * 1024, timeout: 10_000, windowsHide: true, signal,
    });
    return stdout.split("\0").filter(Boolean).flatMap((row) => {
      const match = /^(\d+)\t(\d+)\t([\s\S]+)$/.exec(row);
      if (!match || !eligible(match[3])) return [];
      return [{ file: match[3], added: Number(match[1]), removed: Number(match[2]) }];
    });
  } catch (error) {
    if (error.code === "ENOENT" || /not a git repository|bad revision|ambiguous argument|Could not access 'HEAD'/.test(String(error.stderr))) return null;
    throw error;
  }
}
