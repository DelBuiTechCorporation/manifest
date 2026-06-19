---
'manifest': patch
---

Actually fix `max_tokens` → `max_completion_tokens` for OpenAI models on Azure. Azure forwards through a `customEndpoint` override, which `resolveEndpoint` reported as `endpointKey: 'custom'` — so the Azure body sanitization never ran and gpt-5/o-series deployments kept getting `unsupported_parameter` 400s. Override endpoints now carry a `sanitizeKey` with their real template identity, so the proxy sanitizes against the right provider. The rewrite also now fires for any Azure deployment (deployment names are user-defined, and every Azure deployment accepts `max_completion_tokens`), so an OpenAI model deployed under a non-standard name still works. Verified end-to-end against a live Azure resource.
