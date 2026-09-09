# Development status

This repository is a local workflow prototype, not yet a complete Xiaohongshu integration.

- MCP draft operations are implemented and tested locally.
- No Xiaohongshu account connection, live data access, or publishing adapter is implemented.
- The GrokBot platform and marketplace import format have not yet been verified. The grokbot directory contains draft listing materials only.
- The approval phrase and content hash check consistency, but do not authenticate a human reviewer. A model can invoke the approval tool. Do not rely on it as an independent human authorization boundary.
- Asset hashes currently cover path strings, not file bytes.
- HTTP deployment is single-user/single-process. Internet-facing or multi-user production deployment needs further hardening.
- GitHub publication and marketplace submission are pending.

See this status before relying on any broader claims in the initial README or listing drafts.
