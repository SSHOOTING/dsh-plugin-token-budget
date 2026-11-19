# dsh-plugin-token-budget

**One command tells you how many tokens this DSH session has burned and whether you are still inside your budget.**

Cost dashboards show billing after the fact; `token-budget` folds the usage counters already present in your session event log into a single scorecard with an `ok` / `warn` / `over` verdict. It is read-only: it reads token numbers only, never prompts, reasoning text, tool bodies, or file contents, and it makes no network calls.

## Install

```powershell
dsh plugin add dsh-plugin-token-budget
```

Requires Node `^22.19.0 || >=24` and DSH `>=0.2.0-rc.2 <0.3.0`.

## 30-second demo

1. Use DSH normally for a few turns.
2. In any session, type `/budget`.
3. You get a compact scorecard:

```text
[budget] 8,000/10,000 tokens (80%) · score 80/100 · WARN
  calls: 2  input: 4,000  output: 2,000  cache-read: 1,000  cache-write: 500  reasoning: 500
Heads-up: budget is at least 80% used. Consider shorter turns or a higher maxTokens.
```

Use `/budget --json` for machine-readable output (CI, scripts, dashboards).

## Configuration

The bundle patch seeds a default budget of 100,000 tokens. Edit the row in your profile's `cordis.patch.yml` to change it:

```yaml
- id: dsh-plugin-token-budget
  name: dsh-plugin-token-budget
  config:
    budget:
      maxTokens: 100000
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `budget.maxTokens` | positive number | `100000` | Token budget for the session. Non-numeric, zero, negative, or non-finite values fall back to the default. Decimal values are floored. |

Invalid config is ignored defensively, so a typo cannot silently erase your budget.

## Scoring

- The plugin reads `assistant/message` events and sums `data.usage` fields: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, and `totalTokens`. If `totalTokens` is missing it is derived from the component counters.
- `percent = totalTokens / maxTokens × 100` (raw, may exceed 100).
- `score = clamp(round(percent), 0, 100)`.
- `verdict`: `ok` below 80%, `warn` at 80% or above, `over` strictly above 100%.

An empty session reports zero tokens, score `0`, and verdict `ok`.

## Privacy & safety

- Only numeric token counters from `assistant/message` events are read.
- No prompt, reasoning, tool result, file, or credential is read or stored.
- No network calls, no telemetry, no file writes.
- Report text passes through a redaction filter before display.

## Compatibility

| Component | Supported |
|---|---|
| DSH | `>=0.2.0-rc.2 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Cordis | `>=4.0.0 <5` |
| Surface | headless and web (command registry only) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/budget` not found | Bundle row not installed | Re-run `dsh plugin add dsh-plugin-token-budget`, then restart DSH. |
| `no model calls observed` | No `assistant/message` usage events in this session yet | Use the session once, then re-run. |
| Budget is not what I configured | Profile `cordis.patch.yml` overrides the bundle row | The last write wins — edit the profile row, not the package. |
| Always shows the default 100,000 | `maxTokens` is invalid (string, zero, negative) | Set a positive number in the config block. |

## Development

```powershell
npm install
npm test
npm pack --dry-run
```

Tests are fully offline: synthetic event fixtures, no model or network calls.

## License

[MIT](LICENSE)

## Related plugins

- [dsh-plugin-safe-route](https://github.com/SSHOOTING/dsh-plugin-safe-route)
- [dsh-plugin-session-archive](https://github.com/SSHOOTING/dsh-plugin-session-archive)
- [dsh-plugin-mcp-guard](https://github.com/SSHOOTING/dsh-plugin-mcp-guard)
- [dsh-plugin-free-model-advisor](https://github.com/SSHOOTING/dsh-plugin-free-model-advisor)
