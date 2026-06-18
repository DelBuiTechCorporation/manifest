---
'manifest': patch
---

Fix connecting Azure AI Foundry providers. The endpoint URL is sent in the `region` field, but the provider controller rejected it with "region is only supported for…" because it had no Azure branch. Azure endpoint URLs are now validated on connect, and full API URLs (e.g. `https://{resource}.openai.azure.com/openai/v1`) are normalized down to their bare origin instead of being rejected.
