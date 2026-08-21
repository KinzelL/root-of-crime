/* ============================================================
   ROOT OF CRIME – Terminal Engine
   ============================================================ */

var Terminal = {
  history: [],
  historyIndex: -1,
  ctx: null,
  vfs: null,
  missionId: null,
  cwd: '/home/itguy',
  home: '/home/itguy',
  user: 'itguy',
  host: 'closet',

  _lastTabValue: '',
  _tabMatches: [],
  _tabIndex: 0,

  outputEl: null,
  inputEl: null,
  promptEl: null,

  commands: {},

  COMMANDS: [
    'help', 'hint', 'man', 'clear', 'cls', 'history',
    'whoami', 'id', 'hostname', 'pwd', 'date', 'uptime', 'uname',
    'echo', 'cat', 'less', 'more', 'head', 'tail', 'wc', 'sort', 'uniq',
    'ls', 'cd', 'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv',
    'chmod', 'find', 'grep', 'file',
    'ps', 'kill', 'pkill',
    'df', 'du',
    'netstat', 'ss',
    'last', 'who',
    'crontab', 'env', 'sudo', 'passwd',
    'ssh', 'ping', 'virsh', 'mount', 'umount', 'lsblk', 'reboot', 'exit'
  ],

  init() {
    this.outputEl = document.getElementById('term-output');
    this.screenEl = document.getElementById('term-screen') || this.outputEl;
    this.inputEl = document.getElementById('termInput');
    this.promptEl = document.querySelector('.term-prompt');

    this.inputEl.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.inputEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      this._insertAtCursor(text);
    });
    const term = document.querySelector('.terminal');
    term?.addEventListener('click', (e) => {
      if ((e.target.closest('.term-output') || e.target.closest('.term-screen')) && String(window.getSelection() || '')) return;
      this.inputEl.focus();
    });
    term?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showTermMenu(e.clientX, e.clientY);
    });
    document.getElementById('term-menu')?.querySelectorAll('button[data-term]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.dataset.term;
        this._hideTermMenu();
        if (act === 'copy') this.copySelection();
        else if (act === 'paste') this.pasteClipboard();
      });
    });
  },

  reset({ missionId, intro, ctx, vfs, cwd, host, user, home }) {
    this.missionId = missionId;
    this.ctx = ctx;
    this.vfs = vfs;
    this.cwd = cwd || '/home/itguy';
    this.host = host || 'closet';
    this.user = user || (this.host === 'closet' ? 'itguy' : 'root');
    this.home = home || (this.host === 'booking-vm' ? '/root' : '/home/itguy');
    this._attached = null;
    this._host = null;
    this._stack = [];
    this._remote = this.host === 'closet' ? null : this.host;
    this.history = [];
    this.historyIndex = -1;
    this._pager = null;
    if (this.inputEl) {
      this.inputEl.readOnly = false;
      this.inputEl.placeholder = '';
    }
    this._resetTabState();
    this._updatePrompt();
    this.outputEl.innerHTML = intro || '';
    this.inputEl.value = '';
    this.inputEl.focus();
  },

  print(text, cls = '') {
    const safe = this._escape(String(text));
    this.outputEl.innerHTML += cls
      ? `<span class="${cls}">${safe}</span>\n`
      : `${safe}\n`;
    this._scroll();
  },

  printRaw(html) {
    this.outputEl.innerHTML += html + (html.endsWith('\n') ? '' : '\n');
    this._scroll();
  },

  clear() {
    this.outputEl.innerHTML = '';
  },

  focus() {
    this.inputEl?.focus();
  },

  _selectedText() {
    const sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel) return sel;
    const el = this.inputEl;
    if (el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd) {
      return el.value.slice(el.selectionStart, el.selectionEnd);
    }
    return this._clip || '';
  },

  _insertAtCursor(text) {
    if (!this.inputEl || text == null) return;
    const el = this.inputEl;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const chunk = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    el.value = el.value.slice(0, start) + chunk + el.value.slice(end);
    const pos = start + chunk.length;
    el.selectionStart = el.selectionEnd = pos;
    el.focus();
  },

  copySelection() {
    const text = this._selectedText();
    if (!text) return;
    this._clip = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  },

  pasteClipboard() {
    const apply = (text) => {
      if (text) this._clip = text;
      this._insertAtCursor(text || this._clip || '');
    };
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(apply).catch(() => apply(this._clip || ''));
      return;
    }
    apply(this._clip || '');
  },

  _showTermMenu(x, y) {
    const menu = document.getElementById('term-menu');
    if (!menu) return;
    const copyBtn = menu.querySelector('[data-term="copy"]');
    if (copyBtn) copyBtn.disabled = !this._selectedText();
    menu.hidden = false;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - w - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - h - 4) + 'px';
  },

  _hideTermMenu() {
    const menu = document.getElementById('term-menu');
    if (menu) menu.hidden = true;
  },

  /* ---------- Input ---------- */
  _onKeyDown(e) {
    if (this._pager) {
      this._onPagerKey(e);
      return;
    }
    if (e.key === 'Enter') {
      const raw = this.inputEl.value;
      this.inputEl.value = '';
      this._resetTabState();
      if (raw.trim()) {
        this.history.push(raw);
        this.historyIndex = this.history.length;
      }
      this._execute(raw);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._resetTabState();
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputEl.value = this.history[this.historyIndex] ?? '';
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._resetTabState();
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.inputEl.value = this.history[this.historyIndex] ?? '';
      } else {
        this.historyIndex = this.history.length;
        this.inputEl.value = '';
      }
      return;
    }
    if (e.key === 'c' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      this.copySelection();
      return;
    }
    if ((e.key === 'v' && e.ctrlKey) || (e.key === 'Insert' && e.shiftKey)) {
      e.preventDefault();
      this.pasteClipboard();
      return;
    }
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      this.printRaw(`<span style="color:var(--prompt)">${this._escape(this.promptEl.textContent)}</span> ${this._escape(this.inputEl.value)}^C`);
      this.inputEl.value = '';
      this._resetTabState();
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      this.clear();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this._handleTab();
      return;
    }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
      this._resetTabState();
    }
  },

  /* ---------- Tab completion ---------- */
  _resetTabState() {
    this._lastTabValue = '';
    this._tabMatches = [];
    this._tabIndex = 0;
  },

  _handleTab() {
    const value = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart ?? value.length;
    if (cursorPos !== value.length) return;

    const parts = value.trimStart().split(/\s+/);
    const isFirstWord = parts.length <= 1 && !value.endsWith(' ');
    const partial = value.endsWith(' ') ? '' : (parts[parts.length - 1] || '');
    const prefix = value.endsWith(' ')
      ? value
      : value.slice(0, value.length - partial.length);

    let matches = [];
    if (typeof Roc !== 'undefined' && Roc.usesKernel()) {
      matches = Roc.complete(value) || [];
    } else if (isFirstWord) {
      matches = this.COMMANDS.filter((c) => c.startsWith(partial.toLowerCase()));
    } else {
      const cmd = parts[0].toLowerCase();
      if (cmd === 'kill') {
        matches = this._pidCompletions(partial);
      } else if (cmd === 'pkill') {
        matches = this._procNameCompletions(partial);
      } else if (cmd === 'uname') {
        matches = ['-a', '-s', '-r'].filter((f) => f.startsWith(partial));
      } else if (cmd === 'man') {
        matches = this.COMMANDS.filter((c) => c.startsWith(partial.toLowerCase()));
      } else {
        matches = this._pathCompletions(partial);
      }
    }

    if (!matches.length) return;

    if (value === this._lastTabValue && this._tabMatches.length > 1) {
      this._tabIndex = (this._tabIndex + 1) % this._tabMatches.length;
      this.inputEl.value = prefix + this._tabMatches[this._tabIndex];
      return;
    }

    this._tabMatches = matches;
    this._tabIndex = 0;
    this._lastTabValue = value;

    if (matches.length === 1) {
      const addSpace = isFirstWord || !matches[0].endsWith('/');
      this.inputEl.value = prefix + matches[0] + (addSpace && isFirstWord ? ' ' : '');
      this._lastTabValue = this.inputEl.value;
    } else {
      const common = this._commonPrefix(matches);
      if (common.length > partial.length) {
        this.inputEl.value = prefix + common;
        this._lastTabValue = this.inputEl.value;
      } else {
        this.print(matches.join('  '), 'muted');
      }
    }
  },

  _pathCompletions(partial) {
    if (!this.vfs) return [];
    const home = this.home;
    let dirPath;
    let namePart;
    if (partial.includes('/')) {
      const cut = partial.lastIndexOf('/');
      const dirRaw = partial.slice(0, cut + 1);
      namePart = partial.slice(cut + 1);
      dirPath = VFS.abs(this.cwd, dirRaw || '/', home);
    } else {
      dirPath = this.cwd;
      namePart = partial;
    }
    const res = VFS.resolve(this.vfs, '/', dirPath);
    if (!res || res.node.type !== 'dir') return [];
    return Object.entries(res.node.children)
      .filter(([n]) => {
        if (!n.startsWith(namePart)) return false;
        if (n.startsWith('.') && !namePart.startsWith('.')) return false;
        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([n, node]) => {
        const stem = partial.slice(0, partial.length - namePart.length);
        return stem + n + (node.type === 'dir' ? '/' : '');
      });
  },

  _pidCompletions(partial) {
    if (!this.ctx?.processes) return [];
    return this.ctx.processes
      .filter((p) => !p.dead)
      .map((p) => String(p.pid))
      .filter((pid) => pid.startsWith(partial));
  },

  _procNameCompletions(partial) {
    if (!this.ctx?.processes) return [];
    const names = new Set();
    this.ctx.processes.forEach((p) => {
      if (p.dead) return;
      const base = p.cmd.split(' ')[0].split('/').pop();
      if (base) names.add(base);
    });
    return [...names].filter((n) => n.startsWith(partial)).sort();
  },

  _commonPrefix(strings) {
    if (!strings.length) return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (!strings[i].startsWith(prefix) && prefix) prefix = prefix.slice(0, -1);
    }
    return prefix;
  },

  /* ---------- Execute ---------- */
  _execute(raw) {
    if (typeof Roc !== 'undefined' && Roc.usesKernel()) {
      this._executeKernel(raw);
      return;
    }
    if (this._pager) this._quitPager();
    const prompt = this.promptEl.textContent;
    this.printRaw(`<span style="color:var(--prompt)">${this._escape(prompt)}</span> ${this._escape(raw)}`);

    let line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) return;

    const hash = line.indexOf(' #');
    if (hash !== -1) line = line.slice(0, hash).trim();

    let redirect = null;
    const redir = line.match(/^(.*?)(>>|>)\s*(\S+)\s*$/);
    if (redir) {
      line = redir[1].trim();
      redirect = { mode: redir[2], path: redir[3] };
    }

    const pipeParts = this._splitPipes(line);
    let stdin = '';
    let last = { stdout: '', stderr: '', code: 0, html: false };

    for (let i = 0; i < pipeParts.length; i++) {
      last = this._runSegment(pipeParts[i], stdin);
      if (last.stderr) this.print(last.stderr.replace(/\n$/, ''), 'error');
      stdin = last.stdout || '';
      if (last.code !== 0 && i < pipeParts.length - 1 && !stdin) break;
    }

    if (redirect) {
      const dest = VFS.abs(this.cwd, redirect.path, this.home);
      const space = this._guestSpace(dest, (last.stdout || '').length);
      if (!space.ok) {
        this.print(redirect.mode + ': ' + space.error, 'error');
      } else {
        const result = VFS.write(this.vfs, this.cwd, redirect.path, last.stdout, {
          append: redirect.mode === '>>',
          home: this.home
        });
        if (!result.ok) this.print(`${redirect.mode}: ${result.error}`, 'error');
      }
    } else if (last.html && pipeParts.length === 1) {
      this.printRaw(last.html);
    } else if (last.stdout) {
      this.print(last.stdout.replace(/\n$/, ''));
    }

    this._afterCommand(raw.trim());
  },

  _executeKernel(raw) {
    if (this._pager && this._pager.kernel) {
      const frame = Roc.pagerKey('q');
      this._applyKernelFrame(frame, { skipEcho: true });
    } else if (this._pager) {
      this._quitPager();
    }
    const prompt = (this.promptEl && this.promptEl.textContent) || (typeof Roc !== 'undefined' ? Roc.prompt() : '');
    this.printRaw(`<span style="color:var(--prompt)">${this._escape(prompt)}</span> ${this._escape(raw)}`);
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const frame = Roc.run(line);
    this._applyKernelFrame(frame, { skipEcho: true });
    if (typeof Game !== 'undefined' && Game._syncFromKernel) Game._syncFromKernel();
    if (typeof Game !== 'undefined' && Game.refreshMissionHud) Game.refreshMissionHud();
    if (typeof Virt !== 'undefined' && (Virt.page === 'mon' || Virt.page === 'ticket')) Virt.paint();
  },

  _applyKernelFrame(frame, opts) {
    if (!frame) return;
    if (frame.clear) this.clear();
    if (frame.pager_active) {
      this._pager = { kernel: true };
      if (this.outputEl) this.outputEl.innerHTML = this._escape(frame.pager_view || '') + '\n';
      if (this.promptEl) this.promptEl.textContent = frame.pager_status || '--More--';
      if (this.inputEl) {
        this.inputEl.value = '';
        this.inputEl.readOnly = true;
      }
      this._scroll();
      return;
    }
    if (this._pager && this._pager.kernel) {
      this._pager = null;
      if (this.inputEl) this.inputEl.readOnly = false;
    }
    if (frame.stderr) this.print(String(frame.stderr).replace(/\n$/, ''), 'error');
    if (frame.stdout && !(opts && opts.skipStdout)) {
      this.print(String(frame.stdout).replace(/\n$/, ''));
    }
    this.host = frame.host || this.host;
    this.cwd = frame.cwd || this.cwd;
    this.user = (this.host === 'closet') ? 'itguy' : 'root';
    this.home = this.host === 'booking-vm' ? '/root' : '/home/itguy';
    if (this.promptEl && frame.prompt) this.promptEl.textContent = frame.prompt;
    this.missionId = frame.current_id || this.missionId;
    this._scroll();
  },

  _splitPipes(line) {
    const parts = [];
    let cur = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        cur += ch;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === '|') {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  },

  _runSegment(segment, stdin) {
    const tokens = this._parse(segment);
    if (!tokens.length) return { stdout: '', stderr: '', code: 0 };

    let name = tokens[0];
    let args = tokens.slice(1);

    if (name === 'sudo') {
      if (!args.length) return { stdout: '', stderr: 'sudo: a command is required', code: 1 };
      this.print('sudo: you are already root. the chief still wants the paperwork.', 'muted');
      name = args[0];
      args = args.slice(1);
    }

    const expanded = [];
    for (const a of args) {
      if (a.includes('*') || a.includes('?')) {
        const hits = VFS.expandGlob(this.vfs, this.cwd, a, this.home);
        expanded.push(...hits);
      } else {
        expanded.push(a);
      }
    }

    const cmd = (this.commands || {})[name.toLowerCase()];
    if (!cmd) {
      return { stdout: '', stderr: `${name}: command not found\nType 'help' if you are lost.`, code: 127 };
    }
    try {
      return cmd.call(this, expanded, stdin) || { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: String(err.message || err), code: 1 };
    }
  },

  _afterCommand(line) {
    const sess = typeof Game !== 'undefined' && Game.ticketSession;
    const id = (sess && sess.id) || this.missionId;
    const mission = Missions.get(id);
    if (!mission) return;
    const ctx = (sess && sess.ctx) || this.ctx;
    const vfs = (sess && sess.vfs) || this.vfs;
    if (typeof mission.afterCommand === 'function') {
      mission.afterCommand(line, ctx, vfs, this);
    }
    if (typeof Mon !== 'undefined' && Mon.tick) Mon.tick(ctx, vfs, mission);
    Game.refreshMissionHud();
  },

  _ok(stdout) {
    return { stdout: stdout ? String(stdout) + (String(stdout).endsWith('\n') ? '' : '\n') : '', stderr: '', code: 0 };
  },

  _err(stderr, code = 1) {
    return { stdout: '', stderr: String(stderr), code };
  },

  _readFile(path) {
    const res = VFS.resolve(this.vfs, this.cwd, path, this.home);
    if (!res) return { error: `cat: ${path}: No such file or directory` };
    if (res.node.type === 'dir') return { error: `cat: ${path}: Is a directory` };
    if (!VFS.readable(res.node)) return { error: `cat: ${path}: Permission denied` };
    return { text: res.node.content, path: res.path, node: res.node };
  },

  _liveProcesses() {
    return (this.ctx?.processes || []).filter((p) => !p.dead);
  },

  _killPid(pid, signal) {
    const proc = (this.ctx?.processes || []).find((p) => p.pid === pid && !p.dead);
    if (!proc) return this._err(`kill: (${pid}) - No such process`);
    if (pid === 1) return this._err('kill: (1) - Operation not permitted');
    if (proc.protected) return this._err(`kill: (${pid}) - Operation not permitted`);
    proc.dead = true;
    this.ctx.killed = this.ctx.killed || [];
    this.ctx.killed.push(proc);
    const word = signal === 'KILL' ? 'Killed' : 'Terminated';
    const name = proc.cmd.split(' ')[0].split('/').pop();
    return this._ok(`[1]  + ${word}                 ${name}`);
  },


  define(names, fn) {
    const list = Array.isArray(names) ? names : [names];
    list.forEach((n) => { this.commands[n] = fn; });
  },

  attachedGuest() {
    if (!this._attached || !this.ctx || !this.ctx.guests) return null;
    return this.ctx.guests[this._attached] || null;
  },

  _guestSpace(path, extra) {
    const guest = this.attachedGuest && this.attachedGuest();
    if (!guest || typeof Virt === 'undefined' || !Virt.ensureSpace) return { ok: true };
    return Virt.ensureSpace(guest, path, extra);
  },

  /* ---------- Internals ---------- */
  _updatePrompt() {
    if (!this.promptEl) return;
    let display = this.cwd;
    if (this.cwd === this.home) display = '~';
    else if (this.cwd && this.home && this.cwd.startsWith(this.home + '/')) {
      display = '~' + this.cwd.slice(this.home.length);
    }
    const sigil = this.user === 'root' ? '#' : '$';
    this.promptEl.textContent = `${this.user}@${this.host}:${display}${sigil}`;
  },

  ensureDesk() {
    if (this._stack && this._stack.length) return;
    if (this.vfs && this.host === 'closet' && !this._remote) return;
    const vfs = VFS.clone(VFS.createBase());
    const hn = VFS.resolve(vfs, '/', '/etc/hostname');
    if (hn && hn.node) hn.node.content = 'closet\n';
    if (typeof Infra !== 'undefined') Infra.boot();
    const motd = VFS.resolve(vfs, '/', '/etc/motd');
    if (motd && motd.node) motd.node.content = VFS.closetMotd();
    const issue = VFS.resolve(vfs, '/', '/etc/issue');
    if (issue && issue.node) issue.node.content = 'ClosetOS 13 (Duct Tape) \\n \\l\n';
    const hosts = VFS.resolve(vfs, '/', '/etc/hosts');
    if (hosts && hosts.node && typeof Infra !== 'undefined') hosts.node.content = Infra.hostsFile();
    const home = VFS.resolve(vfs, '/', '/home/itguy');
    if (home && home.node && home.node.children) {
      home.node.children['jump.txt'] = VFS.file(
        typeof Infra !== 'undefined' ? Infra.jumpNote() : (
          'This closet is a jump host. The LAN is already up.\n' +
          '  ssh precinct-13\n' +
          '  ssh booking-vm\n'
        )
      );
    }
    this.vfs = vfs;
    this.ctx = { processes: baseProcs(), hintLevel: 0 };
    this.cwd = '/home/itguy';
    this.home = '/home/itguy';
    this.host = 'closet';
    this.user = 'itguy';
    this._attached = null;
    this._remote = null;
    this._stack = [];
    if (this.outputEl && !this._deskIntro) {
      this.outputEl.innerHTML = '';
      this.print(VFS.closetMotd().replace(/\n$/, ''));
      this._deskIntro = true;
    }
    this._updatePrompt();
    const xt = typeof document !== 'undefined' ? document.getElementById('xterm-title') : null;
    if (xt) xt.textContent = 'xterm — itguy@closet';
  },

  dropToDesk() {
    while (this._stack && this._stack.length) this.popSession();
    this._attached = null;
    this._remote = null;
    this.ensureDesk();
  },

  _snapSession() {
    return {
      vfs: this.vfs,
      cwd: this.cwd,
      host: this.host,
      home: this.home,
      user: this.user,
      ctx: this.ctx,
      attached: this._attached,
      remote: this._remote,
      missionId: this.missionId
    };
  },

  _applySession(s) {
    this.vfs = s.vfs;
    this.cwd = s.cwd;
    this.host = s.host;
    this.home = s.home;
    this.user = s.user || 'root';
    this.ctx = s.ctx;
    this._attached = s.attached || null;
    this._remote = s.remote || null;
    if (s.missionId) this.missionId = s.missionId;
    this._updatePrompt();
    const xt = typeof document !== 'undefined' ? document.getElementById('xterm-title') : null;
    if (xt) xt.textContent = 'xterm — ' + this.user + '@' + this.host;
  },

  pushSession(next) {
    this._stack = this._stack || [];
    this._stack.push(this._snapSession());
    this._applySession(next);
  },

  popSession() {
    const prev = (this._stack || []).pop();
    if (!prev) return null;
    this._applySession(prev);
    return prev;
  },

  attach(name, opts) {
    const id = name || (typeof Virt !== 'undefined' ? Virt.GUEST : 'booking-vm');
    const ctx = (opts && opts.ctx) || this.ctx;
    const guest = ctx && ctx.guests && ctx.guests[id];
    if (!guest) return this._err('ssh: Could not resolve hostname ' + id);
    if (this._remote === id || this._attached === id) {
      return this._ok('already on ' + guest.hostname);
    }
    this.pushSession({
      vfs: guest.vfs,
      cwd: '/root',
      host: guest.hostname,
      home: '/root',
      user: 'root',
      ctx: ctx,
      attached: guest.id,
      remote: guest.id,
      missionId: this.missionId
    });
    if (ctx) ctx.usedConsole = true;
    return this._ok('Connected to ' + guest.hostname + '. Type exit to return.');
  },

  detach() {
    if (!this._stack || !this._stack.length) return this._ok('');
    this.popSession();
    return this._ok('Connection closed.');
  },

  _parse(line) {
    return line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((s) => s.replace(/^["']|["']$/g, '')) || [];
  },

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _scroll() {
    const el = this.screenEl || this.outputEl;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
};


Terminal.COMMAND_SOURCES = ['help.js', 'fs.js', 'text.js', 'ops.js', 'virt.js'];
if (typeof document !== 'undefined' && document.currentScript) {
  const dir = document.currentScript.src.replace(/[^/]+$/, 'commands/');
  Terminal.COMMAND_SOURCES.forEach((file) => {
    document.write('<script src="' + dir + file + '"><\/script>');
  });
}
