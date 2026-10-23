/**
 * EVENT TIMELINE & DETAIL DRAWER
 *
 * Clean, spacious, modern presentation timeline:
 *   1. Category Filter Chips (ALL, AI-MW, HAZARD, ROUTING, EVAC)
 *   2. Streamlined event history items with clean typography and category badges
 *   3. Human-paced queue (~1-3 events/sec in DEMO mode)
 */

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

export class EventLog {
  /**
   * @param {Object}      opts
   * @param {HTMLElement} opts.container
   * @param {EventBus}    opts.bus
   */
  constructor({ container, bus }) {
    this.container   = container;
    this.bus         = bus;
    this.activeFilter= 'ALL';
    this._history    = [];       // Array of event records
    this._currentSimTime = '00.0s';
    this._queue      = [];
    this._isDisplaying = false;
    this._isPaused   = false;
    this._queueTimeout = null;
    this._presMode   = 'DEMO';

    this._build();
    this._bindSubscribers();
    this._populateInitialEvents();
  }

  _onPause(paused) {
    this._isPaused = paused;
    if (paused) {
      if (this._queueTimeout) {
        clearTimeout(this._queueTimeout);
        this._queueTimeout = null;
      }
      this._isDisplaying = false;
    } else {
      if (!this._isDisplaying && this._queue.length > 0) {
        this._processQueue();
      }
    }
  }

  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;';

    // ── 1. Category Filter Bar (Fixed Sticky Top) ─────────────
    this._filterBar = document.createElement('div');
    this._filterBar.className = 'event-filter-bar';
    const filters = [
      { id: 'ALL', label: 'ALL' },
      { id: 'AI-MW', label: 'AI-MW' },
      { id: 'HAZARD', label: 'HAZARD' },
      { id: 'ROUTING', label: 'ROUTING' },
      { id: 'EVACUATION', label: 'EVAC' },
    ];
    filters.forEach(f => {
      const btn = document.createElement('button');
      btn.className = `filter-btn ${f.id === 'ALL' ? 'active' : ''}`;
      btn.textContent = f.label;
      btn.dataset.filter = f.id;
      btn.addEventListener('click', () => this._setFilter(f.id));
      this._filterBar.appendChild(btn);
    });
    this.container.appendChild(this._filterBar);

