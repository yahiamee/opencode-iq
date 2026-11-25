# OpenCode IQ 0.5.0

## Included

| Area | Current behavior |
| --- | --- |
| OpenCode | V1 commands and a permission-restricted report viewer, tested against OpenCode 1.19.6 on Windows. The provider transport test stays on loopback. |
| Analysis | Incremental AST parsing for JS and TS, plus language-neutral text indexing for other eligible UTF-8 source, including unknown and extensionless files. AST mode supplies scopes, ranges, complexity, a relative import graph and syntax diagnostics. |
| Changes | Snapshot-based creation, modification, deletion and unique identical-content rename matching. Git line counts and observational evidence from `write`, `edit` and `apply_patch`. Unsupported or ambiguous attribution remains unknown. |
| Teaching | Structural and local line-by-line explanations, plus bounded excerpts for explanation by OpenCode’s configured model when authorized. Optional batched terminal notifications from tool evidence. |
| Assessment | Adaptive structural quizzes, local human rubric review, separate model generation and advisory grading sessions for any indexed language, deterministic numeric challenges and a Docker challenge runner for trusted language-specific images. |
| Knowledge | Versioned evidence, due dates, line and unit coverage, a complexity-weighted debt estimate, learning priority, local ownership gating, Ed25519-signed snapshot attestations and an explicit GitHub check publisher. |
| Reporting | Local JSON, CSV, Markdown and interactive HTML outputs, developer evidence history, and state export and deletion. |
| Research | An executable engineering benchmark and a prospective learning-study protocol. |

The local suite covers syntax indexing, Git exclusions and line counts, unknown external changes, identical-content renames, quiz grading, behavioral challenges, manual rubrics, source and dependency invalidation, and reports. The host probe covers configuration, slash-command registration and removal, real command invocation, and the result delivered over a loopback model transport fixture.

A Windows benchmark on an in-development snapshot indexed 13 files and 1,119 eligible lines. One cold scan took 704 ms and a warm scan took 130 ms. The warm scan reused all 13 parser results. These are single-run development measurements.

## Remaining scope

Windows is the current verification target. The full project brief still requires additional language-native parsers, richer data and execution-flow analysis, evidence-backed attribution beyond observed host tools, automated selection of general challenge inputs, integration testing on a real local Docker daemon, a live GitHub App and protected repository check, and a native interactive GUI. Real-provider assessment quality and human research outcomes still require validation. The package has not been published.
