import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

const plugin = new URL("../src/index.js", import.meta.url).href;

test("OpenCode registers, localizes and unloads the plugin", { timeout: 90_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-iq-"));
  const requests = [];
  const provider = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push(requestBody);
    const last = JSON.stringify(requestBody.messages.filter(({ role }) => role === "user").at(-1)?.content ?? "");
    let content = "IQ transport verified";
    if (last.includes("OpenCode IQ question generation.")) content = JSON.stringify({ question: "What does the assignment do?", citations: [2] });
    if (last.includes("OpenCode IQ independent review.")) content = JSON.stringify({ scores: [2, 2, 1], confidence: 0.8, feedback: "Correct assignment trace.", citations: [2] });
    const chunk = { id: "local-fixture", object: "chat.completion.chunk", created: 1, model: "fixture" };
    const result = { ...chunk, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] };
    const stop = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(`data: ${JSON.stringify(result)}\n\ndata: ${JSON.stringify(stop)}\n\ndata: [DONE]\n\n`);
  });
  provider.listen(0, "127.0.0.1");
  try {
    await once(provider, "listening");
    const baseURL = `http://127.0.0.1:${provider.address().port}/v1`;
    await writeFile(join(dir, "fixture.py"), "localOnlyLiteral = 42\nselected_line = 3\n");
    for (const [run, enabled] of [false, true, false].entries()) {
      const commands = await inspectHost(dir, run, enabled, baseURL, t);
      const byName = new Map(commands.map((command) => [command.name, command]));
      assert.ok(byName.has("init"));
      assert.equal(byName.has("iq-help"), enabled);
      assert.equal(byName.has("iq-settings"), enabled);
      assert.equal(byName.has("iq-scan"), enabled);
      assert.equal(byName.has("iq-dashboard"), enabled);
      if (enabled) {
        assert.match(byName.get("iq-help").description, /أوامر/);
        assert.match(byName.get("iq-settings").template, /"locale": "ar"/);
      }
    }
    assert.equal(requests.length, 6);
    const content = requests[0].messages.filter(({ role }) => role === "user").flatMap(({ content }) => (
      typeof content === "string" ? [content] : content.map((item) => item.text ?? "")
    )).join("\n");
    assert.match(content, /"parsed"\s*:\s*1/);
    assert.doesNotMatch(content, /localOnlyLiteral/);
    const excerpt = requests[1].messages.filter(({ role }) => role === "user").at(-1).content;
    assert.match(JSON.stringify(excerpt), /selected_line = 3/);
    assert.doesNotMatch(JSON.stringify(excerpt), /localOnlyLiteral/);
    assert.match(JSON.stringify(requests[2].messages), /question generation/);
    assert.match(JSON.stringify(requests[4].messages), /independent review/);
    assert.doesNotMatch(JSON.stringify(requests[4].messages), /question generation/);
    assert.ok(!(requests[0].tools ?? []).some((tool) => ["bash", "edit", "write"].includes(tool.function?.name)));
  } finally {
    provider.closeAllConnections();
    await new Promise((done) => provider.close(done));
    await rm(dir, { recursive: true, force: true });
  }
});

async function inspectHost(dir, run, enabled, baseURL, t) {
  await writeFile(join(dir, "opencode.json"), JSON.stringify({
    plugin: enabled ? [[plugin, { locale: "ar", shareReports: true, shareSource: true }]] : [],
    enabled_providers: ["iq-fixture"],
    model: "iq-fixture/fixture",
    provider: {
      "iq-fixture": { npm: "@ai-sdk/openai-compatible", name: "Local test transport", options: { baseURL, apiKey: "fixture" }, models: { fixture: { name: "Fixture" } } },
    },
  }));
  const env = { ...process.env, OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true" };
  env.OPENCODE_IQ_DATA_DIR = join(dir, ".iq-data");
  env.npm_config_offline = "true";
  env.npm_config_cache = join(dir, "npm-cache");
  for (const key of ["XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) {
    env[key] = join(dir, `.run-${run}`, key);
  }
  for (const key of ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT", "OPENCODE_SERVER_USERNAME", "OPENCODE_SERVER_PASSWORD"]) {
    delete env[key];
  }
  const binary = process.env.OPENCODE_BIN;
  const start = performance.now();
  const child = spawn(binary ? resolve(binary) : "opencode", ["serve", "--port", "0", "--print-logs", "--log-level", "DEBUG"], { cwd: dir, env, windowsHide: true });
  const closed = new Promise((done) => child.once("close", done));
  let logs = "";
  child.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-12_000); });
  try {
    const url = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`OpenCode startup timed out: ${logs}`)), 20_000);
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout = (stdout + chunk).slice(-4000);
        const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url) { clearTimeout(timer); done(url); }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`OpenCode exited (${code}): ${logs}`)); });
    });
    const response = await fetch(`${url}/command`, { signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, await response.clone().text());
    const commands = await response.json();
    t.diagnostic(`${enabled ? "plugin enabled" : "plugin disabled"}: ${Math.round(performance.now() - start)} ms to command response`);
    if (enabled && commands.some(({ name }) => name === "iq-scan")) {
      const post = (path, body) => fetch(`${url}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      });
      const created = await post("/session", { title: "IQ fixture" });
      assert.equal(created.status, 200, await created.clone().text());
      const session = await created.json();
      const invocation = await post(`/session/${session.id}/command`, { command: "iq-scan", arguments: "", model: "iq-fixture/fixture" });
      assert.equal(invocation.status, 200, await invocation.clone().text());
      assert.match(await invocation.text(), /IQ transport verified/);
      const explanation = await post(`/session/${session.id}/command`, { command: "iq-explain", arguments: "--model fixture.py:2-2", model: "iq-fixture/fixture" });
      assert.equal(explanation.status, 200, await explanation.clone().text());
      assert.match(await explanation.text(), /IQ transport verified/);
      const invoke = async (command, args) => {
        const result = await post(`/session/${session.id}/command`, { command, arguments: args, model: "iq-fixture/fixture" });
        assert.equal(result.status, 200, await result.clone().text());
        await result.text();
      };
      await invoke("iq-assess", "fixture.py:2-2");
      const dataDir = join(dir, ".iq-data");
      const [stateFile] = (await readdir(dataDir)).filter((name) => name.endsWith(".json"));
      const state = () => readFile(join(dataDir, stateFile), "utf8").then(JSON.parse);
      const [{ id }] = (await state()).modelAssessments ?? [];
      await invoke("iq-assess-submit", `${id} Assigns the number 3.`);
      assert.deepEqual((await state()).modelAssessments[0].review.scores, [2, 2, 1]);
    }
    return commands;
  } catch (error) {
    throw new Error(`OpenCode command probe failed: ${error.message}\n${logs}`, { cause: error });
  } finally {
    child.kill();
    await closed;
  }
}
