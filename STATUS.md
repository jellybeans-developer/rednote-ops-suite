# Development status

This repository is a local workflow prototype, not yet a complete Xiaohongshu integration.

Fixed in the current MCP workflow:

- Draft operations include save, list, get, update, cancel, review, hash-bound approval, publish-package handoff, and local metric recording.
- `contentHash` includes SHA-256 of asset file bytes when the paths exist on disk. Missing, non-file, or unreadable paths fail closed. The server does not substitute path strings or invented bytes.
- `safety_status`, `approve_draft`, and draft tool responses state that the approval phrase does not authenticate a human. A model can still call `approve_draft`. This is an explicit limitation, not a solved authorization boundary.

Still true / remaining:

- No Xiaohongshu account connection, live data access, or publishing adapter is implemented.
- The GrokBot platform and marketplace import format have not yet been verified. Public Grok Bot docs describe creating a Bot and connecting MCP in the product UI; they do not document an official listing-import schema that this repository can claim. The grokbot directory remains draft listing materials only.
- GrokBot listing drafts were refreshed to listing version `0.2.0` so they match the current 13 MCP tools, file-byte hashing, and the approval-phrase limitation. Refreshing copy is not a marketplace-format verification.
- The approval phrase plus content hash only bind a review to exact content. They do not prove a human clicked. Do not add a weaker fake gate and treat it as human authentication.
- HTTP deployment is single-user/single-process. Internet-facing or multi-user production deployment needs further hardening.
- GitHub marketplace submission is pending.

See this status before relying on any broader claims in the initial README or listing drafts.
