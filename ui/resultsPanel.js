/**
 * RESULTS PANEL
 * Final simulation statistics, research KPIs, and static-vs-dynamic routing comparison.
 */

export class ResultsPanel {
  /**
   * @param {Object}        opts
   * @param {HTMLElement}   opts.container
   * @param {EventBus}      opts.bus
   * @param {MetricsEngine} opts.metrics
   */
  constructor({ container, bus, metrics }) {
    this.container = container;
    this.bus       = bus;
    this.metrics   = metrics;
    this.bus.on('sim:complete', () => this._show());
    this.bus.on('sim:reset',    () => this._hide());
  }

  _show() {
    const r = this.metrics.getReport();
    this.container.innerHTML = this._renderHTML(r);
    this.container.classList.add('visible');
    this.container.style.display = 'block';

    // Bind close button
    const btnClose = this.container.querySelector('#btn-close-results');
    btnClose?.addEventListener('click', () => this._hide());

    // Bind export button
    const btnExport = this.container.querySelector('#btn-export-kpis');
    btnExport?.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(r, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `digital_twin_research_kpis_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  _hide() {
    this.container.innerHTML = '';
    this.container.classList.remove('visible');
    this.container.style.display = 'none';
  }

  _renderHTML(r) {
    const staticTime = r.static_routing_evac_s !== null && r.static_routing_evac_s > 0 ? r.static_routing_evac_s : null;
    const dynamicTime = r.dynamic_routing_evac_s !== null && r.dynamic_routing_evac_s > 0 ? r.dynamic_routing_evac_s : null;
    const imp = (staticTime && dynamicTime) ? +((1 - dynamicTime / staticTime) * 100).toFixed(1) : null;

    return `
    <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">
      <!-- Title & Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:var(--radius-sm);">
        <div>
          <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent-cyan);font-weight:700;letter-spacing:0.5px;">
            RESEARCH EVALUATION &amp; BENCHMARK
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-family:var(--font-mono);">
            AI-Driven Digital Twin Framework for Emergency Evacuation
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="btn-export-kpis" class="btn btn-speed" style="color:var(--accent-cyan);border-color:rgba(56,189,248,0.35)">Export JSON</button>
          <button id="btn-close-results" class="btn btn-speed">Close</button>
        </div>
      </div>

      <!-- Key stats grid -->
      <div class="results-grid">
        <div class="result-stat">
          <span class="stat-value" style="color:${r.evacuated_occupants > 0 ? '#22c55e' : '#ef4444'}">${r.evacuated_occupants ?? 0}</span>
          <span class="stat-label">Safely Evacuated (N = ${r.total_occupants ?? 0})</span>
        </div>
        <div class="result-stat">
          <span class="stat-value" style="color:${(r.evacuation_rate ?? 0) >= 80 ? '#22c55e' : (r.evacuation_rate ?? 0) >= 40 ? '#f59e0b' : '#ef4444'}">${r.evacuation_rate !== null ? `${r.evacuation_rate}%` : '--'}</span>
          <span class="stat-label">Life Safety Rate (${r.trapped_occupants || 0} Trapped)</span>
        </div>
        <div class="result-stat">
          <span class="stat-value" style="color:#00d4e8">${r.dynamic_routing_evac_s !== null ? `${r.dynamic_routing_evac_s}s` : '--'}</span>
          <span class="stat-label">Egress Duration</span>
        </div>
        <div class="result-stat">
          <span class="stat-value" style="color:#f59e0b">${r.route_recalculations || 0}</span>
          <span class="stat-label">Dijkstra Recalcs</span>
        </div>
        <div class="result-stat">
          <span class="stat-value" style="color:#a855f7">${r.mapping_accuracy_pct !== null ? `${r.mapping_accuracy_pct}%` : '--'}</span>
          <span class="stat-label">AI Mapping Accuracy</span>
        </div>
        <div class="result-stat">
          <span class="stat-value" style="color:#00d4e8">${r.avg_mapping_latency_ms !== null ? `${r.avg_mapping_latency_ms}ms` : '--'}</span>
          <span class="stat-label">Hybrid Ingestion Lag</span>
        </div>
      </div>

      <!-- Two column breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <!-- Evacuation Metrics -->
        <div class="card">
          <div class="card-title">Evacuation Timeline</div>
          <div class="kv-row"><span class="kv-key">Fire Ignition</span><span class="kv-val yellow">${r.fire_trigger_time_s !== null ? `${r.fire_trigger_time_s}s` : '--'}</span></div>
          <div class="kv-row"><span class="kv-key">Evacuation Began</span><span class="kv-val">${r.evacuation_start_s !== null ? `${r.evacuation_start_s}s` : '--'}</span></div>
          <div class="kv-row"><span class="kv-key">Avg Occupant Egress</span><span class="kv-val cyan">${r.avg_evacuation_time_s !== null ? `${r.avg_evacuation_time_s}s` : '--'}</span></div>
          <div class="kv-row"><span class="kv-key">Fastest Evacuation</span><span class="kv-val green">${r.min_evacuation_time_s !== null ? `${r.min_evacuation_time_s}s` : '--'}</span></div>
          <div class="kv-row"><span class="kv-key">Trapped Occupants (ASET)</span><span class="kv-val ${r.trapped_occupants > 0 ? 'red' : 'green'}">${r.trapped_occupants || 0}</span></div>
        </div>

        <!-- Semantic Middleware Metrics -->
        <div class="card">
          <div class="card-title">AI Semantic Middleware</div>
          <div class="kv-row"><span class="kv-key">Total Schema Mappings</span><span class="kv-val cyan">${r.total_mappings || 0}</span></div>
          <div class="kv-row"><span class="kv-key">Validated &amp; Applied</span><span class="kv-val green">${r.passed_mappings || 0}</span></div>
          <div class="kv-row"><span class="kv-key">Firewall Ambiguity Gate</span><span class="kv-val yellow">${r.flagged_mappings || 0}</span></div>
          <div class="kv-row"><span class="kv-key">Physical Bounds Rejected</span><span class="kv-val red">${r.failed_mappings || 0}</span></div>
          <div class="kv-row"><span class="kv-key">Sensor→DT Ingestion Lag</span><span class="kv-val">${r.avg_sensor_to_dt_ms !== null ? `${r.avg_sensor_to_dt_ms}ms` : '--'}</span></div>
        </div>
      </div>

      <!-- Static vs Dynamic Comparative Table -->
      <div class="card">
        <div class="card-title">Comparative Research Analysis: Static vs Dynamic Digital Twin Routing</div>
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Evaluation Parameter</th>
              <th>Static Building Routing (Baseline)</th>
              <th>AI-Driven Digital Twin (Proposed)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="td-label">Evacuation Time</td>
              <td class="td-bad">${staticTime !== null ? `${staticTime}s` : '-- (Run comparative trial)'}</td>
              <td class="td-good">${dynamicTime !== null ? `${dynamicTime}s (Optimal dynamic path)` : '--'}</td>
            </tr>
            <tr>
              <td class="td-label">Life Safety &amp; Survival Rate</td>
              <td class="td-bad">${r.static_safe_rate !== null ? `${r.static_safe_rate}%` : '--'}</td>
              <td class="${(r.evacuation_rate ?? 0) >= 90 ? 'td-good' : 'td-bad'}">${r.evacuation_rate !== null ? `${r.evacuation_rate}% (${r.evacuated_occupants}/${r.total_occupants} Safely Evacuated · ${r.trapped_occupants} Trapped)` : '--'}</td>
            </tr>
            <tr>
              <td class="td-label">Hazard Avoidance Recalculations</td>
              <td class="td-bad">0 (Static signs only)</td>
              <td class="td-good">${r.route_recalculations || 0} Real-time Dijkstra cycles</td>
            </tr>
            <tr>
              <td class="td-label">Performance &amp; Safety Delta</td>
              <td colspan="2" style="text-align:center;color:${(r.evacuation_rate ?? 0) >= 80 ? '#34d399' : '#ef4444'};font-weight:700;font-size:12px;background:${(r.evacuation_rate ?? 0) >= 80 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'};">
                ${imp !== null ? `▲ ${imp}% Faster Evacuation &amp; ${r.evacuation_rate}% Life Safety Preservation` : `Simulation Complete · ${r.evacuated_occupants}/${r.total_occupants} Safely Egressed`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="text-align:center;font-size:11px;color:#8892b0;margin-top:8px;">
        AI calls: ${r.gemini_calls || 0} | Cache hits: ${r.cache_hits || 0} | Deterministic: ${r.baseline_calls || 0}
      </div>
    </div>
    `;
  }
}
