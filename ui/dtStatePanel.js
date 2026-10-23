/**
 * DIGITAL TWIN STATE PANEL & PREDICTIVE HAZARD MONITOR
 *
 * Shows the live unified state of all building entities,
 * with summary metric cards, interactive space selector pills,
 * live physical telemetry, heterogeneous source identifiers,
 * and a real-time PREDICTIVE HAZARD MONITOR distinguishing
 * current deterministic hazard from ML-forecasted future risk.
 */

import { BUILDING } from '../data/building.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

const HAZARD_BADGE_HTML = (level, accessible = true, type = '') => {
  if (accessible === false || level === 'BLOCKED') {
    const label = type === 'LIFT' ? 'DISABLED' : 'BLOCKED';
    return `<span class="dt-hazard-badge badge-red" data-level="${level}">${label}</span>`;
  }
  const cls = { NORMAL:'green', WARNING:'yellow', CRITICAL:'red', BLOCKED:'red' }[level] || 'green';
  return `<span class="dt-hazard-badge badge-${cls}" data-level="${level}">● ${level}</span>`;
};

const PREDICTION_BADGE_HTML = (predState, risk = 0) => {
  const cls = {
    SAFE: 'green',
    WATCH: 'blue',
    PREDICTED_WARNING: 'yellow',
    PREDICTED_CRITICAL: 'red',
  }[predState] || 'green';

  const label = {
    SAFE: 'SAFE',
    WATCH: 'WATCH',
    PREDICTED_WARNING: 'P-WARNING',
    PREDICTED_CRITICAL: 'P-CRITICAL',
  }[predState] || 'SAFE';

  const pct = Math.round(risk * 100);
  return `<span class="dt-hazard-badge badge-${cls}" title="${predState} (Model Score: ${pct}%)">${label} (${pct}%)</span>`;
};

export class DTStatePanel {
  /**
   * @param {Object}           opts
   * @param {HTMLElement}      opts.container
   * @param {EventBus}         opts.bus
   * @param {DigitalTwinState} [opts.dtState]
   */
  constructor({ container, bus, dtState = null }) {
    this.container    = container;
    this.bus          = bus;
    this.dtState      = dtState;
    this._cards       = {};
    this._selectedId  = 'ROOM_101';
    this._entities    = dtState ? dtState.getAll() : {};
    this._predictions = {};
    this._timelineHistory = {};
    this._lastRecordedTick = -1;

    this._build();
    if (dtState && Object.keys(this._entities).length > 0) {
      this._onInit({ entities: this._entities });
    }
    this.bus.on('dt:state_change', e => this._onStateChange(e));
    this.bus.on('dt:initialised',  e => this._onInit(e));
    this.bus.on('hazard:ml_forecast', e => this._onPredictions(e));
    this.bus.on('sim:tick', (e) => {
      this._recordTimeline(e);
      this._updateInspector();
    });
    this.bus.on('hazard:level_change', () => this._updateInspector());
    this.bus.on('hazard:lift_blocked', () => this._updateInspector());
    this.bus.on('sim:reset',       () => this._reset());
  }

  _recordTimeline(e = {}) {
    const time = typeof e.time === 'number' ? `${e.time.toFixed(1)}s` : `${((e.tick || 0) * 0.1).toFixed(1)}s`;
    const tick = e.tick || 0;
    if (tick - this._lastRecordedTick < 10) return; // Sample every 1.0s (10 ticks)
    this._lastRecordedTick = tick;

    const spaces = BUILDING.spaces || [];
    spaces.forEach(space => {
      const ent = (this.dtState ? this.dtState.getEntity(space.id) : null) || this._entities[space.id] || {};
      const pred = this._predictions[space.id] || {};
      this._timelineHistory[space.id] = this._timelineHistory[space.id] || [];
      this._timelineHistory[space.id].push({
        time,
        temp: typeof ent.temperature === 'number' ? `${ent.temperature.toFixed(1)}°C` : '27.4°C',
        smoke: typeof ent.smoke === 'number' ? `${ent.smoke.toFixed(2)}` : '0.01',
        predictedRisk: typeof pred.predictedRisk === 'number' ? pred.predictedRisk : (ent.predicted_risk || 0),
        actualState: ent.hazard_level || 'NORMAL',
      });
      if (this._timelineHistory[space.id].length > 20) {
        this._timelineHistory[space.id].shift();
      }
    });
  }

  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 10px;height:100%;overflow-y:auto;box-sizing:border-box;';

    const spaces = BUILDING.spaces || [];

