# SECRETS_POLICY.md
# BanyanTree — Secrets and Sensitive Data Policy

## The single rule

BanyanTree never stores, indexes, graphs, or transmits secrets.

A secret is: API keys, passwords, tokens, private keys, credentials,
PII, health data, financial data, or any value that would cause harm
if disclosed.

---

## File exclusions (never indexed)

The file watcher and AST parser skip these unconditionally:

### By filename
- `.env` and all variants (`.env.local`, `.env.production`, etc.)
- `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`
- `*.secret`, `*.secrets`
- `id_rsa`, `id_ed25519`, and all SSH key files
- `credentials.json`, `service-account.json`
- `.netrc`, `.npmrc` (may contain auth tokens)
- `*.keystore`

### By directory
- `.secrets/`
- `secrets/`
- `credentials/`
- `private/`
- `certs/`
- `.ssh/`

### By content pattern (AST parser redacts before storing)
If a parsed file contains values matching these patterns,
the value is replaced with `[REDACTED]` before any storage:

- Strings matching `sk-[a-zA-Z0-9]{48}` (OpenAI API keys)
- Strings matching `Bearer [a-zA-Z0-9._-]{20,}` (auth tokens)
- Strings starting with `ghp_`, `github_pat_` (GitHub tokens)
- Strings matching `AKIA[A-Z0-9]{16}` (AWS access keys)
- `.env` variable assignments (`KEY=value` → `KEY=[REDACTED]`)

---

## Graph storage rules

- Entity content fields never store raw secret values
- Memory content is human-written or AI-summarised — never raw file content
- Reasoning traces store query + summary, never raw code blocks
- Session notes store intent and decisions, never credentials

---

## What BanyanTree does store (and is safe to store)

- File paths and names (never file content verbatim)
- Function names and class names (structural metadata)
- Architectural decisions written by the developer
- Session summaries (AI-generated, human-reviewed)
- Relationship types between entities
- Developer-written memory notes

---

## Cloud transmission rules

When cloud models are enabled (opt-in only):

- Raw source code is never transmitted
- Only semantic summaries are sent: "AuthService uses stateless JWT with 24h expiry"
- API keys are never included in any prompt or summary
- The security log shows every outgoing call (banyan logs --security)

---

## Contributor rule

Any PR that indexes, stores, or transmits secret values —
even accidentally — is rejected immediately and the contributor
must audit their change history before resubmitting.

This rule has no exceptions.
