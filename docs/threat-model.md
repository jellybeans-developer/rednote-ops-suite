# Threat model

## Protected assets

- Draft content and local media paths
- Publication approval decisions
- Public post identifiers and performance metrics
- MCP authentication tokens
- The user's Xiaohongshu account standing

## Main threats and controls

| Threat | Control |
|---|---|
| Prompt causes silent publication | Server exposes no undocumented publisher; approval and handoff are separate tools |
| Approval reused after editing | Approval is bound to SHA-256 of title, body, topics, resolved asset paths, and the SHA-256 of each asset file's bytes |
| Public HTTP endpoint is unauthenticated | Non-loopback binding requires a bearer token; production guidance requires HTTPS/OAuth |
| Credential leakage | Tools never accept Xiaohongshu cookies, passwords, SMS codes, or private signatures |
| Sensitive body copied into audit logs | Audit records only action metadata and errors |
| Concurrent writes corrupt JSON | In-process transactions are serialized and files are atomically replaced |
| Malicious media path | Core reads asset files only to hash bytes for `contentHash`; it never executes, uploads, or renders them. Missing paths fail closed instead of inventing bytes |
| Platform enforcement evasion | Project policy rejects CAPTCHA bypass, private API reverse engineering, and anti-detection code |
| Model calls `approve_draft` | Tool descriptions and `safety_status` state that the confirmation phrase does not authenticate a human; publication still requires a person in an official client |
| Official OAuth tokens leak via MCP | Adapter is off by default; tools are unregistered until enable + credentials; public payloads are stripped of token fields; audit logs store metadata only |
| OAuth treated as publish permission | Tool results set `publishesNotes: false`; config rejects non-`basic_info` scopes and non-official hosts |

## Known limits

- The JSON store is not a tenant boundary and is intended for one local user or trusted team.
- Bearer authentication does not provide per-user identity or revocation. Public services need OAuth and tenant isolation.
- Content checks are intentionally conservative and cannot guarantee legal or platform compliance.
- Anyone with filesystem access to the data directory can read its content unless the host encrypts storage.
- The approval phrase is not a human-identity factor. A model that can call MCP tools can invoke `approve_draft` if it also has the current content hash.
