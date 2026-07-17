---
name: mcp-token-expired
description: "What to do when a native claude.ai MCP connector (Slack, Calendar, Notion, Google Drive, Gmail — mcp__claude_ai_* or an equivalent connector) returns an authentication error (invalid_auth_token, not_authed, token_expired, auth_failed…): visual alert, guided reconnection, fallback without blocking. Load it AS SOON AS such an error appears."
version: 1.0.0
---

# Expired MCP token — visual alert + reconnection

As soon as a tool of a native claude.ai connector (Slack, Gmail, Calendar, Notion, Google Drive)
returns an **authentication error** (`invalid_auth_token`, `not_authed`, `token_expired`,
`auth_failed`…), run the procedure below.

## ⚠️ Exception: a connector that is unavailable by design

Some connectors may be **unavailable by design** — not because of an expired token, but because an
**org policy or a provider restriction** blocks them for this account. This is **not a token to
refresh**: do NOT show the alert below and do NOT run the reconnection. Treat the connector as an
**unavailable source by default**: use the fallback, briefly note "<connector> unavailable
(org/provider restriction)", and continue without blocking.

## Procedure (real authentication error)

1. **Immediately show this alert block** (as-is, emojis included):

   ```
   🚨🚨🚨 MCP TOKEN EXPIRED 🚨🚨🚨
   ⚠️  Connector: <name> (mcp__claude_ai_<...>)
   ⚠️  Error: <error code>
   🔌 Impact: <what becomes unavailable> → fallback used.

   👉 TO RECONNECT: type  /mcp  → select <connector> → Re-authenticate
      (browser OAuth flow, ~20 s, and everything works again)

   🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
   ```

2. **Push `/mcp` in the terminal as the first attempt.** If the token is simply expired and
   `/mcp` offers a re-authentication, this is the fastest path.

3. **If `/mcp` shows `connected` but the call still fails with `invalid_auth_token`**
   → the downstream token is stale **despite** the "connected" status; a `/mcp` will not
   regenerate it (it believes it is already connected). **Real fix: `Disconnect` then `Reconnect`
   the connector on claude.ai** (`open "https://claude.ai/settings/connectors"`). On reconnect,
   **explicitly authorize the right account / workspace** (the SSO or identity this connector
   expects) — otherwise the connector stays "connected" but on an invalid token.

4. **Continue with the fallback** without blocking (e.g. an alternative MCP connector, or a
   channel/timestamp search for Slack — see the Sourcing rule in CLAUDE.md). Do not stop and
   wait for the reconnection.

## Pitfalls ruled out in practice

- A `connected` state in `/mcp` or on the connectors page **does not imply** a valid downstream token.
- Rule out an **account mismatch** (CLI and browser on the same identity) before concluding the
  token is expired.
- Claude **cannot** trigger the OAuth handshake itself (interactive command, URL not exposed,
  security restriction by design) — pushing the user toward `/mcp` then Disconnect/Reconnect is
  the most it can do.
