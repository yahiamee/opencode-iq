import assert from "node:assert/strict";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { provenance } from "../src/provenance.js";
import { run } from "../src/workspace.js";
import { signEvidence, verifyEvidence } from "../src/attestation.js";
import { publishGitHubCheck } from "../src/github-check.js";
import { runIsolatedChallenge } from "../src/isolated-challenge.js";

test("indexes, records changes, grades evidence and renders a report", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "iq-workspace-"));
  process.env.OPENCODE_IQ_DATA_DIR = join(fixture, "data");
  const root = join(fixture, "project");
  await mkdir(root);
  await mkdir(join(root, "node_modules"));
  const a = join(root, "main.ts");
  const b = join(root, "value.ts");
  await writeFile(a, "import { value } from './value';\n// note\nexport function choose(x: boolean) {\n  if (x) return value;\n  return 0;\n}\n");
  await writeFile(b, "export const value = 2;\nexport function absolute(x: number) { return x < 0 ? -x : x; }\n");
  await writeFile(join(root, "node_modules", "ignored.js"), "void 0;");
  await writeFile(join(root, "binary.js"), Buffer.from([0, 255]));
  try {
    assert.deepEqual(await run(root, "scan"), { files: 2, parsed: 2, reused: 0, changes: [] });
    assert.equal((await run(root, "scan")).reused, 2);
    assert.deepEqual((await run(root, "map")).dependencies["main.ts"], ["value.ts"]);
    const units = await run(root, "walkthrough", "main.ts");
    const unit = units.find(({ kind }) => kind === "function");
    assert.equal(unit.start, 3);
    assert.equal(unit.complexity, 2);
    const quiz = await run(root, "quiz", unit.id);
    assert.equal(quiz.level, 1);
    assert.equal(Object.hasOwn(quiz, "answer"), false);
    assert.equal((await run(root, "submit", `${quiz.id} 1`)).correct, true);
    const second = await run(root, "quiz", unit.id);
    assert.equal(second.level, 2);
    assert.equal((await run(root, "submit", `${second.id} 1`)).correct, true);
    const coverage = await run(root, "coverage");
    assert.equal(coverage.totalLines, 7);
    assert.equal(Object.values(coverage.lines).reduce((total, count) => total + count, 0), coverage.totalLines);
    assert.equal(coverage.lines.partial, 4);
    assert.equal(coverage.lines.mastered, 0);

    const absolute = "value.ts::function:absolute";
    const challenge = await run(root, "challenge", absolute);
    assert.equal(Object.hasOwn(challenge, "cases"), false);
    await assert.rejects(run(root, "challenge-submit", `${challenge.id} function unsafe(x) { return process.exit(x); }`), /support numeric inputs/);
    const verified = await run(root, "challenge-submit", `${challenge.id} function answer(n) { return n >= 0 ? n : -n; }`);
    assert.equal(verified.correct, true);
    assert.equal(verified.passed, verified.total);
    assert.equal((await run(root, "mastery", absolute))[0].practical, true);
    const open = await run(root, "quiz-open", absolute);
    assert.equal(open.rubric.length, 4);
    await run(root, "quiz-respond", `${open.id} Negative inputs are negated. Zero remains zero.`);
    assert.match((await run(root, "quiz-review", open.id)).answer, /Negative inputs/);
    const review = await run(root, "quiz-review", `${open.id} 2 2 1 0 Include line numbers in the next review.`);
    assert.deepEqual(review.scores, [2, 2, 1, 0]);
    assert.equal((await run(root, "explain", `--lines ${absolute}`))[0].lines[0].line, 2);
    await assert.rejects(run(root, "explain", `--lines ${absolute}`, { host: true }), /local CLI/);

    for (const [name, args] of [["changes", ""], ["explain", absolute], ["unknown", ""], ["debt", ""], ["risk", ""], ["review", ""], ["improve", ""], ["learn", ""], ["retention", ""], ["dashboard", ""]]) {
      assert.ok(await run(root, name, args), name);
    }

    const pending = await run(root, "quiz", unit.id);
    const watcher = provenance(root);
    const call = { tool: "edit", sessionID: "session", callID: "call" };
    await watcher["tool.execute.before"](call, { args: { filePath: b } });
    await writeFile(b, "export const value = 3;\nexport function absolute(x: number) { return x < 0 ? -x : x; }\n");
    await watcher["tool.execute.after"](call);
    const delta = await run(root, "scan");
    assert.equal(delta.reused, 1);
    assert.equal(delta.changes[0].origin, "opencode-tool-observed");
    assert.equal(delta.changes[0].evidence.call, "call");
    await assert.rejects(run(root, "submit", `${pending.id} 4`), /dependencies changed/);
    assert.equal((await run(root, "mastery", unit.id))[0].status, "reassessment");
    const html = await run(root, "report", "html");
    assert.match(html, /<details><summary>main\.ts<\/summary>/);
    assert.match(html, /id="status"/);
    assert.match(await run(root, "report", "csv"), /"reassessment"/);
    assert.equal((await run(root, "export")).openAssessments[0].review.source, "human-entered");
    assert.equal((await run(root, "gate")).passed, false);
    await assert.rejects(run(root, "clear"), /confirm/);
    assert.deepEqual(await run(root, "clear", "confirm"), { deleted: true });
    assert.equal((await run(root, "profile")).attempts.length, 0);
  } finally {
    delete process.env.OPENCODE_IQ_DATA_DIR;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("uses Git exclusions and line counts and identifies unknown external edits", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "iq-vcs-"));
  process.env.OPENCODE_IQ_DATA_DIR = join(fixture, "data");
  const root = join(fixture, "repo");
  await mkdir(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { windowsHide: true, stdio: "pipe" });
  try {
    git("init", "--quiet");
    await writeFile(join(root, ".gitignore"), "local.ts\n");
    await writeFile(join(root, "local.ts"), "export const privateValue = 0;\n");
    await writeFile(join(root, "index.ts"), "export const answer = 1;\n");
    git("add", ".gitignore", "index.ts");
    git("-c", "user.name=IQ fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture baseline");
    assert.equal((await run(root, "scan")).files, 1);
    await writeFile(join(root, "index.ts"), "export const answer = 2;\nexport const added = true;\n");
    const result = await run(root, "changes");
    assert.deepEqual(result.git, [{ file: "index.ts", added: 2, removed: 1 }]);
    assert.equal(result.changes[0].origin, "unknown");
    await rename(join(root, "index.ts"), join(root, "renamed.ts"));
    const renamed = await run(root, "scan");
    assert.deepEqual(renamed.changes.map(({ name, kind, from }) => [name, kind, from]), [["renamed.ts", "renamed", "index.ts"]]);
  } finally {
    delete process.env.OPENCODE_IQ_DATA_DIR;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("indexes known, unknown and extensionless source and shares only an explicit range", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "iq-languages-"));
  process.env.OPENCODE_IQ_DATA_DIR = join(fixture, "data");
  const root = join(fixture, "project");
  await mkdir(root);
  try {
    await Promise.all([
      writeFile(join(root, "main.py"), "def twice(n):\n    return n * 2\n\nprivate_line = 1\n"),
      writeFile(join(root, "lib.rs"), "fn square(n: i32) -> i32 { n * n }\n"),
      writeFile(join(root, "entry.newlang"), "PROGRAM start\n"),
      writeFile(join(root, "launch"), "#!/bin/sh\nexit 0\n"),
      writeFile(join(root, "README.md"), "# Excluded documentation\n"),
      writeFile(join(root, "invalid.data"), Buffer.from([0xff, 0xfe, 0xfd])),
    ]);
    assert.equal((await run(root, "scan")).files, 4);
    const { files } = await run(root, "map");
    assert.deepEqual(files.map(({ language }) => language), ["Unknown", "Script", "Rust", "Python"]);
    const [result] = await run(root, "explain", "main.py");
    assert.equal(result.analysis, "text");
    assert.equal((await run(root, "quiz-open", "lib.rs")).file, "lib.rs");
    const quiz = await run(root, "quiz", "main.py");
    assert.equal((await run(root, "submit", `${quiz.id} 3`)).correct, true);
    await assert.rejects(run(root, "explain", "--model main.py:2-2", { host: true }), /shareReports and shareSource/);
    const { source } = await run(root, "explain", "--model main.py:2-2", { host: true, shareSource: true });
    assert.deepEqual(source.lines, [{ line: 2, text: "    return n * 2" }]);
    assert.equal(source.language, "Python");
  } finally {
    delete process.env.OPENCODE_IQ_DATA_DIR;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("verifies signed mastery evidence only for the assessed source snapshot", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "iq-attestation-"));
  process.env.OPENCODE_IQ_DATA_DIR = join(fixture, "data");
  const root = join(fixture, "project");
  await mkdir(root);
  const source = join(root, "answer.ts");
  const key = join(fixture, "private.pem");
  const pub = join(fixture, "public.pem");
  const proof = join(fixture, "evidence.json");
  const pair = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  try {
    await writeFile(source, "function twice(x: number) { return x * 2; }\n");
    await writeFile(key, pair.privateKey);
    await writeFile(pub, pair.publicKey);
    await assert.rejects(signEvidence(root, key), /does not meet/);
    const target = "answer.ts::function:twice";
    for (const answer of [1, 0]) {
      const quiz = await run(root, "quiz", target);
      await run(root, "submit", `${quiz.id} ${answer}`);
    }
    const challenge = await run(root, "challenge", target);
    await run(root, "challenge-submit", `${challenge.id} function answer(x) { return x + x; }`);
    const evidence = await signEvidence(root, key);
    await writeFile(proof, JSON.stringify(evidence));
    assert.deepEqual(await verifyEvidence(root, pub, proof), { verified: true, mastery: 1, minimum: 0.8 });
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { windowsHide: true, stdio: "pipe" }).toString().trim();
    git("init", "--quiet");
    git("add", "answer.ts");
    git("-c", "user.name=IQ fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Attested source");
    const sha = git("rev-parse", "HEAD");
    let requests = 0;
    const github = { repository: "example/iq-fixture", sha, publicKey: pub, proof, token: "fixture_token_not_a_credential", request: async (url, options) => {
      requests++;
      assert.equal(url, "https://api.github.com/repos/example/iq-fixture/check-runs");
      assert.equal(options.redirect, "error");
      const { head_sha, conclusion, output } = JSON.parse(options.body);
      assert.equal(head_sha, sha);
      assert.equal(conclusion, "success");
      assert.doesNotMatch(JSON.stringify(output), /twice|answer\.ts|fixture_token/);
      return Response.json({ id: 123, head_sha, conclusion }, { status: 201 });
    } };
    assert.equal((await publishGitHubCheck(root, github)).checkRun, 123);
    const invalid = { ...evidence, signature: (evidence.signature[0] === "A" ? "B" : "A") + evidence.signature.slice(1) };
    await writeFile(proof, JSON.stringify(invalid));
    await assert.rejects(verifyEvidence(root, pub, proof), /signature verification failed/);
    await writeFile(proof, JSON.stringify(evidence));
    await writeFile(source, "function twice(x: number) { return x * 3; }\n");
    await assert.rejects(verifyEvidence(root, pub, proof), /current source snapshot/);
    await assert.rejects(publishGitHubCheck(root, github), /clean checkout/);
    assert.equal(requests, 1);
  } finally {
    delete process.env.OPENCODE_IQ_DATA_DIR;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("isolated challenge grades outputs on the host and enforces Docker configuration", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "iq-docker-protocol-"));
  const manifest = join(fixture, "manifest.json");
  const solution = join(fixture, "input.txt");
  const image = `example/iq-fixture@sha256:${"a".repeat(64)}`;
  try {
    await writeFile(solution, "submission test fixture");
    let runs = 0;
    const execute = async (_config, args, stdin) => {
      if (args[0] === "info") return { code: 0, stdout: "linux\n" };
      if (args[0] === "image") return { code: 0, stdout: "null\n" };
      if (args[0] === "rm") return { code: 0, stdout: "" };
      assert.equal(args[0], "run");
      assert.equal(args.at(-1), image);
      for (const flag of ["--network=none", "--pull=never", "--read-only", "--cap-drop=ALL", "--memory=256m", "--pids-limit=64"]) assert.ok(args.includes(flag));
      assert.ok(args.some((value) => value.endsWith("target=/submission,readonly")));
      assert.equal(args.filter((value) => value.startsWith("type=bind,")).length, 1);
      assert.equal(JSON.parse(stdin), ++runs);
      return { code: 0, stdout: JSON.stringify(runs * 2) };
    };
    await writeFile(manifest, JSON.stringify({ image, filename: "answer.rs", cases: [{ input: 1, expected: 2 }, { input: 2, expected: 5 }] }));
    assert.deepEqual(await runIsolatedChallenge(manifest, solution, { execute }), {
      correct: false, passed: 1, total: 2, cases: [{ case: 1, passed: true, status: "matched" }, { case: 2, passed: false, status: "unexpected-output" }],
    });
    runs = 0;
    await writeFile(manifest, JSON.stringify({ image, filename: "answer.rs", cases: [{ input: 1 }, { input: 2 }] }));
    assert.deepEqual(await runIsolatedChallenge(manifest, solution, { execute, capture: true }), {
      image, filename: "answer.rs", cases: [{ input: 1, expected: 2 }, { input: 2, expected: 4 }],
    });
    await writeFile(manifest, JSON.stringify({ image, filename: "../escape", cases: [{ input: 1, expected: 2 }] }));
    await assert.rejects(runIsolatedChallenge(manifest, solution, { execute }), /plain submission filename/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
