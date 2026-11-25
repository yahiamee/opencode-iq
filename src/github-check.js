import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyEvidence } from "./attestation.js";

const exec = promisify(execFile);

async function cleanCommit(root, signal) {
  const git = (...args) => exec("git", ["--no-optional-locks", "-C", root, "-c", "core.fsmonitor=false", ...args], {
    signal, windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
  });
  const { stdout: status } = await git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (status.length) throw new Error("GitHub check requires a clean checkout of the target commit");
  const { stdout } = await git("rev-parse", "--verify", "HEAD^{commit}");
  return stdout.trim();
}

export async function publishGitHubCheck(root, { repository, sha, publicKey, proof, minimum, token, signal, request = fetch }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || /\/(?:\.|\.\.)$/.test(repository)) throw new Error("Provide a GitHub repository as owner/name");
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Provide the full lowercase GitHub commit SHA");
  if (typeof token !== "string" || !/^[A-Za-z0-9_.-]{20,512}$/.test(token)) throw new Error("Set OPENCODE_IQ_GITHUB_TOKEN to a GitHub App installation token with Checks write permission");
  if (await cleanCommit(root, signal) !== sha) throw new Error("The checkout does not match the GitHub commit SHA");
  const evidence = await verifyEvidence(root, publicKey, proof, minimum, { signal });
  if (await cleanCommit(root, signal) !== sha) throw new Error("The checkout changed while evidence was verified");
  const timeout = AbortSignal.timeout(15_000);
  const response = await request(`https://api.github.com/repos/${repository}/check-runs`, {
    method: "POST", redirect: "error", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" },
    body: JSON.stringify({
      name: "OpenCode IQ ownership", head_sha: sha, status: "completed", conclusion: "success",
      output: { title: "Signed mastery evidence verified", summary: "The configured signer and mastery threshold were verified against this source snapshot." },
    }),
  });
  if (response.status !== 201) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`GitHub did not create the ownership check (HTTP ${response.status})`);
  }
  const result = await response.json();
  if (!Number.isSafeInteger(result.id) || result.head_sha !== sha || result.conclusion !== "success") {
    throw new Error("GitHub returned an unexpected check run; inspect the commit before retrying");
  }
  return { checkRun: result.id, repository, sha, verified: true, mastery: evidence.mastery };
}
