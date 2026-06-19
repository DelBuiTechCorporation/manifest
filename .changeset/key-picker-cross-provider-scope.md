---
'manifest': patch
---

Fix the per-connection key picker greying out a valid connection. When the same model name is routed from two different providers in one tier (e.g. an Azure `gpt-5.5` as primary and an OpenAI-subscription `gpt-5.5` as fallback), the "which connection/key" dropdown wrongly marked one of the OpenAI subscription's keys (e.g. "DBTC") as already used — because used-key detection matched routes by model name only. It now scopes the match to the same `(provider, authType, model)`, so a same-named model from a different provider no longer consumes another provider's connection key.
