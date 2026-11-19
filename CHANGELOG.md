# Changelog

## 0.1.0 (2026-11-19)

- Initial release.
- `/budget` command: folds token counters from `assistant/message` events into a per-session scorecard with `ok` / `warn` / `over` verdict and a 0–100 score.
- Configurable `budget.maxTokens` via the bundle patch row; default 100,000. Invalid config falls back to the default.
- Reads only token numbers; no prompts, tool bodies, credentials, network calls, or file writes.
- Registers the command through `ctx.effect()` so disable/reload disposes it cleanly.
- `--json` output for automation.
- Fully offline test suite with synthetic event fixtures.
