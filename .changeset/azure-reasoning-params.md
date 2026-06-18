---
'manifest': patch
---

Make Azure reasoning models (gpt-5 / o-series deployments) work through the proxy. Requests to Azure now rewrite `max_tokens` → `max_completion_tokens` (Azure rejects `max_tokens` on these models) and preserve `reasoning_effort`. When reasoning is engaged, the sampling params Azure rejects in reasoning mode (`temperature` ≠ 1, `top_p`, `frequency_penalty`, `presence_penalty`) are stripped so the request doesn't 400. Verified against a live Azure resource.
