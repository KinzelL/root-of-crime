/* ROOT OF CRIME – process / disk / net / cron */

Object.assign(Terminal, {
  _cmdPs(args) {
    const procs = this._liveProcesses();
    if (!procs.length) return this._ok('  PID TTY          TIME CMD\n    1 ?            00:00:12 init');
    const long = args.some((a) => /a|u|x|e|f/.test(a.replace(/^-/, ''))) || args.includes('aux') || args.includes('-aux') || args.includes('-ef');
    if (long) {
      const lines = ['USER         PID %CPU %MEM    TTY      STAT START   TIME COMMAND'];
      const htmlLines = [this._escape(lines[0])];
      procs.forEach((p) => {
        const line = `${p.user.padEnd(12)}${String(p.pid).padEnd(6)}${String(p.cpu).padEnd(5)}${String(p.mem).padEnd(5)}  ${String(p.tty).padEnd(7)} S    ${String(p.start).padEnd(7)}${p.time} ${p.cmd}`;
        lines.push(line);
        if (p.highlight) htmlLines.push(`<span class="highlight">${this._escape(line)}</span>`);
        else htmlLines.push(this._escape(line));
      });
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0, html: htmlLines.join('\n') + '\n' };
    }
    const lines = ['  PID TTY          TIME CMD'];
    procs.forEach((p) => {
      lines.push(` ${String(p.pid).padStart(5)} ${String(p.tty).padEnd(12)} ${p.time} ${p.cmd.split(' ')[0]}`);
    });
    return this._ok(lines.join('\n'));
  },

  _cmdKill(args) {
    if (!this.ctx?.processes) return this._err('kill: no process table in this context');
    let signal = 'TERM';
    const rest = [];
    args.forEach((a) => {
      if (['-9', '-KILL', '-SIGKILL'].includes(a)) signal = 'KILL';
      else if (['-15', '-TERM', '-SIGTERM'].includes(a)) signal = 'TERM';
      else rest.push(a);
    });
    if (!rest.length) return this._err('kill: usage: kill [-9] <PID>');
    const pid = parseInt(rest[0], 10);
    if (!pid) return this._err('kill: usage: kill [-9] <PID>');
    return this._killPid(pid, signal);
  },

  _cmdPkill(args) {
    if (!this.ctx?.processes) return this._err('pkill: no process table in this context');
    const pattern = (args[0] || '').toLowerCase();
    if (!pattern) return this._err('pkill: usage: pkill <pattern>');
    const hits = this._liveProcesses().filter((p) => p.cmd.toLowerCase().includes(pattern) || p.cmd.split('/').pop().toLowerCase().includes(pattern));
    if (!hits.length) return this._err(`pkill: no process found matching '${args[0]}'`);
    const results = [];
    hits.forEach((p) => {
      const r = this._killPid(p.pid, 'TERM');
      if (r.stdout) results.push(r.stdout.trim());
    });
    return this._ok(results.join('\n'));
  },

  _cmdDf(args) {
    const guest = this.attachedGuest && this.attachedGuest();
    if (guest) return this._ok(Virt.dfTable(guest));
    const used = VFS.sizeOf(this.vfs);
    const total = this.ctx?.diskTotal || 512000;
    const avail = Math.max(0, total - used);
    const pct = Math.min(99, Math.round((used / total) * 100));
    const human = (args || []).some((a) => a === '-h' || a === '-H');
    const fmt = (n) => {
      if (!human) return `${Math.max(0, Math.round(n / 1024))}K`;
      if (n < 1024) return `${n}B`;
      if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
      return `${(n / (1024 * 1024)).toFixed(1)}M`;
    };
    if (human) {
      return this._ok(
        'Filesystem      Size  Used Avail Use% Mounted on\n' +
        `/dev/sda1      ${fmt(total).padStart(5)} ${fmt(used).padStart(5)} ${fmt(avail).padStart(5)}  ${String(pct).padStart(3)}% /`
      );
    }
    return this._ok(
      'Filesystem     1K-blocks    Used Available Use% Mounted on\n' +
      `/dev/sda1      ${fmt(total).padStart(9)} ${fmt(used).padStart(7)} ${fmt(avail).padStart(9)}  ${String(pct).padStart(3)}% /`
    );
  },

  _cmdDu(args) {
    const human = args.includes('-h') || args.includes('-sh') || args.includes('-hs');
    const summarize = args.includes('-s') || args.includes('-sh') || args.includes('-hs');
    const paths = args.filter((a) => !a.startsWith('-'));
    const targets = paths.length ? paths : ['.'];
    const format = (n) => {
      if (!human) return String(Math.max(1, Math.round(n / 1024)));
      if (n < 1024) return `${n}B`;
      if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
      return `${(n / (1024 * 1024)).toFixed(1)}M`;
    };
    const lines = [];
    for (const target of targets) {
      const res = VFS.resolve(this.vfs, this.cwd, target, this.home);
      if (!res) return this._err(`du: cannot access '${target}': No such file or directory`);
      if (summarize || res.node.type === 'file' || targets.length > 1) {
        lines.push(`${format(VFS.sizeOf(res.node))}\t${target}`);
        continue;
      }
      Object.entries(res.node.children || {}).forEach(([name, child]) => {
        lines.push(`${format(VFS.sizeOf(child))}\t${name}`);
      });
      lines.push(`${format(VFS.sizeOf(res.node))}\t.`);
    }
    return this._ok(lines.join('\n'));
  },

  _cmdNetstat() {
    const conns = this.ctx?.connections || [
      { proto: 'tcp', local: '0.0.0.0:22', remote: '0.0.0.0:*', state: 'LISTEN', proc: 'sshd' },
      { proto: 'tcp', local: '127.0.0.1:631', remote: '0.0.0.0:*', state: 'LISTEN', proc: 'cupsd' }
    ];
    const lines = ['Proto Local Address           Foreign Address         State       PID/Program name'];
    conns.forEach((c) => {
      const line = `${c.proto.padEnd(5)} ${c.local.padEnd(22)} ${c.remote.padEnd(23)} ${c.state.padEnd(11)} ${c.proc}`;
      lines.push(c.highlight ? line : line);
    });
    if (this.ctx) this.ctx.usedNetstat = true;
    const html = lines.map((line, i) => {
      if (i > 0 && conns[i - 1]?.highlight) return `<span class="highlight">${this._escape(line)}</span>`;
      return this._escape(line);
    }).join('\n') + '\n';
    return { stdout: lines.join('\n') + '\n', stderr: '', code: 0, html };
  },

  _cmdLast() {
    const extra = this.ctx?.lastLog || '';
    const base =
      'root     tty1         Fri Aug 14 19:02   still logged in\n' +
      'chief    pts/0        Fri Aug 14 18:55   still logged in\n' +
      'miller   pts/2        Fri Aug 14 17:10 - 17:44  (00:34)\n';
    if (this.ctx) this.ctx.usedLast = true;
    return this._ok(base + extra);
  },

  _cmdCrontab(args) {
    if (!args.includes('-l') && args[0] !== '-l') {
      return this._err('crontab: usage: crontab -l');
    }
    const file = VFS.resolve(this.vfs, '/', '/etc/crontab');
    const extraDir = VFS.resolve(this.vfs, '/', '/etc/cron.d');
    let out = file ? file.node.content : '';
    if (extraDir && extraDir.node.type === 'dir') {
      Object.entries(extraDir.node.children).forEach(([name, node]) => {
        out += `\n# /etc/cron.d/${name}\n${node.content}`;
      });
    }
    if (this.ctx) this.ctx.usedCrontab = true;
    return this._ok(out);
  },

  _cmdPasswd(args) {
    const target = args[0] || 'root';
    if (this.ctx?.allowPasswdFor && (target === this.ctx.allowPasswdFor || args.length === 0 && this.ctx.allowPasswdFor === 'root')) {
      this.ctx.passwordChanged = this.ctx.passwordChanged || [];
      this.ctx.passwordChanged.push(this.ctx.allowPasswdFor);
      return this._ok(`Changing password for ${this.ctx.allowPasswdFor}.\nNew password: ********\npasswd: password updated successfully`);
    }
    if (target === 'coffee' || target === 'beantek') {
      this.ctx.passwordChanged = this.ctx.passwordChanged || [];
      this.ctx.passwordChanged.push('coffee');
      return this._ok('Changing password for coffee.\nNew password: ********\npasswd: password updated successfully');
    }
    return this._err('passwd: Authentication token manipulation error\n(This console only lets you rotate the appliance account.)');
  },

  _cmdPing(args) {
    const raw = (args[0] || '').trim();
    if (!raw || raw.startsWith('-')) return this._err('usage: ping HOST');
    if (typeof Infra === 'undefined') return this._err('ping: network is down');
    Infra.boot();
    const id = Infra.resolve(raw);
    const rec = Infra.catalog(id);
    if (!rec) return this._err('ping: ' + raw + ': Name or service not known');
    return this._ok(
      'PING ' + rec.id + ' (' + rec.addr + ') 56(84) bytes of data.\n' +
      '64 bytes from ' + rec.id + ' (' + rec.addr + '): icmp_seq=1 ttl=64 time=0.4 ms\n' +
      '64 bytes from ' + rec.id + ' (' + rec.addr + '): icmp_seq=2 ttl=64 time=0.3 ms\n' +
      '--- ' + rec.id + ' ping statistics ---\n' +
      '2 packets transmitted, 2 received, 0% packet loss'
    );
  }
});

Terminal.define('ps', function (args) { return this._cmdPs(args); });
Terminal.define('kill', function (args) { return this._cmdKill(args); });
Terminal.define('pkill', function (args) { return this._cmdPkill(args); });
Terminal.define('df', function (args) { return this._cmdDf(args); });
Terminal.define(['netstat', 'ss'], function (args) { return this._cmdNetstat(args); });
Terminal.define('du', function (args) { return this._cmdDu(args); });
Terminal.define('last', function () { return this._cmdLast(); });
Terminal.define('who', function () {
  return this._ok('root     tty1         2026-08-14 19:02\nchief    pts/0        2026-08-14 18:55');
});
Terminal.define('crontab', function (args) { return this._cmdCrontab(args); });
Terminal.define('passwd', function (args) { return this._cmdPasswd(args); });
Terminal.define('ping', function (args) { return this._cmdPing(args); });
