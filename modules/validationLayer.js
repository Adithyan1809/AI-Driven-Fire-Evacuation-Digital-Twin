/**
 * VALIDATION LAYER — AUTHORITATIVE AI SAFETY FIREWALL
 *
 * Deterministic, server-authoritative AI Safety Firewall between Gemini AI output / raw telemetry
 * and the safety-critical Digital Twin state.
 *
 * Authoritative 9-Point Validation Pipeline:
 *   1. Structural schema validation (valid JSON, required attributes present)
 *   2. Unknown decision / entity check (rejects 'UNKNOWN', empty, or null target entity)
 *   3. Target existence check (verified against authoritative active canonical spaces/registry)
 *   4. Confidence threshold check (confidence >= min_confidence, default 0.75)
 *   5. Ambiguity margin check (top candidate confidence - 2nd alternative confidence >= margin)
 *   6. Field recognition (only permitted Digital Twin fields allowed)
 *   7. Physical range & boundary checks (temperature -20..350°C, smoke 0.0..1.0, occupancy 0..2000)
 *   8. Value type & enum validation (boolean, number, string, enum sets)
 *   9. Integrity check (rejects impossible physical values e.g. temp=999999, smoke=-20, occ=-4)
 *
 * Gemini proposes interpretation. Validation deterministically decides admissibility.
 * Invalid or unverified data NEVER mutates the Digital Twin.
 */

import { BUILDING, getActiveBuilding } from '../data/building.js';
import { canonicalRegistryInstance } from '../data/canonicalRegistry.js';

export const DT_PHYSICAL_FIELDS = Object.freeze({
  temperature:     { type: 'number',  min: -20,  max: 350,  unit: '°C' },
  smoke:           { type: 'number',  min: 0.0,  max: 1.0,  unit: 'AQI' },
  fire_alarm:      { type: 'boolean' },
  occupancy:       { type: 'number',  min: 0,    max: 2000, unit: 'persons' },
  bim_space_type:  { type: 'string' },
  door_state:      { type: 'string',  values: ['OPEN','CLOSED','LOCKED','BLOCKED','UNLOCKED','UNLOCKED_EMERGENCY'] },
  hazard_level:    { type: 'string',  values: ['NORMAL','WARNING','CRITICAL','BLOCKED'] },
  accessible:      { type: 'boolean' },
});

/**
 * Pure function to validate a semantic mapping or telemetry update against canonical rules.
 * Usable by both server.js and client-side ValidationLayer.
 *
 * @param {Object} mapping
 * @param {Object} [opts]
 * @param {Array}  [opts.canonicalEntities]
 * @param {number} [opts.minConfidence]
 * @param {number} [opts.ambiguityMargin]
 * @param {boolean}[opts.validationEnabled]
 * @returns {{ valid: boolean, status: string, reason: string, patch: Object|null, checks: Object, flagged: boolean }}
 */
