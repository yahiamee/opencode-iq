import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.js";

const { server } = plugin;

test("registers both commands and reports safe defaults", async () => {
  const config = {};
  await (await server()).config(config);
  for (const name of ["iq-help", "iq-settings", "iq-scan", "iq-quiz", "iq-report"]) assert.ok(config.command[name]);
  assert.match(config.command["iq-settings"].template, /"locale": "en"/);
  assert.match(config.command["iq-settings"].template, /"sourceAccess": false/);
  assert.match(config.command["iq-settings"].template, /"telemetry": false/);
});

test("host analysis keeps project details local by default", async () => {
  const config = {};
  const hooks = await server({ directory: "not-a-real-directory" });
  await hooks.config(config);
  const output = { parts: [{ type: "text", text: "private" }] };
  await hooks["command.execute.before"]({ command: "iq-scan", arguments: "private" }, output);
  assert.match(output.parts[0].text, /opencode-iq scan/);
  assert.doesNotMatch(output.parts[0].text, /private/);
});

test("localizes supported commands and preserves pre-existing commands", async () => {
  const original = { template: "Existing project help" };
  const config = { command: { "iq-help": original } };
  const hooks = await server(undefined, { locale: "ar" });
  await hooks.config(config);
  await hooks.config(config);
  assert.equal(config.command["iq-help"], original);
  assert.match(config.command["iq-settings"].description, /إعدادات/);
  assert.match(config.command["iq-settings"].template, /"locale": "ar"/);
});

test("unsupported locale falls back to English", async () => {
  const config = {};
  await (await server(undefined, { locale: "fr" })).config(config);
  assert.match(config.command["iq-help"].template, /commands/);
  assert.match(config.command["iq-settings"].template, /"locale": "en"/);
});
