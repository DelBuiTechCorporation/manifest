---
'manifest': patch
---

Apply the reasoning-model parameter handling consistently to native OpenAI, not just Azure. When `reasoning_effort` reaches an OpenAI-infrastructure reasoning model (gpt-5 / o-series) on either `openai` or Azure, the sampling params those models reject in reasoning mode (`temperature` ≠ 1, `top_p`, `frequency_penalty`, `presence_penalty`) are stripped so the request doesn't 400. Copilot is excluded because it strips `reasoning_effort` and therefore never enters reasoning mode.
