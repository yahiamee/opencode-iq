# OpenCode IQ

**Developed by [YAHIA](https://github.com/yahiamee).**

**Public preview** · MIT license · Verified on Windows with OpenCode V1 1.19.6

[العربية](README.ar.md) · [Quick install](#quick-install) · [Release notes](https://github.com/yahiamee/opencode-iq/releases/tag/v0.5.0)

OpenCode IQ is an independent, local-first plugin for OpenCode V1. It indexes UTF-8 source across languages, tracks change evidence and reports assessed coverage, retention and knowledge debt. JavaScript and TypeScript have AST analysis and bounded behavior challenges. Other languages support file-level text indexing, local walkthroughs and open-ended assessment with a human rubric.

OpenCode IQ is a community project with no affiliation to the OpenCode team.

## Quick install

Add the published package URL to the `plugin` array in your project's `opencode.json`. Preserve any entries you already have.

```json
{
  "plugin": ["https://github.com/yahiamee/opencode-iq/releases/download/v0.5.0/opencode-iq-0.5.0.tgz"]
}
```

Restart OpenCode and run `/iq-help`. OpenCode downloads the package and its dependencies on first use. We verified this path from an empty cache in OpenCode V1 1.19.6 on Windows. To remove the plugin, delete the URL from the array and restart OpenCode.

## Start here

| Want to | Start with |
| --- | --- |
| Confirm installation | `/iq-help` in OpenCode |
| Understand a file | `opencode-iq explain --lines <path>` locally |
| Check your understanding | `opencode-iq quiz <path-or-function-id>` or `opencode-iq quiz-open <path-or-function-id>` |
| Review coverage | `opencode-iq dashboard` or `opencode-iq report html` |
| Report a problem | [GitHub Issues](https://github.com/yahiamee/opencode-iq/issues) |

The `opencode-iq` CLI is available separately from the plugin entry. Run it from a local checkout as `node <plugin-checkout>/src/cli.js`, or install the release package with a Node package manager.

## Enable analysis commands in OpenCode chat

Project reports stay local by default. To use analysis commands in the OpenCode chat, replace the existing URL entry with the following tuple. This allows bounded report metadata to reach your configured model. Raw source sharing remains a separate opt-in.

```json
[
  "https://github.com/yahiamee/opencode-iq/releases/download/v0.5.0/opencode-iq-0.5.0.tgz",
  { "shareReports": true }
]
```

## Install from a local checkout

Run `npm ci` in the plugin checkout. In your project's `opencode.json`, add the plugin to the existing `plugin` array. Replace the example file URL with the absolute URL of `src/index.js` in your checkout. This example selects Arabic and enables local observations of OpenCode tool edits.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["file:///D:/opencodeIQ/src/index.js", { "locale": "ar", "trackToolChanges": true }]]
}
```

Restart OpenCode and enter `/iq-help` or `/iq-settings`. Existing project commands take precedence. To update a local installation, replace the checkout with the desired version, run `npm ci`, and restart. To remove the plugin, delete its entry and restart. Use the local `clear confirm` command to delete its data.

## Local CLI

From the project directory, run the package's `opencode-iq` binary or invoke `node <plugin-checkout>/src/cli.js`. The local CLI handles reports and assessments without a model account.

```text
opencode-iq scan
opencode-iq walkthrough src/example.ts
opencode-iq explain src/example.ts::function:calculate
opencode-iq quiz src/example.ts::function:calculate
opencode-iq submit <quiz-id> 2
opencode-iq quiz-open src/example.ts::function:calculate
opencode-iq quiz-respond <assessment-id> "My reasoning and source citations"
opencode-iq quiz-review <assessment-id>
opencode-iq quiz-review <assessment-id> 2 2 1 2 "Discuss an additional boundary case."
opencode-iq challenge src/example.ts::function:calculate
opencode-iq challenge-submit <challenge-id> "function solve(x) { return x < 0 ? -x : x; }"
opencode-iq dashboard
opencode-iq report html > iq-report.html
opencode-iq gate --strict 0.8
```

Use `changes` and `review` for snapshot and Git observations, `map` for per-file evidence and import links, `risk` and `learn` for prioritized review, `retention` for due dates, and `export` for the local data. The strict gate exits with status 2 when mastery is below the requested threshold. Teams can invoke it from their own local workflow.

A designated reviewer can sign a source snapshot with `opencode-iq gate-sign <ed25519-private-pem> 0.8`. Route its JSON output to a file outside the indexed source. Verify it with `opencode-iq gate-verify <trusted-ed25519-public-pem> <evidence.json> 0.8` from the assessed checkout. The verifier checks the signature, the seven-day age limit, the coverage threshold and the exact indexed source snapshot. In CI, use a trusted copy of the verifier and pin the public key outside pull request-controlled files. Keep the private key with the reviewer.

### GitHub ownership checks

In a clean checkout, set `OPENCODE_IQ_GITHUB_TOKEN` to an installation token from a trusted GitHub App with Checks write permission, then explicitly run `opencode-iq gate-github <owner/repo> <full-commit-sha> <trusted-public-key> <evidence.json> 0.8`. IQ verifies the evidence and checkout before creating the `OpenCode IQ ownership` check for the supplied commit. The request sends the commit SHA and a fixed result message. Keep the token, trusted public key and verifier outside pull request-controlled code. Select the installed App as the expected source when configuring a required check. No GitHub request runs during ordinary scans or verification. [GitHub Checks API](https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10)

### Isolated practical challenges on Windows

`opencode-iq challenge-isolated <manifest.json> <solution>` runs one fresh container per test case using the local Docker Desktop Linux-container engine. Use a trusted image that is already installed and reference it by digest. The image's entrypoint must accept one JSON value on standard input, read the submission under `/submission`, and print one JSON value on standard output. Compile into `/work` if needed. The runner compares output with the expected value on the host. It exits with status 2 if any case fails.

A manifest contains `image`, `filename`, and `cases`. Each case has an `input` and an `expected` JSON value. To generate expected values from a known-good source file, put just `input` values in the cases and run `opencode-iq challenge-build <inputs.json> <reference> > challenge.json`, then use that challenge for grading. The runner mounts only the selected source file, disables networking and bounds CPU, memory, output, processes and time. It requires the local Docker daemon and a digest-pinned image without Dockerfile volumes. Challenge results are separate from mastery evidence.

### Coverage reports

The HTML coverage report includes file and status filters and expandable units with their source ranges. It opens locally in a browser and makes no network requests.

## Model access and privacy

OpenCode slash commands render through the selected model. By default the plugin directs reports to the CLI. Set `shareReports: true` only if you want OpenCode to pass bounded result data, such as symbol names and assessment records, to its selected model. `trackToolChanges` is a separate local setting. With it enabled, `teaching` can be `silent`, `smart` or `intensive`. The latter two batch eligible edit counts into a terminal notice at session idle.

To have the model explain source in any indexed language, set both `shareReports: true` and `shareSource: true` in the plugin options, then explicitly invoke `/iq-explain --model src/main.rs:10-30`. OpenCode receives only the requested excerpt, capped at 100 lines and 12,000 serialized characters, along with file and language metadata. The selected model receives that excerpt through OpenCode; review the selected lines before using this command. With source sharing disabled, use `opencode-iq explain --lines src/main.rs` for a local view.

With the same opt-in, run `/iq-assess src/main.rs:10-30` and then `/iq-assess-submit <id> <answer>`. Generation and grading use separate tool-restricted OpenCode scratch sessions. Set `assessmentModel` to `provider/model` to override OpenCode's default model for those sessions. Automatic OpenCode session sharing must be disabled for these commands. IQ verifies rubric scores and source citation bounds before persisting model feedback. The local `profile` command shows exact saved scores. Advisory model feedback does not grant mastery or pass the ownership gate.

## How coverage is measured

AST line totals count lines with parser tokens once under the narrowest covering unit. Text-mode totals count nonblank lines, including comments. Reports distinguish the two modes. Language labels are inferred from extensions or a script header. Unknown extensions and extensionless UTF-8 files can be indexed unless an exclusion applies. Hidden paths, common generated paths, documentation, standard data formats and binary content are excluded. Text-mode dependency graphs and syntax diagnostics are unavailable.

Structural quizzes supply limited evidence. In AST mode, mastery also requires a successful behavior challenge and two distinct structural question levels. Behavioral grading runs a restricted expression interpreter over sampled integer inputs. Tool observations cover OpenCode `write`, `edit` and `apply_patch` hooks. Unmatched changes have unknown origin.

## Verification

Use Node.js 22 or later. Run `npm test` for the local suite. Run `npm run test:host` with OpenCode 1.19.6 on `PATH`, or set `OPENCODE_BIN` to the binary's absolute path. The host test uses temporary OpenCode state and a loopback transport fixture without a model account.

[Engineering plan and compatibility matrix](docs/engineering.md)

[Phase 1 report and verification results](docs/phase-1.md)

[Current implementation and remaining scope](docs/implementation-status.md)

## License and attribution

OpenCode IQ is licensed under [MIT](LICENSE). Anyone may use, modify, and redistribute it, including commercially, provided that all copies or substantial portions retain the copyright notice for YAHIA and OpenCode IQ contributors and the MIT permission notice.

[Releases](https://github.com/yahiamee/opencode-iq/releases) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)
