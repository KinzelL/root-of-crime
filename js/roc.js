/* ROOT OF CRIME – wasm kernel bridge.
   When pkg/roc_wasm.js exists the Motif desk talks to roc-kernel.
   Otherwise every call is a no-op and the JS engine stays in charge. */

var Roc = {
  live: false,
  desk: null,
  ready: Promise.resolve(false),
  SAVE_KEY: 'roc_kernel_v1',

  available() {
    try {
      return typeof fetch === 'function'
        && typeof document !== 'undefined'
        && !!(document.body && document.body.tagName);
    } catch {
      return false;
    }
  },

  usesKernel() {
    return !!(this.live && this.desk);
  },

  boot() {
    if (!this.available()) {
      this.ready = Promise.resolve(false);
      return this.ready;
    }
    const url = 'pkg/roc_wasm.js';
    this.ready = import(url)
      .then(async (mod) => {
        if (typeof mod.default === 'function') await mod.default();
        const Desk = mod.Desk;
        if (!Desk) throw new Error('no Desk export');
        this.desk = new Desk();
        this.live = true;
        try {
          const raw = typeof localStorage !== 'undefined' && localStorage.getItem(this.SAVE_KEY);
          if (raw) this.desk.loadJson(raw);
        } catch {
          /* empty / bad save */
        }
        return true;
      })
      .catch(() => {
        this.live = false;
        this.desk = null;
        return false;
      });
    return this.ready;
  },

  persist() {
    if (!this.usesKernel() || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.SAVE_KEY, this.desk.saveJson());
    } catch {
      /* quota */
    }
  },

  parse(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  workTicket(id) {
    return this.desk.workTicket(id);
  },

  hasTicket(id) {
    return this.tickets().some((t) => t.id === id);
  },

  run(line) {
    return this.parse(this.desk.runJson(line)) || { stdout: '', stderr: '', code: 1 };
  },

  pagerKey(key) {
    return this.parse(this.desk.pagerJson(key)) || { pager_active: false };
  },

  complete(line) {
    return this.parse(this.desk.completeJson(line)) || [];
  },

  monSnapshot() {
    const s = this.parse(this.desk.monJson()) || { rows: [], red: false, warn: false };
    const rows = (s.rows || []).map((r) => ({
      host: r.host,
      check: r.check,
      status: r.status,
      color: r.color,
      alert: r.alert,
      missionId: r.mission_id
    }));
    const mid = s.mission_id;
    return {
      rows,
      red: !!s.red,
      warn: !!s.warn,
      live: !!s.live,
      prevent: !!s.prevent,
      fix: !!s.fix,
      cleared: !!s.cleared,
      mission: (typeof Missions !== 'undefined' && mid) ? Missions.get(mid) : null
    };
  },

  monClear(host) {
    return this.desk.monClear(host);
  },

  closeTicket() {
    this.desk.closeTicket();
    this.persist();
  },

  tickets() {
    return this.parse(this.desk.ticketsJson()) || [];
  },

  tracker() {
    const rows = this.parse(this.desk.trackerJson()) || [];
    return rows.map((r) => {
      if (Array.isArray(r)) return { label: r[0], done: r[1] };
      return { label: r.label, done: !!r.done };
    });
  },

  completed() {
    return this.parse(this.desk.completedJson()) || [];
  },

  score() {
    return this.desk.score();
  },

  currentId() {
    return this.desk.currentId() || null;
  },

  host() {
    return this.desk.host();
  },

  cwd() {
    return this.desk.cwd();
  },

  prompt() {
    return this.desk.prompt();
  },

  toast() {
    return this.desk.toast();
  },

  intro() {
    return this.desk.intro();
  },

  saveJson() {
    return this.desk.saveJson();
  },

  loadJson(raw) {
    this.desk.loadJson(raw);
  },

  punchOut() {
    const report = this.parse(this.desk.punchOutJson()) || {};
    this.persist();
    return report;
  },

  reset() {
    this.desk.reset();
    this.persist();
  }
};

if (typeof document !== 'undefined') Roc.boot();
