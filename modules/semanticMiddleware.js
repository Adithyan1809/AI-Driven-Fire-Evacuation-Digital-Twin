/**
 * SEMANTIC MIDDLEWARE
 *
 * Orchestrates the full AI Semantic Interoperability Pipeline:
 *   Incoming heterogeneous messages (BMS / FAS / ENV_IOT / OCC / BIM / ACCESS)
 *     ↓ AISemanticService   (Zero-Shot Gemini AI Entity & Attribute Resolution + Semantic Cache)
 *     ↓ ValidationLayer     (Authoritative 9-Point Deterministic AI Safety Firewall)
 *     ↓ DigitalTwinState    (Unified State Store Update with Generation & Sequence guards)
 *
 * Safety & Race Condition Guarantees:
 *   - Captures simulationGenerationId at dispatch time.
 *   - Stale async responses from prior simulation runs are safely discarded and logged.
 *   - Telemetry timestamps and sequences are monotonically verified.
 *   - Gemini proposes interpretation; Safety Firewall decides state admission.
 */

import { AISemanticService } from './aiSemanticService.js';
import { ValidationLayer }   from './validationLayer.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';

export class SemanticMiddleware {
  /**
   * @param {Object}          opts
   * @param {EventBus}        opts.bus
   * @param {DigitalTwinState}opts.dtState
   * @param {Object}          [opts.config]
   */
  constructor({ bus, dtState, config = null }) {
    this.bus        = bus;
    this.dtState    = dtState;
    this.config     = config;
    this.aiService  = new AISemanticService();
    this.validator  = new ValidationLayer({ bus, config });
    this.metrics    = {
      total: 0,
      passed: 0,
      flagged: 0,
      failed: 0,
      staleDiscarded: 0,
      latency_ms: [],
      aiCalls: 0,
      cacheHits: 0,
      baselineCalls: 0,
      offlineRejections: 0,
    };
    this._lastPipelineEvent = null;

    // Listen for incoming heterogeneous telemetry streams
    this.bus.on('hetero:messages', e => this._enqueue(e));
    this.bus.on('sim:reset',       () => this._reset());
    this.bus.on('config:changed',  ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
      const fullCfg = this._getConfig();
      if (fullCfg.semantic?.mode) {
        this.aiService.setMode(fullCfg.semantic.mode);
      }
    });
  }

  // ── Public API ─────────────────────────────────────────

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  getMetrics() {
    const lat = this.metrics.latency_ms;
    return {
      ...this.metrics,
      avg_latency_ms: lat.length ? +(lat.reduce((a,b)=>a+b,0)/lat.length).toFixed(2) : 0,
      accuracy: this.metrics.total > 0
        ? +((this.metrics.passed / this.metrics.total) * 100).toFixed(1)
        : 100,
      cacheStats: this.aiService.stats,
    };
  }

  // ── Internal ───────────────────────────────────────────

  _enqueue({ messages, testType = null, forceOffline = false }) {
    if (!messages || messages.length === 0) return;
    this._processBatch(messages, testType, forceOffline);
  }

  async _processBatch(messages, testType = null, forceOffline = false) {
    const t0 = performance.now();
    const currentGen = this.dtState ? this.dtState.getGenerationId() : 1;
    const allMappings = [];
    const messageRecords = [];

    for (const msg of messages) {
      const { sourceEntity, description, attributes, rawValues } = this._extractMessagePayload(msg);

      const resolution = await this.aiService.resolve({
        sourceSystem: msg._system || 'HETEROGENEOUS',
        sourceEntity,
        description,
        attributes,
        generationId: currentGen,
        forceOffline: forceOffline || msg.forceOffline || false,
      });

      // ── RACE CONDITION CHECK (Phase 10): Discard if simulation was reset mid-request ──
      if (this.dtState && this.dtState.getGenerationId() !== currentGen) {
        console.warn(`[SemanticMiddleware] Discarded async resolution for ${sourceEntity}: generation ${currentGen} !== current ${this.dtState.getGenerationId()}`);
        this.metrics.staleDiscarded++;
        this.bus.emit('mw:stale_discarded', { sourceEntity, capturedGen: currentGen, activeGen: this.dtState.getGenerationId() });
        return;
      }

      const mapping = resolution.mapping || {};
      const isCacheHit = resolution.cache_hit;
      const source = resolution.source || 'GEMINI_AI';

      if (isCacheHit) this.metrics.cacheHits++;
      else if (source === 'GEMINI_AI') this.metrics.aiCalls++;
      else if (source === 'DETERMINISTIC_BASELINE') this.metrics.baselineCalls++;
      else if (source === 'AI_UNAVAILABLE') this.metrics.offlineRejections++;

      // Generate mapping candidates for each attribute
      const attrMappings = Array.isArray(mapping.attribute_mappings) && mapping.attribute_mappings.length > 0
        ? mapping.attribute_mappings
        : attributes.map(a => {
            const lower = a.toLowerCase();
            let target = 'temperature';
            if (lower.includes('smoke') || lower.includes('obscur') || lower.includes('aqi') || lower.includes('partic')) target = 'smoke';
            else if (lower.includes('alarm') || lower.includes('alert') || lower.includes('fire') || lower.includes('state')) target = 'fire_alarm';
            else if (lower.includes('occ') || lower.includes('peop') || lower.includes('count') || lower.includes('head') || lower.includes('pres')) target = 'occupancy';
            else if (lower.includes('temp') || lower.includes('therm') || lower.includes('deg')) target = 'temperature';
            return { source: a, target, confidence: 0.9 };
          });

      const msgMappings = attrMappings.map(am => {
        let val = rawValues[am.source];
        if (val === undefined) {
          val = rawValues[Object.keys(rawValues)[0]] ?? msg.value ?? null;
        }

        // Normalize alarm/state representations
        if (typeof val === 'string') {
          const upper = val.toUpperCase();
          if (['ALM', 'ALARM', 'ACTIVE', 'TRIGGERED', 'TRUE'].includes(upper)) val = true;
          else if (['OK', 'NORMAL', 'CLEAR', 'FALSE'].includes(upper)) val = false;
        }

        return {
          canonical_entity: mapping.target_entity,
          field: am.target,
          value: val,
          confidence: (mapping.entity_confidence || 0.9) * (am.confidence || 1.0),
          entity_found: mapping.target_entity && mapping.target_entity !== 'UNKNOWN',
          reasoning: mapping.reason || mapping.explanation || `Mapped ${am.source} -> ${am.target} in ${mapping.target_entity}`,
          source_system: msg._system,
          source_entity: sourceEntity,
          source_attribute: am.source,
          model: mapping.model || (source === 'DETERMINISTIC_BASELINE' ? 'deterministic-baseline' : isCacheHit ? 'semantic-memory-cache' : 'gemini-2.0-flash'),
          decision: mapping.decision || (mapping.target_entity === 'UNKNOWN' ? 'UNKNOWN' : 'MATCH'),
          alternatives: mapping.alternatives || [],
          cache_hit: isCacheHit,
          source: source,
          explanation: mapping.explanation || mapping.reason,
          timestamp: msg.ts || msg.timestamp || Date.now(),
          seq: msg.seq || msg.sequenceNumber || 0,
        };
      });

      allMappings.push(...msgMappings);
      messageRecords.push({
        msg,
        mappings: msgMappings,
        source,
        cacheHit: isCacheHit,
        resolution,
      });
    }

    if (allMappings.length === 0) return;

    // ── Step 3: Deterministic Validation Firewall ────────
    const { patchMap, metaMap, report } = this.validator.validateBatch(allMappings);

    // ── Step 4: Update Digital Twin Unified State with granular per-entity metadata ────────
    const updatedEntities = Object.keys(patchMap);
    if (updatedEntities.length > 0) {
      if (metaMap) {
        metaMap.generationId = currentGen;
      }
      this.dtState.applyPatchMap(patchMap, `MW:TELEMETRY`, metaMap || { generationId: currentGen });
    }

    // ── Metrics ──────────────────────────────────────────
    const latency = +(performance.now() - t0).toFixed(2);
    this.metrics.total     += allMappings.length;
    this.metrics.passed    += report.filter(r => r.result.valid && !r.result.flagged).length;
    this.metrics.flagged   += report.filter(r => r.result.flagged).length;
    this.metrics.failed    += report.filter(r => !r.result.valid).length;
    this.metrics.latency_ms.push(latency);

    // Emit per-message pipeline events with strictly matched 1-to-1 mappings
    for (const rec of messageRecords) {
      const recReport = report.filter(r => rec.mappings.some(m => m === r.mapping));
      const pipelineEvent = {
        msg: rec.msg,
        mappings: rec.mappings,
        report: recReport.length ? recReport : report.slice(0, 1),
        patchMap,
        latency: +(latency / messageRecords.length).toFixed(1),
        source: rec.source,
        cacheHit: rec.cacheHit,
        generationId: currentGen,
        testType,
        t0,
      };
      this._lastPipelineEvent = pipelineEvent;
      this.bus.emit('mw:pipeline_complete', pipelineEvent);
    }
  }

  /**
   * Dynamically extracts the source entity identifier and attribute key/values
   * from any heterogeneous message format without hardcoded schema rules.
   */
  _extractMessagePayload(msg) {
    if (!msg || typeof msg !== 'object') {
      return { sourceEntity: 'GENERIC', description: '', attributes: ['value'], rawValues: {} };
    }

    // 1. Identify source entity (prioritize spatial zone / location / endpoint)
    const entityCandidates = [
      msg.zone,
      msg.loc,
      msg.area,
      msg.endpoint,
      msg.node_ref,
      msg.portal_id,
      msg.device_id,
      msg.asset,
      msg.object,
      msg.camera_id,
      msg.sensor,
      msg.dev,
      msg.id,
    ];
    const sourceEntity = entityCandidates.find(c => c && typeof c === 'string' && c.trim().length > 0) || 'UNKNOWN_DEVICE';

    // 2. Identify description
    const description = msg.description || msg.name || `Heterogeneous ${msg._system || 'IoT'} telemetry for ${sourceEntity}`;

    // 3. Extract non-metadata attributes
    const reserved = new Set([
      '_system', 'ts', 'timestamp', 'unit', 'source_system', 'sequenceNumber', 'seq', 'buildingId',
      'endpoint', 'device_id', 'node_ref', 'asset', 'portal_id',
      'zone', 'loc', 'area', 'object', 'camera_id', 'sensor', 'dev',
      'id', 'name', 'type', 'floor', 'description', 'forceOffline'
    ]);

    const attributes = Object.keys(msg).filter(k => !reserved.has(k));
    if (attributes.length === 0) {
      if (msg.value !== undefined) attributes.push('value');
      else if (msg.type) attributes.push('bim_space_type');
    }

    const rawValues = {};
    attributes.forEach(attr => { rawValues[attr] = msg[attr]; });

    return { sourceEntity, description, attributes, rawValues };
  }

  _reset() {
    this.aiService.clearCache();
    this.validator.resetStats();
    this.metrics = {
      total: 0,
      passed: 0,
      flagged: 0,
      failed: 0,
      staleDiscarded: 0,
      latency_ms: [],
      aiCalls: 0,
      cacheHits: 0,
      baselineCalls: 0,
      offlineRejections: 0,
    };
  }
}
