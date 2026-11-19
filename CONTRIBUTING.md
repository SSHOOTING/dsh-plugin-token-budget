# Contributing

Thanks for helping improve these read-only DSH plugins.

## Reporting issues

Open an issue in this repository with:
- DSH version and Node version;
- the command you ran (`/route-check`, `/session-export`, `/budget`, `/mcp-guard`, `/free-models`);
- a minimal synthetic event or config example that reproduces the problem.

Never paste real credentials, tokens, or private session content into an issue.

## Pull requests

- Keep the plugin read-only: no network calls, no file writes, no config mutation.
- Add or update offline tests; do not depend on live model calls.
- Run `npm test` and `npm pack --dry-run` before opening a PR.
- Update `README.md` and `README.zh.md` together when behavior changes.

## Security

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.