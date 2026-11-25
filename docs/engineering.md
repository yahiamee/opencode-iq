# Engineering plan

The baseline is the latest stable release found during initial review, [OpenCode v1.19.6](https://github.com/anomalyco/opencode/releases/tag/v1.19.6). The default documentation now describes V2. Integration decisions below use the V1 documentation and source pinned to the stable tag.

## Compatibility matrix

| Requirement | V1 integration | Design or constraint |
| --- | --- | --- |
| Lifecycle | Server export and config hook | Keep activation side-effect free. Test load and removal on restart. [Loader source](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/plugin/index.ts) |
| Session and file changes | `event` callback for session, edit and watcher events | Treat as signals. A watcher event alone supplies no author evidence. [V1 event list](https://opencode.ai/v1/docs/plugins/#events) |
| Tool provenance | `tool.execute.before` and `.after` with session and call IDs | Pair observed actions with snapshots. Keep uncorrelated changes unknown. [Plugin API](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/plugin/src/index.ts) |
| Tools and commands | `tool` definitions, `config.command` prompt templates | Protect project-owned names. Templates are model prompts. Do not use them to run shell commands. [Commands source](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/command/index.ts) |
| Agents and providers | Host agent/model configuration and SDK session operations | Keep model selection in OpenCode. Model-backed engines require explicit handling of source disclosure and validated outputs. [V1 agents](https://opencode.ai/v1/docs/agents/) · [V1 providers](https://opencode.ai/v1/docs/providers/) |
| Git | Project directory and worktree supplied by host | Use read-only Git inspection for state and diffs. Handle non-Git projects separately. [Plugin API](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/plugin/src/index.ts) |
| TUI | Standard slash commands and published TUI entrypoint | Use normal commands for the core. Verify richer UI against the tagged surface before adopting it. [V1 TUI types](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/plugin/src/tui.ts) |
| Desktop and editor decoration | Separate V2 GUI API documented | No V1 desktop extension or inline decoration contract established in this review. Use host command and report surfaces for the V1 baseline. [V2 GUI documentation](https://opencode.ai/docs/build/plugins/gui/) |
| Local storage | No durable plugin store in the reviewed V1 input | Use versioned plugin-owned local storage in a later phase. Keep worktrees and developer profiles scoped. [Plugin API](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/plugin/src/index.ts) |
| Permissions and ownership | Host permissions and tool hooks, external GitHub branch rules | Host permission checks do not establish authorship or repository-wide enforcement. Verify each enforcement surface separately. [V1 permissions](https://opencode.ai/v1/docs/permissions/) |

## Implementation gates

| Phase | Work | Acceptance evidence |
| --- | --- | --- |
| 1 | Versioned host adapter, help, locale and settings | Real host resolves local plugin and registers both commands. Confirm command behavior, existing command precedence and removal. Record startup timing, and run on Windows, Linux and macOS. |
| 2 | AST index, incremental updates, Git change evidence and provenance | Fixtures cover create/edit/delete/rename, concurrent edits, ignored and binary files, and externally modified files. A warm scan reuses unchanged parses. Unknown origins remain unknown. |
| 3 | Grounded explanations and teaching controls | Every source claim resolves to a current file range. Unsupported design intent is marked as inference. Test no provider calls in silent mode and enforce prompt and context limits. |
| 4 | Adaptive questions and independent rubric evaluation | Assess actual project units. Validate model output, keep rubrics separate from question generation, test deterministic grading and record confidence and appeals. |
| 5 | Semantic mastery and coverage | Each eligible line has exactly one status. Prove reclassification on content or dependency changes, with raw and weighted measures shown independently. |
| 6 | Isolated practical exercises and remediation | Demonstrate filesystem, network, process, secret and resource isolation before executing submissions. Retest weaknesses with new evidence. |
| 7 | Debt, knowledge graph/map, developer profile and retention | Validate graph updates, stale evidence, due review and profile export/delete. Report assessment coverage with debt estimates. |
| 8 | Ownership gate and GitHub integration | Test local gate and recorded override. Verify remote check behavior and failure handling using an authorized test repository. |
| 9 | Dashboard, reports, learning plan and improvement advisor | Verify report totals against the same snapshot, test export formats and ensure recommendations never edit code automatically. |
| 10 | Security, performance and compatibility | Test trust boundaries, cancellation, resource limits, recovery, upgrades and supported platforms. Produce comparative host overhead measurements. |
| 11 | Research and benchmark | Publish a reproducible study protocol and benchmark. Measure immediate and retained knowledge, maintenance, cost and time for all three arms. |
| 12 | Production package and release | Verify package installation, upgrade and removal. Review dependency licenses and security workflow. Obtain publication approval. |

## Phase 1 architecture

The adapter registers two static V1 prompt commands from `src/core.js`. The effective configuration has an allowlisted locale and fixed privacy capabilities. No package dependency is needed at runtime. The adapter has no file, shell, network, telemetry or provider access. OpenCode's ordinary command prompt flow is responsible for delivery and can send the fixed text to its configured provider. The plugin owns no secrets and stores no data. A command may appear in host session history under the host's own policies.
