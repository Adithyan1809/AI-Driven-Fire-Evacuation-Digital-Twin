/**
 * SENSOR PANEL
 *
 * Live Virtual IoT Sensor Dashboard — visualizes multi-system heterogeneous telemetry.
 * Displays synthetic sensor feeds (BMS, FAS, ENV_IOT, OCCUPANCY) with clear,
 * spacious cards, category filtering, and real-time status updates.
 */

import { BUILDING } from '../data/building.js';

const TYPE_ICON = {
  TEMPERATURE: 'TEMP',
  SMOKE:       'SMOKE',
  FIRE_ALARM:  'ALARM',
  OCCUPANCY:   'OCC'
};

const SYSTEM_TAG_STYLE = {
  BMS:       'background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);',
  FAS:       'background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);',
  ENV_IOT:   'background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.3);',
  OCCUPANCY: 'background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);',
};

export class SensorPanel {
  /**
   * @param {Object}   opts
   * @param {HTMLElement} opts.container
   * @param {EventBus} opts.bus
   */
  constructor({ container, bus }) {
    this.container    = container;
    this.bus          = bus;
    this._cards       = {};   // sensorId → { valueEl, cardEl, dotEl, statusTextEl }
    this._activeFilter = 'ALL';
    this._isSimActive = false;

    this._build();
    this.bus.on('sensors:update', e => this._onUpdate(e));
    this.bus.on('sim:start',      () => this._setSimActive(true));
    this.bus.on('sim:reset',      () => this._resetAll());
    this.bus.on('building:changed', () => this._build());
  }

