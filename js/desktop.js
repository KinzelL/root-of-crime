/* ROOT OF CRIME – twm desktop (icons, taskbar, gadgets) */

Object.assign(Game, {
  _renderDesktopIcons() {
    const area = this.els.desktopIcons;
    if (!area) return;
    const icons = [
      { action: 'netmoth', name: 'netmoth', face: '<div class="xbm-ns"></div>' },
      { action: 'xterm', name: 'xterm', face: '<div class="xbm-term"></div>' },
      { action: 'timeclock', name: 'timeclock', face: '<div class="xbm-clock"></div>' },
      { action: 'missions', name: 'missions', face: '<div class="xbm"></div>' },
      { action: 'case', name: 'casefile', face: '<div class="xbm-doc"></div>' },
      { action: 'manual', name: 'xman', face: '<div class="xbm-book"></div>' },
      { action: 'notes', name: 'notes', face: '<div class="xbm-note"></div>' },
      { action: 'radio', name: 'radio', face: '<div class="xbm-radio"></div>' },
      { action: 'xconsole', name: 'xconsole', face: '<div class="xbm-con"></div>' },
      { action: 'settings', name: 'twmprefs', face: '<div class="xbm-gear"></div>' }
    ];
    area.innerHTML = icons.map((ic) => `
      <div class="twm-icon" data-action="${ic.action}" tabindex="0" title="${ic.name}">
        <div class="twm-icon-title">${ic.name}</div>
        <div class="twm-icon-face">${ic.face}</div>
      </div>
    `).join('');
    area.querySelectorAll('.twm-icon').forEach((icon) => {
      const go = () => this._desktopAction(icon.dataset.action);
      icon.addEventListener('click', go);
      icon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  },

  _mailDay(mission) {
    return Missions.shiftDayOf(mission);
  },

  _mailWhen(day, hhmm) {
    const p = String(hhmm || '00:00').split(':');
    const h = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    return (day || 0) * 1440 + (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  },

  _mailStamp(when, long) {
    const day = Math.floor((when || 0) / 1440);
    const rem = (when || 0) % 1440;
    const d = new Date(Date.UTC(2026, 7, 14 + day, Math.floor(rem / 60), rem % 60, 0));
    const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    if (long) return wk + ' ' + mon + ' ' + d.getUTCDate() + ' ' + hh + ':' + mm + ':00 2026';
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + hh + ':' + mm;
  },

  _mailFromRadio(line, day) {
    const m = String(line).match(/^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (!m) {
      return {
        from: 'radio@precinct-13', name: 'Radio', subject: String(line).slice(0, 40),
        body: String(line), when: this._mailWhen(day || 0, '12:00')
      };
    }
    const name = m[2].trim();
    const body = m[3].trim();
    return {
      from: name.toLowerCase().replace(/\s+/g, '.') + '@precinct-13',
      name,
      subject: body.slice(0, 42) || '(no subject)',
      body,
      when: this._mailWhen(day || 0, m[1])
    };
  },

  _inbox() {
    const done = this.state.completed || [];
    const out = [];
    const next = Missions.list().find((m) => !done.includes(m.id) && Missions.isUnlocked(m, done));
    (Missions.INTRO_RADIO || []).forEach((line) => out.push(this._mailFromRadio(line, 0)));
    Missions.list().forEach((mission) => {
      if (!done.includes(mission.id)) return;
      const day = this._mailDay(mission);
      (mission.radio || []).forEach((line) => out.push(this._mailFromRadio(line, day)));
      if (mission.chiefNote) {
        const floor = this._mailWhen(day, '20:00');
        const last = out.length ? out[out.length - 1].when : floor;
        out.push({
          from: 'chief@precinct-13', name: 'Chief',
          subject: 'Re: ' + mission.title,
          body: mission.chiefNote,
          when: Math.max(last, floor) + 3
        });
      }
    });
    const newest = out.reduce((n, mail) => Math.max(n, mail.when || 0), this._mailWhen(0, '19:00'));
    this._ensureShift();
    const today = this._shiftWork();
    const jobWhen = Math.max(newest + 5, this._shiftWhen());
    const listToday = today.map((m) => (
      Missions.code(m) + ' — ' + m.title
    )).join('\n');
    if (!done.length) {
      out.push({
        from: 'chief@precinct-13', name: 'Chief', job: true,
        subject: 'Punch in. Today\'s work is on the board.',
        body: 'Shift ' + this.shiftStamp(true) + '\n\n' +
          (listToday || 'How This Desk Works') +
          '\n\nOpen the ticket queue in NetMoth (tickets.precinct). Close a ticket and the clock jumps. 16:00 punches you out. Leftovers roll.',
        when: jobWhen
      });
    } else if (today.length) {
      out.push({
        from: 'chief@precinct-13', name: 'Chief', job: true,
        subject: 'Today\'s work.',
        body: 'Shift ' + this.shiftStamp(true) + '\n\n' + listToday +
          '\n\nOpen the ticket queue in NetMoth. Close tickets. Leftovers roll to tomorrow.',
        when: jobWhen
      });
    } else if (next) {
      out.push({
        from: 'chief@precinct-13', name: 'Chief', job: true,
        subject: 'Next case is on the board.',
        body: Missions.code(next) + ' — ' + next.title + '\n\nOpen the ticket queue in NetMoth.',
        when: jobWhen
      });
    } else {
      out.push({
        from: 'chief@precinct-13', name: 'Chief', job: true,
        subject: 'The board is clear.',
        body: Missions.campaignDone(done)
          ? 'The case is filed. If the queue is empty, punch out. Tomorrow will invent something.'
          : 'Every case is filed. Open the ticket queue if you want to run one again.',
        when: jobWhen
      });
    }
    for (let d = 0; d < this.state.shiftDay; d++) {
      const log = (this.state.shiftLog || []).find((l) => l.day === d);
      const names = log && log.closed && log.closed.length
        ? log.closed.map((row) => {
            const id = typeof row === 'string' ? row : row && row.id;
            const m = Missions.get(id);
            const pts = row && typeof row === 'object' && row.pay != null
              ? '  +' + ((row.pay || 0) + (row.clean || 0))
              : '';
            return (m ? Missions.code(m) + ' — ' + m.title : id) + pts;
          }).join('\n')
        : '';
      let body = 'Shift closed. See you at 08:00.';
      if (log) {
        const extra = (log.ontime ? '\nOn time +' + log.ontime + '.' : '') +
          (log.hints ? '\nHints −' + (log.hints * Missions.HINT_COST) + '.' : '');
        body = 'Closed ' + (log.closed || []).length + ' ticket(s). Score +' + (log.score || 0) + '.' + extra +
          (names ? '\n\n' + names : '') +
          (log.leftover ? '\n\n' + log.leftover + ' rolled to the next shift.' : '') +
          '\n\nSee you at 08:00.';
      }
      out.push({
        from: 'timeclock@precinct-13', name: 'Timeclock', job: false,
        subject: 'Punched out — ' + this._mailStamp(this._mailWhen(d, '16:00')),
        body,
        when: this._mailWhen(d, '16:05')
      });
    }
    const key = this._mailSortKey || 'when';
    const dir = this._mailSortDir == null ? -1 : this._mailSortDir;
    out.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === 'name' || key === 'subject') {
        av = String(av || '').toLowerCase();
        bv = String(bv || '').toLowerCase();
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      }
      return ((av || 0) - (bv || 0)) * dir;
    });
    return out;
  },

  mailSort(key) {
    const cur = this._mailSortKey || 'when';
    if (cur === key) this._mailSortDir = -(this._mailSortDir == null ? -1 : this._mailSortDir);
    else {
      this._mailSortKey = key;
      this._mailSortDir = key === 'when' ? -1 : 1;
    }
    this._mailSortKey = key;
    this._mailHold = 3;
    this._paintXmessage();
  },

  _paintXmessage() {
    const list = document.getElementById('mail-list');
    const read = document.getElementById('mail-read') || document.querySelector('#win-xmessage .xmessage-body');
    if (!list && !read) return;
    const box = this._inbox();
    if (this._mailSeen !== box.length) {
      this._mailSeen = box.length;
      this._mailIdx = 0;
    }
    if (!box.length) return;
    this._mailIdx = ((this._mailIdx || 0) % box.length + box.length) % box.length;
    const cur = box[this._mailIdx];
    const title = document.getElementById('mail-title');
    if (title) title.textContent = 'netmoth — Inbox (' + box.length + ')';
    const arrow = (key) => {
      if ((this._mailSortKey || 'when') !== key) return '';
      return (this._mailSortDir == null ? -1 : this._mailSortDir) < 0 ? ' ▼' : ' ▲';
    };
    if (list) {
      list.innerHTML =
        '<div class="mail-row mail-cols">' +
          '<span data-sort="name">From' + arrow('name') + '</span>' +
          '<span data-sort="subject">Subject' + arrow('subject') + '</span>' +
          '<span data-sort="when">Date' + arrow('when') + '</span>' +
        '</div>' +
        box.map((mail, i) => (
          '<div class="mail-row' + (i === this._mailIdx ? ' on' : '') + '" data-mail="' + i + '">' +
            '<span>' + this._esc(mail.name) + '</span>' +
            '<span>' + this._esc(mail.subject) + '</span>' +
            '<span>' + this._esc(this._mailStamp(mail.when)) + '</span>' +
          '</div>'
        )).join('');
    }
    if (read) {
      read.innerHTML =
        '<div class="mail-head">' +
          '<div><strong>From:</strong> ' + this._esc(cur.name) + ' &lt;' + this._esc(cur.from) + '&gt;</div>' +
          '<div><strong>Subject:</strong> ' + this._esc(cur.subject) + '</div>' +
          '<div><strong>Date:</strong> ' + this._esc(this._mailStamp(cur.when, true)) + '</div>' +
        '</div>' +
        '<p>' + this._esc(cur.body).replace(/\n/g, '<br>') + '</p>' +
        (cur.job ? '<button type="button" class="btn" onclick="Game.openMissionBoard()">Open ticket queue</button>' : '');
    }
  },

  mailSelect(i) {
    this._mailIdx = i;
    this._mailHold = 2;
    this._paintXmessage();
  },

  mailNext() {
    const n = this._inbox().length;
    if (!n) return;
    this._mailIdx = ((this._mailIdx || 0) + 1) % n;
    this._mailHold = 2;
    this._paintXmessage();
  },

  mailPrev() {
    const n = this._inbox().length;
    if (!n) return;
    this._mailIdx = ((this._mailIdx || 0) - 1 + n) % n;
    this._mailHold = 2;
    this._paintXmessage();
  },

  mailGet() {
    this._paintXmessage();
    this.toast('NetMoth Mail: no new messages on precinct-13');
  },

  _startMailLoop() {
    if (this._mailTimer) return;
    this._mailTimer = setInterval(() => {
      if (this.state.currentScreen !== 'desktop') return;
      if (this._mailHold) {
        this._mailHold -= 1;
        return;
      }
      const n = this._inbox().length;
      if (n < 2) return;
      this._mailIdx = ((this._mailIdx || 0) + 1) % n;
      this._paintXmessage();
    }, 7000);
  },

  _startClock() {
    const tick = () => this._paintShiftClock();
    tick();
    if (!this._clockTimer) this._clockTimer = setInterval(tick, 1000);
  },

  _paintShiftClock() {
    this._ensureShift();
    const min = this.state.shiftMin;
    const hh = Math.floor(min / 60);
    const mm = min % 60;
    const stamp = this.shiftStamp();
    if (this.els.clock) this.els.clock.textContent = stamp;
    const tray = document.getElementById('task-clock');
    if (tray) tray.textContent = stamp;
    this._setHand('hand-h', ((hh % 12) + mm / 60) * 30);
    this._setHand('hand-m', mm * 6);
    this._setHand('hand-s', 0);
  },

  _setHand(id, deg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('transform', `rotate(${deg} 50 50)`);
  },

  _buildClockFace() {
    const g = document.getElementById('xclock-ticks');
    if (!g) return;
    let marks = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * 30) * Math.PI / 180;
      const x1 = 50 + Math.sin(a) * 40;
      const y1 = 50 - Math.cos(a) * 40;
      const x2 = 50 + Math.sin(a) * 45;
      const y2 = 50 - Math.cos(a) * 45;
      marks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${i % 3 === 0 ? 2 : 1}"/>`;
    }
    g.innerHTML = marks;
  },

  _paintXload() {
    const el = document.getElementById('xload-bars');
    if (!el) return;
    const n = 24;
    const load = 0.25 + ((typeof Mon !== 'undefined' && Mon.hasRed()) ? 0.7 : (this.state.completed.includes('wanted-poster') || this.state.completed.includes('mon-printer') ? 0.1 : 0.45)) + Math.random() * 0.2;
    el.innerHTML = Array.from({ length: n }, (_, i) => {
      const t = (i / n);
      const h = Math.max(8, Math.round(52 * Math.min(1, load * (0.4 + t) * (0.6 + Math.random() * 0.6))));
      const color = h > 40 ? '#cc0000' : '#00aa00';
      return `<div class="xload-bar" style="height:${h}px;background:${color}"></div>`;
    }).join('');
  },

  _paintConsole() {
    const el = this.els.xconsole;
    if (!el) return;
    const done = this.state.completed;
    const lines = [
      'Xlib:  extension "XFree86-VidMode" missing on display ":0".',
      'twm:  started on precinct-13:0',
      (typeof Mon !== 'undefined' && Mon.hasRed())
        ? '<span class="err">mon.precinct: CRITICAL' +
            (function () {
              const row = Mon.snapshot().rows.find((r) => r.alert);
              return row ? ' — ' + row.host : '';
            }()) + '</span>'
        : (Missions.cleared(done, 'mon-printer') || Missions.cleared(done, 'wanted-poster')
          ? 'lp0: idle (miracle)'
          : '<span class="err">lp0 on fire</span>'),
      'sshd[42]: Server listening on 0.0.0.0 port 22.',
      'libvirtd: booking-vm running on precinct-13',
      Missions.cleared(done, 'coffee-c2')
        ? 'coffee.lan: quiet. still brewing.'
        : '<span class="err">coffee.lan: unexpected SYN to 203.0.113.66:4444</span>',
      `session: root   pts/1   rank=${this.rank()}`
    ];
    el.innerHTML = lines.join('\n');
  },

  _bindDesktop() {
    const root = document.getElementById('screen-desktop');
    if (!root) return;

    root.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.twm-icon, .x-gadget, .x-client, button, input, a, .taskbar')) return;
      e.preventDefault();
      this._showRootMenu(e.clientX, e.clientY);
    });

    root.addEventListener('mousedown', (e) => {
      const win = e.target.closest('.x-client, .x-gadget');
      if (!win || !win.id) return;
      if (win.classList.contains('iconified')) return;
      this._raiseWindow(win);
      if (win.id === 'win-xterm' && e.button === 0 && !e.target.closest('button, .term-output')) {
        Terminal.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#root-menu, #task-start')) this._hideRootMenu();
      if (!e.target.closest('#term-menu, .terminal')) Terminal._hideTermMenu();
    });

    document.getElementById('root-menu')?.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._desktopAction(btn.dataset.action);
      });
    });

    document.getElementById('task-start')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleStartMenu();
    });
    document.getElementById('task-pager')?.addEventListener('click', () => {
      this.toast('workspace 1 of 1 — the other screens are on fire');
    });
    document.getElementById('task-mail')?.addEventListener('click', () => {
      this._focusGadget('win-xmessage');
    });
    document.getElementById('mail-list')?.addEventListener('click', (e) => {
      const col = e.target.closest('[data-sort]');
      if (col) {
        this.mailSort(col.dataset.sort);
        return;
      }
      const row = e.target.closest('[data-mail]');
      if (row) this.mailSelect(parseInt(row.dataset.mail, 10));
    });
    document.getElementById('task-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.task-btn');
      if (btn) this._taskClick(btn.dataset.task);
    });

    document.addEventListener('mousemove', (e) => this._trackEyes(e));

    document.querySelectorAll('.x-drag').forEach((el) => this._makeDraggable(el));
    if (this.winBindAll) this.winBindAll();
  },

  _toggleStartMenu() {
    const menu = document.getElementById('root-menu');
    if (!menu) return;
    if (!menu.hidden) {
      this._hideRootMenu();
      return;
    }
    const btn = document.getElementById('task-start');
    const r = btn.getBoundingClientRect();
    menu.hidden = false;
    const h = menu.offsetHeight;
    menu.style.left = r.left + 'px';
    menu.style.top = Math.max(4, r.top - h - 2) + 'px';
    btn.classList.add('open');
  },

  _showRootMenu(x, y) {
    const menu = document.getElementById('root-menu');
    if (!menu) return;
    menu.hidden = false;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - w - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - h - 4) + 'px';
    document.getElementById('task-start')?.classList.add('open');
  },

  _hideRootMenu() {
    const menu = document.getElementById('root-menu');
    if (menu) menu.hidden = true;
    document.getElementById('task-start')?.classList.remove('open');
  },

  _renderTaskbar() {
    const list = document.getElementById('task-list');
    const mail = document.getElementById('task-mail');
    if (!list) return;

    const items = [];
    const specs = this.WINDOWS || {};
    const desk = document.getElementById('screen-desktop');
    let gadgets = desk && desk.querySelectorAll ? desk.querySelectorAll('.x-gadget') : [];
    if (!gadgets.length) {
      gadgets = Object.keys(specs).map((id) => document.getElementById(id)).filter(Boolean);
    }
    gadgets.forEach((el) => {
      if (!el || !el.id) return;
      const spec = specs[el.id] || {};
      if (spec.skipTaskbar) return;
      if (el.classList.contains('withdrawn')) return;
      items.push({
        id: el.id,
        label: spec.label || el.id.replace(/^win-/, ''),
        kind: 'gadget',
        active: this.state.focusedWin === el.id && !el.classList.contains('iconified'),
        iconified: el.classList.contains('iconified')
      });
    });

    list.innerHTML = items.map((it) => `
      <button type="button" class="task-btn${it.active ? ' active' : ''}${it.iconified ? ' iconified' : ''}" data-task="${it.id}" title="${it.label}">
        ${it.label}
      </button>
    `).join('');

    if (mail) {
      const done = this.state.completed || [];
      const waiting = Missions.list().some((m) => !done.includes(m.id) && Missions.isUnlocked(m, done));
      mail.textContent = waiting ? '[!]' : '[ ]';
      mail.classList.toggle('alert', waiting);
    }
  },

  _taskClick(id) {
    this._play('click');
    this._hideRootMenu();
    this._focusGadget(id);
  },

  _focusGadget(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (this.state.currentScreen !== 'desktop') this.showScreen('desktop');
    const raised = this.state.focusedWin === id && !el.classList.contains('iconified');
    if (raised) {
      this.iconifyClient(id, true);
    } else {
      if (this.winOpen) this.winOpen(id);
      else {
        this._raiseWindow(el);
        if (id === 'win-xterm') Terminal.focus();
      }
    }
  },

  _trackEyes(e) {
    if (this.state.currentScreen !== 'desktop') return;
    document.querySelectorAll('.eye').forEach((eye) => {
      const pupil = eye.querySelector('.pupil');
      if (!pupil) return;
      const r = eye.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      const max = Math.min(r.width, r.height) * 0.22;
      pupil.style.transform = `translate(${Math.cos(ang) * max}px, ${Math.sin(ang) * max}px)`;
    });
  },

  _makeDraggable(el) {
    const handle = el.querySelector('.xwin-title') || el;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, .x-rsz')) return;
      e.preventDefault();
      if (el.classList.contains('x-max')) this.winRestore(el.id, true);
      const parent = document.getElementById('screen-desktop');
      const pr = parent.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      el.style.zIndex = String(10 + (this._zseq = (this._zseq || 10) + 1));
      this.state.focusedWin = el.id;
      el.classList.remove('iconified');
      this._renderTaskbar();
      const move = (ev) => {
        el.style.left = Math.max(0, ev.clientX - pr.left - ox) + 'px';
        el.style.top = Math.max(0, ev.clientY - pr.top - oy) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    this._makeResizable(el);
  },

  _winMinSize(el) {
    if (el.id === 'win-xterm') return { w: 280, h: 160 };
    if (el.id === 'win-brief') return { w: 240, h: 140 };
    if (el.id === 'win-virt') return { w: 280, h: 180 };
    if (el.id === 'win-xmessage') return { w: 300, h: 180 };
    if (el.id === 'win-timeclock') return { w: 280, h: 200 };
    if (el.id === 'win-case' || el.id === 'win-manual') return { w: 280, h: 180 };
    if (el.id === 'win-notes' || el.id === 'win-radio' || el.id === 'win-prefs') return { w: 240, h: 160 };
    return { w: 100, h: 72 };
  },

  _makeResizable(el) {
    if (el.querySelector('.x-rsz')) return;
    if (typeof document.createElement !== 'function' || typeof el.appendChild !== 'function') return;
    'n s e w ne nw se sw'.split(' ').forEach((dir) => {
      const g = document.createElement('div');
      g.className = 'x-rsz x-rsz-' + dir;
      g.dataset.dir = dir;
      g.addEventListener('mousedown', (e) => this._beginResize(el, dir, e));
      el.appendChild(g);
    });
  },

  _beginResize(el, dir, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (el.classList.contains('x-max')) this.winRestore(el.id, true);
    const parent = document.getElementById('screen-desktop');
    const pr = parent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const min = this._winMinSize(el);
    const start = {
      x: e.clientX,
      y: e.clientY,
      left: r.left - pr.left,
      top: r.top - pr.top,
      w: r.width,
      h: r.height
    };
    el.classList.add('x-sized');
    el.style.zIndex = String(10 + (this._zseq = (this._zseq || 10) + 1));
    this.state.focusedWin = el.id;
    this._renderTaskbar();
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      let left = start.left;
      let top = start.top;
      let w = start.w;
      let h = start.h;
      if (dir.indexOf('e') !== -1) w = start.w + dx;
      if (dir.indexOf('s') !== -1) h = start.h + dy;
      if (dir.indexOf('w') !== -1) {
        w = start.w - dx;
        left = start.left + dx;
      }
      if (dir.indexOf('n') !== -1) {
        h = start.h - dy;
        top = start.top + dy;
      }
      if (w < min.w) {
        if (dir.indexOf('w') !== -1) left = start.left + start.w - min.w;
        w = min.w;
      }
      if (h < min.h) {
        if (dir.indexOf('n') !== -1) top = start.top + start.h - min.h;
        h = min.h;
      }
      left = Math.max(0, left);
      top = Math.max(0, top);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
});
