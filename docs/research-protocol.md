# Evaluation protocol

Randomly assign participants to one of three arms. The first uses stock OpenCode. The second adds code explanations. The third adds explanations, assessments, actionable feedback and knowledge evidence. Stratify assignment by prior JavaScript or TypeScript experience. Use the same selected provider, model version, token budget and repository starting snapshot in every arm.

Each participant implements an equivalent change, completes an immediate test without AI assistance, and returns for a delayed exercise after seven days. Use alternate question forms and counterbalance task order. Score trace questions, boundary reasoning and an independent maintenance task with a preregistered rubric. Have two raters score de-identified responses. Record disagreements and measure inter-rater agreement before comparing the groups.

Record time on task, tokens and actual incurred cost, immediate and delayed scores, functional correctness on the maintenance task, and a consistent perceived workload instrument. Preregister the primary outcome, sample size, treatment of missing delayed observations, statistical tests and effect-size intervals. Keep source code and identifiers local unless participants and repository owners authorize disclosure.

The workspace benchmark `node benchmarks/scan.js <repository>` records cold scan time, warm scan time, parser reuse and coverage aggregation time. It uses the selected repository files. The benchmark measures runtime and does not measure learning outcomes. This protocol has not yet been run with participants.
