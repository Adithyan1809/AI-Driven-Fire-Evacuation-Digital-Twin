/**
 * PAGE NAVIGATION CONTROLLER
 *
 * Manages zero-reload tab switching between:
 *   1. view-live-twin    (Main Control Room & Evacuation Simulation)
 *   2. view-sensor-fleet (Dedicated Virtual IoT Sensors Dashboard)
 *   3. view-ai-lab       (AI Semantic Interoperability & Firewall Playground)
 *   4. view-benchmarks   (Research Benchmarks & Comparative Analytics)
 */

export class PageNavigation {
  /**
   * @param {Object}   opts
   * @param {EventBus} opts.bus
   */
  constructor({ bus }) {
    this.bus = bus;
    this.currentView = 'view-live-twin';
    this._navTabs = {};
    this._views = {};

    this._init();
  }

  _init() {
    const tabIds = ['tab-live-twin', 'tab-sensor-fleet', 'tab-ai-lab', 'tab-benchmarks'];
    const viewIds = ['view-live-twin', 'view-sensor-fleet', 'view-ai-lab', 'view-benchmarks'];

    tabIds.forEach((tabId, idx) => {
      const viewId = viewIds[idx];
      const tabEl = document.getElementById(tabId);
      const viewEl = document.getElementById(viewId);

      if (tabEl && viewEl) {
        this._navTabs[viewId] = tabEl;
        this._views[viewId] = viewEl;

        tabEl.addEventListener('click', () => {
          this.switchView(viewId);
        });
      }
    });
  }

  switchView(targetViewId) {
    if (!this._views[targetViewId]) return;

    this.currentView = targetViewId;

    // Toggle tab active classes
    Object.entries(this._navTabs).forEach(([viewId, tabEl]) => {
      tabEl.classList.toggle('active', viewId === targetViewId);
    });

    // Toggle view visibility
    Object.entries(this._views).forEach(([viewId, viewEl]) => {
      if (viewId === targetViewId) {
        viewEl.style.display = 'grid';
        viewEl.classList.add('anim-fade-in');
      } else {
        viewEl.style.display = 'none';
        viewEl.classList.remove('anim-fade-in');
      }
    });

    this.bus.emit('navigation:view_changed', { viewId: targetViewId });
  }
}
