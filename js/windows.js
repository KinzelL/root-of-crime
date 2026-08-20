/* ============================================================
   ROOT OF CRIME – window contract

   Every desktop client MUST support:
     winMinimize  hide, stay on the taskbar
     winMaximize  fill the desk (fullscreen)
     winRestore   leave fullscreen
     winClose     withdraw; leave the taskbar until winOpen

   To add a window:
     1. Put a #win-* .xwin.x-gadget.x-drag on #screen-desktop
     2. Register it in Game.WINDOWS below (label is mandatory)
     3. Open it with Game.winOpen('win-foo') — never a one-off overlay
     Chrome (_, □/❐, X) is installed by winBindAll(). Do not hand-roll buttons.
   ============================================================ */

Object.assign(Game, {
  WINDOWS: {
    'win-xterm': {
      label: 'xterm',
      onOpen() {
        if (typeof Terminal !== 'undefined') {
          if (Game.ensureDeskShell) Game.ensureDeskShell();
          Terminal.focus();
        }
      }
    },
    'win-virt': { label: 'netmoth', onOpen() { if (typeof Virt !== 'undefined') Virt.paint(); } },
    'win-timeclock': { label: 'timeclock', onOpen() { this._paintTimeclock(); } },
    'win-xmessage': { label: 'mail', onOpen() { this._paintXmessage(); } },
    'win-xconsole': { label: 'xconsole', onOpen() { this._paintConsole(); } },
    'win-xclock': { label: 'xclock' },
    'win-xeyes': { label: 'xeyes' },
    'win-xload': { label: 'xload' },
    'win-status': { label: 'xbiff' },
    'win-case': { label: 'casefile', session: true },
    'win-notes': { label: 'notes', session: true },
    'win-radio': { label: 'radio', session: true },
    'win-manual': { label: 'xman', session: true, onOpen() { this._paintManual(); } },
    'win-prefs': { label: 'twmprefs', session: true },
    'win-brief': { label: 'slip', skipTaskbar: true }
  },

  winSpec(id) {
    return (this.WINDOWS || {})[id] || null;
  },

  winEl(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  },

  winList() {
    return Object.keys(this.WINDOWS || {});
  },

  winMinimize(id, quiet) {
    const el = this.winEl(id);
    if (!el) return;
    el.classList.add('iconified');
    el.classList.remove('withdrawn');
    if (this.state.focusedWin === id) this.state.focusedWin = null;
    if (id === 'win-timeclock' && this._shiftView !== 'status') this._shiftView = 'status';
    this._renderTaskbar();
    if (!quiet) this._play('click');
  },

  winMaximize(id) {
    const el = this.winEl(id);
    if (!el) return;
    if (!el._geom) {
      el._geom = {
        left: el.style.left || '',
        top: el.style.top || '',
        right: el.style.right || '',
        bottom: el.style.bottom || '',
        width: el.style.width || '',
        height: el.style.height || ''
      };
    }
    el.classList.add('x-max');
    this._updateWinBtns(el);
    this._raiseWindow(el);
    this._play('click');
  },

  winRestore(id, quiet) {
    const el = this.winEl(id);
    if (!el) return;
    el.classList.remove('x-max');
    const g = el._geom;
    if (g) {
      el.style.left = g.left;
      el.style.top = g.top;
      el.style.right = g.right;
      el.style.bottom = g.bottom;
      el.style.width = g.width;
      el.style.height = g.height;
    }
    this._updateWinBtns(el);
    if (!quiet) this._play('click');
  },

  winToggleMax(id) {
    const el = this.winEl(id);
    if (!el) return;
    if (el.classList.contains('x-max')) this.winRestore(id);
    else this.winMaximize(id);
  },

  winClose(id, quiet) {
    const el = this.winEl(id);
    if (!el) return;
    if (el.classList.contains('x-max')) this.winRestore(id, true);
    el.classList.add('iconified', 'withdrawn');
    if (this.state.focusedWin === id) this.state.focusedWin = null;
    if (id === 'win-timeclock' && this._shiftView !== 'status') this._shiftView = 'status';
    this._renderTaskbar();
    if (!quiet) this._play('click');
  },

  winOpen(id) {
    const el = this.winEl(id);
    if (!el) return;
    this._raiseWindow(el);
    const spec = this.winSpec(id);
    if (spec && typeof spec.onOpen === 'function') spec.onOpen.call(this, el);
  },

  iconifyClient(id, quiet) { return this.winMinimize(id, quiet); },
  maximizeClient(id) { return this.winMaximize(id); },
  restoreClient(id, quiet) { return this.winRestore(id, quiet); },
  toggleMax(id) { return this.winToggleMax(id); },
  closeClient(id, quiet) { return this.winClose(id, quiet); },
  openClient(id) { return this.winOpen(id); },

  _updateWinBtns(el) {
    const btn = el && el.querySelector && el.querySelector('[data-win="max"]');
    if (!btn) return;
    const maxed = el.classList.contains('x-max');
    btn.textContent = maxed ? '❐' : '□';
    btn.title = maxed ? 'restore' : 'maximize';
  },

  _raiseWindow(el) {
    if (!el) return;
    el.classList.remove('iconified', 'withdrawn');
    el.style.zIndex = String(10 + (this._zseq = (this._zseq || 10) + 1));
    this.state.focusedWin = el.id;
    this._updateWinBtns(el);
    this._renderTaskbar();
  },

  _deskAppIds() {
    return this.winList().filter((id) => this.WINDOWS[id] && this.WINDOWS[id].session);
  },

  _withdrawDeskApps() {
    this._deskAppIds().forEach((id) => this.winClose(id, true));
  },

  winBind(el) {
    if (!el || !el.id) return;
    const title = el.querySelector && el.querySelector('.xwin-title');
    if (!title) return;
    if (title.querySelector && title.querySelector('.xwin-btns-live')) {
      this._updateWinBtns(el);
      return;
    }
    if (title.querySelectorAll) {
      title.querySelectorAll('.xwin-dot, .xwin-iconify, .xwin-close, .xwin-btns').forEach((n) => n.remove());
    }
    const box = document.createElement('span');
    box.className = 'xwin-btns xwin-btns-live';
    box.innerHTML =
      '<button type="button" class="xwin-iconify" title="minimize" data-win="min">_</button>' +
      '<button type="button" class="xwin-max" title="maximize" data-win="max">□</button>' +
      '<button type="button" class="xwin-close" title="close" data-win="close">X</button>';
    title.appendChild(box);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = e.target && e.target.dataset && e.target.dataset.win;
      if (act === 'min') this.winMinimize(el.id);
      else if (act === 'max') this.winToggleMax(el.id);
      else if (act === 'close') this.winClose(el.id);
    });
    title.addEventListener('dblclick', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      this.winToggleMax(el.id);
    });
    this._updateWinBtns(el);
  },

  winBindAll() {
    this.winList().forEach((id) => {
      const el = this.winEl(id);
      if (el) this.winBind(el);
    });
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('#screen-desktop .x-gadget').forEach((el) => this.winBind(el));
  }
});
