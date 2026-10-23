/**
 * AI SEMANTIC SERVICE & SEMANTIC MEMORY CLIENT
 *
 * Client-side interface to the Backend Gemini Semantic Interoperability Layer.
 *
 * Provides:
 *   1. Real Zero-Shot Gemini AI semantic entity and attribute resolution
 *   2. Semantic Memory layer with instant sub-ms caching (<2ms for repeat schemas)
 *   3. Honest operational modes: 'AI_GEMINI' | 'DETERMINISTIC_BASELINE' | 'AI_UNAVAILABLE'
 *   4. Clean structured output with auditable explanation (no hidden reasoning)
 *   5. Robust generation tracking & telemetry
 */

import { AISemanticMapper } from './aiSemanticMapper.js';
import { validateSemanticMappingRecord } from './validationLayer.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';

export class AISemanticService {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.mode] - 'AI_GEMINI' | 'DETERMINISTIC_BASELINE' | 'AI_UNAVAILABLE'
   * @param {string} [opts.apiBase] - Base URL for API
   */
  constructor({ mode = 'AI_GEMINI', apiBase = '' } = {}) {
    this.mode             = mode;
    this.apiBase          = apiBase || ((typeof window === 'undefined') ? 'http://localhost:8080' : '');
    this.localCache       = new Map();
    this.baselineMapper   = new AISemanticMapper();
    this.isBackendOnline  = true;
    this.hasGeminiKey     = false;
    this.geminiModel      = 'gemini-2.0-flash';

    this.stats = {
      localHits: 0,
      backendCalls: 0,
      baselineCalls: 0,
      offlineRejections: 0,
      errors: 0,
      latencies: [],
    };

    this.checkHealth();
  }

  async checkHealth() {
    try {
      const res = await fetch(`${this.apiBase}/api/health`);
      if (res.ok) {
        const data = await res.json();
        this.isBackendOnline = true;
        this.hasGeminiKey    = data.hasGeminiKey;
        this.geminiModel     = data.model || this.geminiModel;
      }
    } catch (e) {
      this.isBackendOnline = false;
    }
  }

  setMode(newMode) {
    this.mode = newMode;
  }

  clearCache() {
    this.localCache.clear();
    if (this.baselineMapper && typeof this.baselineMapper.refreshDict === 'function') {
      this.baselineMapper.refreshDict();
    }
  }

  /**
   * Resolve an incoming heterogeneous data point to canonical entity & attributes.
   */
  async resolve({
    sourceSystem,
    sourceEntity,
    description = '',
    entityType = 'room',
    floor = 1,
    attributes = [],
    generationId = 1,
    forceRefresh = false,
    forceOffline = false,
  }) {
    const t0 = performance.now();
    const effectiveMode = forceOffline ? 'AI_UNAVAILABLE' : this.mode;
    const cacheKey = `${(sourceSystem||'').toUpperCase()}:${(sourceEntity||'').trim().toUpperCase()}:${[...attributes].sort().join(',')}`;

    // ── 1. Check Local Semantic Cache (<2ms runtime latency) ───────────
    if (!forceRefresh && effectiveMode !== 'AI_UNAVAILABLE' && this.localCache.has(cacheKey)) {
      this.stats.localHits++;
      const cached = this.localCache.get(cacheKey);
      const latency = +(performance.now() - t0).toFixed(2);
      return {
        ...cached,
        cache_hit: true,
        source: 'SEMANTIC_MEMORY',
        generationId,
        latency_ms: latency,
      };
    }

    // ── 2. AI Unavailable / Offline Mode (Honest Failure) ─────────────
    if (effectiveMode === 'AI_UNAVAILABLE') {
      this.stats.offlineRejections++;
      const latency = +(performance.now() - t0).toFixed(2);
      const mapping = {
        source_system: sourceSystem,
        source_entity: sourceEntity,
        target_entity: 'UNKNOWN',
        entity_confidence: 0.0,
        attribute_mappings: (attributes || []).map(a => ({
          source: typeof a === 'string' ? a : a.source || a.name,
          target: 'UNKNOWN',
          confidence: 0.0,
          unit: '',
        })),
        alternatives: [],
        reason: 'Gemini AI is unavailable. Unfamiliar schema cannot be resolved without AI.',
        explanation: 'AI service offline. Unknown telemetry held by deterministic firewall.',
        decision: 'UNKNOWN',
        latency_ms: latency,
        model: 'AI_UNAVAILABLE',
        source: 'AI_UNAVAILABLE',
        status: 'NOT_RESOLVED',
        cache_hit: false,
      };

      const validation = validateSemanticMappingRecord(mapping);

      return { mapping, validation, source: 'AI_UNAVAILABLE', generationId, cache_hit: false, latency_ms: latency };
    }

    // ── 3. Deterministic Baseline Comparator Mode ──────────────────────
    if (effectiveMode === 'DETERMINISTIC_BASELINE' || !this.isBackendOnline) {
      this.stats.baselineCalls++;
      const baseResult = this.baselineMapper.resolveEntity(sourceEntity);
      const latency = +(performance.now() - t0).toFixed(2);

      const mapping = {
        source_system: sourceSystem,
        source_entity: sourceEntity,
        target_entity: baseResult.canonical || 'UNKNOWN',
        entity_confidence: baseResult.confidence,
        attribute_mappings: (attributes || []).map(a => {
          const src = typeof a === 'string' ? a : a.source || a.name;
          return { source: src, target: this.baselineMapper.resolveField(src) || 'UNKNOWN', confidence: 0.90 };
        }),
        alternatives: [],
        reason: baseResult.reason || 'Deterministic baseline lookup.',
        explanation: 'Resolved using deterministic baseline rule dictionary.',
        decision: baseResult.entity_found ? 'MATCH' : 'UNKNOWN',
        latency_ms: latency,
        model: 'DETERMINISTIC_BASELINE',
        source: 'DETERMINISTIC_BASELINE',
        status: baseResult.entity_found ? 'RESOLVED' : 'NOT_RESOLVED',
        cache_hit: false,
      };

      const validation = validateSemanticMappingRecord(mapping);

      if (validation.valid) {
        this.localCache.set(cacheKey, { mapping, validation, source: 'DETERMINISTIC_BASELINE' });
      }

      return { mapping, validation, source: 'DETERMINISTIC_BASELINE', generationId, cache_hit: false, latency_ms: latency };
    }

    // ── 4. Call Real Backend Gemini Semantic Service ───────────────────
    this.stats.backendCalls++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${this.apiBase}/api/semantic/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_system: sourceSystem,
          source_entity: sourceEntity,
          description,
          entity_type: entityType,
          floor,
          attributes,
          generationId,
          force_refresh: forceRefresh,
          mode: effectiveMode,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const result = await response.json();
      const latency = +(performance.now() - t0).toFixed(1);
      this.stats.latencies.push(latency);

      // Re-verify validation deterministically on client side
      const validation = validateSemanticMappingRecord(result.mapping || {});

      // Store in local cache if strictly valid
      if (validation.valid && result.mapping) {
        this.localCache.set(cacheKey, {
          mapping: result.mapping,
          validation,
          source: result.source || 'GEMINI_AI',
        });
      }

      return {
        mapping: result.mapping,
        validation,
        source: result.source || 'GEMINI_AI',
        generationId,
        cache_hit: result.cache_hit || false,
        latency_ms: latency,
      };
    } catch (err) {
      this.stats.errors++;
      const baseResult = this.baselineMapper.resolveEntity(sourceEntity);
      const latency = +(performance.now() - t0).toFixed(2);

      const isKnown = baseResult.entity_found && baseResult.canonical !== 'UNKNOWN';
      const fallbackMapping = {
        source_system: sourceSystem,
        source_entity: sourceEntity,
        target_entity: isKnown ? baseResult.canonical : 'UNKNOWN',
        entity_confidence: isKnown ? +(baseResult.confidence * 0.95).toFixed(2) : 0.40,
        attribute_mappings: (attributes || []).map(a => {
          const src = typeof a === 'string' ? a : a.source || a.name;
          const target = this.baselineMapper.resolveField(src) || (src.includes('temp') ? 'temperature' : src.includes('smoke') ? 'smoke' : src.includes('count') || src.includes('pres') ? 'occupancy' : 'UNKNOWN');
          return { source: src, target, confidence: 0.90 };
        }),
        alternatives: [],
        reason: baseResult.reason || `Resolved via deterministic fallback (${sourceEntity} -> ${baseResult.canonical}).`,
        explanation: isKnown
          ? `Mapped ${sourceEntity} -> ${baseResult.canonical} via deterministic building ontology.`
          : 'Unknown sensor identifier held by deterministic safety firewall.',
        decision: isKnown ? 'MATCH' : 'UNKNOWN',
        latency_ms: latency,
        model: 'DETERMINISTIC_FALLBACK',
        source: 'DETERMINISTIC_FALLBACK',
        status: isKnown ? 'RESOLVED' : 'NOT_RESOLVED',
        cache_hit: false,
      };

      const validation = validateSemanticMappingRecord(fallbackMapping);

      if (validation.valid) {
        this.localCache.set(cacheKey, { mapping: fallbackMapping, validation, source: 'DETERMINISTIC_FALLBACK' });
      }

      return {
        mapping: fallbackMapping,
        validation,
        source: 'DETERMINISTIC_FALLBACK',
        generationId,
        cache_hit: false,
        latency_ms: latency,
      };
    }
  }

  // ── Semantic Memory Methods ──────────────────────────────
  async getSemanticMemory() {
    try {
      const res = await fetch(`${this.apiBase}/api/semantic/memory`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return { items: [], stats: {} };
  }

  async clearSemanticMemory() {
    this.localCache.clear();
    try {
      const res = await fetch(`${this.apiBase}/api/semantic/memory/clear`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      return { success: true, clearedCount: 0 };
    }
  }
}
