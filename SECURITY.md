# Security and data handling

The plugin and CLI run with the privileges of their parent process. Keep `shareReports` disabled for private code or assessment data. Local scans do not call a model. With report sharing enabled, the host may include bounded structural metadata and user-facing results in a provider prompt. Raw source sharing additionally requires `shareSource: true` and an explicit `/iq-explain --model` invocation. Source can contain secrets even in an ordinary file, so review the line range before sending it. Treat imported names, source instructions and model rendering as untrusted.

The scanner restricts reads to eligible source files beneath the project, excludes hidden paths and common dependency or generated directories, and skips filesystem links, binary files and oversized files. Git is invoked with an argument array. Diff inspection disables external diff and text conversion. A concurrently hostile filesystem is outside the scanner's trust boundary.

The practical evaluator parses a restricted expression language and does not run submitted JavaScript. It limits submitted size and expression depth. Results cover sampled inputs. The current evaluator does not cover general feature changes or arbitrary test suites.

The separate Docker runner executes submitted code. Use a trusted, patched Docker Desktop installation and a trusted local image pinned to its digest. IQ sends one test input at a time and keeps expected outputs outside the container. The Docker engine and container isolation are part of the security boundary. The GitHub publisher requires an explicit command and an installation token. It sends a fixed result and Git commit SHA only after verifying the signed snapshot in a trusted clean checkout.

IQ state is stored in `~/.opencode-iq` or the path in `OPENCODE_IQ_DATA_DIR`. It includes source fingerprints, structural metadata, change observations and assessment evidence. The parent account can read or edit its own data. Treat the local gate as developer evidence in a trusted workspace. Team enforcement requires an independently trusted source of evidence. Use `opencode-iq export` or `opencode-iq clear confirm` for local data management.

Model-generated assessments are opt-in. The configured OpenCode provider receives the bounded excerpt and, for grading, the submitted answer. IQ checks the response structure and source line bounds. Feedback remains a model judgment. IQ attempts to delete scratch sessions after use; the provider and OpenCode may retain information according to their own policies.

State updates use an exclusive lock and write a replacement file. If the process is killed and the lock persists, verify that no other IQ process is using that project before removing its corresponding `.lock` file. Git and the TypeScript parser execute as trusted dependencies. The package pins its Apache-2.0 TypeScript dependency.
