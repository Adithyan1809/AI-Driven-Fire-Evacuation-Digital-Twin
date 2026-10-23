# Deprecated / Stale Results Archive

The following metrics appeared in preliminary development iterations or unnormalized counter loops and are **permanently deprecated**. They MUST NOT be cited in the final IEEE paper.

| Stale Metric / Value | Context in Old Drafts | Authoritative Reconciled Value | Reason for Invalidation |
|---|---|---|---|
| **2080.4** | Unsafe exposure / traversals | **$5.8$ unsafe occupants** | Unnormalized simulation loop tick accumulator. Superseded by normalized occupant event tracking. |
| **1642.6** | Scenario 2 unsafe count | **$0.0$ unsafe occupants ($31.6$ blocked)** | Legacy counter counted stalled ticks rather than unique agents traversing fire. |
| **2069.4** | Gamma sweep unsafe count | **$6.0$ to $20.4$ unsafe occupants** | Loop counter artifact across 600 ticks without per-occupant normalization. |
| **4.8 s / 4.0 s** | Initial evacuation time | **$14.9\text{ s} \pm 1.4\text{ s}$** | Measured on instant teleportation velocity without reaction delay and realistic walking speeds. |
| **2038.97 ms** | Preliminary Gemini cold latency | **$1563.67\text{ ms}$ (p50: $1212.92\text{ ms}$)** | Generated during earlier non-batched unoptimized API run. |
| **51.7% / 58.4%** | Early Raw Gemini accuracy / F1 | **$72.5\%$ accuracy / $78.1\%$ F1** | Evaluated on earlier unprompted schema without building space catalog context. |
| **60.5% / 41.1%** | Early Unseen F1 score | **$76.8\%$ F1 (unseen partition)** | Measured prior to structured JSON output enforcement and zero-leakage prompt grounding. |