    // ── 2. Event History List (Fills Remaining Height) ─────────
    this._historyContainer = document.createElement('div');
    this._historyContainer.className = 'event-history-list';
    this.container.appendChild(this._historyContainer);
  }

  _populateInitialEvents() {
    const initialEvents = [
      {
        tag: 'system',
        cat: 'SYSTEM',
        title: 'Building Geometry & Topology Loaded',
        sub: '12 architectural spaces, 19 graph junctions, 3 egress exits.',
        timeStr: '00.0s',
        priority: 'normal'
      },
      {
        tag: 'sensor',
        cat: 'SENSORS',
        title: 'Virtual IoT Sensors Synchronized',
        sub: '21 virtual sensors configured across BMS, FAS, ENV_IOT, and OCC.',
        timeStr: '00.0s',
        priority: 'normal'
      },
      {
        tag: 'ai',
        cat: 'AI-MW',
        title: 'AI Semantic Middleware Online',
        sub: 'Zero-shot Gemini interoperability engine and Semantic Memory cache ready.',
        timeStr: '00.0s',
        priority: 'important'
      },
      {
        tag: 'dt',
        cat: 'SYSTEM',
        title: 'Digital Twin Unified State Active',
        sub: 'Baseline state synchronized for all 12 spaces. 50 occupants standing by.',
        timeStr: '00.0s',
        priority: 'important'
      },
    ];

    initialEvents.forEach(evt => this._addHistoryItem(evt, false));
    this._updateCounter();
  }

  _bindSubscribers() {
    this.bus.on('sim:tick', ({ time }) => {
      this._currentSimTime = `${time.toFixed(1)}s`;
    });

    this.bus.on('presentation:mode', ({ mode }) => {
      this._presMode = mode;
    });

    this.bus.on('sim:pause', ({ paused }) => this._onPause(paused));
    this.bus.on('sim:complete', () => this._onPause(true));

    this.bus.on('sim:start', () => {
      this._enqueueEvent({
        tag: 'system',
        cat: 'SYSTEM',
        title: 'Simulation Started',
        sub: 'Sensor streams transmitting real-time telemetry.',
        priority: 'important',
      });
    });

    this.bus.on('sim:fire_trigger', ({ room, time }) => {
      this._enqueueEvent({
        tag: 'fire',
        cat: 'HAZARD',
        title: `FIRE DETECTED IN ${room}`,
        sub: `Critical thermal anomaly. Fire Alarm System triggered in ${room}.`,
        priority: 'critical',
        time,
      });
    });

    this.bus.on('mw:pipeline_complete', (event) => {
      const mapping = event.mappings?.[0];
      const isFirewallHeld = event.report?.some(r => !r.result.valid);

      // Only add to main Incident Timeline if it is a deliberate test injection or unexpected critical firewall event
      if (event.testType || (isFirewallHeld && event.testType)) {
        this._enqueueEvent({
          tag: isFirewallHeld ? 'firewall_held' : 'ai_resolve',
          cat: 'AI-MW',
          title: isFirewallHeld
            ? `Safety Firewall: Invalid Payload Held`
            : `AI Mapped: ${mapping?.source_entity || 'Sensor'} → ${mapping?.canonical_entity || 'Space'}`,
          sub: isFirewallHeld
            ? (event.report?.[0]?.result?.reason || 'Violated physical safety invariant.')
            : (mapping?.explanation || `Resolved via zero-shot semantic mapping (${event.latency}ms).`),
          priority: isFirewallHeld ? 'critical' : 'normal',
          rawEvent: event
        });
      }
    });

    this.bus.on('hazard:level_change', ({ entityId, room, next: nextLevel, level }) => {
      const targetRoom = entityId || room;
      const targetLevel = nextLevel || level;
      if (targetLevel === 'CRITICAL' || targetLevel === 'BLOCKED') {
        this._enqueueEvent({
          tag: 'hazard',
          cat: 'HAZARD',
          title: `Hazard Level ${targetLevel}: ${targetRoom}`,
          sub: `Environmental sensors detected severe conditions in ${targetRoom}.`,
          priority: 'critical',
        });
      }
    });

    this.bus.on('routes:calculated', ({ routes, elapsed_ms }) => {
      const redirectedCount = Object.values(routes).filter(r => r && r.status === 'REDIRECTED').length;
      if (redirectedCount > 0) {
        this._enqueueEvent({
          tag: 'routing',
          cat: 'ROUTING',
          title: `Dynamic Egress Reroute Triggered`,
          sub: `${redirectedCount} spaces recalculated optimal exit paths avoiding hazard (${elapsed_ms.toFixed(1)}ms).`,
          priority: 'important',
        });
      }
    });

    this.bus.on('hazard:prediction_escalated', ({ spaceId, newPrediction, probability, horizon, reasons }) => {
      this._enqueueEvent({
        tag: 'hazard_prediction',
        cat: 'HAZARD',
        title: `ML Hazard Forecast: ${spaceId} — ${newPrediction.replace('_', ' ')}`,
        sub: `Model forecast: ${(probability * 100).toFixed(0)}% risk within ${horizon}s. ${reasons && reasons[0] ? reasons[0] : ''}`,
        priority: newPrediction === 'PREDICTED_CRITICAL' ? 'critical' : 'important',
      });
    });

    this.bus.on('route:proactive_reroute', ({ occupantId, spaceId, oldExit, newExit, predictedRisk, horizon, reason, safetyScore }) => {
      this._enqueueEvent({
        tag: 'proactive_reroute',
        cat: 'ROUTING',
        title: `Proactive Reroute: Agent ${occupantId}`,
        sub: `Selected: ${newExit || 'Secondary Exit'} (Safety Score: ${safetyScore || 85}/100) | Avoided: ${spaceId} (${(predictedRisk * 100).toFixed(0)}% risk in ${horizon || 15}s)`,
        priority: 'critical',
      });
    });

    this.bus.on('occupants:all_evacuated', (payload = {}) => {
      const count = payload.count ?? 50;
      const total = payload.total ?? 50;
      const trapped = payload.trapped ?? 0;
      const subText = trapped > 0
        ? `${count}/${total} occupants evacuated safely (${trapped} trapped by fire).`
        : `All ${count}/${total} occupants reached assembly exit areas safely.`;

      this._enqueueEvent({
        tag: 'evac',
        cat: 'EVACUATION',
        title: `Evacuation Complete`,
        sub: subText,
        priority: 'important',
      });
    });

    this.bus.on('occupants:evacuated', (payload = {}) => {
      if (payload.count !== undefined && payload.total !== undefined) {
        this._enqueueEvent({
          tag: 'evac',
          cat: 'EVACUATION',
          title: `Occupant Egress Milestone`,
          sub: `${payload.count}/${payload.total} occupants safely evacuated.`,
          priority: 'normal',
        });
      }
    });

    this.bus.on('sim:start', () => { this._isPaused = false; });
    this.bus.on('sim:reset', () => this._reset());
  }

  _enqueueEvent(evt) {
    if (this._presMode === 'FAST') {
      this._addHistoryItem(evt, true);
    } else {
      this._queue.push(evt);
      if (!this._isDisplaying && !this._isPaused) this._processQueue();
    }
  }

  _processQueue() {
    if (this._isPaused || this._queue.length === 0) {
      this._isDisplaying = false;
      return;
    }
    this._isDisplaying = true;
    const evt = this._queue.shift();
    this._addHistoryItem(evt, true);
    this._queueTimeout = setTimeout(() => this._processQueue(), 500);
  }

  _setFilter(filterId) {
    this.activeFilter = filterId;
    const btns = this._filterBar.querySelectorAll('.filter-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.filter === filterId));

    const items = this._historyContainer.querySelectorAll('.event-item');
    items.forEach(item => {
      const cat = item.dataset.cat;
      const match = filterId === 'ALL' || cat === filterId;
      item.style.display = match ? 'flex' : 'none';
    });
  }

  _updateCounter() {
    const counterEl = document.getElementById('timeline-counter');
    if (counterEl) {
      counterEl.textContent = `${this._history.length} events`;
    }
  }

  _addHistoryItem(evt, prepend = true) {
    const timeStr = evt.timeStr || (evt.time !== undefined ? `${evt.time.toFixed(1)}s` : this._currentSimTime);
    this._history.push({ ...evt, timeStr });
    this._updateCounter();

    const item = document.createElement('div');
    const isCritical  = evt.priority === 'critical';
    const isImportant = evt.priority === 'important';
    item.className = `event-item ${isCritical ? 'critical' : isImportant ? 'important' : ''}`;
    item.dataset.cat = evt.cat || 'SYSTEM';

    // Category badge class — no emoji
    let catBadgeClass = 'badge-blue';
    let dotClass = '';
    if (evt.cat === 'HAZARD')     { catBadgeClass = 'badge-red';    dotClass = 'tl-dot--critical'; }
    else if (evt.cat === 'AI-MW') { catBadgeClass = 'badge-purple'; dotClass = 'tl-dot--ai'; }
    else if (evt.cat === 'ROUTING')    { catBadgeClass = 'badge-cyan';  dotClass = 'tl-dot--routing'; }
    else if (evt.cat === 'EVACUATION') { catBadgeClass = 'badge-green'; dotClass = 'tl-dot--success'; }

    item.innerHTML = `
      <div class="tl-time">${escapeHtml(timeStr)}</div>
      <div class="tl-dot ${dotClass}"></div>
      <div class="tl-body">
        <div class="tl-title" style="font-size:11px;font-weight:600;color:var(--text-primary);line-height:1.3;">${escapeHtml(evt.title)}</div>
        ${evt.sub ? `<div class="tl-sub" style="font-size:10px;color:var(--text-muted);margin-top:1px;line-height:1.3;">${escapeHtml(evt.sub)}</div>` : ''}
      </div>
    `;

    if (evt.rawEvent) {
      item.style.cursor = 'pointer';
      item.title = 'Click to view raw JSON telemetry record';
      item.addEventListener('click', () => {
        this.bus.emit('modal:open_technical_drawer', { records: [evt.rawEvent] });
      });
    }

    if (prepend && this._historyContainer.firstChild) {
      this._historyContainer.insertBefore(item, this._historyContainer.firstChild);
    } else {
      this._historyContainer.appendChild(item);
    }

    // Keep DOM clean by limiting visible items to 50
    while (this._historyContainer.children.length > 50) {
      this._historyContainer.removeChild(this._historyContainer.lastChild);
    }

    // Apply active filter
    if (this.activeFilter !== 'ALL' && evt.cat !== this.activeFilter) {
      item.style.display = 'none';
    }
  }

  _reset() {
    this._history = [];
    this._queue = [];
    this._isDisplaying = false;
    this._isPaused = false;
    this._currentSimTime = '00.0s';
    if (this._queueTimeout) {
      clearTimeout(this._queueTimeout);
      this._queueTimeout = null;
    }
    this._historyContainer.innerHTML = '';
    this._populateInitialEvents();
  }
}
