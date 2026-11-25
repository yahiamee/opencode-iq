import { realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { sourceFingerprint } from "./scan.js";
import { withState } from "./store.js";

function pathsFor(tool, args) {
  if (["write", "edit"].includes(tool) && typeof args?.filePath === "string") return [args.filePath];
  if (tool !== "apply_patch" || typeof args?.patchText !== "string" || args.patchText.length > 2_000_000) return [];
  const paths = args.patchText.split(/\r?\n/).flatMap((line) => {
    const match = /^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/.exec(line);
    return match ? [match[1]] : [];
  });
  return [...new Set(paths)].slice(0, 64);
}

export function provenance(root, client, settings = {}, workingDirectory = root) {
  const pending = new Map();
  const teaching = new Map();
  const keyFor = ({ sessionID, callID }) => JSON.stringify([sessionID, callID]);
  return {
    async event({ event }) {
      if (event.type !== "session.idle") return;
      const session = event.properties.sessionID;
      const count = teaching.get(session);
      teaching.delete(session);
      if (!count) return;
      const message = settings.locale === "ar" ?
        `رُصد ${count} تعديل. راجع الأدلة عبر opencode-iq review.` :
        `Observed ${count} edit(s). Review the evidence with opencode-iq review.`;
      try {
        await client?.tui.showToast({ body: { title: "OpenCode IQ", message, variant: "info" } });
      } catch {
        // Some clients do not render TUI events.
      }
    },
    async "tool.execute.before"(input, { args }) {
      const paths = pathsFor(input.tool, args);
      if (!paths.length) return;
      try {
        const directory = await realpath(root);
        const files = [];
        for (const file of paths) {
          const path = resolve(workingDirectory, file);
          const before = await sourceFingerprint(directory, path);
          files.push({ path, before: before && { name: before.name, hash: before.hash, size: before.bytes.length } });
        }
        if (pending.size >= 128) pending.delete(pending.keys().next().value);
        pending.set(keyFor(input), files);
      } catch {
        // Observations are best effort and must not interrupt OpenCode tools.
      }
    },
    async "tool.execute.after"(input) {
      const key = keyFor(input);
      const files = pending.get(key);
      pending.delete(key);
      if (!files) return;
      try {
        const directory = await realpath(root);
        const observations = [];
        let important = 0;
        for (const { path, before } of files) {
          const after = await sourceFingerprint(directory, path);
          const name = after?.name ?? before?.name;
          if (!name || before?.hash === after?.hash) continue;
          observations.push({
            change: randomUUID(), name, session: input.sessionID, call: input.callID,
            tool: input.tool, time: new Date().toISOString(), before: before?.hash ?? null, after: after?.hash ?? null,
          });
          const size = Math.abs((before?.size ?? 0) - (after?.bytes.length ?? 0));
          if (!before || !after || size >= 300) important++;
        }
        if (!observations.length) return;
        await withState(directory, (state) => {
          state.observed = [...state.observed, ...observations].slice(-1000);
          return {};
        }, { signal: AbortSignal.timeout(500) });
        const count = settings.teaching === "intensive" ? observations.length : settings.teaching === "smart" ? important : 0;
        if (count) {
          if (teaching.size >= 128 && !teaching.has(input.sessionID)) teaching.delete(teaching.keys().next().value);
          teaching.set(input.sessionID, (teaching.get(input.sessionID) ?? 0) + count);
        }
      } catch {
        // Keep uncertain origins unknown if observations cannot be persisted.
      }
    },
  };
}
