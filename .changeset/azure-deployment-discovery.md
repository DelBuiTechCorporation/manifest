---
'manifest': patch
---

Azure AI Foundry model discovery now lists the resource's actual deployments (via the data-plane `GET /openai/deployments` endpoint) instead of the region's full model catalog, so only the models the account has deployed show up. Deployments are priced and scored through their underlying base model (e.g. a `prod-gpt4o` deployment inherits OpenAI `gpt-4o` pricing/capabilities) while still being labelled by their deployment name.
