import { homedir } from "node:os";
import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { digest } from "./scan.js";

const initial = () => ({ version: 1, attempts: [], quizzes: [], observed: [], changes: [] });

export async function withState(root, operation, { signal } = {}) {
  root = await realpath(root);
  const home = resolve(process.env.OPENCODE_IQ_DATA_DIR || join(homedir(), ".opencode-iq"));
  await mkdir(home, { recursive: true, mode: 0o700 });
  const key = digest(process.platform === "win32" ? root.toLowerCase() : root);
  const path = join(home, `${key}.json`);
  const lockPath = join(home, `${key}.lock`);
  let lock;
  const deadline = Date.now() + 15_000;
  while (!lock) {
    signal?.throwIfAborted();
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("The OpenCode IQ state lock is busy. Retry when the other operation ends.");
      await setTimeout(75, undefined, { signal });
    }
  }
  const stage = join(home, `${key}.${randomUUID()}.tmp`);
  try {
    let state;
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = initial();
    }
    if (state.version !== 1) throw new Error("Unsupported OpenCode IQ data schema");
    const { output, save = true, remove = false } = await operation(state, root);
    if (remove) await rm(path, { force: true });
    else if (save) {
      const file = await open(stage, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(state));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(stage, path);
    }
    return output;
  } finally {
    try {
      await rm(stage, { force: true });
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
