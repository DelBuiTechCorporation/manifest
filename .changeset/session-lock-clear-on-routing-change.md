---
'manifest': patch
---

Routing config changes now take effect immediately instead of being delayed for active sessions. The per-session model lock (which pins a session to one model for prompt-cache preservation) is now cleared whenever an agent's routing config changes — so swapping a tier's model in the dashboard is reflected on the very next request, rather than staying on the previously-locked model for up to the 30-minute lock TTL.
