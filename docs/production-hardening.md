# Production Hardening Gates

The current program still contains two explicit production blockers:

- `RandomnessMode::BlockhashMvp`
- hardcoded admin `Admin11111111111111111111111111111111111111`

Real-value deployment must remain blocked until one of these is implemented:

- VRF-backed judge assignment randomness, or
- commit-reveal randomness with documented reveal timeout behavior.

Admin authority must be replaced by deploy-time configuration or a multisig-compatible authority before production.

