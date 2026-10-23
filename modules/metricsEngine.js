/**
 * METRICS ENGINE
 *
 * Records all research metrics throughout the simulation.
 * Used for the Final Results panel and research paper data.
 *
 * Metrics tracked:
 *   - Semantic mapping accuracy (passed / total)
 *   - Entity matching accuracy (correctly resolved entities)
 *   - Average mapping latency (ms)
 *   - Sensor-to-DT update latency (ms)
 *   - Route recalculation count and timing
 *   - Evacuation times per occupant
 *   - Total evacuation duration
 *   - Comparison vs. static routing baseline
 */

export class MetricsEngine {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   */
  constructor({ bus }) {
    this.bus = bus;
    this._data = this._emptyData();

    this.bus.on('sim:start',              () => { this._data.sim_start_time = Date.now(); });
    this.bus.on('sim:fire_trigger',       e  => { this._data.fire_trigger_time = e.time; });
    this.bus.on('sim:evacuation',         e  => { this._data.evacuation_start_time = e.time; });
    this.bus.on('sim:complete',           e  => { this._data.evacuation_end_time   = e.time; });
    this.bus.on('mw:pipeline_complete',   e  => this._onMapping(e));
    this.bus.on('routes:recalculating',   e  => { this._data.route_recalc_count = e.count; });
    this.bus.on('routes:calculated',      e  => { this._data.route_calc_times_ms.push(e.elapsed_ms); });
    this.bus.on('occupants:trapped',      e  => this._onTrapped(e));
    this.bus.on('occupants:evacuated',    e  => this._onEvacuated(e));
    this.bus.on('occupants:initialised',  e  => { this._totalOccupants = e.count; });
    this.bus.on('hazard:exit_status',     e  => { if (!e.accessible) this._data.blocked_exits.add(e.exitId); });
    this.bus.on('hazard:level_change',    e  => this._onHazardChange(e));
    this.bus.on('metrics:set_static_baseline', e => { this._data.static_evac_time = e.time; });
    this.bus.on('sim:reset',              () => { this._data = this._emptyData(); });
    this.bus.on('sensors:update',         e  => this._onSensorUpdate(e));
    this.bus.on('dt:state_change',        e  => this._onDTChange(e));
  }

  // ── Public ─────────────────────────────────────────────

  reset() {
    this._data = this._emptyData();
  }

  getReport() {
    const d = this._data;
    const evTimes = d.evacuation_times_s;
    const totalOcc = this._data.total_occupants || this._totalOccupants || (evTimes.length + d.trapped_occupants.size) || 0;
    const evacuated = evTimes.length;
    const trapped = d.trapped_occupants.size;

    const dynamicEvacTime = (d.evacuation_end_time !== null && d.evacuation_start_time !== null)
      ? +(d.evacuation_end_time - d.evacuation_start_time).toFixed(1)
      : (evTimes.length > 0 ? +Math.max(...evTimes).toFixed(1) : null);

    const staticEvacTime = d.static_evac_time !== null ? +d.static_evac_time.toFixed(1) : null;
    const impPct = (staticEvacTime !== null && dynamicEvacTime !== null && staticEvacTime > 0)
      ? +((1 - dynamicEvacTime / staticEvacTime) * 100).toFixed(1)
      : null;

    const mapLatencies = d.mapping_latencies_ms;
    const sensorLatencies = d.sensor_to_dt_latencies_ms;

    // Genuine zero-shot AI accuracy derived directly from pipeline execution
    const rawAcc = d.total_mappings > 0 ? +((d.passed_mappings / d.total_mappings) * 100).toFixed(1) : null;

    const safeRate = totalOcc > 0 ? +((evacuated / totalOcc) * 100).toFixed(1) : 0;

    return {
      // Occupants & Life Safety
      total_occupants:        totalOcc,
      evacuated_occupants:    evacuated,
      trapped_occupants:      trapped,
      evacuation_rate:        safeRate,
      static_trapped:         d.static_trapped ?? null,
      static_safe_rate:       d.static_safe_rate ?? null,

      // Timing
      fire_trigger_time_s:    d.fire_trigger_time ?? null,
      evacuation_start_s:     d.evacuation_start_time ?? null,
      evacuation_duration_s:  dynamicEvacTime,
      avg_evacuation_time_s:  evTimes.length ? +(evTimes.reduce((a,b)=>a+b,0)/evTimes.length).toFixed(1) : null,
      max_evacuation_time_s:  evTimes.length ? +evTimes.reduce((a,b)=>Math.max(a,b), -Infinity).toFixed(1) : null,
      min_evacuation_time_s:  evTimes.length ? +evTimes.reduce((a,b)=>Math.min(a,b), Infinity).toFixed(1) : null,

      // Routing
      route_recalculations:   d.route_recalc_count,
      avg_route_calc_ms:      d.route_calc_times_ms.length
        ? +(d.route_calc_times_ms.reduce((a,b)=>a+b,0)/d.route_calc_times_ms.length).toFixed(2)
        : null,

      // Semantic middleware
      total_mappings:         d.total_mappings,
      passed_mappings:        d.passed_mappings,
      flagged_mappings:       d.flagged_mappings,
      failed_mappings:        d.failed_mappings,
      mapping_accuracy_pct:   rawAcc,
      avg_mapping_latency_ms: mapLatencies.length
        ? +(mapLatencies.reduce((a,b)=>a+b,0)/mapLatencies.length).toFixed(1)
        : null,
      avg_sensor_to_dt_ms:    sensorLatencies.length
        ? +(sensorLatencies.reduce((a,b)=>a+b,0)/sensorLatencies.length).toFixed(2)
        : null,
      gemini_calls:           d.gemini_calls,
      cache_hits:             d.cache_hits,
      baseline_calls:         d.baseline_calls,
      offline_rejections:     d.offline_rejections,

      // Hazards
      hazardous_rooms:        d.peak_hazardous_rooms,
      blocked_exits:          d.blocked_exits.size,

      // Comparison
      static_routing_evac_s:  staticEvacTime,
      dynamic_routing_evac_s: dynamicEvacTime,
      improvement_pct:        impPct,
    };
  }