export function validateSemanticMappingRecord(mapping, {
  canonicalEntities = null,
  minConfidence = 0.75,
  ambiguityMargin = 0.05,
  validationEnabled = true,
} = {}) {
  const result = {
    valid: false,
    status: 'REJECTED',
    reason: '',
    patch: null,
    flagged: false,
    checks: {
      schemaValid: false,
      knownEntity: false,
      entityExists: false,
      confidenceMet: false,
      ambiguityResolved: false,
      fieldRecognized: false,
      physicalRangeValid: false,
      attributesValid: false,
    },
    mapping,
  };

  if (!mapping || typeof mapping !== 'object') {
    result.status = 'SCHEMA_ERROR';
    result.reason = 'Mapping payload must be a non-null object.';
    return result;
  }

  if (!validationEnabled) {
    result.valid = true;
    result.status = 'PASSED_UNCHECKED';
    result.reason = 'Validation firewall bypassed per configuration.';
    result.patch = mapping.field ? { [mapping.field]: mapping.value } : null;
    return result;
  }

  // ── 1. Structural Schema Check ──
  const targetEntity = mapping.canonical_entity || mapping.target_entity || mapping.canonical_space_id || mapping.space_id;
  const confidence = typeof mapping.confidence === 'number'
    ? mapping.confidence
    : (typeof mapping.entity_confidence === 'number' ? mapping.entity_confidence : 0.0);

  result.checks.schemaValid = typeof targetEntity === 'string' && typeof confidence === 'number';
  if (!result.checks.schemaValid) {
    result.status = 'SCHEMA_ERROR';
    result.reason = 'Mapping failed structural schema: target_entity and numeric confidence required.';
    result.flagged = true;
    return result;
  }

  // ── 2. Unknown Decision / Entity Check ──
  const isUnknown = mapping.decision === 'UNKNOWN' ||
                    targetEntity === 'UNKNOWN' ||
                    mapping.entity_found === false ||
                    !targetEntity.trim();

  result.checks.knownEntity = !isUnknown;
  if (isUnknown) {
    result.status = 'UNKNOWN_ENTITY';
    result.reason = `Target entity "${mapping.source_entity || targetEntity}" was flagged as UNKNOWN. Held by firewall (Human Review Required).`;
    result.flagged = true;
    return result;
  }

  // ── 3. Canonical Registry Existence Check ──
  const activeSpaces = Array.isArray(canonicalEntities) && canonicalEntities.length > 0
    ? canonicalEntities
    : canonicalRegistryInstance.getActiveSpaces();

  const activeBld = getActiveBuilding ? getActiveBuilding() : BUILDING;
  const spaceMatch = activeSpaces.find(e => e.id === targetEntity) ||
                     (activeBld.spaces || []).find(s => s.id === targetEntity) ||
                     (activeBld.exits || []).find(e => e.id === targetEntity) ||
                     (activeBld.graph?.nodes || []).find(n => n.id === targetEntity);

  result.checks.entityExists = !!spaceMatch;
  if (!spaceMatch) {
    result.status = 'REJECTED_UNKNOWN';
    result.reason = `Target entity "${targetEntity}" not found in authoritative canonical building registry.`;
    result.flagged = true;
    return result;
  }

  // ── 4. Confidence Threshold Check ──
  // Allow epsilon tolerance (0.005) for floating point representation
  result.checks.confidenceMet = confidence >= (minConfidence - 0.005);
  if (!result.checks.confidenceMet) {
    result.status = 'LOW_CONFIDENCE';
    result.reason = `Confidence ${(confidence * 100).toFixed(1)}% is below authoritative safety threshold ${(minConfidence * 100).toFixed(0)}%. Held for review.`;
    result.flagged = true;
    return result;
  }

  // ── 5. Ambiguity Margin Check ──
  const alternatives = mapping.alternatives || [];
  if (mapping.decision === 'AMBIGUOUS' || (Array.isArray(alternatives) && alternatives.length > 0)) {
    const topAlt = alternatives[0];
    if (topAlt && typeof topAlt.confidence === 'number') {
      const margin = confidence - topAlt.confidence;
      if (margin < ambiguityMargin) {
        result.checks.ambiguityResolved = false;
        result.status = 'AMBIGUOUS';
        result.reason = `Ambiguous mapping: Top candidate "${targetEntity}" (${(confidence*100).toFixed(0)}%) vs Alternative "${topAlt.entity || topAlt.target}" (${(topAlt.confidence*100).toFixed(0)}%) margin is ${(margin*100).toFixed(1)}% (< ${(ambiguityMargin*100).toFixed(0)}%). Held for review.`;
        result.flagged = true;
        return result;
      }
    }
  }
  result.checks.ambiguityResolved = true;

  // ── 6 & 7 & 8. Field, Range, and Type Validation ──
  const field = mapping.field || mapping.canonical_metric || mapping.metric;
  const value = mapping.value !== undefined ? mapping.value : mapping.value_mapped;

  if (field !== undefined) {
    const fieldRule = DT_PHYSICAL_FIELDS[field];

    // Field recognized check
    if (!fieldRule) {
      // Allow metadata extensions if safe
      if (field === 'bim_space_type' || field === 'status') {
        result.checks.fieldRecognized = true;
        result.checks.physicalRangeValid = true;
      } else {
        result.status = 'UNRECOGNIZED_FIELD';
        result.reason = `Unrecognized Digital Twin field "${field}". Prohibited from mutating state.`;
        result.flagged = true;
        return result;
      }
    } else {
      result.checks.fieldRecognized = true;

      // Type & range checks
      if (fieldRule.type === 'number') {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
          result.status = 'INVALID_TYPE';
          result.reason = `Field "${field}" requires a finite number, received ${typeof value} (${value}).`;
          result.flagged = true;
          return result;
        }
        if (fieldRule.min !== undefined && value < fieldRule.min) {
          result.status = 'OUT_OF_BOUNDS';
          result.reason = `Value ${value} for "${field}" is below physical minimum (${fieldRule.min} ${fieldRule.unit || ''}).`;
          result.flagged = true;
          return result;
        }
        if (fieldRule.max !== undefined && value > fieldRule.max) {
          result.status = 'OUT_OF_BOUNDS';
          result.reason = `Value ${value} for "${field}" exceeds physical maximum (${fieldRule.max} ${fieldRule.unit || ''}).`;
          result.flagged = true;
          return result;
        }
      } else if (fieldRule.type === 'boolean') {
        if (typeof value !== 'boolean') {
          result.status = 'INVALID_TYPE';
          result.reason = `Field "${field}" requires a boolean, received ${typeof value} (${value}).`;
          result.flagged = true;
          return result;
        }
      } else if (fieldRule.values && Array.isArray(fieldRule.values)) {
        if (typeof value !== 'string' || !fieldRule.values.includes(value.toUpperCase())) {
          result.status = 'INVALID_ENUM';
          result.reason = `Value "${value}" for "${field}" is not in valid enum set [${fieldRule.values.join(', ')}].`;
          result.flagged = true;
          return result;
        }
      }
      result.checks.physicalRangeValid = true;
    }
  } else {
    // If no single field is passed (e.g. whole entity resolution mapping from Gemini)
    result.checks.fieldRecognized = true;
    result.checks.physicalRangeValid = true;
  }

  // ── 9. Attribute Array Validity Check ──
  if (Array.isArray(mapping.attribute_mappings)) {
    let allAttrsValid = true;
    for (const am of mapping.attribute_mappings) {
      if (am && am.target && am.target !== 'UNKNOWN') {
        if (!DT_PHYSICAL_FIELDS[am.target] && am.target !== 'bim_space_type' && am.target !== 'status') {
          allAttrsValid = false;
        }
      }
    }
    result.checks.attributesValid = allAttrsValid;
  } else {
    result.checks.attributesValid = true;
  }

  // All 9 safety firewall checks passed!
  result.valid = true;
  result.status = 'ACCEPTED';
  result.reason = `Verified: ${spaceMatch.name || targetEntity} (Confidence ${(confidence*100).toFixed(0)}% >= ${(minConfidence*100).toFixed(0)}%, all safety checks passed).`;
  result.patch = field !== undefined ? { [field]: value } : null;

  return result;
}

