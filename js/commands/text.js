/* ROOT OF CRIME – text commands + pager */

Object.assign(Terminal, {
  _cmdCat(args, stdin) {
    if (!args.length) return this._ok(stdin || '');
    const chunks = [];
    for (const a of args) {
      const got = this._readFile(a);
      if (got.error) return this._err(got.error);
      chunks.push(got.text);
      if (this.ctx) {
        this.ctx.readFiles = this.ctx.readFiles || [];
        if (!this.ctx.readFiles.includes(got.path)) this.ctx.readFiles.push(got.path);
      }
    }
    return this._ok(chunks.join(''));
  },

  _cmdLess(args, stdin) {
    const paths = args.filter((a) => !a.startsWith('-'));
    let text = '';
    let title = '';
    if (paths.length) {
      const chunks = [];
      for (const a of paths) {
        const got = this._readFile(a);
        if (got.error) return this._err(got.error.replace(/^cat:/, 'less:'));
        chunks.push(got.text);
        if (this.ctx) {
          this.ctx.readFiles = this.ctx.readFiles || [];
          if (!this.ctx.readFiles.includes(got.path)) this.ctx.readFiles.push(got.path);
        }
        title = got.path;
      }
      text = chunks.join('\n');
      if (paths.length > 1) title = paths.length + ' files';
    } else {
      text = stdin || '';
      title = '(stdin)';
      if (!text) return this._err('less: missing filename (try: less FILE)');
    }
    const lines = String(text).replace(/\n$/, '').split('\n');
    this._pager = {
      lines,
      pos: 0,
      title,
      saved: this.outputEl ? this.outputEl.innerHTML : ''
    };
    this._renderPager();
    return { stdout: '', stderr: '', code: 0 };
  },

  _pagerPageSize() {
    const el = this.screenEl || this.outputEl;
    if (!el || !el.clientHeight) return 20;
    let lh = 18;
    try {
      const style = window.getComputedStyle(el);
      const parsed = parseFloat(style.lineHeight);
      if (parsed) lh = parsed;
    } catch {
      /* headless */
    }
    return Math.max(8, Math.floor(el.clientHeight / lh) - 1);
  },

  _renderPager() {
    if (!this._pager || !this.outputEl) return;
    const page = this._pagerPageSize();
    const { lines, pos, title } = this._pager;
    const slice = lines.slice(pos, pos + page);
    this.outputEl.innerHTML = this._escape(slice.join('\n')) + '\n';
    const atEnd = pos + page >= lines.length;
    const pct = lines.length ? Math.min(100, Math.round(((pos + slice.length) / lines.length) * 100)) : 100;
    const label = atEnd ? `--END-- ${title}` : `--More--(${pct}%) ${title}`;
    if (this.promptEl) this.promptEl.textContent = label;
    if (this.inputEl) {
      this.inputEl.value = '';
      this.inputEl.readOnly = true;
      this.inputEl.placeholder = '';
    }
    this._scroll();
  },

  _pagerPage(dir) {
    if (!this._pager) return;
    const page = this._pagerPageSize();
    const max = Math.max(0, this._pager.lines.length - page);
    this._pager.pos = Math.max(0, Math.min(max, this._pager.pos + dir * page));
    this._renderPager();
  },

  _pagerLine(dir) {
    if (!this._pager) return;
    const page = this._pagerPageSize();
    const max = Math.max(0, this._pager.lines.length - page);
    this._pager.pos = Math.max(0, Math.min(max, this._pager.pos + dir));
    this._renderPager();
  },

  _quitPager() {
    if (!this._pager) return;
    const { lines, pos, saved } = this._pager;
    const page = this._pagerPageSize();
    const shown = lines.slice(pos, pos + page).join('\n');
    this._pager = null;
    if (this.outputEl) {
      this.outputEl.innerHTML = (saved != null ? saved : '') + this._escape(shown) + (shown ? '\n' : '');
    }
    if (this.inputEl) {
      this.inputEl.readOnly = false;
      this.inputEl.placeholder = '';
      this.inputEl.value = '';
    }
    this._updatePrompt();
    this._scroll();
  },

  _onPagerKey(e) {
    e.preventDefault();
    e.stopPropagation();
    const k = e.key;
    if (k === 'q' || k === 'Q' || k === 'Escape') this._quitPager();
    else if (k === ' ' || k === 'f' || k === 'F' || k === 'PageDown') this._pagerPage(1);
    else if (k === 'b' || k === 'B' || k === 'PageUp') this._pagerPage(-1);
    else if (k === 'Enter' || k === 'j' || k === 'ArrowDown') this._pagerLine(1);
    else if (k === 'k' || k === 'ArrowUp') this._pagerLine(-1);
    else if (k === 'g') {
      this._pager.pos = 0;
      this._renderPager();
    } else if (k === 'G') {
      this._pager.pos = Math.max(0, this._pager.lines.length - this._pagerPageSize());
      this._renderPager();
    } else if (k === 'c' && e.ctrlKey) {
      this._quitPager();
    }
  },

  _cmdHeadTail(args, stdin, kind) {
    let n = 10;
    const paths = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1]) {
        n = parseInt(args[i + 1], 10) || 10;
        i++;
      } else if (/^-n?\d+$/.test(args[i])) {
        n = parseInt(args[i].replace('-n', '').replace('-', ''), 10) || 10;
      } else paths.push(args[i]);
    }
    let text = stdin;
    if (paths.length) {
      const got = this._readFile(paths[0]);
      if (got.error) return this._err(got.error.replace(/^cat/, kind));
      text = got.text;
      if (this.ctx) {
        this.ctx.readFiles = this.ctx.readFiles || [];
        if (!this.ctx.readFiles.includes(got.path)) this.ctx.readFiles.push(got.path);
      }
    }
    const lines = String(text || '').replace(/\n$/, '').split('\n');
    const slice = kind === 'head' ? lines.slice(0, n) : lines.slice(-n);
    return this._ok(slice.join('\n'));
  },

  _cmdWc(args, stdin) {
    const paths = args.filter((a) => !a.startsWith('-'));
    const summarize = (text, label) => {
      const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const bytes = text.length;
      return `${String(lines).padStart(7)} ${String(words).padStart(7)} ${String(bytes).padStart(7)}` + (label ? ` ${label}` : '');
    };
    if (!paths.length) return this._ok(summarize(stdin || ''));
    const lines = [];
    for (const p of paths) {
      const got = this._readFile(p);
      if (got.error) return this._err(got.error.replace(/^cat/, 'wc'));
      lines.push(summarize(got.text, p));
    }
    return this._ok(lines.join('\n'));
  },

  _cmdSort(args, stdin) {
    let text = stdin;
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length) {
      const got = this._readFile(paths[0]);
      if (got.error) return this._err(got.error.replace(/^cat/, 'sort'));
      text = got.text;
    }
    const lines = String(text || '').replace(/\n$/, '').split('\n');
    lines.sort();
    return this._ok(lines.join('\n'));
  },

  _cmdUniq(args, stdin) {
    let text = stdin;
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length) {
      const got = this._readFile(paths[0]);
      if (got.error) return this._err(got.error.replace(/^cat/, 'uniq'));
      text = got.text;
    }
    const lines = String(text || '').replace(/\n$/, '').split('\n');
    const out = [];
    for (const line of lines) {
      if (out[out.length - 1] !== line) out.push(line);
    }
    return this._ok(out.join('\n'));
  },

  _cmdGrep(args, stdin) {
    const flags = new Set();
    const rest = [];
    args.forEach((a) => {
      if (a.startsWith('-') && a !== '-') a.slice(1).split('').forEach((c) => flags.add(c));
      else rest.push(a);
    });
    if (!rest.length && !stdin) return this._err('Usage: grep [ -i ] [ -r ] PATTERN [FILE...]');
    const pattern = rest[0];
    const files = rest.slice(1);
    if (!files.length && !stdin && !flags.has('r') && !flags.has('R')) {
      return this._err('Usage: grep [ -i ] [ -r ] PATTERN [FILE...]');
    }
    let re;
    try {
      re = new RegExp(pattern, flags.has('i') ? 'i' : '');
    } catch {
      return this._err(`grep: invalid pattern`);
    }

    const hits = [];
    const searchText = (text, label) => {
      String(text).split('\n').forEach((line) => {
        if (re.test(line)) hits.push(label ? `${label}:${line}` : line);
      });
    };

    if (!files.length) {
      if (flags.has('r') || flags.has('R')) {
        files.push('.');
      } else {
        searchText(stdin || '', '');
        if (this.ctx && hits.length) this.ctx.grepHits = (this.ctx.grepHits || 0) + hits.length;
        return this._ok(hits.join('\n'));
      }
    }

    const visit = (pathArg) => {
      const res = VFS.resolve(this.vfs, this.cwd, pathArg, this.home);
      if (!res) {
        hits.push(`grep: ${pathArg}: No such file or directory`);
        return;
      }
      if (res.node.type === 'dir') {
        if (flags.has('r') || flags.has('R')) {
          VFS.walk(res.node, res.path, (node, path) => {
            if (node.type === 'file' && VFS.readable(node)) {
              const before = hits.length;
              searchText(node.content, path);
              if (hits.length > before && this.ctx) {
                this.ctx.readFiles = this.ctx.readFiles || [];
                if (!this.ctx.readFiles.includes(path)) this.ctx.readFiles.push(path);
              }
            }
          });
        } else {
          hits.push(`grep: ${pathArg}: Is a directory`);
        }
        return;
      }
      if (!VFS.readable(res.node)) {
        hits.push(`grep: ${pathArg}: Permission denied`);
        return;
      }
      if (this.ctx) {
        this.ctx.readFiles = this.ctx.readFiles || [];
        if (!this.ctx.readFiles.includes(res.path)) this.ctx.readFiles.push(res.path);
      }
      searchText(res.node.content, files.length + (flags.has('r') ? 1 : 0) > 1 ? res.path : '');
    };
    files.forEach(visit);
    if (this.ctx && hits.length) {
      this.ctx.grepHits = (this.ctx.grepHits || 0) + hits.length;
      this.ctx.grepPatterns = this.ctx.grepPatterns || [];
      this.ctx.grepPatterns.push(pattern.toLowerCase());
    }
    return this._ok(hits.join('\n'));
  }
});

Terminal.define('cat', function (args, stdin) { return this._cmdCat(args, stdin); });
Terminal.define(['less', 'more'], function (args, stdin) { return this._cmdLess(args, stdin); });
Terminal.define('head', function (args, stdin) { return this._cmdHeadTail(args, stdin, 'head'); });
Terminal.define('tail', function (args, stdin) { return this._cmdHeadTail(args, stdin, 'tail'); });
Terminal.define('wc', function (args, stdin) { return this._cmdWc(args, stdin); });
Terminal.define('sort', function (args, stdin) { return this._cmdSort(args, stdin); });
Terminal.define('uniq', function (args, stdin) { return this._cmdUniq(args, stdin); });
Terminal.define('grep', function (args, stdin) { return this._cmdGrep(args, stdin); });