  _setSimActive(active) {
    this._isSimActive = active;
    const statusText = active ? '● ACTIVE STREAM' : '○ READY';
    const statusColor = active ? 'var(--accent-green)' : 'var(--accent-cyan)';
    const statusEl = document.getElementById('sensor-stream-status');
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.style.color = statusColor;
    }
  }

  _build() {
    this.container.innerHTML = '';

    const sensors = BUILDING.sensors || [];
    const spaces = BUILDING.spaces || [];

    // ── 1. Category Filter Bar ──────────────────────────────
    const filterBar = document.createElement('div');
    filterBar.className = 'sensor-filter-bar';

    const protocols = ['ALL', 'BMS', 'FAS', 'OCCUPANCY', 'ENV_IOT'];
    protocols.forEach(proto => {
      const count = proto === 'ALL' ? sensors.length : sensors.filter(s => s.source_system === proto).length;
      if (proto !== 'ALL' && count === 0) return;

      const chip = document.createElement('button');
      chip.className = `sensor-filter-chip ${this._activeFilter === proto ? 'active' : ''}`;
      chip.textContent = `${proto === 'OCCUPANCY' ? 'OCC' : proto} (${count})`;
      chip.addEventListener('click', () => {
        this._activeFilter = proto;
        filterBar.querySelectorAll('.sensor-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this._applyFilter();
      });
      filterBar.appendChild(chip);
    });
    this.container.appendChild(filterBar);

    // ── 2. Summary Status Bar ───────────────────────────────
    const summaryBar = document.createElement('div');
    summaryBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(0,0,0,0.25);border:1px solid var(--border-primary);border-radius:var(--radius-sm);margin-bottom:6px;font-family:var(--font-mono);font-size:9px;';
    summaryBar.innerHTML = `
      <div>
        <span style="color:var(--text-muted)">CONFIGURED:</span>
        <strong style="color:var(--text-primary);margin-left:4px;">${sensors.length} SENSORS</strong>
      </div>
      <div>
        <span id="sensor-stream-status" style="color:var(--accent-cyan);font-weight:700;">○ READY</span>
      </div>
    `;
    this.container.appendChild(summaryBar);

    // ── 3. Sensor List Container ────────────────────────────
    const listContainer = document.createElement('div');
    listContainer.className = 'sensor-list-container';
    listContainer.id = 'sensor-items-wrapper';

    const grouped = {};
    sensors.forEach(s => {
      (grouped[s.room] = grouped[s.room] || []).push(s);
    });

    spaces.forEach(space => {
      const roomSensors = grouped[space.id];
      if (!roomSensors || roomSensors.length === 0) return;

      const groupEl = document.createElement('div');
      groupEl.dataset.room = space.id;
      groupEl.className = 'sensor-room-group';

      const header = document.createElement('div');
      header.className = 'sensor-room-header';
      header.innerHTML = `
        <span>${space.name}</span>
        <span style="font-size:8px;color:var(--text-muted);font-family:var(--font-mono)">${space.id}</span>
      `;
      groupEl.appendChild(header);

      roomSensors.forEach(sensor => {
        const card = document.createElement('div');
        card.className = 'sensor-card-compact';
        card.dataset.sensor = sensor.id;
        card.dataset.system = sensor.source_system || 'IoT';

        // Initial values based on type
        let baseVal = '—';
        let unitStr = '';
        if (sensor.type === 'TEMPERATURE') { baseVal = '27.4'; unitStr = '°C'; }
        else if (sensor.type === 'SMOKE') { baseVal = '0.01'; unitStr = 'AQI'; }
        else if (sensor.type === 'FIRE_ALARM') { baseVal = 'OK'; unitStr = ''; }
        else if (sensor.type === 'OCCUPANCY') { baseVal = '14'; unitStr = 'pax'; }

        // Left section
        const leftEl = document.createElement('div');
        leftEl.className = 'sensor-left';

        const iconEl = document.createElement('span');
        iconEl.className = 'sensor-type-icon';
        iconEl.textContent = TYPE_ICON[sensor.type] || '●';
        leftEl.appendChild(iconEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'sensor-meta';

        const idEl = document.createElement('span');
        idEl.className = 'sensor-id-text';
        idEl.textContent = sensor.id;
        metaEl.appendChild(idEl);

        const tagContainer = document.createElement('div');
        const tagEl = document.createElement('span');
        tagEl.className = 'sensor-protocol-tag';
        tagEl.setAttribute('style', SYSTEM_TAG_STYLE[sensor.source_system] || '');
        tagEl.textContent = sensor.source_system || 'IoT';
        tagContainer.appendChild(tagEl);
        metaEl.appendChild(tagContainer);

        leftEl.appendChild(metaEl);
        card.appendChild(leftEl);

        // Right section
        const rightEl = document.createElement('div');
        rightEl.className = 'sensor-right';

        const valEl = document.createElement('span');
        valEl.className = 'sensor-val-num';
        valEl.innerHTML = `${baseVal} <span style="font-size:8.5px;color:var(--text-muted);font-weight:400;">${unitStr}</span>`;
        rightEl.appendChild(valEl);

        const statusRow = document.createElement('div');
        statusRow.className = 'sensor-status-dot-row';

        const dotEl = document.createElement('span');
        dotEl.style.cssText = 'color:var(--accent-cyan);font-size:8px;';
        dotEl.textContent = '●';
        statusRow.appendChild(dotEl);

        const stText = document.createElement('span');
        stText.textContent = 'READY';
        statusRow.appendChild(stText);

        rightEl.appendChild(statusRow);
        card.appendChild(rightEl);

        groupEl.appendChild(card);

        this._cards[sensor.id] = {
          cardEl: card,
          valueEl: valEl,
          dotEl: dotEl,
          statusTextEl: stText,
          unitStr
        };
      });

      listContainer.appendChild(groupEl);
    });

    this.container.appendChild(listContainer);
    this._applyFilter();
  }

  _applyFilter() {
    const cards = this.container.querySelectorAll('.sensor-card-compact');
    cards.forEach(card => {
      const match = this._activeFilter === 'ALL' || card.dataset.system === this._activeFilter;
      card.style.display = match ? 'flex' : 'none';
    });

    // Hide empty room groups
    const groups = this.container.querySelectorAll('.sensor-room-group');
    groups.forEach(g => {
      const visibleCards = Array.from(g.querySelectorAll('.sensor-card-compact')).some(c => c.style.display !== 'none');
      g.style.display = visibleCards ? '' : 'none';
    });
  }

  _onUpdate({ readings }) {
    this._setSimActive(true);
    for (const [sensorId, data] of Object.entries(readings)) {
      const els = this._cards[sensorId];
      if (!els) continue;
      const { cardEl, valueEl, dotEl, statusTextEl, unitStr } = els;

      // Format live value
      let formattedVal = '';
      if (data.unit === 'bool') {
        formattedVal = data.value ? 'ALM' : 'OK';
      } else if (typeof data.value === 'number') {
        formattedVal = data.value < 1 && data.value > 0
          ? data.value.toFixed(3)
          : data.value.toFixed(1);
      } else {
        formattedVal = String(data.value);
      }

      valueEl.innerHTML = `${formattedVal} <span style="font-size:8.5px;color:var(--text-muted);font-weight:400;">${unitStr}</span>`;

      // Status styling
      cardEl.className = 'sensor-card-compact';
      if (data.status === 'CRITICAL' || data.value === true) {
        cardEl.classList.add('critical');
        valueEl.style.color = '#f87171';
        dotEl.style.color = '#ef4444';
        statusTextEl.textContent = 'CRITICAL';
      } else if (data.status === 'WARNING') {
        cardEl.classList.add('warning');
        valueEl.style.color = '#fbbf24';
        dotEl.style.color = '#f59e0b';
        statusTextEl.textContent = 'WARN';
      } else {
        cardEl.classList.add('active');
        valueEl.style.color = '#f8fafc';
        dotEl.style.color = '#10b981';
        statusTextEl.textContent = 'ACTIVE';
      }
    }
  }

  _resetAll() {
    this._setSimActive(false);
    Object.values(this._cards).forEach(({ cardEl, valueEl, dotEl, statusTextEl }) => {
      cardEl.className = 'sensor-card-compact';
      valueEl.style.color = '#f8fafc';
      dotEl.style.color = 'var(--accent-cyan)';
      statusTextEl.textContent = 'READY';
    });
  }
}
