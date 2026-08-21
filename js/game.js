/* ============================================================
   ROOT OF CRIME – Game Shell
   ============================================================ */

const STORAGE_KEY = 'roc_save_v1';

var Game = {
  state: {
    currentScreen: 'title',
    completed: [],
    currentMissionId: null,
    score: 0,
    hintsUsed: 0,
    missionHints: 0,
    settings: { crt: true, sound: true },
    seenBriefing: false,
    shiftDay: 0,
    shiftMin: 8 * 60,
    shiftClosed: [],
    shiftScore: 0,
    shiftHints: 0,
    shiftLog: [],
    shiftJobs: [],
    jobSeq: 0
  },

  els: {},

  init() {
    this._load();
    this._cacheElements();
    this._applySettings();
    if (typeof Infra !== 'undefined') Infra.boot();
    Terminal.init();
    this._buildClockFace();
    this._renderDesktopIcons();
    this._updateChrome();
    this._paintXload();
    this._startClock();
    this._bindKeys();
    this._bindDesktop();
    if (this.winBindAll) this.winBindAll();
    this._startMailLoop();
    if (typeof Roc !== 'undefined' && Roc.ready) {
      Promise.resolve(Roc.ready).then(() => {
        if (this._kernel()) {
          this._syncFromKernel();
          this._updateChrome();
        }
      });
    }
  },

  _kernel() {
    return typeof Roc !== 'undefined' && Roc.usesKernel();
  },

  _syncFromKernel() {
    if (!this._kernel()) return;
    this.state.completed = Roc.completed();
    this.state.score = Roc.score();
    this.state.currentMissionId = Roc.currentId();
    const save = Roc.parse(Roc.saveJson()) || {};
    if (save.hints_used != null) this.state.hintsUsed = save.hints_used;
    if (save.shift_day != null) this.state.shiftDay = save.shift_day;
    if (save.shift_min != null) this.state.shiftMin = save.shift_min;
    if (save.seen_briefing != null) this.state.seenBriefing = save.seen_briefing;
    if (typeof Terminal !== 'undefined') {
      Terminal.host = Roc.host();
      Terminal.cwd = Roc.cwd();
      Terminal.missionId = this.state.currentMissionId;
      if (Terminal.promptEl) Terminal.promptEl.textContent = Roc.prompt();
    }
    Roc.persist();
  },

  start() {
    if (typeof Roc !== 'undefined' && Roc.available && Roc.available() && !Roc.usesKernel()) {
      Promise.resolve(Roc.ready).then(() => this._startNow());
      return;
    }
    this._startNow();
  },

  _startNow() {
    if (this._kernel()) this._syncFromKernel();
    this._play('boot');
    this.showScreen('boot');
    this._runBoot(() => {
      this._arriveDesktop();
      if (!this.state.seenBriefing) this._showWelcome();
    });
  },

  /* ---------- Persistence ---------- */
  _defaultState() {
    return {
      currentScreen: 'title',
      completed: [],
      currentMissionId: null,
      score: 0,
      hintsUsed: 0,
      missionHints: 0,
      settings: { crt: true, sound: true },
      seenBriefing: false,
      shiftDay: 0,
      shiftMin: 8 * 60,
      shiftClosed: [],
      shiftScore: 0,
      shiftHints: 0,
      shiftLog: [],
      shiftJobs: [],
      jobSeq: 0
    };
  },

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.state = { ...this._defaultState(), ...saved, currentScreen: 'title', currentMissionId: null };
      this.state.settings = { crt: true, sound: true, ...(saved.settings || {}) };
      this._hydrateJobs();
      if (saved.shiftDay == null || saved.shiftMin == null) this._inferShift();
      this._ensureJobs();
    } catch {
      this.state = this._defaultState();
    }
  },

  _save() {
    const { currentScreen, currentMissionId, ...rest } = this.state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    if (this._kernel()) Roc.persist();
  },

  resetProgress() {
    const settings = this.state.settings;
    if (typeof Missions !== 'undefined' && Missions.forgetJobs) Missions.forgetJobs();
    if (this._kernel()) Roc.reset();
    this.state = this._defaultState();
    this.state.settings = settings;
    this.iconifyClient('win-xterm', true);
    this.iconifyClient('win-brief', true);
    this.iconifyClient('win-virt', true);
    this.iconifyClient('win-timeclock', true);
    document.title = 'ROOT OF CRIME';
    this._save();
    if (typeof Infra !== 'undefined') Infra.reboot();
    this.ensureDeskShell();
    this._updateChrome();
    this.closeClient('win-prefs', true);
    this._showWelcome();
    this.toast('Progress wiped. You are a recruit again.');
  },

  _arriveDesktop() {
    if (typeof Infra !== 'undefined') Infra.boot();
    this.ensureDeskShell();
    this.showScreen('desktop');
    this.openTimeclock();
  },

  /* ---------- Screens ---------- */
  showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`screen-${name}`)?.classList.add('active');
    this.state.currentScreen = name;
    const bar = document.getElementById('taskbar');
    const showBar = name === 'desktop';
    if (bar) bar.hidden = !showBar;
    document.body.classList.toggle('has-taskbar', showBar);
    if (name === 'desktop') this._updateChrome();
    else this._renderTaskbar();
  },

  openOverlay(id) {
    document.querySelectorAll('.overlay').forEach((el) => {
      if (el.id === id) return;
      if (id === 'epilogue-overlay' && el.id === 'success-overlay') return;
      el.classList.remove('active');
    });
    document.getElementById(id)?.classList.add('active');
    this._renderTaskbar();
  },

  closeOverlay(id) {
    document.getElementById(id)?.classList.remove('active');
    this._renderTaskbar();
  },

  closeTopOverlay() {
    const order = [
      'shift-report', 'success-overlay', 'epilogue-overlay', 'welcome-overlay'
    ];
    for (const id of order) {
      const el = document.getElementById(id);
      if (el?.classList.contains('active')) {
        if (id === 'shift-report') {
          this.logOff();
          return true;
        }
        el.classList.remove('active');
        this._renderTaskbar();
        return true;
      }
    }
    return false;
  },

  backToDesktop() {
    if (document.getElementById('shift-report')?.classList.contains('active')) {
      this.logOff();
      return;
    }
    this.closeOverlay('success-overlay');
    this.closeOverlay('epilogue-overlay');
    this.closeOverlay('welcome-overlay');
    this._withdrawDeskApps();
    this.state.currentMissionId = null;
    this.iconifyClient('win-brief', true);
    this.iconifyClient('win-virt', true);
    this.iconifyClient('win-timeclock', true);
    document.title = 'ROOT OF CRIME';
    this.showScreen('desktop');
    this._play('click');
  },

  /* ---------- Desktop ---------- */
  _desktopAction(action) {
    this._play('click');
    this._hideRootMenu();
    if (action === 'netmoth' || action === 'netscape') this.openNetmoth();
    else if (action === 'timeclock') this.openTimeclock();
    else if (action === 'xterm') this.openXterm();
    else if (action === 'mail') this.openClient('win-xmessage');
    else if (action === 'xclock') this.openClient('win-xclock');
    else if (action === 'xeyes') this.openClient('win-xeyes');
    else if (action === 'xload') this.openClient('win-xload');
    else if (action === 'xbiff') this.openClient('win-status');
    else if (action === 'xconsole') this.openClient('win-xconsole');
    else if (action === 'missions') this.openMissionBoard();
    else if (action === 'case') this.openCaseFile();
    else if (action === 'manual') this.openManual();
    else if (action === 'notes') this.openNotes();
    else if (action === 'radio') this.openRadio();
    else if (action === 'settings') this.openSettings();
    else if (action === 'welcome') this.openWalkthrough();
    else if (action === 'logoff') this.logOffOrPunch();
    else if (action === 'restart') this._restartTwm();
  },

  _showWelcome() {
    this.state.seenBriefing = true;
    this._save();
    this.showWelcomePage();
    this.openOverlay('welcome-overlay');
  },

  showWelcomePage() {
    this._welcomePage = 'hello';
    this._paintWelcome();
  },

  openWalkthrough() {
    this._welcomePage = 'walk';
    this._paintWelcome();
    this.openOverlay('welcome-overlay');
    this._play('click');
  },

  dismissWelcome() {
    this.closeOverlay('welcome-overlay');
    this._play('click');
  },

  _paintWelcome() {
    const hello = document.getElementById('welcome-view');
    const walk = document.getElementById('walkthrough-view');
    const bar = document.getElementById('welcome-title-bar');
    const walkOn = this._welcomePage === 'walk';
    if (hello) hello.hidden = walkOn;
    if (walk) walk.hidden = !walkOn;
    if (bar) {
      bar.textContent = walkOn
        ? 'xmessage — CASE SLIP // HELP'
        : 'xmessage — CASE SLIP // DAY 1';
    }
  },

  _restartTwm() {
    this.toast('twm: another window manager is already running');
    this._paintXload();
  },

  dismissGadget(id) {
    document.getElementById(id)?.remove();
    if (this.state.focusedWin === id) this.state.focusedWin = null;
    this._renderTaskbar();
  },

  rank() {
    const camp = typeof Missions !== 'undefined' && Missions.campaign
      ? Missions.campaign()
      : [];
    const n = camp.filter((m) => (this.state.completed || []).includes(m.id)).length;
    let name = RANKS[0].name;
    RANKS.forEach((r) => { if (n >= r.min) name = r.name; });
    return name;
  },

  _updateChrome() {
    const camp = Missions.campaign ? Missions.campaign() : Missions.list();
    const total = camp.length;
    const done = camp.filter((m) => this.state.completed.includes(m.id)).length;
    if (this.els.progress) this.els.progress.textContent = `CASES ${done}/${total}`;
    if (this.els.rank) this.els.rank.textContent = this.rank();
    if (this.els.score) this.els.score.textContent = `SCORE ${this.state.score}`;
    this._paintShiftClock();
    this._renderDesktopIcons();
    this._paintConsole();
    this._paintXmessage();
    this._paintXbiffAlert();
    if (typeof Virt !== 'undefined' && Virt.page !== 'guest') Virt.paint();
    const clock = document.getElementById('win-timeclock');
    if (clock && !clock.classList.contains('iconified') && (this._shiftView || 'status') === 'status') {
      this._paintTimeclock();
    }
    this._renderTaskbar();
  },

  _paintXbiffAlert() {
    const el = document.getElementById('xbiff-alert');
    if (!el) return;
    const snap = typeof Mon !== 'undefined' ? Mon.snapshot() : { red: false, warn: false };
    if (snap.red) {
      el.textContent = 'mon: CRITICAL';
      el.className = 'xbiff-crit';
    } else if (snap.warn) {
      el.textContent = 'mon: UNACK';
      el.className = 'xbiff-warn';
    } else {
      el.textContent = 'mon: OK';
      el.className = 'xbiff-ok';
    }
  },

  _ensureShift() {
    if (!Number.isFinite(this.state.shiftDay)) this.state.shiftDay = 0;
    if (!Number.isFinite(this.state.shiftMin)) this.state.shiftMin = Missions.SHIFT_START;
  },

  _inferShift() {
    const done = this.state.completed || [];
    for (let d = 0; d <= 3; d++) {
      if (Missions.todayWork(done, d).length) {
        this.state.shiftDay = d;
        this.state.shiftMin = Missions.SHIFT_START;
        return;
      }
    }
    if (Missions.campaignDone(done)) {
      this.state.shiftDay = 4;
      this.state.shiftMin = Missions.SHIFT_START;
      return;
    }
    this.state.shiftDay = 3;
    this.state.shiftMin = Missions.SHIFT_END;
  },

  _hydrateJobs() {
    if (typeof Missions === 'undefined' || !Missions.spawnJob) return;
    (this.state.shiftJobs || []).forEach((rec) => {
      if (rec && rec.id && !Missions.get(rec.id)) Missions.spawnJob(rec.template, rec);
    });
  },

  _ensureJobs() {
    this._ensureShift();
    this._hydrateJobs();
    if (typeof Missions === 'undefined' || !Missions.campaignDone) return;
    if (!Missions.campaignDone(this.state.completed)) return;
    const day = this.state.shiftDay;
    if (day < 4) return;
    const have = Missions.todayWork(this.state.completed, day).length;
    const need = Math.max(0, 2 - have);
    if (!need) return;
    const picks = Missions.jobPick(day);
    this.state.shiftJobs = this.state.shiftJobs || [];
    this.state.jobSeq = this.state.jobSeq || 0;
    for (let i = 0; i < need; i++) {
      const template = picks[i];
      if (!template || !Missions.templates[template]) continue;
      this.state.jobSeq += 1;
      const rec = {
        id: template + '-' + day + '-' + this.state.jobSeq,
        template,
        seed: day * 17 + this.state.jobSeq,
        shiftDay: day,
        seq: this.state.jobSeq
      };
      this.state.shiftJobs.push(rec);
      Missions.spawnJob(template, rec);
    }
  },

  _shiftWhen() {
    this._ensureShift();
    return this.state.shiftDay * 1440 + this.state.shiftMin;
  },

  shiftStamp(long) {
    return this._mailStamp(this._shiftWhen(), long);
  },

  _shiftWork() {
    this._ensureShift();
    this._ensureJobs();
    if (this._kernel()) {
      return Roc.tickets()
        .filter((t) => !t.done && t.unlocked && t.today)
        .map((t) => Missions.get(t.id) || { id: t.id, title: t.title, act: 0 });
    }
    return Missions.todayWork(this.state.completed, this.state.shiftDay);
  },

  _clockTicket(mission) {
    this._ensureShift();
    this.state.shiftMin += Missions.ticketMinutes(mission);
  },

  openTimeclock() {
    if (this._shiftView === 'confirm') this._shiftView = 'status';
    if (this._shiftView === 'summary') this._shiftView = 'status';
    this._paintTimeclock();
    this._raiseTimeclock();
    this._play('click');
  },

  _raiseTimeclock() {
    const win = document.getElementById('win-timeclock');
    if (!win) return;
    this._raiseWindow(win);
    this._placeTimeclockWindow();
  },

  _placeTimeclockWindow() {
    const win = document.getElementById('win-timeclock');
    if (!win || win.classList.contains('iconified') || win.classList.contains('x-sized')) return;
    if (typeof window !== 'undefined' && window.innerWidth < 820) {
      win.style.left = '8px';
      win.style.right = '8px';
      win.style.width = 'auto';
      win.style.top = '8px';
      return;
    }
    win.style.right = 'auto';
    win.style.top = '56px';
    win.style.left = '240px';
  },

  _setTimeclockLed(when) {
    const led = document.getElementById('timeclock-led');
    if (!led) return;
    const stamp = Number.isFinite(when) ? this._mailStamp(when, true) : this.shiftStamp(true);
    led.textContent = stamp.replace(/:00 2026$/, '').replace(/ 2026$/, '');
  },

  _closeId(row) {
    return typeof row === 'string' ? row : (row && row.id);
  },

  _scoreStub(closed, extra) {
    const rows = closed || [];
    let jobs = 0;
    let clean = 0;
    rows.forEach((row) => {
      if (!row || typeof row === 'string') return;
      jobs += row.pay || 0;
      clean += row.clean || 0;
    });
    const hints = extra && extra.hints != null ? extra.hints : (this.state.shiftHints || 0);
    const hintCost = hints * Missions.HINT_COST;
    const ontime = extra && extra.ontime ? extra.ontime : 0;
    return {
      jobs,
      clean,
      hints,
      hintCost,
      ontime,
      net: jobs + clean + ontime - hintCost
    };
  },

  _scoreStubHtml(stub) {
    const line = (label, n, sign) => {
      if (!n && label !== 'This shift') return '';
      const v = sign === '-' ? -n : n;
      const shown = (v >= 0 ? '+' : '') + v;
      return '<tr><td>' + label + '</td><td>' + shown + '</td></tr>';
    };
    return '<table class="timesheet score-stub">' +
      line('Jobs', stub.jobs, '+') +
      line('Clean close', stub.clean, '+') +
      line('On time', stub.ontime, '+') +
      line('Hints', stub.hintCost, '-') +
      '<tr><td>This shift</td><td>' + (stub.net >= 0 ? '+' : '') + stub.net + '</td></tr>' +
    '</table>';
  },

  _ticketRows(rows, empty) {
    if (!rows || !rows.length) {
      return '<tr><td colspan="4">' + this._esc(empty || 'None.') + '</td></tr>';
    }
    return rows.map((row) => {
      const id = this._closeId(row);
      const mission = Missions.get(id);
      const no = (typeof Virt !== 'undefined' && Virt.ticketNo && mission)
        ? Virt.ticketNo(mission)
        : '—';
      const pts = row && typeof row === 'object' && row.pay != null
        ? '+' + ((row.pay || 0) + (row.clean || 0))
        : '';
      return '<tr><td>' + this._esc(no) + '</td><td>' +
        this._esc(mission ? Missions.code(mission) : '') + '</td><td>' +
        this._esc(mission ? mission.title : id) + '</td><td>' + pts + '</td></tr>';
    }).join('');
  },

  _paintTimeclock() {
    this._ensureShift();
    const view = this._shiftView || 'status';
    const title = document.getElementById('timeclock-title');
    const body = document.getElementById('timeclock-body');
    if (title) {
      title.textContent = view === 'summary'
        ? 'timeclock — SHIFT CLOSED'
        : view === 'confirm'
          ? 'timeclock — PUNCH OUT?'
          : 'timeclock — precinct-13';
    }
    if (view === 'confirm') this._paintTimeclockConfirm(body);
    else if (view === 'summary') this._paintTimeclockSummary(body, this._lastPunch);
    else this._paintTimeclockStatus(body);
  },

  _paintTimeclockStatus(body) {
    this._setTimeclockLed();
    if (!body) return;
    const closed = this.state.shiftClosed || [];
    const leftover = this._shiftWork();
    body.innerHTML =
      '<p class="clock-meta">STATUS: PUNCHED IN · out at 16:00</p>' +
      '<div class="shift-score">' +
        '<span>Closed today: ' + closed.length + '</span>' +
        '<span>Score this shift: +' + (this.state.shiftScore || 0) + '</span>' +
        '<span>Total: ' + this.state.score + '</span>' +
      '</div>' +
      this._scoreStubHtml(this._scoreStub(closed)) +
      '<table class="timesheet">' +
        '<tr><th>Ticket</th><th>Ch</th><th>Closed today</th><th>Pts</th></tr>' +
        this._ticketRows(closed, 'No tickets closed this shift.') +
      '</table>' +
      (leftover.length
        ? '<p class="clock-meta">' + leftover.length + ' still open on today\'s board.</p>'
        : '<p class="clock-meta">Today\'s board is clear.</p>') +
      '<div class="shift-actions">' +
        '<button type="button" class="btn" onclick="Game.askPunchOut()">Punch out</button>' +
        '<button type="button" class="btn" onclick="Game.openAppHelp(\'timeclock\')">Help</button>' +
      '</div>';
  },

  _paintTimeclockConfirm(body) {
    this._setTimeclockLed();
    if (!body) return;
    const closed = this.state.shiftClosed || [];
    const leftover = this._shiftWork();
    body.innerHTML =
      '<h2>PUNCH OUT?</h2>' +
      '<p>Shift ' + this._esc(this.shiftStamp(true)) + '. Out at 16:00.</p>' +
      '<div class="shift-score">' +
        '<span>Closed today: ' + closed.length + '</span>' +
        '<span>Score this shift: +' + (this.state.shiftScore || 0) + '</span>' +
      '</div>' +
      (leftover.length
        ? '<p class="tkt-note">' + leftover.length + ' open ticket' + (leftover.length === 1 ? '' : 's') +
          ' will roll to tomorrow.</p>'
        : '<p>The board is clear for today.</p>') +
      '<div class="shift-actions">' +
        '<button type="button" class="btn" onclick="Game.stayOnShift()">Stay</button>' +
        '<button type="button" class="btn" onclick="Game.confirmPunchOut()">Punch out</button>' +
      '</div>';
  },

  _paintTimeclockSummary(body, log) {
    const closed = (log && log.closed) || [];
    const leftover = log && log.leftover ? log.leftover : 0;
    const gained = log && log.score ? log.score : 0;
    const when = log && Number.isFinite(log.when) ? log.when : this._shiftWhen();
    this._setTimeclockLed(when);
    if (!body) return;
    const next = this.shiftStamp();
    const foot = leftover
      ? leftover + ' ticket' + (leftover === 1 ? '' : 's') + ' roll to ' + next + '.'
      : 'Next shift is ' + next + '.';
    body.innerHTML =
      '<h2>SHIFT CLOSED</h2>' +
      '<div class="shift-score">' +
        '<span>Tickets: ' + closed.length + '</span>' +
        '<span>Score this shift: +' + gained + '</span>' +
        '<span>Total: ' + this.state.score + '</span>' +
        '<span>Rank: ' + this._esc(this.rank()) + '</span>' +
      '</div>' +
      this._scoreStubHtml(this._scoreStub(closed, log)) +
      '<table class="timesheet">' +
        '<tr><th>Ticket</th><th>Ch</th><th>Solved today</th><th>Pts</th></tr>' +
        this._ticketRows(closed, 'No tickets closed this shift.') +
      '</table>' +
      '<p class="tkt-note">' + this._esc(foot) + '</p>' +
      '<div class="shift-actions">' +
        '<button type="button" class="btn" onclick="Game.logOff()">Log off</button>' +
      '</div>';
  },

  askPunchOut() {
    this._shiftView = 'confirm';
    this._paintTimeclock();
    this._raiseTimeclock();
    this._play('click');
  },

  confirmPunchOut() {
    return this.punchOut('manual');
  },

  stayOnShift() {
    this._shiftView = 'status';
    this._paintTimeclock();
    this._play('click');
  },

  closeTimeclock(openQueue) {
    this._shiftView = 'status';
    this.iconifyClient('win-timeclock');
    if (openQueue) this.logOff();
  },

  dismissShiftSlip() {
    if (this._shiftView === 'summary') this.logOff();
    else this.stayOnShift();
  },

  _leftoverLines(log) {
    const ids = (log && log.leftovers) || [];
    if (!ids.length) return '';
    return '<div class="shift-report-kicker">ROLLS TO TOMORROW</div><table class="timesheet">' +
      '<tr><th>Ticket</th><th>Ch</th><th>Summary</th><th></th></tr>' +
      this._ticketRows(ids, '') +
      '</table>';
  },

  _paintShiftReport(log) {
    const bar = document.getElementById('shift-report-title');
    const body = document.getElementById('shift-report-body');
    const closed = (log && log.closed) || [];
    const leftover = log && log.leftover ? log.leftover : 0;
    const gained = log && log.score ? log.score : 0;
    const when = log && Number.isFinite(log.when) ? log.when : this._shiftWhen();
    const next = this.shiftStamp(true);
    if (bar) bar.textContent = 'xmessage — SHIFT REPORT // ' + this._mailStamp(when);
    if (body) {
      const out = leftover
        ? leftover + ' ticket' + (leftover === 1 ? '' : 's') + ' roll to the next shift.'
        : 'The board is clear. Tomorrow will invent something.';
      body.innerHTML =
        '<div class="brief-meta"><span class="tag">CLOSED</span>' +
          '<span class="brief-stamp">' + this._esc(this._mailStamp(when)) + '</span></div>' +
        '<h2>SHIFT CLOSED</h2>' +
        '<p>In 08:00. Out ' + this._esc(this._mailStamp(when)).replace(/^.*?(\d{1,2}:\d{2}).*$/, '$1') +
          '. Next punch-in: ' + this._esc(next) + '.</p>' +
        '<div class="shift-score">' +
          '<span>Tickets: ' + closed.length + '</span>' +
          '<span>This shift: +' + gained + '</span>' +
          '<span>Total: ' + this.state.score + '</span>' +
          '<span>Rank: ' + this._esc(this.rank()) + '</span>' +
        '</div>' +
        '<div class="shift-report-kicker">TIMESHEET</div>' +
        this._scoreStubHtml(this._scoreStub(closed, log)) +
        '<div class="shift-report-kicker">SOLVED TODAY</div>' +
        '<table class="timesheet">' +
          '<tr><th>Ticket</th><th>Ch</th><th>Summary</th><th>Pts</th></tr>' +
          this._ticketRows(closed, 'No tickets closed this shift.') +
        '</table>' +
        this._leftoverLines(log) +
        '<p class="tkt-note">' + this._esc(out) + ' Log off to end the day. Log in to start the next one.</p>' +
        '<div class="shift-actions">' +
          '<button type="button" class="btn" onclick="Game.logOff()">Log off</button>' +
        '</div>';
    }
    this.openOverlay('shift-report');
  },

  _paintShiftSummary(log) {
    this._lastPunch = log;
    this._shiftView = 'summary';
    this._paintTimeclock();
    this._raiseTimeclock();
    this._paintShiftReport(log);
  },

  logOffOrPunch() {
    const report = document.getElementById('shift-report');
    if (report && report.classList.contains('active')) {
      this.logOff();
      return;
    }
    if (this._shiftView === 'summary') {
      this.logOff();
      return;
    }
    this.askPunchOut();
  },

  logOff() {
    this._shiftView = 'status';
    this.closeOverlay('shift-report');
    this.closeOverlay('success-overlay');
    this.closeOverlay('epilogue-overlay');
    this.closeOverlay('welcome-overlay');
    this._withdrawDeskApps();
    this.state.currentMissionId = null;
    this.iconifyClient('win-xterm', true);
    this.iconifyClient('win-brief', true);
    this.iconifyClient('win-virt', true);
    this.iconifyClient('win-timeclock', true);
    if (Terminal.dropToDesk) Terminal.dropToDesk();
    else if (Terminal.detach) Terminal.detach();
    document.title = 'ROOT OF CRIME';
    this._paintLogin();
    this.showScreen('title');
    this._play('click');
  },

  _paintLogin() {
    const sub = document.getElementById('xdm-sub');
    const flavor = document.getElementById('xdm-flavor');
    const btn = document.getElementById('xdm-login');
    const next = this.shiftStamp(true);
    if (sub) {
      sub.textContent = this._lastPunch
        ? 'login: itguy@precinct-13  ·  ' + next
        : 'login: itguy@precinct-13';
    }
    if (flavor) {
      flavor.textContent = this._lastPunch
        ? 'Shift closed. See you at 08:00. Punch in. The board will be waiting.'
        : 'Someone rooted the precinct. The printer is screaming. The evidence locker is mode 000. The coffee machine has a login. You have the terminal. Find the root of the crime.';
    }
    if (btn) btn.textContent = 'Log In';
  },

  punchOut(why) {
    this._ensureShift();
    if (this._kernel()) {
      const from = this.state.shiftDay;
      const leftoverList = this._shiftWork();
      const report = Roc.punchOut();
      this._syncFromKernel();
      const leftover = report.leftover || leftoverList.length;
      const ontime = report.on_time ? Missions.ON_TIME_BONUS : 0;
      const log = {
        day: from,
        closed: (this.state.shiftClosed || []).slice(),
        score: report.score || this.state.score,
        leftover,
        leftovers: leftoverList.map((m) => m.id),
        hints: this.state.shiftHints || 0,
        ontime,
        why: why || 'manual',
        when: this._shiftWhen()
      };
      this.state.shiftLog = (this.state.shiftLog || []).concat([log]);
      this.state.shiftClosed = [];
      this.state.shiftScore = 0;
      this.state.shiftHints = 0;
      this._lastPunch = log;
      this._punchNote = true;
      this._save();
      this._updateChrome();
      const next = this.shiftStamp();
      if (leftover) this.toast('Punched out. ' + leftover + ' ticket(s) roll to ' + next + '.');
      else this.toast('Punched out. Next shift is ' + next + '.');
      this._paintShiftSummary(log);
      return true;
    }
    const leftoverList = this._shiftWork();
    const leftover = leftoverList.length;
    const from = this.state.shiftDay;
    const closed = (this.state.shiftClosed || []).slice();
    let gained = this.state.shiftScore || 0;
    let ontime = 0;
    if (closed.length && leftover === 0 && this.state.shiftMin <= Missions.SHIFT_END) {
      ontime = Missions.ON_TIME_BONUS;
      gained += ontime;
      this.state.score += ontime;
    }
    const log = {
      day: from,
      closed,
      score: gained,
      leftover,
      leftovers: leftoverList.map((m) => m.id),
      hints: this.state.shiftHints || 0,
      ontime,
      why: why || 'manual',
      when: this._shiftWhen()
    };
    this.state.shiftLog = (this.state.shiftLog || []).concat([log]);
    this.state.shiftDay = from + 1;
    this.state.shiftMin = Missions.SHIFT_START;
    this.state.shiftClosed = [];
    this.state.shiftScore = 0;
    this.state.shiftHints = 0;
    this._lastPunch = log;
    this._punchNote = true;
    this._ensureJobs();
    this._save();
    this._updateChrome();
    const next = this.shiftStamp();
    if (leftover) this.toast('Punched out. ' + leftover + ' ticket(s) roll to ' + next + '.');
    else this.toast('Punched out. Next shift is ' + next + '.');
    this._paintShiftSummary(log);
    return true;
  },

  _maybePunchOut(opts) {
    const first = !!(opts && opts.first);
    this._ensureShift();
    const past = this.state.shiftMin >= Missions.SHIFT_END;
    const work = this._shiftWork();
    const later = this._kernel()
      ? Roc.tickets().some((t) => !t.done && !t.today)
      : Missions.list().some((m) => (
        !this.state.completed.includes(m.id) && Missions.shiftDayOf(m) > this.state.shiftDay
      ));
    if (past) return this.punchOut('bell');
    if (!work.length && later) return this.punchOut('clear');
    if (!work.length && first && !later) return this.punchOut('done');
    return false;
  },

  openNetmoth() {
    if (typeof Virt === 'undefined') return;
    if (!Virt.page) Virt.page = 'tickets';
    if (Virt.page === 'guest' && !Virt.currentGuest()) Virt.page = 'virt';
    Virt.paint();
    this._raiseWindow(document.getElementById('win-virt'));
    this._placeVirtWindow();
    this._play('click');
  },

  intranetGo(page) {
    if (typeof Virt === 'undefined') return;
    Virt.go(page);
    this._raiseWindow(document.getElementById('win-virt'));
  },

  openTicket(id) {
    if (typeof Virt === 'undefined') return;
    Virt.go('ticket', { ticketId: id });
    this._raiseWindow(document.getElementById('win-virt'));
  },

  workTicket(id) {
    if (this._kernel()) {
      try {
        const intro = Roc.workTicket(id);
        this._startKernelTicket(id, intro);
      } catch (err) {
        this.toast(String(err && err.message ? err.message : err));
      }
      return;
    }
    const mission = Missions.get(id);
    if (!mission) return;
    if (!Missions.isUnlocked(mission, this.state.completed)) {
      this.toast('Ticket not assigned to you yet');
      return;
    }
    this._ensureShift();
    if (Missions.shiftDayOf(mission) > this.state.shiftDay) {
      this.toast('Not on today\'s board');
      return;
    }
    this.startMission(id);
  },

  _startKernelTicket(id, intro) {
    this._play('click');
    this._syncFromKernel();
    this.state.currentMissionId = id;
    this.state.missionHints = 0;
    const mission = Missions.get(id);
    const asset = (mission && Missions.assetOf(mission)) || (Roc.tickets().find((t) => t.id === id) || {}).asset || 'closet';
    this.ticketSession = { id, host: asset, cwd: '/home/itguy' };
    const code = mission ? Missions.code(mission) : '';
    if (this.els.missionTitleBar) this.els.missionTitleBar.textContent = `xmessage — CASE SLIP // ${code}`;
    if (this.els.missionTag && mission) this.els.missionTag.textContent = mission.difficulty.toUpperCase();
    if (this.els.missionStamp) this.els.missionStamp.textContent = code;
    if (this.els.missionName && mission) this.els.missionName.textContent = mission.title;
    if (this.els.missionDesc && mission) this.els.missionDesc.textContent = mission.description;
    this._paintTracker(mission, null, null);
    this.closeOverlay('success-overlay');
    this.closeOverlay('epilogue-overlay');
    this.showScreen('desktop');
    this.iconifyClient('win-brief', true);
    if (typeof Virt !== 'undefined') {
      if (mission && mission.monitor) Virt.go('mon');
      else Virt.go('ticket', { ticketId: id });
      this._raiseWindow(document.getElementById('win-virt'));
      this._placeVirtWindow();
    }
    const xt = document.getElementById('win-xterm');
    const xtermOpen = xt && !xt.classList.contains('withdrawn') && !xt.classList.contains('iconified');
    const toast = Roc.toast();
    if (!xtermOpen && toast) this.toast(toast);
    else if (toast) this.toast(toast);
    if (intro && typeof Terminal !== 'undefined' && Terminal.print) {
      /* slip already has the job; xterm stays as-is */
    }
    this._updateChrome();
  },

  /* ---------- Apps ---------- */
  openMissionBoard() {
    if (typeof Virt === 'undefined') return;
    Virt.ticketFilter = 'open';
    Virt.page = 'tickets';
    this.openNetmoth();
  },

  _notesFor(id) {
    this._ticketNotes = this._ticketNotes || {};
    if (!this._ticketNotes[id]) this._ticketNotes[id] = { hints: [], help: '' };
    return this._ticketNotes[id];
  },

  recordTicketHint(lines) {
    const id = this.state.currentMissionId || (typeof Virt !== 'undefined' && Virt.ticketId);
    if (!id) return;
    const pack = this._notesFor(id);
    (lines || []).forEach((line) => {
      const text = typeof line === 'string' ? line : (line && line.text);
      if (text) pack.hints.push(text);
    });
    if (typeof Virt !== 'undefined' && Virt.page === 'ticket') Virt.paint();
  },

  ticketHint() {
    if (this._kernel()) {
      const frame = Roc.run('hint');
      const text = (frame.stdout || '').replace(/\n$/, '');
      if (text) this.recordTicketHint([{ text }]);
      this._syncFromKernel();
      this.toast(frame.toast || Roc.toast() || 'Hint filed on the ticket');
      if (typeof Virt !== 'undefined' && Virt.page === 'ticket') Virt.paint();
      this._updateChrome();
      return;
    }
    const env = this.ticketEnv();
    const id = env.id || this.state.currentMissionId;
    const mission = Missions.get(id);
    if (!mission || !env.ctx) {
      this.toast('Work the ticket first');
      return;
    }
    env.ctx.usedHint = true;
    const lines = mission.getHint(env.ctx, env.vfs) || [];
    this.onHintUsed();
    this.recordTicketHint(lines);
    this.toast('Hint filed on the ticket');
  },

  ticketHelp() {
    if (this._kernel()) {
      const frame = Roc.run('help');
      const id = Roc.currentId() || this.state.currentMissionId;
      if (id) this._notesFor(id).help = (frame.stdout || '').replace(/\n$/, '');
      this._syncFromKernel();
      if (typeof Virt !== 'undefined' && Virt.page === 'ticket') Virt.paint();
      this.refreshMissionHud();
      return;
    }
    const env = this.ticketEnv();
    const id = env.id || this.state.currentMissionId;
    const mission = Missions.get(id);
    if (!mission || !env.ctx) {
      this.toast('Work the ticket first');
      return;
    }
    env.ctx.usedHelp = true;
    this._notesFor(id).help = mission.getHelp ? mission.getHelp() : '';
    if (typeof Virt !== 'undefined' && Virt.page === 'ticket') Virt.paint();
    this.refreshMissionHud();
  },

  openCaseFile() {
    const body = this.els.caseBody;
    const done = this.state.completed;
    if (!done.length) {
      body.innerHTML = '<p class="app-help"><a href="#" onclick="Game.openAppHelp(\'casefile\');return false">Help…</a></p>' +
        '<p class="muted">No entries. Clear a mission. The file fills itself.</p>';
    } else {
      body.innerHTML = '<p class="app-help"><a href="#" onclick="Game.openAppHelp(\'casefile\');return false">Help…</a></p>' +
        done.map((id) => {
        const mission = Missions.get(id);
        if (!mission || !mission.caseTitle) return '';
        return `<article class="case-entry">
          <h3>${Missions.code(mission)} — ${mission.caseTitle}</h3>
          <p>${mission.caseBody}</p>
        </article>`;
      }).join('');
    }
    this.openClient('win-case');
  },

  openNotes() {
    const pack = Missions.latestStory(this.state.completed, 'notes');
    this.els.notesBody.innerHTML = '<p class="app-help"><a href="#" onclick="Game.openAppHelp(\'notes\');return false">Help…</a></p>' +
      pack.map((l) => `<div class="sticky">• ${this._esc(l)}</div>`).join('');
    this.openClient('win-notes');
  },

  openRadio() {
    const pack = Missions.latestStory(this.state.completed, 'radio');
    this.els.radioBody.innerHTML = '<p class="app-help"><a href="#" onclick="Game.openAppHelp(\'radio\');return false">Help…</a></p>' +
      pack.map((l) => `<div class="radio-line">${this._esc(l)}</div>`).join('');
    this.openClient('win-radio');
  },

  openAppHelp(id) {
    this.openManual(id);
  },

  openManual(topic) {
    if (topic) this._manTopic = topic;
    if (!this._manTopic) this._manTopic = 'twm';
    this._paintManual();
    this.openClient('win-manual');
  },

  _paintManual() {
    const body = this.els.manualBody;
    if (!body) return;
    const apps = typeof APP_DOCS !== 'undefined' ? APP_DOCS : [];
    const cmds = typeof MANUAL !== 'undefined' ? MANUAL : [];
    const topic = this._manTopic || 'twm';
    const app = apps.find((a) => a.id === topic);
    const cmd = !app && cmds.find((c) => c.cmd === topic);
    const item = (id, label, isOn) => (
      '<button type="button" class="xman-item' + (isOn ? ' on' : '') + '" data-man="' + this._esc(id) + '">' +
        this._esc(label) +
      '</button>'
    );
    const index =
      '<div class="xman-sec">APPS</div>' +
      apps.map((a) => item(a.id, a.title, a.id === topic)).join('') +
      '<div class="xman-sec">COMMANDS</div>' +
      cmds.map((c) => item(c.cmd, c.cmd, c.cmd === topic)).join('');
    let page = '';
    if (app) {
      page = '<h3>' + this._esc(app.title) + '(1)</h3>' +
        app.body.split('\n\n').map((p) => '<p>' + this._esc(p).replace(/\n/g, '<br>') + '</p>').join('');
    } else if (cmd) {
      page = '<h3>' + this._esc(cmd.cmd) + '</h3><p>' + this._esc(cmd.why) + '</p>' +
        '<p class="muted">In xterm: man ' + this._esc((cmd.cmd.split(/[ /]/)[0] || 'ls')) + '</p>';
    } else {
      page = '<p class="muted">No page. Pick a topic.</p>';
    }
    body.innerHTML =
      '<div class="xman-index">' + index + '</div>' +
      '<div class="xman-page">' + page + '</div>';
    const bar = document.querySelector('#win-manual .xwin-name');
    if (bar) bar.textContent = 'xman — ' + (app ? app.title : (cmd ? cmd.cmd : 'manual'));
    body.querySelectorAll('[data-man]').forEach((btn) => {
      btn.addEventListener('click', () => this.openManual(btn.dataset.man));
    });
  },

  openSettings() {
    const crt = document.getElementById('opt-crt');
    const sound = document.getElementById('opt-sound');
    if (crt) crt.checked = !!this.state.settings.crt;
    if (sound) sound.checked = !!this.state.settings.sound;
    this.openClient('win-prefs');
  },

  toggleSetting(key, value) {
    this.state.settings[key] = value;
    this._applySettings();
    this._save();
  },

  _applySettings() {
    document.body.classList.toggle('crt', !!this.state.settings.crt);
  },

  /* ---------- Mission flow ---------- */
  ticketEnv() {
    if (this.ticketSession) return this.ticketSession;
    return {
      id: (typeof Terminal !== 'undefined' && Terminal.missionId) || this.state.currentMissionId,
      ctx: typeof Terminal !== 'undefined' ? Terminal.ctx : null,
      vfs: typeof Terminal !== 'undefined' ? Terminal.vfs : null,
      host: typeof Terminal !== 'undefined' ? Terminal.host : 'closet'
    };
  },

  ensureDeskShell() {
    if (typeof Terminal !== 'undefined' && Terminal.ensureDesk) Terminal.ensureDesk();
  },

  openXterm() {
    this.openClient('win-xterm');
  },

  _syncLiveSession(asset, setup, id, code) {
    if (typeof Terminal === 'undefined' || !Terminal.vfs) return;
    const onPrecinct = Terminal.host === 'precinct-13' && Terminal._remote === 'precinct-13';
    const onGuest = Terminal.host === 'booking-vm' || Terminal._attached === 'booking-vm';
    const stay = onPrecinct || (asset === 'booking-vm' && onGuest);
    if (!stay && Terminal._stack && Terminal._stack.length && Terminal.dropToDesk) {
      Terminal.dropToDesk();
    }
    if (Terminal.host === 'precinct-13' && Terminal._remote === 'precinct-13') {
      Terminal.vfs = setup.vfs;
      Terminal.ctx = setup.ctx;
      Terminal.cwd = setup.cwd || '/home/itguy';
      Terminal.missionId = id;
      if (Terminal.print) {
        Terminal.print(
          '— ticket ' + code + ' — still on precinct-13' +
            (asset === 'booking-vm' ? '. ssh booking-vm or virsh console' : '') +
            ' —',
          'muted'
        );
      }
      return;
    }
    if (asset === 'booking-vm' && (Terminal.host === 'booking-vm' || Terminal._attached === 'booking-vm')) {
      const guest = setup.ctx && setup.ctx.guests && setup.ctx.guests[Virt.GUEST];
      if (guest) {
        Terminal.vfs = guest.vfs;
        Terminal.ctx = setup.ctx;
        Terminal.missionId = id;
      }
      return;
    }
    if (Terminal.print) Terminal.print('ticket ' + code + ' — ssh ' + asset, 'info');
  },

  startMission(id) {
    if (this._kernel()) {
      if (Roc.hasTicket(id)) return this.workTicket(id);
      this.toast('That ticket is not on this kernel shift.');
      return;
    }
    const mission = Missions.get(id);
    if (!mission) return;
    this._play('click');
    this.state.currentMissionId = id;
    this.state.missionHints = 0;
    this.closeOverlay('success-overlay');
    this.closeOverlay('epilogue-overlay');

    const asset = Missions.assetOf(mission);
    const code = Missions.code(mission);
    if (asset === 'closet') {
      if (Terminal.dropToDesk) Terminal.dropToDesk();
      else this.ensureDeskShell();
      this.ticketSession = {
        id, host: 'closet', vfs: Terminal.vfs, ctx: Terminal.ctx, cwd: Terminal.cwd || '/home/itguy'
      };
    } else {
      const setup = mission.setup();
      this.ticketSession = {
        id, host: asset, vfs: setup.vfs, ctx: setup.ctx, cwd: setup.cwd || '/home/itguy'
      };
      this._syncLiveSession(asset, setup, id, code);
    }
    Terminal.missionId = id;
    if (this.els.missionTitleBar) this.els.missionTitleBar.textContent = `xmessage — CASE SLIP // ${code}`;
    if (this.els.missionTag) this.els.missionTag.textContent = mission.difficulty.toUpperCase();
    if (this.els.missionStamp) this.els.missionStamp.textContent = code;
    if (this.els.missionName) this.els.missionName.textContent = mission.title;
    if (this.els.missionDesc) this.els.missionDesc.textContent = mission.description;
    this._paintTracker(mission, this.ticketSession.ctx, this.ticketSession.vfs);
    document.title = 'ROOT OF CRIME';

    this.showScreen('desktop');
    this.iconifyClient('win-brief', true);
    if (typeof Virt !== 'undefined') {
      if (mission.monitor) Virt.go('mon');
      else Virt.go('ticket', { ticketId: id });
      this._raiseWindow(document.getElementById('win-virt'));
      this._placeVirtWindow();
    }
    const xt = document.getElementById('win-xterm');
    const xtermOpen = xt && !xt.classList.contains('withdrawn') && !xt.classList.contains('iconified');
    if (!xtermOpen) {
      this.toast(
        asset === 'closet'
          ? 'This ticket is on closet. Double-click the xterm icon.'
          : 'Asset ' + asset + '. Open xterm (desk icon), then ssh ' + asset
      );
    }
  },

  _placeVirtWindow() {
    const virt = document.getElementById('win-virt');
    if (!virt || virt.classList.contains('iconified')) return;
    if (typeof window !== 'undefined' && window.innerWidth < 820) {
      virt.style.left = '8px';
      virt.style.right = '8px';
      virt.style.width = 'auto';
      virt.style.top = '8px';
      virt.style.bottom = 'auto';
      return;
    }
    virt.style.right = 'auto';
    virt.style.bottom = 'auto';
    virt.style.top = '12px';
    virt.style.left = '112px';
    virt.style.width = '';
  },

  virtAttach() {
    const env = this.ticketEnv();
    const guest = Virt.get(env.ctx);
    const sizeEl = document.getElementById('virt-size');
    const unitEl = document.getElementById('virt-unit');
    const parsed = Virt.parseSize(sizeEl && sizeEl.value, unitEl && unitEl.value);
    if (!parsed.ok) {
      this.toast(parsed.error);
      return;
    }
    const r = Virt.attachVolume(guest, parsed.bytes);
    if (!r.ok) {
      this.toast(r.error || 'attach failed');
      return;
    }
    Virt.paint(guest);
    this.refreshMissionHud();
    this.toast('Volume attached as /dev/sdb (' + Math.round(parsed.bytes / 1024) + 'K)');
  },

  virtConsole() {
    this.ensureDeskShell();
    this.winOpen('win-xterm');
    let r;
    if (Terminal.host === 'closet') {
      r = Terminal._cmdSsh ? Terminal._cmdSsh(['booking-vm']) : Terminal.attach(Virt.GUEST);
    } else {
      r = Terminal.attach(Virt.GUEST);
    }
    if (r && r.stderr) {
      this.toast(r.stderr);
      return;
    }
    if (r && r.stdout) Terminal.print(r.stdout.replace(/\n$/, ''), 'info');
    this.refreshMissionHud();
    Terminal.focus();
  },

  virtReboot() {
    const env = this.ticketEnv();
    const guest = Virt.get(env.ctx);
    if (!guest) {
      this.toast('no guest');
      return;
    }
    if (Terminal._attached === guest.id) Terminal.detach();
    Virt.reboot(guest);
    Virt.paint(guest);
    this.refreshMissionHud();
    this.toast(guest.hostname + ' is being rebooted');
    this._checkMissionWin();
  },

  _checkMissionWin() {
    this.refreshMissionHud();
  },

  closeTicket() {
    if (this._kernel()) {
      const id = Roc.currentId() || this.state.currentMissionId;
      try {
        Roc.closeTicket();
      } catch (err) {
        this.toast(String(err && err.message ? err.message : err));
        return false;
      }
      const mission = Missions.get(id);
      this._syncFromKernel();
      if (mission) {
        this._notesFor(id).closeout = {
          first: true,
          flavor: mission.successFlavor || '',
          learned: mission.learned || '',
          chief: mission.chiefNote || ''
        };
      }
      this.toast(Roc.toast() || 'Ticket closed');
      this.iconifyClient('win-brief', true);
      if (typeof Virt !== 'undefined') {
        Virt.go('ticket', { ticketId: id });
        this._raiseWindow(document.getElementById('win-virt'));
        this._placeVirtWindow();
      }
      this._updateChrome();
      this._maybePunchOut({ first: true });
      return true;
    }
    const env = this.ticketEnv();
    const id = env.id || (typeof Terminal !== 'undefined' && Terminal.missionId) || this.state.currentMissionId;
    const mission = Missions.get(id);
    if (!mission) {
      this.toast('No ticket in progress');
      return false;
    }
    if (!env.ctx || !mission.isWon(env.ctx, env.vfs)) {
      this.toast('Work remaining. The tracker is not done.');
      return false;
    }
    this.state.currentMissionId = id;
    this.onMissionSuccess();
    return true;
  },

  _placeMissionWindows() {
    if (this._placedMissionWins) return;
    this._placedMissionWins = true;
    if (window.innerWidth >= 820) return;
    const brief = document.getElementById('win-brief');
    const term = document.getElementById('win-xterm');
    if (brief) {
      brief.style.left = '8px';
      brief.style.top = '8px';
    }
    if (term) {
      term.style.left = '8px';
      term.style.top = 'auto';
      term.style.bottom = '36px';
      term.style.right = '8px';
      term.style.width = 'auto';
    }
  },

  refreshMissionHud() {
    const env = this.ticketEnv();
    const mission = Missions.get(env.id || this.state.currentMissionId);
    if (!mission) return;
    this._paintTracker(mission, env.ctx, env.vfs);
    if (typeof Virt !== 'undefined' && (
      (Virt.page === 'ticket' && Virt.ticketId === mission.id) ||
      Virt.page === 'mon'
    )) {
      Virt.paint();
    }
  },

  trackerItems(mission, ctx, vfs) {
    if (this._kernel() && mission && this.state.currentMissionId === mission.id) {
      return Roc.tracker();
    }
    return Missions.tracker(mission, ctx, vfs);
  },

  _paintTracker(mission, ctx, vfs) {
    const ul = this.els.missionTracker;
    if (!ul) return;
    const items = this.trackerItems(mission, ctx, vfs);
    const done = items.filter((i) => i.done).length;
    if (this.els.missionTrackCount) {
      this.els.missionTrackCount.textContent = items.length ? done + '/' + items.length : '';
    }
    ul.innerHTML = items.map((i) => (
      '<li class="' + (i.done ? 'done' : '') + '">' +
        '<span class="box">' + (i.done ? '[x]' : '[ ]') + '</span>' +
        '<span>' + this._esc(i.label) + '</span>' +
      '</li>'
    )).join('');
  },

  onHintUsed() {
    const cost = Missions.HINT_COST;
    this.state.hintsUsed += 1;
    this.state.missionHints += 1;
    this.state.shiftHints = (this.state.shiftHints || 0) + 1;
    this.state.score = Math.max(0, this.state.score - cost);
    this.state.shiftScore = (this.state.shiftScore || 0) - cost;
    this._save();
    this._updateChrome();
  },

  onMissionSuccess() {
    if (!this.state.currentMissionId) return;
    const mission = Missions.get(this.state.currentMissionId);
    if (!mission) return;
    if (this._successLock) return;
    this._successLock = true;
    setTimeout(() => { this._successLock = false; }, 800);

    const first = !this.state.completed.includes(mission.id);
    this._punchNote = false;
    if (first) {
      this.state.completed.push(mission.id);
      let pay = Missions.ticketPay(mission);
      if (mission.id === 'root-of-crime') pay += 100;
      const clean = this.state.missionHints === 0 ? Missions.CLEAN_BONUS : 0;
      const gain = pay + clean;
      this.state.score += gain;
      this._clockTicket(mission);
      this.state.shiftClosed = (this.state.shiftClosed || []).concat([{
        id: mission.id,
        pay,
        clean,
        hints: this.state.missionHints || 0
      }]);
      this.state.shiftScore = (this.state.shiftScore || 0) + gain;
    }
    this._save();
    this._updateChrome();
    this._play('ok');

    this.closeOverlay('success-overlay');
    const notes = this._notesFor(mission.id);
    notes.closeout = {
      first,
      flavor: mission.successFlavor || '',
      learned: mission.learned || '',
      chief: mission.chiefNote || ''
    };
    this.iconifyClient('win-brief', true);
    this._maybePunchOut({ first });
    if (typeof Virt !== 'undefined') {
      Virt.go('ticket', { ticketId: mission.id });
      this._raiseWindow(document.getElementById('win-virt'));
      this._placeVirtWindow();
    }
  },

  openEpilogue() {
    this.closeOverlay('success-overlay');
    const n = Missions.campaign().filter((m) => this.state.completed.includes(m.id)).length;
    const hints = this.state.hintsUsed;
    document.getElementById('epilogue-body').innerHTML = `
      <p>The root of the crime was not the cat.</p>
      <p>The cat was a delivery system with whiskers. The root was a coffee machine that shipped with <code>mocha123</code>, sat on the copier VLAN, and ran a vendor backdoor named “maintenance.”</p>
      <p>You cleared <strong>${n}</strong> chapters. Hints used: <strong>${hints}</strong>. Rank: <strong>${this.rank()}</strong>. Score: <strong>${this.state.score}</strong>.</p>
      <p>The case is closed. The board is not. Night shift will eat another file. The disk will fill again. That is the job.</p>
    `;
    this.openOverlay('epilogue-overlay');
  },

  /* ---------- Boot / juice ---------- */
  _runBoot(done) {
    const el = document.getElementById('boot-log');
    const morning = !!this.state.seenBriefing;
    const lines = morning
      ? [
        'PRECINCT-13 BIOS 4.13',
        'checking disks........................ OK',
        'X Window System Version 11 Release 6.4',
        'twm: starting on :0 .................. OK',
        'libvirtd: booking-vm ................. running',
        'sshd: precinct-13:22 ................. up',
        'coffee.lan: appliance vlan ........... up',
        'motd: good morning.',
        'session: itguy   ' + this.shiftStamp(true),
        'punch in. the board is waiting.'
      ]
      : [
        'PRECINCT-13 BIOS 4.13',
        'checking disks........................ OK',
        'X Window System Version 11 Release 6.4',
        'twm: starting on :0 .................. OK',
        'libvirtd: booking-vm ................. running',
        'sshd: precinct-13:22 ................. up',
        'coffee.lan: appliance vlan ........... up',
        'xconsole: lp0 on fire',
        'xterm: itguy@closet',
        'starting cupsd........................ WHY',
        'motd: If it works, do not reboot it.',
        'welcome, officer.'
      ];
    el.textContent = '';
    let i = 0;
    const tick = () => {
      if (i < lines.length) {
        el.textContent += lines[i] + '\n';
        i += 1;
        setTimeout(tick, 140);
      } else {
        setTimeout(done, 380);
      }
    };
    tick();
  },

  toast(msg) {
    const el = this.els.toast;
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  },

  _play(kind) {
    if (!this.state.settings.sound) return;
    try {
      const ctx = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      if (kind === 'ok') {
        o.frequency.setValueAtTime(440, now);
        o.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        g.gain.setValueAtTime(0.06, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        o.start(now); o.stop(now + 0.2);
      } else if (kind === 'boot') {
        o.type = 'square';
        o.frequency.setValueAtTime(160, now);
        g.gain.setValueAtTime(0.03, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
      } else {
        o.type = 'square';
        o.frequency.setValueAtTime(220, now);
        g.gain.setValueAtTime(0.025, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        o.start(now); o.stop(now + 0.06);
      }
    } catch {
      /* ignore */
    }
  },

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (Terminal._pager) return;
        if (this.closeTopOverlay()) {
          e.preventDefault();
          const xt = document.getElementById('win-xterm');
          if (this.state.currentMissionId && xt && !xt.classList.contains('iconified')) {
            Terminal.focus();
          }
        } else if (this.state.currentMissionId) {
          const focus = this.state.focusedWin;
          const target = (focus === 'win-brief' || focus === 'win-xterm' || focus === 'win-virt' || focus === 'win-timeclock') ? focus : 'win-xterm';
          const el = document.getElementById(target);
          if (el && !el.classList.contains('iconified')) {
            e.preventDefault();
            this.iconifyClient(target);
          }
        }
      }
    });
  },

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _cacheElements() {
    this.els = {
      desktopIcons: document.getElementById('desktop-icons'),
      progress: document.getElementById('progress-text'),
      rank: document.getElementById('rank-text'),
      score: document.getElementById('score-text'),
      clock: document.getElementById('desktop-clock'),
      missionList: document.getElementById('mission-list'),
      missionTitleBar: document.getElementById('mission-title-bar'),
      missionTag: document.getElementById('mission-tag'),
      missionStamp: document.getElementById('mission-stamp'),
      missionName: document.getElementById('mission-name'),
      missionDesc: document.getElementById('mission-desc'),
      missionTracker: document.getElementById('mission-tracker'),
      missionTrackCount: document.getElementById('mission-track-count'),
      successTitleBar: document.getElementById('success-title-bar'),
      successTag: document.getElementById('success-tag'),
      successStamp: document.getElementById('success-stamp'),
      successTitle: document.getElementById('success-title'),
      successFlavor: document.getElementById('success-flavor'),
      successLearned: document.getElementById('success-learned'),
      successChief: document.getElementById('success-chief'),
      successExtra: document.getElementById('success-extra'),
      caseBody: document.getElementById('case-body'),
      notesBody: document.getElementById('notes-body'),
      radioBody: document.getElementById('radio-body'),
      manualBody: document.getElementById('manual-body'),
      xconsole: document.getElementById('xconsole-log'),
      toast: document.getElementById('toast')
    };
  }
};

document.addEventListener('DOMContentLoaded', () => Game.init());
