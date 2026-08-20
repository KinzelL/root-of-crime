/* ROOT OF CRIME – persistent precinct LAN
   Machines are up from punch-in. Tickets overlay a problem; they do not spawn the box. */

var Infra = {
  booted: false,
  machines: {},

  CATALOG: [
    { id: 'closet', kind: 'jump', user: 'itguy', home: '/home/itguy', addr: '10.13.0.1', cluster: 'closet', role: 'jump host' },
    { id: 'precinct-13', kind: 'host', user: 'root', home: '/home/itguy', addr: '10.13.0.4', cluster: 'on-prem', role: 'HV / ticket box' },
    { id: 'booking-vm', kind: 'guest', parent: 'precinct-13', user: 'root', home: '/root', addr: '10.13.0.20', cluster: 'on-prem', role: 'booking guest' },
    { id: 'coffee.lan', kind: 'appliance', user: 'root', home: '/opt/coffee', addr: '10.13.0.8', cluster: 'copier-vlan', role: 'BeanTek appliance' }
  ],

  ALIAS: {
    precinct: 'precinct-13',
    precinct13: 'precinct-13',
    booking: 'booking-vm',
    coffee: 'coffee.lan',
    localhost: 'closet',
    '127.0.0.1': 'closet'
  },

  resolve(name) {
    const n = String(name || '').trim().toLowerCase().replace(/^.*@/, '');
    return this.ALIAS[n] || n;
  },

  catalog(id) {
    const key = this.resolve(id);
    return this.CATALOG.find((h) => h.id === key) || null;
  },

  known() {
    return this.CATALOG.slice();
  },

  boot() {
    if (this.booted) return this;
    this.machines['precinct-13'] = this._makePrecinct();
    this.machines['booking-vm'] = this._makeBooking();
    this.machines['coffee.lan'] = this._makeCoffee();
    this.machines['precinct-13'].ctx.guests = {
      'booking-vm': this.machines['booking-vm'].guest
    };
    this.booted = true;
    return this;
  },

  reboot() {
    this.booted = false;
    this.machines = {};
    return this.boot();
  },

  get(id) {
    this.boot();
    return this.machines[this.resolve(id)] || null;
  },

  guest(id) {
    const m = this.get(id || 'booking-vm');
    return m && m.guest ? m.guest : null;
  },

  sessionFor(id) {
    this.boot();
    const key = this.resolve(id);
    if (key === 'closet') return null;
    const ticket = typeof Game !== 'undefined' ? Game.ticketSession : null;
    if (ticket && this._ticketCovers(ticket, key)) return this._fromTicket(ticket, key);
    return this._idleSession(key);
  },

  hostsFile() {
    const lines = ['127.0.0.1\tlocalhost'];
    this.known().forEach((h) => {
      lines.push(h.addr + '\t' + h.id);
    });
    return lines.join('\n') + '\n';
  },

  jumpNote() {
    return (
      'This closet is a jump host. The LAN is already up.\n' +
      '\n' +
      this.known().filter((h) => h.id !== 'closet').map((h) => (
        '  ssh ' + h.id.padEnd(16) + h.role
      )).join('\n') +
      '\n\nvirt.precinct has the inventory. ping HOST if you doubt it.\n'
    );
  },

  loginBanner(sess) {
    const lines = ['Last login: from closet'];
    const ticket = typeof Game !== 'undefined' ? Game.ticketSession : null;
    const code = (ticket && ticket.id && typeof Missions !== 'undefined')
      ? Missions.code(Missions.get(ticket.id))
      : '';
    if (sess.host === 'precinct-13' && ticket && ticket.id && ticket.host !== 'closet') {
      lines.push('root@precinct-13. Ticket ' + code + '. Type exit to return to closet.');
    } else if (sess.host === 'coffee.lan') {
      lines.push('BeanTek BrewOS 0.4. Please do not unplug.');
    } else {
      lines.push((sess.user || 'root') + '@' + sess.host + '. Type exit to return to closet.');
    }
    return lines.join('\n');
  },

  _ticketCovers(ticket, key) {
    if (!ticket) return false;
    if (ticket.host === key) return true;
    if (key === 'booking-vm' && ticket.ctx && ticket.ctx.guests && ticket.ctx.guests['booking-vm']) return true;
    if (key === 'precinct-13' && ticket.vfs && (ticket.host === 'precinct-13' || ticket.host === 'booking-vm')) {
      return true;
    }
    return false;
  },

  _fromTicket(ticket, key) {
    if (key === 'booking-vm') {
      const guest = ticket.ctx && ticket.ctx.guests && ticket.ctx.guests['booking-vm'];
      if (guest) {
        return { kind: 'guest', id: 'booking-vm', host: 'booking-vm', ctx: ticket.ctx, guest: guest };
      }
    }
    if (key === 'precinct-13' && ticket.vfs) {
      return {
        kind: 'host',
        host: 'precinct-13',
        user: 'root',
        home: '/home/itguy',
        cwd: ticket.cwd || '/home/itguy',
        vfs: ticket.vfs,
        ctx: ticket.ctx
      };
    }
    if (ticket.host === key && ticket.vfs) {
      const rec = this.catalog(key) || {};
      return {
        kind: rec.kind === 'guest' ? 'guest' : 'host',
        id: key,
        host: key,
        user: rec.user || 'root',
        home: rec.home || '/home/itguy',
        cwd: ticket.cwd || rec.home || '/home/itguy',
        vfs: ticket.vfs,
        ctx: ticket.ctx,
        guest: ticket.ctx && ticket.ctx.guests && ticket.ctx.guests[key]
      };
    }
    return this._idleSession(key);
  },

  _idleSession(key) {
    if (key === 'booking-vm') {
      const parent = this.machines['precinct-13'];
      const box = this.machines['booking-vm'];
      if (!parent || !box) return null;
      return { kind: 'guest', id: 'booking-vm', host: 'booking-vm', ctx: parent.ctx, guest: box.guest };
    }
    const m = this.machines[key];
    if (!m || !m.vfs) return null;
    return {
      kind: 'host',
      host: m.host || key,
      user: m.user,
      home: m.home,
      cwd: m.cwd || m.home,
      vfs: m.vfs,
      ctx: m.ctx
    };
  },

  _makePrecinct() {
    const vfs = VFS.clone(VFS.createBase());
    const processes = baseProcs();
    processes.push(proc(
      2201, 'root', '2.1', '8.0', '?', 'Aug14', '04:12:08',
      '/usr/bin/qemu-system-x86_64 -name booking-vm -m 512'
    ));
    const motd = VFS.resolve(vfs, '/', '/etc/motd');
    if (motd && motd.node) {
      motd.node.content =
        'Precinct 13 — If it works, do not reboot it.\n' +
        'booking-vm is on this host. virsh list.\n';
    }
    return {
      host: 'precinct-13',
      user: 'root',
      home: '/home/itguy',
      cwd: '/home/itguy',
      vfs,
      ctx: { processes: processes, hintLevel: 0, guests: {} }
    };
  },

  _makeBooking() {
    const guest = (typeof Virt !== 'undefined' && Virt.makeIdleBooking)
      ? Virt.makeIdleBooking()
      : Virt.makeBooking();
    return { guest: guest };
  },

  _makeCoffee() {
    const vfs = VFS.clone(VFS.createBase());
    const hn = VFS.resolve(vfs, '/', '/etc/hostname');
    if (hn && hn.node) hn.node.content = 'coffee.lan\n';
    const motd = VFS.resolve(vfs, '/', '/etc/motd');
    if (motd && motd.node) {
      motd.node.content =
        'BeanTek BrewOS 0.4\n' +
        'Default password is still mocha123. The vendor said that is fine.\n';
    }
    return {
      host: 'coffee.lan',
      user: 'root',
      home: '/opt/coffee',
      cwd: '/opt/coffee',
      vfs,
      ctx: {
        processes: [
          proc(1, 'root', '0.0', '0.1', '?', 'Jun19', '00:00:12', '/sbin/init', { protected: true }),
          proc(2048, 'coffee', '0.8', '1.2', '?', 'Aug10', '00:45:12', '/opt/coffee/coffee_machine_daemon --network')
        ],
        hintLevel: 0
      }
    };
  }
};
