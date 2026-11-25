# Contributing

Use Node.js 22 or later and install pinned dependencies with `npm ci`. Run `npm test` for the local suite and `npm run test:host` with OpenCode 1.19.6 available. Set `OPENCODE_BIN` to an absolute path when the native binary is outside `PATH`.

Describe behavior changes, test platforms and host versions in your pull request. Include a regression test for changes to coverage, persistence, evidence or privacy. Use temporary projects and loopback provider fixtures in tests. Keep source excerpts, credentials and user assessment data out of reports and fixtures.

Validate distribution files with `npm pack --dry-run`. Follow semantic versioning and update the changelog when preparing an artifact. The repository's automated checks build an installable package and do not publish releases.