  // ── Internal ───────────────────────────────────────────

  _onTrapped({ occupantId }) {
    this._data.trapped_occupants.add(occupantId);
  }

  _onMapping({ mappings, report, latency, source, cacheHit }) {
    if (!report) return;
    this._data.total_mappings   += mappings?.length || 0;
    this._data.passed_mappings  += report.filter(r => r.result.valid && !r.result.flagged).length;
    this._data.flagged_mappings += report.filter(r => r.result.flagged).length;
    this._data.failed_mappings  += report.filter(r => !r.result.valid).length;
    if (latency) this._data.mapping_latencies_ms.push(+latency.toFixed(3));
    if (cacheHit) {
      this._data.cache_hits++;
    } else if (source === 'GEMINI_AI') {
      this._data.gemini_calls++;
    } else if (source === 'DETERMINISTIC_BASELINE') {
      this._data.baseline_calls++;
    } else if (source === 'AI_UNAVAILABLE') {
      this._data.offline_rejections++;
    }
  }

  _onEvacuated({ tick, occupantId }) {
    const evStartS = this._data.evacuation_start_time ?? 0;
    const evTime   = (tick / 10) - evStartS;
    this._data.evacuation_times_s.push(Math.max(0, evTime));
  }

  _onHazardChange({ entityId, next: level }) {
    if (level === 'WARNING' || level === 'CRITICAL' || level === 'BLOCKED') {
      this._data._hazardousEntities.set(entityId, level);
    } else {
      this._data._hazardousEntities.delete(entityId);
    }
    this._data.peak_hazardous_rooms = Math.max(this._data.peak_hazardous_rooms, this._data._hazardousEntities.size);
  }

  _onSensorUpdate() {
    this._data._lastSensorTs = performance.now();
  }

  _onDTChange() {
    if (this._data._lastSensorTs !== null) {
      const lat = performance.now() - this._data._lastSensorTs;
      this._data.sensor_to_dt_latencies_ms.push(Math.max(0, Math.min(500, lat)));
      this._data._lastSensorTs = null;
    }
  }

  _emptyData() {
    return {
      total_occupants:          0,
      trapped_occupants:        new Set(),
      static_evac_time:         null,
      sim_start_time:           null,
      fire_trigger_time:        null,
      evacuation_start_time:    null,
      evacuation_end_time:      null,
      evacuation_times_s:       [],
      route_recalc_count:       0,
      route_calc_times_ms:      [],
      total_mappings:           0,
      passed_mappings:          0,
      flagged_mappings:         0,
      failed_mappings:          0,
      mapping_latencies_ms:     [],
      sensor_to_dt_latencies_ms:[],
      gemini_calls:             0,
      cache_hits:               0,
      baseline_calls:           0,
      offline_rejections:       0,
      blocked_exits:            new Set(),
      peak_hazardous_rooms:     0,
      _hazardousEntities:       new Map(),
      _lastSensorTs:            null,
    };
  }
}
