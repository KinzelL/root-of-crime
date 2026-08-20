/* ============================================================
   ROOT OF CRIME – Virtual Filesystem
   ============================================================ */

var VFS = (() => {
  const DEFAULT_MTIME = 'Aug 14 09:00';

  function file(content, extra = {}) {
    const text = content == null ? '' : String(content);
    return {
      type: 'file',
      mode: extra.mode ?? 0o644,
      owner: extra.owner ?? 'root',
      group: extra.group ?? 'root',
      mtime: extra.mtime ?? DEFAULT_MTIME,
      content: text
    };
  }

  function dir(children = {}, extra = {}) {
    return {
      type: 'dir',
      mode: extra.mode ?? 0o755,
      owner: extra.owner ?? 'root',
      group: extra.group ?? 'root',
      mtime: extra.mtime ?? DEFAULT_MTIME,
      children
    };
  }

  function clone(node) {
    return JSON.parse(JSON.stringify(node));
  }

  function parseMode(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw & 0o777;
    const s = String(raw).trim();
    if (!/^[0-7]{3,4}$/.test(s)) return null;
    return parseInt(s.slice(-3), 8);
  }

  function modeString(node) {
    const prefix = node.type === 'dir' ? 'd' : '-';
    const mode = node.mode ?? 0o644;
    let out = prefix;
    for (let shift = 6; shift >= 0; shift -= 3) {
      const n = (mode >> shift) & 7;
      out += (n & 4) ? 'r' : '-';
      out += (n & 2) ? 'w' : '-';
      out += (n & 1) ? 'x' : '-';
    }
    return out;
  }

  function sizeOf(node, skip) {
    if (!node) return 0;
    if (skip && ((skip.has && skip.has(node)) || skip === node)) return 0;
    if (node.type === 'file') return node.content.length;
    return Object.values(node.children || {}).reduce((sum, child) => sum + sizeOf(child, skip), 0);
  }

  function join(a, b) {
    if (!b || b === '.') return a;
    if (b.startsWith('/')) return normalizePath(b);
    return normalizePath(a.replace(/\/+$/, '') + '/' + b);
  }

  function normalizePath(path) {
    const parts = [];
    for (const part of String(path).split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return '/' + parts.join('/');
  }

  function expandHome(path, home) {
    if (path === '~') return home;
    if (path.startsWith('~/')) return join(home, path.slice(2));
    return path;
  }

  function abs(cwd, path, home = '/home/itguy') {
    const raw = path == null || path === '' ? cwd : expandHome(String(path), home);
    if (raw.startsWith('/')) return normalizePath(raw);
    return join(cwd, raw);
  }

  function resolve(tree, cwd, path, home) {
    const full = abs(cwd, path, home);
    if (full === '/') return { node: tree, parent: null, name: '/', path: '/' };
    const parts = full.split('/').filter(Boolean);
    let node = tree;
    let parent = null;
    for (const part of parts) {
      if (!node || node.type !== 'dir') return null;
      parent = node;
      node = node.children ? node.children[part] : undefined;
      if (!node) return null;
    }
    return { node, parent, name: parts[parts.length - 1], path: full };
  }

  function dirname(path) {
    const full = normalizePath(path);
    if (full === '/') return '/';
    const i = full.lastIndexOf('/');
    return i <= 0 ? '/' : full.slice(0, i);
  }

  function basename(path) {
    const full = normalizePath(path);
    if (full === '/') return '/';
    return full.slice(full.lastIndexOf('/') + 1);
  }

  function write(tree, cwd, path, content, opts = {}) {
    const full = abs(cwd, path, opts.home);
    const parentPath = dirname(full);
    const name = basename(full);
    const parentRes = resolve(tree, '/', parentPath);
    if (!parentRes || parentRes.node.type !== 'dir') {
      return { ok: false, error: `cannot create '${path}': No such file or directory` };
    }
    const existing = parentRes.node.children[name];
    if (existing && existing.type === 'dir') {
      return { ok: false, error: `cannot write '${path}': Is a directory` };
    }
    if (existing && opts.append) {
      existing.content += content;
      existing.mtime = opts.mtime || 'Aug 14 21:14';
      return { ok: true, node: existing };
    }
    parentRes.node.children[name] = file(content, {
      mode: existing ? existing.mode : (opts.mode ?? 0o644),
      owner: existing ? existing.owner : 'root',
      group: existing ? existing.group : 'root',
      mtime: opts.mtime || 'Aug 14 21:14'
    });
    return { ok: true, node: parentRes.node.children[name] };
  }

  function unlink(tree, cwd, path, home) {
    const full = abs(cwd, path, home);
    const res = resolve(tree, '/', full);
    if (!res) return { ok: false, error: `cannot remove '${path}': No such file or directory` };
    if (res.node.type === 'dir') {
      const names = Object.keys(res.node.children || {});
      if (names.length) return { ok: false, error: `cannot remove '${path}': Directory not empty` };
      if (!res.parent) return { ok: false, error: `cannot remove '${path}': Device or resource busy` };
      delete res.parent.children[res.name];
      return { ok: true };
    }
    if (!res.parent) return { ok: false, error: `cannot remove '${path}'` };
    delete res.parent.children[res.name];
    return { ok: true };
  }

  function rmRecursive(tree, cwd, path, home) {
    const full = abs(cwd, path, home);
    const res = resolve(tree, '/', full);
    if (!res) return { ok: false, error: `cannot remove '${path}': No such file or directory` };
    if (!res.parent) return { ok: false, error: `cannot remove '${path}': Device or resource busy` };
    delete res.parent.children[res.name];
    return { ok: true };
  }

  function mkdir(tree, cwd, path, home) {
    const full = abs(cwd, path, home);
    if (resolve(tree, '/', full)) return { ok: false, error: `cannot create directory '${path}': File exists` };
    const parentRes = resolve(tree, '/', dirname(full));
    if (!parentRes || parentRes.node.type !== 'dir') {
      return { ok: false, error: `cannot create directory '${path}': No such file or directory` };
    }
    parentRes.node.children[basename(full)] = dir({});
    return { ok: true };
  }

  function chmod(tree, cwd, path, mode, home) {
    const res = resolve(tree, cwd, path, home);
    if (!res) return { ok: false, error: `cannot access '${path}': No such file or directory` };
    const parsed = parseMode(mode);
    if (parsed == null) return { ok: false, error: `invalid mode: ‘${mode}’` };
    res.node.mode = parsed;
    return { ok: true, node: res.node };
  }

  function touch(tree, cwd, path, home) {
    const res = resolve(tree, cwd, path, home);
    if (res) {
      res.node.mtime = 'Aug 14 21:14';
      return { ok: true, node: res.node };
    }
    return write(tree, cwd, path, '', { home });
  }

  function walk(node, path, fn) {
    fn(node, path);
    if (node.type === 'dir') {
      Object.entries(node.children || {}).forEach(([name, child]) => {
        const childPath = path === '/' ? '/' + name : path + '/' + name;
        walk(child, childPath, fn);
      });
    }
  }

  function find(tree, startPath, pred) {
    const start = resolve(tree, '/', startPath);
    if (!start) return [];
    const hits = [];
    walk(start.node, start.path, (node, path) => {
      if (pred(node, path)) hits.push({ node, path });
    });
    return hits;
  }

  function globToRegExp(glob) {
    let out = '^';
    for (let i = 0; i < glob.length; i++) {
      const ch = glob[i];
      if (ch === '*') out += '.*';
      else if (ch === '?') out += '.';
      else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(out + '$');
  }

  function expandGlob(tree, cwd, token, home) {
    if (!token || (!token.includes('*') && !token.includes('?'))) return [token];
    const full = abs(cwd, token, home);
    const parentPath = dirname(full);
    const pat = basename(token.includes('/') ? token : full);
    const parent = resolve(tree, '/', parentPath);
    if (!parent || parent.node.type !== 'dir') return [token];
    const re = globToRegExp(pat);
    const names = Object.keys(parent.node.children)
      .filter((n) => re.test(n))
      .sort();
    if (!names.length) return [token];
    return names.map((n) => (parentPath === '/' ? '/' + n : parentPath + '/' + n));
  }

  function formatLong(name, node) {
    const perm = modeString(node);
    const size = node.type === 'dir' ? 4096 : (node.content ? node.content.length : 0);
    return `${perm} 1 ${String(node.owner).padEnd(10)} ${String(node.group).padEnd(10)} ${String(size).padStart(7)} ${node.mtime} ${name}`;
  }

  function readable(node) {
    if (!node) return false;
    if (node.type === 'dir') return true;
    return ((node.mode ?? 0o644) & 0o444) !== 0;
  }

  function createBase() {
    return dir({
      bin: dir({
        bash: file('ELF 64-bit LSB executable', { mode: 0o755 }),
        ls: file('ELF 64-bit LSB executable', { mode: 0o755 }),
        cat: file('ELF 64-bit LSB executable', { mode: 0o755 })
      }),
      boot: dir({}),
      dev: dir({
        null: file('', { mode: 0o666, mtime: 'Jun 19 00:00' }),
        tty: file('', { mode: 0o666 })
      }),
      etc: dir({
        hostname: file('precinct-13\n'),
        hosts: file('127.0.0.1 localhost\n127.0.1.1 precinct-13\n'),
        issue: file('PrecinctOS 13 GNU/Linux \\n \\l\n'),
        os_release: file('NAME="PrecinctOS"\nVERSION="13 (Duct Tape)"\nID=precinct\n'),
        passwd: file(
          [
            'root:x:0:0:root:/root:/bin/bash',
            'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
            'chief:x:1000:1000:Chief Harlan Briggs:/home/chief:/bin/bash',
            'miller:x:1001:1001:Officer Dana Miller:/home/miller:/bin/bash',
            'itguy:x:1002:1002:IT Temp:/home/itguy:/bin/bash',
            'coffee:x:2000:2000:BeanTek Appliance:/opt/coffee:/usr/sbin/nologin',
            ''
          ].join('\n')
        ),
        group: file('root:x:0:\nchief:x:1000:\nmiller:x:1001:\nitguy:x:1002:\ndetectives:x:1100:chief,miller\ncoffee:x:2000:\n'),
        shadow: file('root:*:19900:0:99999:7:::\n', { mode: 0o640, group: 'shadow' }),
        crontab: file('# /etc/crontab: system crontab\nSHELL=/bin/sh\nPATH=/usr/bin:/bin\n\n17 * * * * root    cd / && run-parts --report /etc/cron.hourly\n'),
        'cron.d': dir({
          precinct: file('# precinct housekeeping\n5 4 * * * root /usr/local/bin/rotate-logs\n')
        }),
        motd: file('Precinct 13 — If it works, do not reboot it.\n')
      }),
      home: dir({
        itguy: dir({
          'welcome.txt': file(
            'WELCOME TO PRECINCT 13 — IT CLOSET (yes, this is your office)\n' +
            '============================================================\n\n' +
            'You start in 10 minutes. The chief taped this to the CRT.\n\n' +
            '  1. Do not reboot anything that is currently blinking.\n' +
            '  2. The coffee machine is on the network. That is not a joke.\n' +
            '  3. If a detective says "the computer is broken", ask which one.\n' +
            '  4. Your first job is on the Mission Board. Open it.\n\n' +
            '— Briggs\n'
          ),
          'sticky_note.txt': file('Chief says: Fix the printer first. Then we talk about coffee.\n'),
          '.bash_history': file('ls\npwd\ncat welcome.txt\n', { mode: 0o600 }),
          '.bashrc': file('export PS1="\\u@\\h:\\w\\$ "\n', { mode: 0o644 })
        }, { owner: 'itguy', group: 'itguy' }),
        chief: dir({
          'todo.txt': file('- yell at IT\n- find out who keeps printing cats\n- buy more paper\n- change coffee machine password (later)\n')
        }, { owner: 'chief', group: 'chief' }),
        miller: dir({
          'report_draft.txt': file('I saw a cat. It looked guilty. It may have been carrying a USB stick.\n')
        }, { owner: 'miller', group: 'miller' })
      }),
      evidence: dir({
        'README': file('Evidence locker. Detectives only. Do not chmod 000 this again.\n')
      }, { group: 'detectives' }),
      opt: dir({
        coffee: dir({
          'README': file('BeanTek BrewMaster 3000 — management interface.\nDefault password is printed on the bottom of the unit.\n'),
          'coffee_machine_daemon': file('ELF 64-bit LSB executable', { mode: 0o755 })
        })
      }),
      proc: dir({
        version: file('Linux version 6.1.0-23-amd64 (precinct-13) (gcc 12.2.0)\n'),
        uptime: file('48291.12 120033.40\n')
      }),
      root: dir({
        '.bash_history': file('whoami\npasswd\n# never again\n', { mode: 0o600 })
      }),
      tmp: dir({}, { mode: 0o1777 }),
      usr: dir({
        local: dir({
          bin: dir({
            'rotate-logs': file('#!/bin/sh\n# stub\n', { mode: 0o755 })
          })
        }),
        share: dir({
          man: dir({})
        })
      }),
      var: dir({
        log: dir({
          syslog: file(
            'Aug 14 08:01:02 precinct-13 systemd[1]: Started PrecinctOS.\n' +
            'Aug 14 08:01:10 precinct-13 cron[3141]: (CRON) STARTUP (NICE)\n' +
            'Aug 14 18:55:01 precinct-13 thunderbird[4096]: mail sync ok\n' +
            'Aug 14 19:01:04 precinct-13 kernel: usb 1-3: new high-speed USB device\n'
          ),
          'auth.log': file(
            'Aug 14 08:00:01 precinct-13 sshd[42]: Server listening on 0.0.0.0 port 22.\n' +
            'Aug 14 18:54:12 precinct-13 login[512]: pam_unix: session opened for user chief\n' +
            'Aug 14 19:02:14 precinct-13 login[880]: pam_unix: session opened for user root\n'
          ),
          incident: dir({
            'incident_01.log': file('INC-01  noise complaint. closed.\n'),
            'incident_02.log': file('INC-02  missing stapler. suspect: everyone.\n')
          })
        }),
        spool: dir({
          printer: dir({
            'queue.txt': file('idle\n')
          })
        }),
        tmp: dir({})
      })
    });
  }

  function createGuest() {
    const fat = ('INC-042 case file — do not purge\n').repeat(1800);
    return dir({
      bin: dir({
        bash: file('ELF 64-bit LSB executable', { mode: 0o755 }),
        ls: file('ELF 64-bit LSB executable', { mode: 0o755 })
      }),
      boot: dir({}),
      dev: dir({
        sda: file('', { mode: 0o660, group: 'disk' }),
        sda1: file('', { mode: 0o660, group: 'disk' }),
        null: file('', { mode: 0o666 })
      }),
      etc: dir({
        hostname: file('booking-vm\n'),
        hosts: file('127.0.0.1 localhost\n10.13.0.20 booking-vm\n'),
        fstab: file(
          '# <file system> <mount point> <type> <options> <dump> <pass>\n' +
          '/dev/sda1  /  ext4  defaults  0  1\n'
        ),
        os_release: file('NAME="PrecinctOS"\nVERSION="13 (Duct Tape)"\nID=precinct\n')
      }),
      home: dir({
        booking: dir({
          'README': file('Booking service account. Data lives under /var/lib/booking.\n')
        }, { owner: 'booking', group: 'booking' })
      }),
      mnt: dir({}),
      opt: dir({}),
      root: dir({
        'NOTE': file('This is the booking guest. The host is precinct-13.\nDo not delete the cases. Grow the disk.\n')
      }),
      tmp: dir({}, { mode: 0o1777 }),
      usr: dir({
        bin: dir({}),
        sbin: dir({})
      }),
      var: dir({
        cache: dir({
          booking: dir({
            'thumbs.cache': file('stale jpeg thumbs\n')
          })
        }),
        lib: dir({
          booking: dir({
            'cases.db': file(fat, { mtime: 'Aug 14 21:40' }),
            'booking.conf': file('datadir=/var/lib/booking\nlisten=10.13.0.20:8080\n'),
            'README': file('The booking database. Detectives will riot if this disappears.\n')
          })
        }),
        log: dir({
          syslog: file('Aug 14 21:40:01 booking-vm kernel: EXT4-fs warning: partition almost full\n'),
          booking: dir({
            'app.log': file(
              'Aug 14 21:40:08 booking[880]: write failed: No space left on device\n' +
              'Aug 14 21:40:09 booking[880]: refusing new incident INC-043\n'
            )
          })
        }),
        mail: dir({
          root: file('From cron: /var is full again\n')
        }),
        spool: dir({
          booking: dir({
            'queue.dat': file('pending: INC-043\n')
          })
        }),
        tmp: dir({}),
        www: dir({
          html: dir({
            'index.html': file('<html><body>Precinct 13 Booking</body></html>\n')
          })
        })
      })
    });
  }

  function closetMotd() {
    return [
      '',
      '  ******************************************',
      '  *  P13 IT CLOSET              [##] [##]  *',
      '  * +------------------------+    #   #    *',
      '  * |########################|     ###     *',
      '  * |##  o          o     ###|    #   #    *',
      '  * |##        __         ###|   ## # ##   *',
      '  * |########################|    mittens  *',
      '  * +------------------------+             *',
      '  *   (o) (o)  ==========    sandwich in   *',
      '  *                          the 5.25"     *',
      '  ******************************************',
      '',
      'Linux closet 6.1.0-23-amd64  tty1',
      'Authorized IT only. This box is a JUMP. The LAN is already up.',
      '  ssh precinct-13      HV / ticket box',
      '  ssh booking-vm       booking guest',
      '  ssh coffee.lan       copier VLAN',
      'If it works, do not reboot it.',
      ''
    ].join('\n');
  }

  return {
    file,
    dir,
    closetMotd,
    clone,
    sizeOf,
    join,
    abs,
    resolve,
    basename,
    write,
    unlink,
    rmRecursive,
    mkdir,
    chmod,
    touch,
    walk,
    find,
    expandGlob,
    formatLong,
    readable,
    createBase,
    createGuest
  };
})();
