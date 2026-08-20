/* ROOT OF CRIME – filesystem commands */

Object.assign(Terminal, {
  _cmdCd(args) {
    const target = args[0] || '~';
    const full = VFS.abs(this.cwd, target, this.home);
    const res = VFS.resolve(this.vfs, '/', full);
    if (!res) return this._err(`cd: ${target}: No such file or directory`);
    if (res.node.type !== 'dir') return this._err(`cd: ${target}: Not a directory`);
    if (this.ctx?.jail && !full.startsWith(this.ctx.jail) && full !== this.ctx.jail) {
      return this._err(`cd: permission denied: cannot leave ${this.ctx.jail} during this task`);
    }
    this.cwd = full;
    this._updatePrompt();
    return this._ok('');
  },

  _cmdLs(args) {
    const flags = new Set();
    const paths = [];
    args.forEach((a) => {
      if (a.startsWith('-') && a !== '-') {
        a.slice(1).split('').forEach((c) => flags.add(c));
      } else paths.push(a);
    });
    const long = flags.has('l');
    const all = flags.has('a') || flags.has('A');
    const targets = paths.length ? paths : ['.'];

    const blocks = [];
    for (const t of targets) {
      const res = VFS.resolve(this.vfs, this.cwd, t, this.home);
      if (!res) return this._err(`ls: cannot access '${t}': No such file or directory`);
      if (res.node.type === 'file') {
        blocks.push(long ? VFS.formatLong(VFS.basename(res.path), res.node) : VFS.basename(res.path));
        continue;
      }
      let names = Object.keys(res.node.children).sort();
      if (!all) names = names.filter((n) => !n.startsWith('.'));
      if (all) names = ['.', '..', ...names];
      if (long) {
        const lines = [`total ${names.length * 4}`];
        names.forEach((n) => {
          if (n === '.') lines.push(VFS.formatLong('.', res.node));
          else if (n === '..') lines.push('drwxr-xr-x 1 root       root          4096 Aug 14 09:00 ..');
          else lines.push(VFS.formatLong(n, res.node.children[n]));
        });
        blocks.push(lines.join('\n'));
      } else {
        blocks.push(names.filter((n) => n !== '.' && n !== '..').join('  '));
      }
    }
    return this._ok(blocks.join('\n\n'));
  },

  _cmdMkdir(args) {
    const paths = args.filter((a) => !a.startsWith('-'));
    if (!paths.length) return this._err('mkdir: missing operand');
    for (const a of paths) {
      const r = VFS.mkdir(this.vfs, this.cwd, a, this.home);
      if (!r.ok) return this._err(`mkdir: ${r.error}`);
    }
    return this._ok('');
  },

  _cmdRmdir(args) {
    if (!args.length) return this._err('rmdir: missing operand');
    for (const a of args) {
      const r = VFS.unlink(this.vfs, this.cwd, a, this.home);
      if (!r.ok) return this._err(`rmdir: ${r.error}`);
    }
    return this._ok('');
  },

  _cmdTouch(args) {
    if (!args.length) return this._err('touch: missing file operand');
    for (const a of args) {
      const r = VFS.touch(this.vfs, this.cwd, a, this.home);
      if (!r.ok) return this._err(`touch: ${r.error}`);
    }
    return this._ok('');
  },

  _cmdRm(args) {
    const recursive = args.some((a) => a === '-r' || a === '-rf' || a === '-fr');
    const force = args.some((a) => a === '-f' || a === '-rf' || a === '-fr');
    const paths = args.filter((a) => !a.startsWith('-'));
    if (!paths.length) return this._err('rm: missing operand');
    for (const p of paths) {
      const res = VFS.resolve(this.vfs, this.cwd, p, this.home);
      if (!res) {
        if (force) continue;
        return this._err(`rm: cannot remove '${p}': No such file or directory`);
      }
      if (res.path === '/' || res.path === '/home' || res.path === '/etc') {
        return this._err(`rm: refusing to remove '${p}'`);
      }
      const r = recursive
        ? VFS.rmRecursive(this.vfs, this.cwd, p, this.home)
        : VFS.unlink(this.vfs, this.cwd, p, this.home);
      if (!r.ok) return this._err(`rm: ${r.error}`);
      if (this.ctx) {
        this.ctx.removed = this.ctx.removed || [];
        this.ctx.removed.push(res.path);
      }
    }
    return this._ok('');
  },

  _cmdCp(args) {
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length < 2) return this._err('cp: missing file operand');
    const dest = paths.pop();
    const src = paths[0];
    const got = this._readFile(src);
    if (got.error) return this._err(got.error.replace(/^cat/, 'cp'));
    const destRes = VFS.resolve(this.vfs, this.cwd, dest, this.home);
    const destPath = destRes && destRes.node.type === 'dir'
      ? VFS.join(destRes.path, VFS.basename(VFS.abs(this.cwd, src, this.home)))
      : dest;
    const space = this._guestSpace(VFS.abs(this.cwd, destPath, this.home), (got.text || '').length);
    if (!space.ok) return this._err('cp: ' + space.error);
    const r = VFS.write(this.vfs, this.cwd, destPath, got.text, { home: this.home });
    if (!r.ok) return this._err(`cp: ${r.error}`);
    return this._ok('');
  },

  _cmdMv(args) {
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length < 2) return this._err('mv: missing file operand');
    const dest = paths[paths.length - 1];
    const srcs = paths.slice(0, -1);
    const destRes = VFS.resolve(this.vfs, this.cwd, dest, this.home);
    if (srcs.length > 1 && !(destRes && destRes.node.type === 'dir')) {
      return this._err(`mv: target '${dest}' is not a directory`);
    }
    for (const src of srcs) {
      const got = this._readFile(src);
      if (got.error) return this._err(got.error.replace(/^cat/, 'mv'));
      const destPath = destRes && destRes.node.type === 'dir'
        ? VFS.join(destRes.path, VFS.basename(VFS.abs(this.cwd, src, this.home)))
        : dest;
      const space = this._guestSpace(VFS.abs(this.cwd, destPath, this.home), (got.text || '').length);
      if (!space.ok) return this._err('mv: ' + space.error);
      const w = VFS.write(this.vfs, this.cwd, destPath, got.text, { home: this.home });
      if (!w.ok) return this._err(`mv: ${w.error}`);
      VFS.unlink(this.vfs, this.cwd, src, this.home);
    }
    return this._ok('');
  },

  _cmdChmod(args) {
    if (args.length < 2) {
      return this._err('chmod: missing operand\nTry: chmod 644 file   or   chmod 644 *');
    }
    const mode = args[0];
    const targets = args.slice(1);
    let count = 0;
    for (const t of targets) {
      const r = VFS.chmod(this.vfs, this.cwd, t, mode, this.home);
      if (!r.ok) return this._err(`chmod: ${r.error}`);
      count++;
    }
    if (this.ctx) this.ctx.chmodCount = (this.ctx.chmodCount || 0) + count;
    return this._ok(count > 1 ? `mode of ${count} files changed to ${mode}` : `mode of '${targets[0]}' changed to ${mode}`);
  },

  _cmdFind(args) {
    let start = '.';
    let name = null;
    let type = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-name' && args[i + 1]) {
        name = args[i + 1].replace(/^['"]|['"]$/g, '');
        i++;
      } else if (args[i] === '-type' && args[i + 1]) {
        type = args[i + 1] === 'd' ? 'dir' : 'file';
        i++;
      } else if (!args[i].startsWith('-')) {
        start = args[i];
      }
    }
    const startRes = VFS.resolve(this.vfs, this.cwd, start, this.home);
    if (!startRes) return this._err(`find: '${start}': No such file or directory`);
    const nameRe = name ? (() => {
      const re = name.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp('^' + re + '$');
    })() : null;
    const hits = [];
    VFS.walk(startRes.node, startRes.path, (node, path) => {
      if (type && node.type !== type) return;
      if (nameRe && !nameRe.test(VFS.basename(path))) return;
      hits.push(path);
    });
    if (this.ctx) this.ctx.usedFind = true;
    return this._ok(hits.join('\n'));
  },

  _cmdFile(args) {
    if (!args.length) return this._err('file: missing operand');
    const lines = args.map((a) => {
      const res = VFS.resolve(this.vfs, this.cwd, a, this.home);
      if (!res) return `${a}: cannot open (No such file or directory)`;
      if (res.node.type === 'dir') return `${a}: directory`;
      const c = res.node.content;
      if (c.startsWith('ELF')) return `${a}: ELF 64-bit LSB executable`;
      if (c.startsWith('[binary') || c.includes('JPEG') || a.endsWith('.jpg')) return `${a}: JPEG image data`;
      return `${a}: ASCII text`;
    });
    return this._ok(lines.join('\n'));
  }
});

Terminal.define('cd', function (args) { return this._cmdCd(args); });
Terminal.define('ls', function (args) { return this._cmdLs(args); });
Terminal.define('mkdir', function (args) { return this._cmdMkdir(args); });
Terminal.define('rmdir', function (args) { return this._cmdRmdir(args); });
Terminal.define('touch', function (args) { return this._cmdTouch(args); });
Terminal.define('rm', function (args) { return this._cmdRm(args); });
Terminal.define('cp', function (args) { return this._cmdCp(args); });
Terminal.define('mv', function (args) { return this._cmdMv(args); });
Terminal.define('chmod', function (args) { return this._cmdChmod(args); });
Terminal.define('find', function (args) { return this._cmdFind(args); });
Terminal.define('file', function (args) { return this._cmdFile(args); });
