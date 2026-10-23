# Benchmark Methodology

## Overview

The benchmark process runs against a standardized 120-case dataset comparing the performance of traditional deterministic models with AI-augmented frameworks for Digital Twin semantic interoperability.

## Dataset Design

- **Size**: 120 heterogeneous building cases representing inputs from disparate protocols (BMS, FAS, BIM/IFC, OCC).
- **Seen Data Split (102 items)**: Direct matches, string inclusions, or lightly obfuscated values available in the baseline schema.
- **Unseen Data Split (18 items)**: Zero-shot complex aliases, novel ontologies, adversarial scenarios, physically impossible readings, or complete hallucinations.

## Methodology

### The 4 Comparison Methods

1. **A: Rules**: Standard regex and deterministic string mapping.
2. **B: Heuristics**: Deterministic string mappings combined with fuzzy search.
3. **C: Raw Gemini**: Unfiltered Gemini LLM generations.
4. **D: Gemini+Firewall**: Gemini supplemented with the Deterministic Safety Firewall.

### Ground Truth Verification

Ground truths are pre-derived from architectural engineering principles and are verified by comparing the system output against expected `canonical_id` targets. The strict matching determines the accuracy scoring per method.

### Hallucination Prevention Metric

The hallucination prevention metric measures the percentage of times the system actively caught invalid, hallucinated, or malformed inputs from AI outputs (e.g., physically impossible inputs, or hallucinated target spaces). Achieving a 17/18 blocked rate translates to a **94.4% safety mitigation success**.

### Evacuation Experiment Methodology

- **Scope**: 150 unique trials run under Static configurations and 150 trials run under Dynamic Routing configurations (300 total executions).
- **Execution Setup**: Simulated at various occupant counts, fire locations, and speed variations. Total occupant latency (time for last occupant to exit safely) is recorded.
- **Goal**: Demonstrate how AI-driven semantic mapping reduces occupant congestion through realtime dynamic graph recalculation compared to static egress.

### Gamma Sensitivity Sweep

- Explores how manipulating the edge cost gamma multipliers (`cost_dangerous`, `cost_smoke`, `temperature_penalties`) impacts traversal decisions across simulated trials.
- By tuning the sensitivity parameters (Gamma Sweep), the benchmark identifies the optimal trade-off between hazard avoidance latency and evacuation length.
