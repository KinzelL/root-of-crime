/* ROOT OF CRIME – virsh / mount / lsblk / exit */

Object.assign(Terminal, {
  _cmdVirsh(args) {
    const sub = (args[0] || '').toLowerCase();
    const guests = (this.ctx && this.ctx.guests) || {};
    const names = Object.keys(guests);
    if (!sub || sub === 'help') {
      return this._ok('usage: virsh list | virsh console <guest> | virsh attach-disk <guest> <size> | virsh reboot <guest>');
    }
    if (sub === 'list') {
      const lines = [' Id    Name                           State', '----------------------------------------------------'];
      names.forEach((n, i) => {
        const g = guests[n];
        lines.push(' ' + String(i + 1).padEnd(5) + n.padEnd(31) + (g.state || 'running'));
      });
      if (!names.length) lines.push(' (no guests)');
      return this._ok(lines.join('\n'));
    }
    if (sub === 'console') {
      return this.attach(args[1] || Virt.GUEST);
    }
    if (sub === 'attach-disk' || sub === 'attach_disk') {
      const rest = args.slice(1);
      let name = Virt.GUEST;
      let sizeTok = '';
      rest.forEach((a) => {
        if (a === '--size' || a === '-s') return;
        if (guests[a]) name = a;
        else sizeTok = a.replace(/^--size=/, '');
      });
      const guest = Virt.get(this.ctx, name);
      if (!guest) return this._err('virsh: failed to get domain');
      const parsed = Virt.parseSize(sizeTok);
      if (!parsed.ok) return this._err('virsh: ' + parsed.error + ' (example: virsh attach-disk booking-vm 200M)');
      const r = Virt.attachVolume(guest, parsed.bytes);
      if (!r.ok) return this._err('virsh: ' + r.error);
      Virt.paint(guest);
      return this._ok("Disk attached to '" + guest.hostname + "' as /dev/sdb (" + sizeTok + ")");
    }
    if (sub === 'reboot') {
      return this._rebootGuest(args[1] || Virt.GUEST);
    }
    return this._err('virsh: command \'' + sub + '\' not found');
  },

  _rebootGuest(name) {
    const guest = Virt.get(this.ctx, name);
    if (!guest) return this._err('virsh: failed to get domain');
    if (this._attached === guest.id) this.detach();
    const r = Virt.reboot(guest);
    if (!r.ok) return this._err('virsh: ' + r.error);
    Virt.paint(guest);
    return this._ok("Domain '" + guest.hostname + "' is being rebooted");
  },

  _cmdReboot() {
    if (this._attached) {
      const guest = this.attachedGuest();
      Virt.reboot(guest);
      this.detach();
      Virt.paint(guest);
      return this._ok('The system is going down for reboot NOW!\nConnection closed.');
    }
    return this._err(
      'reboot: refusing to reboot the host. The last IT left a note about that.\n' +
      'Try:  virsh reboot booking-vm'
    );
  },

  _cmdLsblk() {
    const guest = this.attachedGuest();
    const lines = ['NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT'];
    if (!guest) {
      lines.push('sda      8:0    0  500M  0 disk');
      lines.push('└─sda1   8:1    0  500M  0 part /');
      return this._ok(lines.join('\n'));
    }
    guest.disks.forEach((d) => {
      const kb = Math.max(1, Math.round((d.total || 0) / 1024));
      lines.push(d.id.padEnd(6) + '  8:0    0  ' + String(kb + 'K').padStart(4) + '  0 disk');
      lines.push('└─' + (d.id + '1').padEnd(4) + ' 8:1    0  ' + String(kb + 'K').padStart(4) + '  0 part ' + (d.mount || ''));
    });
    return this._ok(lines.join('\n'));
  },

  _cmdMount(args) {
    const guest = this.attachedGuest();
    if (!args.length) {
      if (!guest) return this._ok('/dev/sda1 on / type ext4 (rw,relatime)');
      return this._ok(guest.disks.filter((d) => d.mount).map((d) => (
        d.device + ' on ' + d.mount + ' type ext4 (rw,relatime)'
      )).join('\n'));
    }
    if (!guest) return this._err('mount: only the guest has extra disks. virsh console first.');
    if (args.length < 2) return this._err('mount: usage: mount DEVICE DIR');
    const r = Virt.mount(guest, args[0], args[1]);
    if (!r.ok) return this._err(r.error);
    Virt.paint(guest);
    return this._ok('');
  },

  _cmdUmount(args) {
    const guest = this.attachedGuest();
    if (!guest) return this._err('umount: nothing to unmount on the host');
    if (!args[0]) return this._err('umount: usage: umount DIR|DEVICE');
    const r = Virt.umount(guest, args[0]);
    if (!r.ok) return this._err(r.error);
    Virt.paint(guest);
    return this._ok('');
  },

  _cmdSsh(args) {
    if (typeof Infra !== 'undefined') Infra.boot();
    const raw = (args[0] || '').trim();
    if (!raw || raw.startsWith('-')) {
      const listed = (typeof Infra !== 'undefined' ? Infra.known() : [])
        .filter((h) => h.id !== 'closet')
        .map((h) => '  ssh ' + h.id.padEnd(16) + h.role)
        .join('\n');
      return this._err('usage: ssh [user@]HOST\n' + (listed || '  ssh precinct-13\n  ssh booking-vm'));
    }
    const id = typeof Infra !== 'undefined' ? Infra.resolve(raw) : raw.replace(/^.*@/, '').toLowerCase();
    if (id === 'closet' || id === 'localhost' || id === '127.0.0.1') {
      if (!this._stack || !this._stack.length) return this._ok('already on closet');
      if (this.dropToDesk) this.dropToDesk();
      else while (this._stack && this._stack.length) this.popSession();
      return this._ok('Connection closed.\n' + (typeof VFS !== 'undefined' && VFS.closetMotd ? VFS.closetMotd() : ''));
    }
    const sess = typeof Infra !== 'undefined' ? Infra.sessionFor(id) : null;
    if (!sess) {
      return this._err('ssh: Could not resolve hostname ' + raw + '\nTry:  ssh precinct-13   or   ssh booking-vm');
    }
    if (sess.kind === 'guest') {
      return this.attach(sess.id || sess.host, { ctx: sess.ctx });
    }
    if (this._attached || this.host === 'booking-vm') this.detach();
    if (this.host === sess.host && this._remote === sess.host) {
      this.vfs = sess.vfs;
      this.ctx = sess.ctx;
      this.cwd = sess.cwd || sess.home || '/home/itguy';
      this.home = sess.home || this.home;
      this.user = sess.user || this.user;
      this._updatePrompt();
      return this._ok('already on ' + sess.host);
    }
    const ticket = typeof Game !== 'undefined' ? Game.ticketSession : null;
    this.pushSession({
      vfs: sess.vfs,
      cwd: sess.cwd || sess.home || '/home/itguy',
      host: sess.host,
      home: sess.home || '/home/itguy',
      user: sess.user || 'root',
      ctx: sess.ctx,
      attached: null,
      remote: sess.host,
      missionId: (ticket && ticket.id) || this.missionId
    });
    if (ticket && ticket.id) this.missionId = ticket.id;
    return this._ok(typeof Infra !== 'undefined' ? Infra.loginBanner(sess) : 'Last login: from closet');
  },

  _cmdExit() {
    if (this._stack && this._stack.length) {
      const r = this.detach();
      if (this.host === 'closet' && !this._remote && typeof VFS !== 'undefined' && VFS.closetMotd) {
        const closed = (r.stdout || '').replace(/\n$/, '');
        return this._ok(closed + '\n' + VFS.closetMotd());
      }
      return r;
    }
    return this._ok('logout');
  }
});

Terminal.define('ssh', function (args) { return this._cmdSsh(args); });
Terminal.define('virsh', function (args) { return this._cmdVirsh(args); });
Terminal.define('lsblk', function () { return this._cmdLsblk(); });
Terminal.define('mount', function (args) { return this._cmdMount(args); });
Terminal.define(['umount', 'unmount'], function (args) { return this._cmdUmount(args); });
Terminal.define('reboot', function () { return this._cmdReboot(); });
Terminal.define('exit', function () { return this._cmdExit(); });
