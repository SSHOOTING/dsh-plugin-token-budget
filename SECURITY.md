# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability**
page on this repository, or by contacting the maintainer directly. Do not open a public issue
for an unpatched vulnerability.

This plugin is read-only: it makes no network calls, writes no files, and does not execute shell
commands. It reads only the `models` config object it is given and prints a redacted report.

## Secrets handling

No credentials are required or stored. Every emitted string passes through a redaction filter
before display. Test fixtures use obviously synthetic values only; no real token or key appears
in the repository.
