import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, lstat, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const endpoint = "npipe:////./pipe/docker_engine";
const imagePattern = /^[a-z0-9][a-z0-9._:/-]{1,200}@sha256:[a-f0-9]{64}$/;
const filenamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

async function loadFile(path, limit) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > limit) throw new Error("Challenge inputs must be small regular files");
  const data = await readFile(path);
  if (data.length > limit) throw new Error("Challenge input exceeded its size limit");
  return data;
}

function docker(config, args, input, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker.exe", ["--host", endpoint, "--config", config, ...args], { signal, windowsHide: true });
    let length = 0;
    const chunks = [];
    let oversized = false;
    child.once("error", reject);
    child.stdin.on("error", () => {});
    child.stderr.resume();
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > 65_536) {
        oversized = true;
        child.kill();
      } else chunks.push(chunk);
    });
    child.once("close", (code) => resolve({ code, oversized, stdout: Buffer.concat(chunks).toString("utf8") }));
    child.stdin.end(input);
  });
}

function bounded(signal, ms) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function runIsolatedChallenge(manifestPath, solutionPath, { signal, execute = docker, capture = false } = {}) {
  const manifest = JSON.parse(await loadFile(manifestPath, 65_536));
  if (!imagePattern.test(manifest?.image ?? "") || !filenamePattern.test(manifest?.filename ?? "") ||
      !Array.isArray(manifest?.cases) || manifest.cases.length < 1 || manifest.cases.length > 12 ||
      !manifest.cases.every((item) => item && Object.hasOwn(item, "input") && (capture || Object.hasOwn(item, "expected")))) {
    throw new Error("Expected a digest-pinned Docker image, a plain submission filename, and 1–12 cases with the required data");
  }
  const solution = await loadFile(solutionPath, 131_072);
  const stage = await mkdtemp(join(tmpdir(), "opencode-iq-isolate-"));
  const config = join(stage, "client");
  const submission = join(stage, "submission");
  const active = new Set();
  try {
    if (submission.includes(",")) throw new Error("The temporary path cannot contain a comma");
    await mkdir(config);
    await mkdir(submission);
    await writeFile(join(submission, manifest.filename), solution, { mode: 0o644, flag: "wx" });
    const engine = await execute(config, ["info", "--format", "{{.OSType}}"], undefined, bounded(signal, 10_000));
    if (engine.code !== 0 || engine.stdout.trim() !== "linux") throw new Error("Start the local Docker Desktop Linux-container engine before running a challenge");
    const image = await execute(config, ["image", "inspect", "--format", "{{json .Config.Volumes}}", manifest.image], undefined, bounded(signal, 10_000));
    if (image.code !== 0) throw new Error("The trusted, digest-pinned challenge image must already be available locally");
    if (!["null", "{}"].includes(image.stdout.trim())) throw new Error("The challenge image must not declare writable volumes");
    const results = [];
    const overall = bounded(signal, 90_000);
    for (const [index, test] of manifest.cases.entries()) {
      overall.throwIfAborted();
      const name = `opencode-iq-${randomUUID()}`;
      active.add(name);
      try {
        const result = await execute(config, [
          "run", "--name", name, "--rm", "--interactive", "--pull=never", "--network=none", "--read-only", "--ipc=none",
          "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=256m", "--memory-swap=256m", "--cpus=1",
          "--user=65532:65532", "--log-driver=none", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777",
          "--tmpfs", "/work:rw,nosuid,nodev,size=96m,mode=1777", "--workdir", "/work",
          "--mount", `type=bind,source=${submission},target=/submission,readonly`, manifest.image,
        ], JSON.stringify(test.input) + "\n", bounded(overall, 12_000));
        if (result.code === 125 && !result.oversized) throw new Error("Docker could not start the container with the required isolation settings");
        let passed = false;
        let output;
        if (result.code === 0 && !result.oversized) {
          try { output = JSON.parse(result.stdout); } catch { /* Invalid output fails the case. */ }
          passed = output !== undefined && isDeepStrictEqual(output, test.expected);
        }
        if (capture) {
          if (output === undefined) throw new Error(`Reference did not return valid JSON for case ${index + 1}`);
          results.push({ input: test.input, expected: output });
        } else {
          results.push({ case: index + 1, passed, status: passed ? "matched" : result.oversized ? "output-limit" : result.code === 0 ? "unexpected-output" : "runtime-error" });
        }
      } catch (error) {
        if (capture || overall.aborted || error.name !== "AbortError") throw error;
        results.push({ case: index + 1, passed: false, status: "timeout" });
      } finally {
        const cleanup = await execute(config, ["rm", "-f", name], undefined, AbortSignal.timeout(5_000)).catch(() => null);
        if (cleanup?.code !== 0) {
          const present = await execute(config, ["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"], undefined, AbortSignal.timeout(5_000)).catch(() => null);
          if (present?.code !== 0 || present.stdout.trim()) throw new Error("Could not confirm that the challenge container stopped");
        }
        active.delete(name);
      }
    }
    if (capture) {
      const result = { image: manifest.image, filename: manifest.filename, cases: results };
      if (Buffer.byteLength(JSON.stringify(result, null, 2)) > 65_000) throw new Error("Reference results exceed the challenge manifest limit");
      return result;
    }
    return { correct: results.every(({ passed }) => passed), passed: results.filter(({ passed }) => passed).length, total: results.length, cases: results };
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Docker Desktop CLI or challenge input is unavailable");
    throw error;
  } finally {
    for (const name of active) await execute(config, ["rm", "-f", name], undefined, AbortSignal.timeout(5_000)).catch(() => {});
    await rm(stage, { recursive: true, force: true });
  }
}