    // ── 1. Clean Space Selector Bar ─────────────────────────
    const selectorWrap = document.createElement('div');
    selectorWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex-shrink:0;';
    selectorWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:var(--font-mono);font-size:7.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;">MONITORED SPACES (${spaces.length})</span>
        <span style="font-family:var(--font-mono);font-size:7.5px;color:var(--accent-cyan);" id="dt-pred-count">SAFE</span>
      </div>
    `;

    this._pillBar = document.createElement('div');
    this._pillBar.className = 'dt-room-pill-bar';
    this._pillBar.style.cssText = 'display:flex;gap:3px;overflow-x:auto;padding-bottom:2px;margin:0;';

    spaces.forEach(space => {
      const pill = document.createElement('button');
      pill.className = `dt-room-pill ${space.id === this._selectedId ? 'selected' : ''}`;
      pill.dataset.id = space.id;
      pill.textContent = space.id.replace('ROOM_', 'R');
      pill.title = space.name || space.id;
      pill.addEventListener('click', () => {
        this.inspectEntity(space.id);
      });
      this._pillBar.appendChild(pill);
      this._cards[space.id] = { pill };
    });
    selectorWrap.appendChild(this._pillBar);
    this.container.appendChild(selectorWrap);

    // ── 2. Selected Space Inspector Card ───────────────────
    this._inspectorEl = document.createElement('div');
    this._inspectorEl.className = 'dt-inspector-card';
    this.container.appendChild(this._inspectorEl);

    // ── 3. Active Threats / Multi-Space Risk Outlook ────────
    this._monitorEl = document.createElement('div');
    this._monitorEl.className = 'dt-predictive-monitor';
    this._monitorEl.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0;';
    this._monitorEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06);">
        <span style="font-family:var(--font-mono);font-size:7.5px;font-weight:700;color:var(--accent-purple);letter-spacing:0.4px;">PREDICTIVE RISK OUTLOOK</span>
        <span style="font-family:var(--font-mono);font-size:7px;color:var(--text-muted);">15s Horizon</span>
      </div>
      <div id="dt-monitor-list" style="display:flex;flex-direction:column;gap:3px;margin-top:2px;"></div>
    `;
    this.container.appendChild(this._monitorEl);

