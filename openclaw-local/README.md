Secure single-operator OpenClaw deployment.

Security decisions:
- Active runtime: portable `Node 24` under `openclaw-local/runtime`.
- Active state root: `%LOCALAPPDATA%\\OpenClawSecure`.
- Host exposure is restricted to `127.0.0.1:18789`.
- Gateway auth is mandatory and loaded from `%LOCALAPPDATA%\\OpenClawSecure\\.env` via `OPENCLAW_GATEWAY_TOKEN`.
- Agent sandboxing stays off on purpose because Docker sandbox support was not available on this host and enabling `docker.sock` later would increase host risk.
- Tool execution is deliberately hardened in config: messaging profile, runtime/fs/ui/nodes automation denied, filesystem scoped to the workspace, elevated exec disabled.
- `compose.yaml` is retained as a reference artifact only. It is not the active runtime path on this host.

Operational helpers:
- `start-gateway.ps1` starts the loopback-only gateway in the background.
- `status-gateway.ps1` checks authenticated RPC health.
- `stop-gateway.ps1` stops the background gateway started by this deployment.
