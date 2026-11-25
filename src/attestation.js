import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { open } from "node:fs/promises";
import { coverage } from "./knowledge.js";
import { digest, scan } from "./scan.js";
import { withState } from "./store.js";

const purpose = "opencode-iq:ownership-evidence:v1";
const maxAge = 7 * 86_400_000;

function snapshot(index) {
  return digest(JSON.stringify(Object.entries(index.files).map(([name, file]) => [name, file.hash])));
}

function threshold(value) {
  const result = Number(value ?? 0.8);
  if (!Number.isFinite(result) || result <= 0 || result > 1) throw new Error("Threshold must be greater than 0 and at most 1");
  return result;
}

async function readBounded(path, size) {
  const file = await open(path);
  try {
    const meta = await file.stat();
    if (!meta.isFile() || meta.size > size) throw new Error("Expected a small regular file");
    const buffer = Buffer.alloc(size + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (!bytesRead || bytesRead > size) throw new Error("Invalid key or attestation size");
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function signEvidence(root, privateKeyPath, minimum, options = {}) {
  const required = threshold(minimum);
  const key = createPrivateKey(await readBounded(privateKeyPath, 8_192));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("An Ed25519 private key is required");
  const evidence = await withState(root, async (state, directory) => {
    const index = await scan(directory, state.index?.files, options);
    const metrics = coverage(index, state.attempts);
    if (metrics.masteryCoverage === null || metrics.masteryCoverage < required) throw new Error("Current source does not meet the mastery threshold");
    return { output: {
      purpose, snapshot: snapshot(index), mastery: metrics.masteryCoverage, assessment: metrics.assessmentCoverage,
      eligibleLines: metrics.totalLines, issuedAt: Date.now(),
    }, save: false };
  }, options);
  const payload = Buffer.from(JSON.stringify(evidence));
  return { payload: payload.toString("base64url"), signature: sign(null, payload, key).toString("base64url") };
}

export async function verifyEvidence(root, publicKeyPath, evidencePath, minimum, options = {}) {
  const required = threshold(minimum);
  const key = createPublicKey(await readBounded(publicKeyPath, 8_192));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("An Ed25519 public key is required");
  const envelope = JSON.parse(await readBounded(evidencePath, 8_192));
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(envelope?.payload ?? "") || !/^[A-Za-z0-9_-]{86}$/.test(envelope?.signature ?? "")) throw new Error("Malformed evidence envelope");
  const payload = Buffer.from(envelope.payload, "base64url");
  if (!verify(null, payload, key, Buffer.from(envelope.signature, "base64url"))) throw new Error("Evidence signature verification failed");
  const evidence = JSON.parse(payload);
  const now = Date.now();
  if (evidence?.purpose !== purpose || !/^[a-f0-9]{64}$/.test(evidence.snapshot) ||
      !Number.isSafeInteger(evidence.issuedAt) || evidence.issuedAt > now + 60_000 || now - evidence.issuedAt > maxAge ||
      !Number.isFinite(evidence.mastery) || evidence.mastery < required || evidence.mastery > 1) throw new Error("Evidence is expired, invalid or below the required mastery threshold");
  const index = await scan(root, {}, options);
  if (evidence.snapshot !== snapshot(index) || evidence.eligibleLines !== Object.values(index.files).reduce((sum, file) => sum + file.lines.length, 0)) {
    throw new Error("Evidence does not match the current source snapshot");
  }
  return { verified: true, mastery: evidence.mastery, minimum: required };
}
