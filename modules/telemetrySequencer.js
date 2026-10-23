/**
 * TELEMETRY SEQUENCER & FRESHNESS VALIDATOR
 *
 * Implements robust sequence number and timestamp tracking per entity and sensor stream.
 * Protects the Digital Twin state from out-of-order, delayed, or replayed telemetry packets.
 *
 * Ordering Rules:
 *   1. Incoming timestamp < last accepted timestamp -> REJECT (Stale Telemetry)
 *   2. Incoming timestamp == last accepted timestamp AND seq <= last accepted seq -> REJECT (Duplicate / Stale Sequence)
 *   3. Otherwise -> ACCEPT and update high-water mark.
 */

export class TelemetrySequencer {
  constructor() {
    // entityId/sensorId -> { lastTimestamp: number, lastSeq: number, acceptedCount: number, rejectedCount: number }
    this._watermarks = new Map();
    this.stats = {
      totalEvaluated: 0,
      accepted: 0,
      rejectedStale: 0,
      rejectedOutOfOrder: 0,
    };
  }

  /**
   * Evaluates an incoming telemetry packet for freshness and sequencing.
   *
   * @param {Object} packet
   * @param {string} packet.entityId     - Canonical or source entity/sensor identifier
   * @param {number} [packet.timestamp]  - Millisecond timestamp of packet creation
   * @param {number} [packet.seq]        - Sequence counter from sensor gateway
   * @param {string} [packet.source]     - System or sensor source name
   * @returns {{ accepted: boolean, reason: string, lastTimestamp: number, lastSeq: number }}
   */
  evaluate(packet) {
    this.stats.totalEvaluated++;
    const key = packet.entityId || packet.sensorId || packet.sourceEntity || 'GLOBAL';
    const ts = typeof packet.timestamp === 'number' ? packet.timestamp : (packet.ts || Date.now());
    const seq = typeof packet.seq === 'number' ? packet.seq : (packet.sequenceNumber || 0);

    const mark = this._watermarks.get(key);

    if (!mark) {
      // First telemetry packet seen for this entity
      this._watermarks.set(key, {
        lastTimestamp: ts,
        lastSeq: seq,
        acceptedCount: 1,
        rejectedCount: 0,
      });
      this.stats.accepted++;
      return { accepted: true, reason: 'Initial watermark established', lastTimestamp: ts, lastSeq: seq };
    }

    // Check 1: Strictly older timestamp
    if (ts < mark.lastTimestamp) {
      mark.rejectedCount++;
      this.stats.rejectedStale++;
      return {
        accepted: false,
        reason: `Stale telemetry rejected: packet timestamp (${ts}) is older than last accepted (${mark.lastTimestamp}) by ${mark.lastTimestamp - ts}ms`,
        lastTimestamp: mark.lastTimestamp,
        lastSeq: mark.lastSeq,
      };
    }

    // Check 2: Equal timestamp but non-monotonic sequence number
    if (ts === mark.lastTimestamp && seq !== 0 && mark.lastSeq !== 0 && seq <= mark.lastSeq) {
      mark.rejectedCount++;
      this.stats.rejectedOutOfOrder++;
      return {
        accepted: false,
        reason: `Out-of-order sequence rejected: packet seq (${seq}) <= last accepted seq (${mark.lastSeq}) at timestamp ${ts}`,
        lastTimestamp: mark.lastTimestamp,
        lastSeq: mark.lastSeq,
      };
    }

    // Fresh and valid packet -> advance watermark
    mark.lastTimestamp = ts;
    if (seq > 0) mark.lastSeq = seq;
    mark.acceptedCount++;
    this.stats.accepted++;

    return {
      accepted: true,
      reason: 'Freshness verified',
      lastTimestamp: ts,
      lastSeq: mark.lastSeq,
    };
  }

  /**
   * Reset tracking state (e.g. on simulation reset)
   */
  reset() {
    this._watermarks.clear();
    this.stats = {
      totalEvaluated: 0,
      accepted: 0,
      rejectedStale: 0,
      rejectedOutOfOrder: 0,
    };
  }

  getWatermark(key) {
    return this._watermarks.get(key) || null;
  }

  getStats() {
    return { ...this.stats, trackedEntities: this._watermarks.size };
  }
}
