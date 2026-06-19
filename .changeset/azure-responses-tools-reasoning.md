---
'manifest': patch
---

Route Azure OpenAI reasoning deployments to the Responses API when a request combines function tools with `reasoning_effort`. gpt-5.5 and gpt-5.3-codex reject that combination on `/openai/deployments/{model}/chat/completions` (400 "Function tools with reasoning_effort are not supported … Please use /v1/responses instead"), even though each works alone. The proxy now detects that exact shape on the classic Azure OpenAI path and forwards through `/openai/responses` instead, reusing the existing chat-completions↔Responses conversion so callers keep sending and receiving plain Chat Completions. `reasoning_effort` is also mapped to the Responses API's `reasoning.effort` so reasoning isn't silently dropped on conversion. Verified end-to-end (streaming and non-streaming) against a live Azure resource.
