#!/usr/bin/env node
import { commandsFor, settings } from "./core.js";
import { run } from "./workspace.js";
import { signEvidence, verifyEvidence } from "./attestation.js";
import { publishGitHubCheck } from "./github-check.js";
import { runIsolatedChallenge } from "./isolated-challenge.js";

const [command = "help", ...args] = process.argv.slice(2);
const options = { locale: process.env.OPENCODE_IQ_LOCALE };
const cancel = new AbortController();
process.once("SIGINT", () => cancel.abort());
try {
  let output;
  if (command === "help") {
    output = Object.entries(commandsFor(options)).map(([name, { description }]) => `${name.slice(3)}  ${description}`).join("\n");
    output += "\nexport  Export this project's local IQ state\nclear  Delete local project data with clear confirm";
    output += "\ngate-sign <private-key> [minimum]  Sign current mastery evidence\ngate-verify <public-key> <evidence> [minimum]  Verify a signature and source snapshot";
    output += "\ngate-github <owner/repo> <commit> <public-key> <evidence> [minimum]  Publish a verified GitHub check";
    output += "\nchallenge-isolated <manifest.json> <solution>  Run a submission in Docker Desktop";
    output += "\nchallenge-build <inputs.json> <reference>  Capture expected outputs from the reference in Docker Desktop";
  } else if (command === "settings") {
    output = { ...settings(options), sourceAccess: true, storage: "local-json" };
  } else if (command === "gate-sign") {
    if (args.length < 1 || args.length > 2) throw new Error("Usage: gate-sign <private-key> [minimum]");
    output = await signEvidence(process.cwd(), args[0], args[1], { signal: cancel.signal });
  } else if (command === "gate-verify") {
    if (args.length < 2 || args.length > 3) throw new Error("Usage: gate-verify <public-key> <evidence> [minimum]");
    output = await verifyEvidence(process.cwd(), args[0], args[1], args[2], { signal: cancel.signal });
  } else if (command === "gate-github") {
    if (args.length < 4 || args.length > 5) throw new Error("Usage: gate-github <owner/repo> <commit> <public-key> <evidence> [minimum]");
    const [repository, sha, publicKey, proof, minimum] = args;
    output = await publishGitHubCheck(process.cwd(), { repository, sha, publicKey, proof, minimum, token: process.env.OPENCODE_IQ_GITHUB_TOKEN, signal: cancel.signal });
  } else if (command === "challenge-isolated" || command === "challenge-build") {
    if (args.length !== 2) throw new Error(`Usage: ${command} <manifest.json> <source>`);
    const capture = command === "challenge-build";
    output = await runIsolatedChallenge(args[0], args[1], { signal: cancel.signal, capture });
    if (!capture && !output.correct) process.exitCode = 2;
  } else {
    const operation = command.replace(/^iq-/, "");
    const strict = operation === "gate" && args[0] === "--strict";
    output = await run(process.cwd(), operation, (strict ? args.slice(1) : args).join(" "), { signal: cancel.signal });
    if (strict && !output.passed) process.exitCode = 2;
  }
  console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));
} catch (error) {
  console.error(`OpenCode IQ: ${error.message}`);
  process.exitCode = cancel.signal.aborted ? 130 : 1;
}
