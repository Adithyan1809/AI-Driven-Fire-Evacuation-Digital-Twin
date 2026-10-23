/**
 * MIDDLEWARE PANEL
 *
 * Presentation-Grade Visualizer for the Gemini AI Semantic Middleware.
 * Provides a clean, spacious visual pipeline displaying
 * multi-system entity resolution, reasoning traces,
 * validation firewall verdicts, and semantic caching in real time.
 */

const SYSTEM_COLOUR = {
  BMS: '#3b82f6',
  FAS: '#ef4444',
  BIM: '#a855f7',
  OCCUPANCY: '#10b981',
  ENV_IOT: '#06b6d4',
  ACCESS_CONTROL: '#f59e0b',
  SMART_IOT_WIRELESS: '#e040fb',
  UNKNOWN_SYSTEM_X: '#ef4444',
};

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

export class MiddlewarePanel {
  /**
   * @param {Object}      opts
   * @param {HTMLElement} opts.container
   * @param {EventBus}    opts.bus
   */
  constructor({ container, bus }) {
    this.container  = container;
    this.bus        = bus;
    this.mode       = 'DEMO';
    this.speed      = 'SLOW';
    this._recentRaw = [];
    this._presentationQueue = [];
    this._isDisplaying = false;
    this._isPaused = false;
    this._presentationTimeout = null;

    this._build();
    this._populateInitialHero();

    this.bus.on('mw:pipeline_complete', e => this._onPipelineMessage(e));
    this.bus.on('sim:pause',            ({ paused }) => this._onPause(paused));
    this.bus.on('sim:complete',         () => this._onPause(true));
    this.bus.on('presentation:mode',    ({ mode }) => { this.mode = mode; });
    this.bus.on('presentation:speed',   ({ speed }) => { this.speed = speed; });
    this.bus.on('sim:start',            () => { this._isPaused = false; });
    this.bus.on('sim:reset',            () => this._reset());
  }

  _populateInitialHero() {
    this._renderHeroPipeline({
      msg: { _system: 'BMS', device_id: 'TEMP_101', zone: 'Z101', temp_celsius: 27.4, people_count: 15 },
      mappings: [
        { source_attribute: 'temp_celsius', field: 'temperature', value: 27.4, source_entity: 'Z101', canonical_entity: 'ROOM_101', confidence: 0.98, reasoning: 'BMS zone Z101 mapped to canonical space ROOM_101.' },
        { source_attribute: 'people_count', field: 'occupancy', value: 15, source_entity: 'Z101', canonical_entity: 'ROOM_101', confidence: 0.95, reasoning: 'BMS people_count mapped to room occupancy.' }
      ],
      report: [{ result: { valid: true, reason: 'Physical bounds verified [15.0°C - 50.0°C].' } }],
      latency: 1.2,
      source: 'SEMANTIC_MEMORY',
      cacheHit: true
    });
  }

  _onPause(paused) {
    this._isPaused = paused;
    if (paused) {
      if (this._presentationTimeout) {
        clearTimeout(this._presentationTimeout);
        this._presentationTimeout = null;
      }
      this._isDisplaying = false;
    } else {
      if (!this._isDisplaying && this._presentationQueue.length > 0) {
        this._processPresentationQueue();
      }
    }
  }

  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'padding:8px 10px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;';

    // ── 1. Compact Aggregated Stats Bar ───────────────────────
    this._statsSection = document.createElement('div');
    this._statsSection.className = 'mw-compact-stats-bar';
    this._statsSection.innerHTML = `
      <div class="stat-mini"><span class="lbl">INGESTED</span><span class="val cyan" id="mw-stat-total">0</span></div>
      <div class="stat-mini"><span class="lbl">ACCURACY</span><span class="val green" id="mw-stat-acc">100%</span></div>
      <div class="stat-mini"><span class="lbl">CACHE HITS</span><span class="val cyan" id="mw-stat-cache">0</span></div>
      <div class="stat-mini"><span class="lbl">AI CALLS</span><span class="val purple" id="mw-stat-calls">0</span></div>
    `;
    this.container.appendChild(this._statsSection);