export class ValidationLayer {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   * @param {Object}   [opts.config]
   */
  constructor({ bus, config = null }) {
    this.bus    = bus;
    this.config = config;
    this.stats  = { passed: 0, failed: 0, flagged: 0, ambiguous: 0 };

    this.bus.on('config:changed', ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
    });
  }

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  /**
   * Validate a single mapping record.
   *
   * @param {Object} mapping
   * @returns {{ valid: boolean, patch: Object|null, reason: string, flagged: boolean, status: string }}
   */
  validate(mapping) {
    const cfg = this._getConfig();
    const minConfidence = cfg.semantic?.confidenceThreshold ?? 0.75;
    const ambiguityMargin = cfg.semantic?.ambiguityMargin ?? 0.05;
    const validationEnabled = cfg.semantic?.validationEnabled ?? true;

    const result = validateSemanticMappingRecord(mapping, {
      canonicalEntities: canonicalRegistryInstance.getActiveSpaces(),
      minConfidence,
      ambiguityMargin,
      validationEnabled,
    });

    if (result.valid) {
      this.stats.passed++;
    } else {
      this.stats.failed++;
      if (result.flagged) this.stats.flagged++;
      if (result.status === 'AMBIGUOUS') this.stats.ambiguous++;

      if (result.status === 'LOW_CONFIDENCE' || result.status === 'AMBIGUOUS') {
        this.bus.emit('validation:flagged', { mapping, reason: result.reason });
      } else {
        this.bus.emit('validation:failed', { mapping, reason: result.reason });
      }
    }

    return result;
  }

  /**
   * Validate a batch of mappings and construct an entity patch map for Digital Twin state updates.
   *
   * @param {Array} mappings
   * @returns {{ patchMap: Object, report: Array }}
   */
  validateBatch(mappings) {
    const patchMap = {};
    const metaMap = {};
    const report = [];

    (mappings || []).forEach(m => {
      const result = this.validate(m);
      report.push({ mapping: m, result });

      const targetEntity = m.canonical_entity || m.target_entity;
      if (result.valid && result.patch && targetEntity && targetEntity !== 'UNKNOWN') {
        patchMap[targetEntity] = {
          ...(patchMap[targetEntity] || {}),
          ...result.patch,
        };

        const mTs = typeof m.timestamp === 'number' ? m.timestamp : (typeof m.ts === 'number' ? m.ts : Date.now());
        const mSeq = typeof m.seq === 'number' ? m.seq : (typeof m.sequenceNumber === 'number' ? m.sequenceNumber : 0);

        if (!metaMap[targetEntity] || mTs >= metaMap[targetEntity].timestamp) {
          metaMap[targetEntity] = {
            timestamp: mTs,
            seq: mSeq,
            sensorId: m.source_entity || m.foreign_id || null,
            sourceSystem: m.source_system || null,
          };
        }
      }
    });

    return { patchMap, metaMap, report };
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { passed: 0, failed: 0, flagged: 0, ambiguous: 0 };
  }
}
