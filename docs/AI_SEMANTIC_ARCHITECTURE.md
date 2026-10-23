# AI Semantic Interoperability Architecture

## Architecture Diagram

```mermaid
flowchart TD
    A[Heterogeneous Systems (BMS, FAS, BIM, CCTV)] --> B[Semantic Memory Cache]
    B --> C{Cache Hit?}
    C -->|Yes| G[Deterministic Validation Firewall]
    C -->|No| D[Gemini AI Engine]
    D --> E[Multi-Model Fallback Layer]
    E --> G
    G --> H{Pass Safety Checks?}
    H -->|Yes| I[Digital Twin Unified Canonical State]
    H -->|No| J[Fallback / Human Review / Rejection]
```

## Decision Strategy

| Component | AI-Driven Decisions | Deterministic Validation |
|---|---|---|
| Entity Resolution | Resolves unknown names/codes to Canonical ID | Rejects unknown/hallucinated IDs against active registry |
| Ontology Mapping | Maps random metrics (e.g., "thermal_reading") to standard ("temperature") | Verifies mapped attributes exist in canonical schema |
| Confidence Scoring | Provides probability of semantic match | Sets hard thresholds (e.g. >75%) |
| Conflict Handling | Handles ambiguous mappings (e.g., similar zones) | Requires min ambiguity margin between options |

## Deterministic Validation Safety Firewall Rules

1. **Structural Schema Check**: Validates the JSON schema structure returned by the AI.
2. **Unknown Decision Check**: Flags if AI returned 'UNKNOWN' for an entity.
3. **Target Existence Check**: Verifies that the resolved entity actually exists in the active building model registry.
4. **Confidence Threshold Check**: Ensures confidence meets the predefined safety threshold.
5. **Ambiguity Margin Check**: Resolves overlapping candidates by ensuring the delta in confidence is large enough to rule out hallucination errors.
6. **Attribute Validity Check**: Verifies that output attributes belong to the predefined digital twin canonical schema.
7. **Cache Consistency Check**: Assures that memory states invalidate accurately when building topology changes.

## Cache Architecture

- **Semantic Memory**: Sub-millisecond lookup cache for previously resolved entities to prevent redundant AI API calls.
- **In-Memory Store**: `Map` structure with auto-save behavior backed by file persistence.
- **Topology-Aware Invalidation**: Calling `invalidateForNewBuilding(activeSpaces)` clears obsolete keys gracefully to prevent poisoning when switching buildings.
- **Human-in-the-Loop Feedback**: Stores manually validated records under `HUMAN_LEARNED` state, which have priority and bypass standard eviction logic.

## Source Labels

- `GEMINI_AI`: Live generative AI API request.
- `SEMANTIC_MEMORY`: Safely cached historical decision previously verified.
- `DETERMINISTIC_BASELINE`: Direct string match or hardcoded simple mapping fallback logic.
- `DETERMINISTIC_FALLBACK`: Degraded state when AI fails or network unreachable.
