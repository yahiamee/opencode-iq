# Changelog

## 0.5.0

- Publish GitHub ownership checks only after verifying signed evidence against a clean checkout at the requested commit.
- Add a Windows Docker Desktop runner for host-graded JSON input/output challenges using digest-pinned images and isolated per-case containers.
- Capture expected challenge outputs from a known-good reference and add search, status filters and expandable units to the local HTML report.

## 0.4.0

- Added optional model-generated questions and independent advisory rubric grading for any indexed language.
- Validate model response shape and source citations before saving evidence.
- Keep generated questions and model reviews tied to the assessed source revision.
- Added Ed25519-signed mastery attestations and local verification against the exact indexed source snapshot.

## 0.3.0

- Added text indexing across source languages and opt-in explanations for bounded source excerpts.

## 0.2.0

- Added JavaScript and TypeScript AST analysis, local assessments, Git observations, coverage and reports.

## 0.1.0

- Added the standalone OpenCode V1 plugin and verified command registration on Windows.
