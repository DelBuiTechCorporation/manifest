---
'manifest': patch
---

Route responses-only Azure OpenAI deployments (Codex, `-pro`, o1-pro, deep-research) to `/openai/responses` unconditionally. These models reject `/chat/completions` outright on Azure ("The requested operation is unsupported"), not just when function tools and `reasoning_effort` are combined — so a plain Codex request was still failing. The classic Azure path now mirrors the native OpenAI behaviour (`OPENAI_RESPONSES_ONLY_RE`): the whole responses-only family reroutes for every request, while other gpt-5/o-series deployments keep rerouting only on the tools + `reasoning_effort` combination. Verified end-to-end against a live Azure resource (a plain `gpt-5.3-codex` request now returns 200 via `/responses`).