    this._updateInspector();
  }

  _onInit({ entities }) {
    this._entities = entities;
    this._updateSummary(entities);
    this._updateInspector();
  }

  _onStateChange({ entityId, entity }) {
    this._entities[entityId] = entity;
    if (entityId === this._selectedId) {
      this._updateInspector();
    }
    this._updateSummary(this._entities);
  }

  _onPredictions({ predictions }) {
    this._predictions = predictions || {};
    this._updateMonitorList();
    this._updateInspector();
  }

  inspectEntity(entityId) {
    this._selectedId = entityId;
    const pills = this.container.querySelectorAll('.dt-room-pill');
    pills.forEach(p => p.classList.toggle('selected', p.dataset.id === entityId));
    this._updateInspector();
  }

  _updateInspector() {
    const spaceData = BUILDING.spaces?.find(s => s.id === this._selectedId) || {};
    const e = (this.dtState ? this.dtState.getEntity(this._selectedId) : null) || this._entities[this._selectedId] || {
      entity_id: this._selectedId,
      name: spaceData.name || this._selectedId,
      type: spaceData.type || 'CLASSROOM',
      floor: 1,
      temperature: 27.4,
      smoke: 0.01,
      occupancy: 0,
      hazard_level: 'NORMAL',
      predicted_state: 'SAFE',
      predicted_risk: 0.0,
      prediction_horizon: 15,
      prediction_trend: 'STABLE',
      prediction_reasons: [],
      accessible: true,
      fire_alarm: false,
    };

    const fmtNum = (v, d = 1) => (typeof v === 'number') ? v.toFixed(d) : '—';
    const sysIds = (BUILDING.system_identifiers && BUILDING.system_identifiers[e.entity_id]) || {
      BMS: `Z_${e.entity_id}`,
      FAS: `R_${e.entity_id}`,
      BIM: e.ifc_id || `IFC_${e.entity_id}`,
      OCCUPANCY: `OCC_${e.entity_id}`
    };

    const pred = this._predictions[this._selectedId] || {
      predictedRisk: e.predicted_risk || 0,
      predictedState: e.predicted_state || 'SAFE',
      trend: e.prediction_trend || 'STABLE',
      horizonSeconds: e.prediction_horizon || 15,
      reasons: e.prediction_reasons || [],
    };

    const isHot = e.temperature > 45;
    const isSmoky = e.smoke > 0.15;
    const isAlarm = e.fire_alarm;
    const isLift = e.type === 'LIFT';
    const isDisabled = e.accessible === false || e.hazard_level === 'BLOCKED';
    const isPredictedHot = pred.predictedState === 'PREDICTED_WARNING' || pred.predictedState === 'PREDICTED_CRITICAL';

    const trendText = pred.trend === 'RISING' ? '↑ Rising' : pred.trend === 'FALLING' ? '↓ Falling' : '→ Stable';
    const predPct = Math.round((pred.predictedRisk || 0) * 100);
    const capacity = spaceData.capacity || 30;
    const occVal = isLift && isDisabled ? 0 : (e.occupancy ?? 0);

    // Compute rate of change
    const hist = this._timelineHistory[this._selectedId] || [];
    let tempRate = null;
    if (hist.length >= 2) {
      const latest = hist[hist.length - 1];
      const prev = hist[hist.length - 2];
      const tDiff = parseFloat(latest.temp) - parseFloat(prev.temp);
      if (!isNaN(tDiff) && Math.abs(tDiff) > 0.05) tempRate = `${tDiff > 0 ? '+' : ''}${tDiff.toFixed(1)}°/s`;
    }

    this._inspectorEl.innerHTML = `
      <div class="inspector-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="display:flex;flex-direction:column;gap:1px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="inspector-id" style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(e.entity_id)}</span>
            <span style="font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);">FL ${escapeHtml(e.floor || 1)} · ${escapeHtml(e.type || 'SPACE')}</span>
          </div>
          <span class="inspector-name" style="font-size:10.5px;color:var(--text-secondary);margin-top:1px;">${escapeHtml(e.name || e.entity_id)}</span>
        </div>
        ${HAZARD_BADGE_HTML(e.hazard_level || 'NORMAL', e.accessible !== false, e.type)}
      </div>

      <!-- Telemetry Grid -->
      <div class="dt-telemetry-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0;">
        <div class="dt-telemetry-box" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-sm);padding:6px 8px;${isHot ? 'border-color:rgba(255,69,58,0.4);background:rgba(255,69,58,0.06);' : ''}">
          <div class="dt-telemetry-lbl" style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:2px;">
            <span>TEMPERATURE</span>
            ${tempRate ? `<span class="dt-telemetry-rate" style="color:${tempRate.startsWith('+') ? 'var(--accent-red)' : 'var(--accent-green)'};font-size:8.5px;">${escapeHtml(tempRate)}</span>` : ''}
          </div>
          <span class="dt-telemetry-val ${isHot ? 'red' : 'cyan'}" style="font-family:var(--font-mono);font-size:15px;font-weight:600;">${fmtNum(e.temperature)}°C</span>
        </div>

        <div class="dt-telemetry-box" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-sm);padding:6px 8px;${isSmoky ? 'border-color:rgba(255,69,58,0.4);background:rgba(255,69,58,0.06);' : ''}">
          <div class="dt-telemetry-lbl" style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:2px;">
            <span>SMOKE / AQI</span>
          </div>
          <span class="dt-telemetry-val ${isSmoky ? 'red' : 'cyan'}" style="font-family:var(--font-mono);font-size:15px;font-weight:600;">${fmtNum(e.smoke, 2)} AQI</span>
        </div>

        <div class="dt-telemetry-box" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-sm);padding:6px 8px;">
          <div class="dt-telemetry-lbl" style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:2px;">
            <span>OCCUPANCY</span>
            <span style="font-size:8.5px;color:var(--text-muted);">${occVal}/${capacity}</span>
          </div>
          <span class="dt-telemetry-val green" style="font-family:var(--font-mono);font-size:15px;font-weight:600;">${occVal} pax</span>
        </div>

        <div class="dt-telemetry-box" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-sm);padding:6px 8px;${(isAlarm || (isLift && isDisabled)) ? 'border-color:rgba(255,69,58,0.4);background:rgba(255,69,58,0.06);' : ''}">
          <div class="dt-telemetry-lbl" style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:2px;">
            <span>${isLift ? 'INTERLOCK' : 'ALARM'}</span>
          </div>
          <span class="dt-telemetry-val ${(isAlarm || (isLift && isDisabled)) ? 'red' : 'green'}" style="font-family:var(--font-mono);font-size:13px;font-weight:600;">
            ${isLift ? (isDisabled ? 'DISABLED' : 'NOMINAL') : (isAlarm ? 'ALERT' : 'NOMINAL')}
          </span>
        </div>
      </div>

      <!-- Predictive Risk Forecast -->
      <div class="predictive-outlook-card ${isPredictedHot ? 'has-risk' : ''}" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-sm);padding:8px 10px;margin-top:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-family:var(--font-mono);font-size:9.5px;font-weight:700;color:var(--accent-purple);letter-spacing:0.4px;">PREDICTIVE HAZARD FORECAST</span>
          ${PREDICTION_BADGE_HTML(pred.predictedState, pred.predictedRisk)}
        </div>
        
        <div style="display:flex;align-items:baseline;gap:10px;margin:4px 0;">
          <span style="font-family:var(--font-mono);font-size:24px;font-weight:300;color:${predPct >= 70 ? 'var(--accent-red)' : predPct >= 40 ? 'var(--accent-amber)' : 'var(--text-primary)'};">${predPct}%</span>
          <div style="display:flex;flex-direction:column;gap:1px;">
            <span style="font-size:10px;font-weight:600;color:var(--text-secondary);">${escapeHtml(pred.predictedState.replace('_', ' '))} · 15s horizon</span>
            <span style="font-family:var(--font-mono);font-size:9px;color:${pred.trend === 'RISING' ? 'var(--accent-red)' : 'var(--text-muted)'};">${trendText}</span>
          </div>
        </div>

        ${(pred.reasons && pred.reasons.length > 0) ? `
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.05);font-size:9.5px;color:var(--text-secondary);line-height:1.4;">
            <strong style="color:var(--text-muted);font-size:8.5px;font-family:var(--font-mono);text-transform:uppercase;display:block;margin-bottom:2px;">WHY:</strong>
            ${pred.reasons.map(r => `<div>• ${escapeHtml(r)}</div>`).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Semantic System IDs -->
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.04);border-radius:var(--radius-xs);padding:4px 8px;font-family:var(--font-mono);font-size:8.5px;color:var(--text-muted);margin-top:4px;">
        <span><strong style="color:var(--accent-blue);">BMS:</strong> ${escapeHtml(sysIds.BMS || '—')}</span>
        <span><strong style="color:var(--accent-red);">FAS:</strong> ${escapeHtml(sysIds.FAS || '—')}</span>
        <span><strong style="color:var(--accent-purple);">BIM:</strong> ${escapeHtml(sysIds.BIM || '—')}</span>
      </div>
    `;
  }

  _updateMonitorList() {
    const listEl = document.getElementById('dt-monitor-list');
    if (!listEl) return;

    // Filter & sort spaces by predicted risk descending
    const items = Object.entries(this._predictions)
      .map(([id, p]) => ({ id, ...p }))
      .filter(p => p.predictedRisk >= 0.20)
      .sort((a, b) => b.predictedRisk - a.predictedRisk)
      .slice(0, 5);

    if (items.length === 0) {
      listEl.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:8px;text-align:center;font-family:var(--font-mono);">All spaces within safe predictive envelope.</div>`;
      return;
    }

    listEl.innerHTML = '';
    items.forEach(p => {
      const isCritical = p.predictedState === 'PREDICTED_CRITICAL';
      const isWarning  = p.predictedState === 'PREDICTED_WARNING';
      const barColor   = isCritical ? 'var(--accent-red)' : isWarning ? 'var(--accent-amber)' : 'var(--accent-cyan)';
      const pct = Math.round(p.predictedRisk * 100);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:2px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:4px;padding:5px 8px;cursor:pointer;';
      // Use event delegation instead of inline onclick — fixes window.__dtPanel bug
      row.addEventListener('click', () => this.inspectEntity(p.id));
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text-primary);">${escapeHtml(p.id)}</span>
          <span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:${barColor};">${escapeHtml(p.predictedState.replace('_', ' '))} · ${pct}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;"></div>
          </div>
          <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">${p.trend === 'RISING' ? '↑' : '→'} ${p.horizonSeconds}s</span>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  _updateSummary(entities) {
    let hazCount = 0;
    let predCritCount = 0;
    let totalOcc = 0;
    Object.values(entities).forEach(e => {
      if (e.hazard_level && e.hazard_level !== 'NORMAL') hazCount++;
      if (e.predicted_state === 'PREDICTED_CRITICAL' || e.predicted_state === 'PREDICTED_WARNING') predCritCount++;
      if (typeof e.occupancy === 'number') totalOcc += e.occupancy;
    });

    // dt-pred-count IS in the DOM — update it
    const predEl = document.getElementById('dt-pred-count');
    if (predEl) {
      if (predCritCount > 0) {
        predEl.textContent = `${predCritCount} THREAT`;
        predEl.style.color = 'var(--accent-red)';
      } else if (hazCount > 0) {
        predEl.textContent = `${hazCount} HAZARD`;
        predEl.style.color = 'var(--accent-amber)';
      } else {
        predEl.textContent = 'SAFE';
        predEl.style.color = 'var(--accent-green)';
      }
    }
    // Note: dt-haz-count and dt-occ-count are not in the DOM — do not query them
  }

  _reset() {
    this._predictions = {};
    this.inspectEntity('ROOM_101');
    this._updateMonitorList();
    this._updateSummary(this._entities);
  }
}
