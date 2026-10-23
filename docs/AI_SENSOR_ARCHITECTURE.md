# AI-Driven Semantic Interoperability Architecture

> **Research Contribution Definition:**
> *"AI-driven semantic interoperability within a synthetic Digital Twin simulation."*
>
> The system does **not** use AI to hallucinate random sensor readings or perform graph mathematics. Physical IoT telemetry and hazard physics are simulated algorithmically; Dijkstra evacuation routing and validation boundaries are computed deterministically. The sole, core research contribution of the AI is **zero-shot semantic interoperability across heterogeneous IoT protocols and unfamiliar sensor schemas**.

---

## 1. End-to-End Execution Flow

```
┌────────────────────────────────────────────────────────┐
│             SYNTHETIC SENSOR SIMULATOR                 │
│  Deterministic Physics · Gaussian Noise · Seeded PRNG  │
│  (Normal baselines, thermal & smoke propagation ramps) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             HETEROGENEOUS SENSOR EVENTS                │
│  BMS:      { device_id, zone, temp_celsius, ... }      │
│  ENV_IOT:  { node_ref, thermal_index, headcount }      │
│  FAS:      { asset, loc, air_obscuration, alert_level }│
│  OCC:      { endpoint, area, presence_count }          │
│  BIM:      { object, bim_space_type, name }            │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│          AI SEMANTIC MIDDLEWARE — GEMINI               │
│  • Zero-shot language understanding (No synonym cheat) │
│  • Discovers entity ID & maps unfamiliar vocabulary    │
│  • Produces structured mapping & auditable explanation │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│          7-POINT DETERMINISTIC SAFETY FIREWALL         │
│  • Target entity exists in canonical registry          │
│  • Attribute is recognized in canonical schema         │
│  • Datatype & physical range check (-20..200°C, 0..1)  │
│  • Confidence threshold (≥0.75) & Ambiguity margin     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│          DIGITAL TWIN UNIFIED STATE UPDATE             │
│  • Atomic state patch applied per space node           │
│  • Synchronized to BuildingGraph                       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│          HAZARD PROPAGATION & DYNAMIC ROUTING          │
│  • HazardEngine computes space danger levels           │
│  • Dynamic Dijkstra re-evaluates edge traversal costs  │
│  • Autonomous occupants reroute around danger zones    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Component Implementation Matrix

| Component | Implementation Category | Role & Mechanism |
|---|---|---|
| **Sensor Value Generation** | Synthetic Algorithm | Algorithmic physics: Gaussian baseline noise, thermal growth ramps, smoke obscuration, occupant counts. |
| **Sensor Heterogeneity** | Configuration + Simulation | Emits heterogeneous schemas across BMS, FAS, ENV_IOT, OCCUPANCY, and BIM with varying keys and units. |
| **Schema Interpretation** | Gemini AI (Zero-Shot) | Identifies semantic meaning of unfamiliar property keys without hardcoded lookup tables. |
| **Semantic Mapping** | Gemini AI (Zero-Shot) | Maps foreign identifiers to canonical building spaces with confidence and auditable explanations. |
| **Mapping Validation** | Deterministic Safety Firewall | 7-point deterministic verification (schema, datatype, physical bounds, entity existence). |
| **Semantic Memory** | Persistent Cache | In-RAM + JSON disk cache: First occurrence = ~1.5s AI call; repeat events = &lt;2ms cache hit. |
| **Digital Twin State** | Deterministic Store | Single source of truth state store holding unified building attributes per space. |
| **Fire Simulation** | Synthetic Simulation | Physics-based fire growth model operating over spatial adjacency. |
| **Navigation Graph** | Generated from Topology | Graph nodes and edges derived dynamically from `BuildingModel` space centroids and door connectivity. |
| **Route Optimization** | Deterministic Dijkstra / A* | Min-heap Dijkstra shortest-path pathfinding dynamically weighted by real-time hazard penalties. |
| **Occupant Movement** | Agent Simulation | Autonomous agent egress simulation driven by reaction delays, speeds, and dynamic rerouting. |
| **Benchmarking** | Deterministic Verification | Exact evaluation over held-out test splits with ground truth metrics and seed reproducibility. |

---

## 3. Detailed Architecture Pillars

### 3.1 What is Synthetic
- **Telemetry values**: Temperatures (e.g. 27.4°C baseline, ramping to 85°C+ during fire), smoke levels (0.01 AQI baseline, ramping to 0.70+ AQI), headcounts (occupants per room).
- **Physical physics**: Thermal convection, smoke infiltration to adjacent rooms with spatial delay, alarm thresholds.
- **Hardware generation**: All virtual IoT devices are synthesized from the active `BuildingModel` configuration.

### 3.2 What is AI-Driven
- **Semantic entity resolution**: Mapping foreign device identifiers (e.g. `ENV_44`, `THERMAL_X7`, `ZONE_9`, `CAM_101`) to canonical building spaces (`ROOM_101`, `ROOM_102`).
- **Semantic attribute mapping**: Mapping arbitrary incoming property names (e.g. `thermal_index` → `temperature`, `air_obscuration` → `smoke`, `headcount` → `occupancy`) without prompt cheating or synonym dictionaries.
- **Confidence estimation & Candidate ranking**: Generating probabilistic match scores and alternative candidate assessments.
- **Auditable reasoning**: Providing concise explanations for why a foreign schema was interpreted in a given way.

### 3.3 What is Deterministic
- **Safety firewall**: 7-point validation firewall enforcing physical bounds (-20°C to 200°C, 0 to 1.0 AQI), datatype integrity, and canonical entity membership. Rejects invalid data (e.g. `temperature = "banana"`).
- **Digital Twin state store**: Atomic state updates and patch propagation.
- **Graph construction**: Spatial nodes, junctions, and edge generation from building geometry.
- **Dijkstra pathfinding**: Mathematical shortest-path optimization with dynamic hazard penalty multipliers.

### 3.4 What is Cached
- **Semantic Memory**: Once Gemini successfully resolves an unfamiliar schema signature (e.g. `ENV_IOT:THERMAL_X7:headcount,thermal_index`), the validated mapping is stored in both local client memory and backend disk cache.
- **Runtime Performance**:
  - **First occurrence**: ~1.5s (Gemini API network call).
  - **Subsequent occurrences**: **&lt;2ms** (Semantic cache hit).
  - High-frequency IoT streams (10–50 Hz) execute in real-time without continuous AI overhead.

### 3.5 What is Validated
Every mapping proposed by Gemini passes through the 7-Point Deterministic AI Safety Firewall:
1. **Schema Structure**: Verifies that the AI returned valid JSON with required mapping fields.
2. **Decision Status**: Rejects or flags entities identified as `UNKNOWN` or `AMBIGUOUS`.
3. **Canonical Existence**: Verifies that `target_entity` exists in the active `BuildingModel` space registry.
4. **Confidence Threshold**: Requires `entity_confidence >= 0.75` (configurable).
5. **Ambiguity Margin**: Enforces a minimum 5% margin between the top candidate and alternatives.
6. **Field Recognition**: Ensures the target attribute belongs to the canonical Digital Twin schema (`temperature`, `smoke`, `fire_alarm`, `occupancy`, `door_state`, `accessible`, `bim_space_type`).
7. **Physical Bounds & Types**: Validates that numerical values lie within safe physical limits.

### 3.6 What Remains Hard-Coded (and What Has Been Generalized)
- **Generalized**:
  - Building geometry, rooms, and sensors are dynamically loaded from `BuildingModel` JSON.
  - Occupant distributions are computed dynamically from room capacities.
  - Adjacency is derived dynamically from door portals and physical connections.
  - Attribute mapping is zero-shot language interpretation without synonym lookup tables.
- **Explicit Deterministic Schemas (Not Hardcoded AI Rules)**:
  - The canonical Digital Twin state definition (`temperature`, `smoke`, `occupancy`, `fire_alarm`, `door_state`) is intentionally deterministic because building control systems require a stable, standard internal model.

### 3.7 How Unseen Schemas are Handled
When a completely novel sensor message arrives (e.g. `endpoint: "ENV-Z91"`, `thermal_index: 72.4`, `headcount: 18`):
1. **Extraction**: `SemanticMiddleware` dynamically extracts unfamiliar keys (`thermal_index`, `headcount`) and entity ID (`ENV-Z91`).
2. **Zero-Shot Prompting**: Gemini receives the raw attributes and the active building space metadata without synonym hints.
3. **AI Resolution**: Gemini reasons that `thermal_index` is temperature and `headcount` is occupancy.
4. **Firewall Ingestion**: Validation confirms the values are valid numbers within range.
5. **Memory Storage**: The schema is cached for all future ticks.
6. **State Sync**: Digital Twin updates `ROOM_101.temperature` and `ROOM_101.occupancy`, triggering hazard checks.

### 3.8 How New Buildings are Handled
1. A new building definition JSON (e.g. with `LAB_A`, `LAB_B`, `SERVER_ROOM`) is loaded into the `BuildingModel` single source of truth.
2. The `SensorSimulator` dynamically synthesizes virtual sensors for the new spaces.
3. The `BuildingGraph` dynamically creates navigation nodes at room centroids and connects them via doors.
4. `CanonicalBuildingRegistry` updates the active spaces list provided to Gemini.
5. `SemanticMemory` invalidates cached entries pointing to spaces that no longer exist in the new building.
6. The entire pipeline runs without requiring source code modifications.

---

## 4. Experimental Verification & Test Modes

The system includes interactive demonstration and validation modes:
- **`🧪 UNSEEN SENSOR TEST`**: Injects novel terminology (`thermal_index`, `headcount`, `air_obscuration`) to demonstrate real-time zero-shot AI resolution and caching.
- **`🔴 AI OFFLINE TEST`**: Simulates Gemini unavailability to demonstrate honest `NOT_RESOLVED` reporting and deterministic firewall protection against corrupted data.
- **`Deterministic Evacuation Proof`**: Proves route divergence under identical seeds between static and dynamic routing.
