/**
 * BENCHMARK & RESEARCH PAGE
 *
 * Dedicated Scientific Evaluation View:
 *   1. Static vs Dynamic Evacuation Comparison
 *   2. Dijkstra Recalculation Performance Breakdown
 *   3. AI Semantic Middleware Ingestion Latency Distributions
 *   4. JSON Data Export for Research Paper Publication
 */

export class BenchmarkPage {
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

    this._build();
    this.bus.on('sim:complete', () => this._build());
    this.bus.on('sim:reset',    () => this._build());
  }

  _build() {
    const r = this.metrics.getReport();
    const hasData = r.dynamic_routing_evac_s !== null;
    const staticTime = r.static_routing_evac_s !== null ? `${r.static_routing_evac_s}s` : '--';
    const dynamicTime = r.dynamic_routing_evac_s !== null ? `${r.dynamic_routing_evac_s}s` : '--';
    const imp = r.improvement_pct !== null ? `${r.improvement_pct}%` : '--';

    this.container.innerHTML = `
      <div class="benchmark-page-container">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);">Research Benchmark &amp; Evaluation</h2>
            <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px;">
              Empirical validation data for AI-Driven Digital Twin Emergency Evacuation
            </div>
          </div>
          <button id="btn-export-bench-json" class="btn btn-speed" style="color:var(--accent-cyan);border-color:rgba(56,189,248,0.4);">
            Export Dataset (JSON)
          </button>
        </div>

        <!-- KPI Grid -->
        <div class="bench-kpi-grid">
          <div class="bench-kpi-card">
            <span class="lbl">LIFE SAFETY &amp; SURVIVAL</span>
            <span class="val green">${hasData && r.evacuation_rate !== null ? `${r.evacuation_rate}%` : '--'}</span>
            <span class="sub">${hasData ? `${r.evacuated_occupants} / ${r.total_occupants} occupants (${r.trapped_occupants || 0} trapped)` : 'Run simulation to measure'}</span>
          </div>
          <div class="bench-kpi-card">
            <span class="lbl">DYNAMIC EGRESS DURATION</span>
            <span class="val cyan">${dynamicTime}</span>
            <span class="sub">${hasData ? `Fastest: ${r.min_evacuation_time_s ?? '--'}s · Slowest: ${r.max_evacuation_time_s ?? '--'}s` : 'Run simulation to measure'}</span>
          </div>
          <div class="bench-kpi-card">
            <span class="lbl">EGRESS IMPROVEMENT</span>
            <span class="val green">${r.improvement_pct !== null ? `▲ ${imp}` : '--'}</span>
            <span class="sub">${r.static_routing_evac_s !== null ? `vs ${staticTime} unadapted static baseline` : 'Requires comparative baseline run'}</span>
          </div>
          <div class="bench-kpi-card">
            <span class="lbl">AI MAPPING ACCURACY</span>
            <span class="val purple">${r.mapping_accuracy_pct !== null ? `${r.mapping_accuracy_pct}%` : '--'}</span>
            <span class="sub">${r.total_mappings > 0 ? `${r.passed_mappings}/${r.total_mappings} validated by safety firewall` : 'Awaiting sensor stream ingestion'}</span>
          </div>
        </div>

        <!-- Comparative Table -->
        <div class="lab-card" style="margin-top:16px;">
          <div class="lab-card-title">STATIC SIGNAGE VS DYNAMIC DIGITAL TWIN ROUTING</div>
          <table class="comparison-table" style="margin-top:8px;">
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
                <td class="td-bad">${staticTime}</td>
                <td class="td-good">${dynamicTime}</td>
              </tr>
              <tr>
                <td class="td-label">Life Safety &amp; Survival Rate</td>
                <td class="td-bad">${r.static_safe_rate !== null ? `${r.static_safe_rate}%` : '--'}</td>
                <td class="td-good">${hasData && r.evacuation_rate !== null ? `${r.evacuation_rate}% (${r.evacuated_occupants}/${r.total_occupants} Safely Evacuated · ${r.trapped_occupants} Trapped)` : '--'}</td>
              </tr>
              <tr>
                <td class="td-label">Hazard Avoidance Recalculations</td>
                <td class="td-bad">0 (Static signs only)</td>
                <td class="td-good">${r.route_recalculations || 0} Real-Time Dijkstra cycles</td>
              </tr>
              <tr>
                <td class="td-label">Multi-Protocol Semantic Interoperability</td>
                <td class="td-bad">Manual relay (Siloed systems)</td>
                <td class="td-good">Automated Zero-Shot Semantic Middleware (${r.mapping_accuracy_pct !== null ? `${r.mapping_accuracy_pct}%` : '--'})</td>
              </tr>
              <tr>
                <td class="td-label">Overall Performance &amp; Safety Delta</td>
                <td colspan="2" style="text-align:center;color:${(r.evacuation_rate ?? 0) >= 80 ? '#34d399' : '#ef4444'};font-weight:700;font-size:12px;background:${(r.evacuation_rate ?? 0) >= 80 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'};">
                  ${hasData ? (r.improvement_pct !== null ? `▲ ${imp} Faster Egress & ${r.evacuation_rate}% Life Safety Preservation` : `Simulation Complete · ${r.evacuated_occupants}/${r.total_occupants} Safely Egressed`) : 'No active simulation run recorded yet. Start simulation from Live Twin to view live metrics.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Export button
    this.container.querySelector('#btn-export-bench-json')?.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(r, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `digital_twin_research_kpis_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }
}