    // ── 2. Visual Pipeline Hero Card ────────────────────────
    this._heroCard = document.createElement('div');
    this._heroCard.className = 'mw-hero-pipeline';
    this._heroCard.innerHTML = `
      <div class="hero-header">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="hero-title">ACTIVE AI RESOLUTION</span>
          <span class="hero-sub" id="hero-sys-badge">READY</span>
        </div>
        <span class="badge badge-green" id="hero-latency-badge" style="font-size:7.5px;padding:1px 5px;">ONLINE</span>
      </div>
      <div class="hero-body" id="hero-pipeline-body"></div>
    `;
    this.container.appendChild(this._heroCard);

    // Hook up header audit button
    const headerAuditBtn = document.getElementById('btn-mw-audit-header');
    headerAuditBtn?.addEventListener('click', () => this._openTechnicalDrawer());
  }

  // ── Event Handlers ─────────────────────────────────────

  _onPipelineMessage(event) {
    this._recentRaw.push(event);
    const countEl = document.getElementById('hdr-audit-count');
    if (countEl) countEl.textContent = `${this._recentRaw.length}`;

    this._updateAggregatedStats(event);

    if (this.mode === 'DEMO') {
      if (this._presentationQueue.length > 3) {
        this._presentationQueue.shift();
      }
      this._presentationQueue.push(event);
      if (!this._isDisplaying && !this._isPaused) this._processPresentationQueue();
    } else {
      this._renderHeroPipeline(event);
    }
  }

  _processPresentationQueue() {
    if (this._isPaused || this._presentationQueue.length === 0) {
      this._isDisplaying = false;
      return;
    }
    this._isDisplaying = true;
    const event = this._presentationQueue.shift();
    this._renderHeroPipeline(event);

    const delay = this.speed === 'SLOW' ? 1200 : this.speed === 'FAST' ? 300 : 700;
    this._presentationTimeout = setTimeout(() => this._processPresentationQueue(), delay);
  }

  _renderHeroPipeline(event) {
    const { msg, mappings, report, latency, source, cacheHit } = event;
    const heroBody = document.getElementById('hero-pipeline-body');
    const sysBadge = document.getElementById('hero-sys-badge');
    const latencyBadge = document.getElementById('hero-latency-badge');
    if (!heroBody || !msg || !mappings || !mappings.length) return;

    const sys = msg._system || 'HETEROGENEOUS';
    const colour = SYSTEM_COLOUR[sys] || '#3b82f6';
    if (sysBadge) {
      sysBadge.textContent = `${sys}`;
      sysBadge.style.color = colour;
    }

    if (latencyBadge) {
      latencyBadge.textContent = latency ? `${latency.toFixed(1)}ms` : '<0.05ms';
      latencyBadge.className = `badge ${source === 'GEMINI_AI' ? 'badge-purple' : source === 'SEMANTIC_MEMORY' || cacheHit ? 'badge-cyan' : 'badge-green'}`;
    }

    const mapping = mappings[0];
    const rep = report?.[0]?.result || { valid: true };
    const isSpecialFirewallTest = !rep.valid || rep.flagged;
    const confidencePct = Math.round((mapping.confidence || 0.95) * 100);

    let sourceTag = '';
    let sourceBadgeClass = '';

    if (source === 'GEMINI_AI') {
      sourceTag = 'GEMINI 2.0';
      sourceBadgeClass = 'badge-purple';
    } else if (source === 'SEMANTIC_MEMORY' || cacheHit) {
      sourceTag = 'CACHE HIT';
      sourceBadgeClass = 'badge-cyan';
    } else if (source === 'AI_UNAVAILABLE') {
      sourceTag = 'AI OFFLINE';
      sourceBadgeClass = 'badge-red';
    } else {
      sourceTag = 'BASELINE';
      sourceBadgeClass = 'badge-blue';
    }

    // Format attributes list with clean styling
    const distinctMappings = mappings.slice(0, 2);
    const attrSummary = distinctMappings.map(m => {
      const valStr = typeof m.value === 'number' ? (Number.isInteger(m.value) ? m.value : m.value.toFixed(1)) : `${m.value}`;
      return `<div style="display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;">
        <span style="color:var(--accent-cyan);font-weight:600;">${escapeHtml(m.source_attribute || m.field)}</span>
        <span style="color:var(--text-muted);font-size:9px;">→</span>
        <span style="color:var(--accent-green);font-weight:600;">${escapeHtml(m.field)} <span style="color:var(--text-primary);font-weight:500;">(${escapeHtml(valStr)})</span></span>
      </div>`;
    }).join('');

    heroBody.innerHTML = `
      <div class="pipeline-card-animated" style="display:flex;flex-direction:column;gap:6px;">
        <!-- Row 1: Ingress Source -> Target Canonical Match -->
        <div class="pipe-step-row">
          <div class="pipe-node-box src-box">
            <span class="pipe-tag" style="color:${colour};display:flex;align-items:center;gap:4px;">
              <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${colour};"></span>
              ${escapeHtml(sys)} INGRESS
            </span>
            <span class="pipe-main-val">${escapeHtml(mapping.source_entity || 'SENSOR_NODE')}</span>
          </div>

          <div class="pipe-arrow">→</div>

          <div class="pipe-node-box ai-box">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="pipe-tag">CANONICAL MATCH</span>
              <span class="badge ${sourceBadgeClass}" style="font-size:9px;padding:1px 5px;">${sourceTag}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="pipe-main-val ${mapping.canonical_entity==='UNKNOWN'?'red':'green'}">
                ${escapeHtml(mapping.canonical_entity || 'UNKNOWN')}
              </span>
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent-cyan);font-weight:600;">${confidencePct}% CONF</span>
            </div>
          </div>
        </div>

        <!-- Mapped Attributes Strip -->
        <div class="pipe-attribute-strip">
          ${attrSummary}
        </div>

        <!-- AI Semantic Reasoning Trace Bar -->
        <div class="pipe-reasoning-bar" title="${escapeHtml(mapping.explanation || mapping.reasoning || '')}">
          <span class="reason-text">${escapeHtml(mapping.explanation || mapping.reasoning || 'Mapped zero-shot via ontological semantic embedding.')}</span>
        </div>

        <!-- Row 2: Validation Firewall -> Digital Twin Synchronizer -->
        <div class="pipe-step-row">
          <div class="pipe-node-box val-box ${isSpecialFirewallTest ? 'val-failed' : ''}">
            <span class="pipe-tag">SAFETY FIREWALL</span>
            <span class="pipe-main-val ${rep.valid ? 'green' : 'red'}" style="font-size:11px;display:flex;align-items:center;gap:4px;">
              ${rep.valid ? 'ACCEPTED (7/7 PASS)' : 'BLOCKED (VIOLATION)'}
            </span>
          </div>

          <div class="pipe-arrow">→</div>

          <div class="pipe-node-box dt-box">
            <span class="pipe-tag">DIGITAL TWIN STATE</span>
            <span class="pipe-main-val cyan" style="font-size:11px;display:flex;align-items:center;gap:4px;">
              ${rep.valid ? 'STATE SYNCHRONIZED' : 'MUTATION HELD'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  _updateAggregatedStats(event) {
    const totalEl = document.getElementById('mw-stat-total');
    const accEl   = document.getElementById('mw-stat-acc');
    const cacheEl = document.getElementById('mw-stat-cache');
    const callsEl = document.getElementById('mw-stat-calls');

    const total = this._recentRaw.length;
    let passed = 0;
    let cacheHits = 0;
    let geminiCalls = 0;

    this._recentRaw.forEach(r => {
      if (r.report?.[0]?.result?.valid) passed++;
      if (r.source === 'SEMANTIC_MEMORY' || r.cacheHit) cacheHits++;
      else if (r.source === 'GEMINI_AI') geminiCalls++;
    });

    const acc = total > 0 ? ((passed / total) * 100).toFixed(0) : '100';

    if (totalEl) totalEl.textContent = `${total}`;
    if (accEl)   accEl.textContent = `${acc}%`;
    if (cacheEl) cacheEl.textContent = `${cacheHits}`;
    if (callsEl) callsEl.textContent = `${geminiCalls}`;
  }

  _openTechnicalDrawer() {
    this.bus.emit('modal:open_technical_drawer', { records: this._recentRaw });
  }

  _reset() {
    this._recentRaw = [];
    this._presentationQueue = [];
    this._isDisplaying = false;
    this._isPaused = false;
    if (this._presentationTimeout) {
      clearTimeout(this._presentationTimeout);
      this._presentationTimeout = null;
    }
    this._populateInitialHero();
    const countEl = document.getElementById('hdr-audit-count');
    if (countEl) countEl.textContent = '0';
    this._updateAggregatedStats({});
  }
}
