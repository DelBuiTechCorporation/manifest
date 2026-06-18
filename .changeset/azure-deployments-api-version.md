---
'manifest': patch
---

Fix Azure deployment discovery api-version. The `GET /openai/deployments` list endpoint only exists on the legacy `2023-03-15-preview` api-version — newer versions (verified against a live resource) return 404, so discovery silently returned no models. Pin discovery to `2023-03-15-preview` and bump the classic Azure OpenAI chat-completions api-version to `2025-04-01-preview`.
