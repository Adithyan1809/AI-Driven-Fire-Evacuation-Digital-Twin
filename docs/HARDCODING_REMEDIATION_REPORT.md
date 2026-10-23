# Hardcoding Remediation Report

## Remaining Hardcoded References

| File | Line | Value | Classification |
|---|---|---|---|
| `scripts/run_all_experiments_verified.mjs` | Multiple | `ROOM_101` / `JUNC_101` | INTENTIONAL (Test definitions) |
| `scripts/test_deterministic_evacuation.mjs` | Multiple | `ROOM_101` / `JUNC_101` | INTENTIONAL (Test scripts) |
| `scripts/test_fire_propagation.mjs` | 30, 52, 53 | `ROOM_101` | INTENTIONAL (Test scripts) |
| `scripts/test_gamma_sensitivity.mjs` | 62, 63, 86, 87 | `ROOM_101` / `JUNC_101` | INTENTIONAL (Test scripts) |
| `scripts/test_model_quotas.mjs` | 22 | `ROOM_101` | INTENTIONAL (Test scripts) |
| `scripts/verify_gap_c.mjs` | Multiple | `ROOM_101` | INTENTIONAL (Test definitions) |
| `ui/configModal.js` | Multiple | `ROOM_101` / `TEST_` keys | INTENTIONAL (UI examples) |
| `ui/dtStatePanel.js` | 28, 253 | `ROOM_101` | RESIDUAL_BUG (Default selection) |
| `ui/eventLog.js` | 125 | `ROOM_101` | RESIDUAL_BUG (UI conditional logic) |
| `ui/guidedTourModal.js` | Multiple | `ROOM_101` / `NEXUS-AI-01` | INTENTIONAL (Tour descriptions) |
| `ui/middlewarePanel.js` | 98-101 | `ROOM_101` | INTENTIONAL (Static UI illustration) |
| `ui/sensorPanel.js` | 32 | `roomOrder` array w/ `ROOM_101` | RESIDUAL_BUG (UI rendering order) |

## Hardcoding Removed in this Refactor
- All core engine modules (`occupantSimulator.js`, `hazardEngine.js`, `simulationEngine.js`, `building.js`) have been fully stripped of hardcoded spatial identifiers.
- Graph processing and route optimization now use dynamic mapping via `SPATIAL_GRAPH_MAPPING` and topology inference.
- The `building.js` file now loads dynamic building plans (`building_a.json`, `building_b.json`, etc.) dynamically via a singleton instance, abstracting away specific building entities from logic components.
