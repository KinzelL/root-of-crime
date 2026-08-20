/* ROOT OF CRIME – one guest, two disks, a Motif intranet page */

var Virt = {
  GUEST: 'booking-vm',
  page: 'tickets',
  ticketFilter: 'open',
  ticketId: null,

  go(page, extra) {
    if (page === 'guest') {
      this.page = 'virt';
      this.sel = (extra && extra.guest) || this.GUEST;
      this.paint();
      return;
    }
    if (page === 'virt' || page === 'boxyard' || page === 'vcenter') {
      this.page = 'virt';
      if (!this.sel) this.sel = 'on-prem';
      this.paint();
      return;
    }
    this.page = page || 'tickets';
    if (extra && extra.ticketId) this.ticketId = extra.ticketId;
    if (this.page === 'tickets') this.ticketId = extra && extra.ticketId ? extra.ticketId : null;
    this.paint();
  },

  select(id) {
    this.sel = id || 'on-prem';
    this.page = 'virt';
    this.paint();
  },

  currentGuest() {
    const env = (typeof Game !== 'undefined' && Game.ticketEnv) ? Game.ticketEnv() : null;
    if (env && env.ctx) {
      const fromTicket = this.get(env.ctx);
      if (fromTicket) return fromTicket;
    }
    if (typeof Infra !== 'undefined' && Infra.guest) return Infra.guest('booking-vm');
    return this.get(typeof Terminal !== 'undefined' ? Terminal.ctx : null);
  },

  makeIdleBooking() {
    const guest = this.makeBooking();
    const used = VFS.sizeOf(guest.vfs);
    guest.disks[0].total = used + 200 * 1024;
    guest.state = 'running';
    return guest;
  },

  makeBooking() {
    const vfs = VFS.createGuest();
    const used = VFS.sizeOf(vfs);
    return {
      id: this.GUEST,
      hostname: this.GUEST,
      vfs,
      state: 'running',
      volumeAttached: false,
      disks: [
        { id: 'sda', device: '/dev/sda1', total: used + 4000, mount: '/' }
      ]
    };
  },

  get(ctx, id) {
    const guests = ctx && ctx.guests;
    if (!guests) return null;
    return guests[id || this.GUEST] || null;
  },

  findDisk(guest, spec) {
    if (!guest || spec == null) return null;
    const s = String(spec).replace(/\/+$/, '');
    const bare = s.replace(/^\/dev\//, '');
    return (guest.disks || []).find((d) => (
      d.device === s ||
      d.device === s + '1' ||
      d.id === bare ||
      d.id + '1' === bare ||
      '/dev/' + d.id === s
    )) || null;
  },

  parseSize(raw, unit) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, error: 'size is required' };
    const m = s.match(/^(\d+(?:\.\d+)?)\s*([kmg]i?b?)?$/i);
    if (!m) return { ok: false, error: 'size must be a number (200, 200M, 1G)' };
    const n = parseFloat(m[1]);
    if (!n) return { ok: false, error: 'size must be greater than zero' };
    let u = (m[2] || unit || 'M').toUpperCase().replace(/IB$/, 'B').replace(/B$/, '');
    const mul = u.charAt(0) === 'G' ? 1024 * 1024 * 1024 : u.charAt(0) === 'K' ? 1024 : 1024 * 1024;
    const bytes = Math.round(n * mul);
    if (bytes < 1024) return { ok: false, error: 'size too small' };
    return { ok: true, bytes };
  },

  attachVolume(guest, extraTotal) {
    if (!guest) return { ok: false, error: 'no guest' };
    if ((guest.disks || []).some((d) => d.id === 'sdb')) {
      return { ok: false, error: 'guest already has a second disk' };
    }
    const total = extraTotal == null ? 0 : extraTotal;
    if (!total) return { ok: false, error: 'size is required' };
    guest.disks.push({
      id: 'sdb',
      device: '/dev/sdb1',
      total,
      mount: null,
      tree: VFS.dir({})
    });
    const dev = VFS.resolve(guest.vfs, '/', '/dev');
    if (dev && dev.node.type === 'dir') {
      dev.node.children.sdb = VFS.file('', { mode: 0o660, group: 'disk' });
      dev.node.children.sdb1 = VFS.file('', { mode: 0o660, group: 'disk' });
    }
    guest.volumeAttached = true;
    return { ok: true };
  },

  diskForPath(guest, path) {
    if (!guest || !path) return null;
    const full = VFS.abs('/', path);
    return (guest.disks || []).find((d) => (
      d.mount && (full === d.mount || full.startsWith(d.mount + '/'))
    )) || null;
  },

  ensureSpace(guest, path, addBytes) {
    const disk = this.diskForPath(guest, path);
    if (!disk) return { ok: true };
    const used = VFS.sizeOf(disk.tree);
    if (used + Math.max(0, addBytes || 0) > disk.total) {
      return { ok: false, error: 'No space left on device' };
    }
    return { ok: true };
  },

  stageUnmountedVolume(guest) {
    this.attachVolume(guest, 200 * 1024 * 1024);
    const booking = VFS.resolve(guest.vfs, '/', '/var/lib/booking');
    const sdb = guest.disks.find((d) => d.id === 'sdb');
    Object.keys(booking.node.children).forEach((n) => {
      sdb.tree.children[n] = booking.node.children[n];
      delete booking.node.children[n];
    });
    booking.node.children.LOST = VFS.file(
      'Night shift rebooted.\nThe database is on the other disk.\nNothing is mounted.\n'
    );
    guest.blurb = 'Night shift rebooted. The extra disk is still attached. Nothing is mounted.';
    return guest;
  },

  fstabLines(guest) {
    const res = guest && VFS.resolve(guest.vfs, '/', '/etc/fstab');
    const text = res && res.node && res.node.type === 'file' ? res.node.content : '';
    return String(text).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  },

  fstabReady(guest) {
    return this.fstabLines(guest).some((line) => {
      const p = line.split(/\s+/);
      if (p.length < 2) return false;
      const disk = this.findDisk(guest, p[0]);
      const mnt = p[1].replace(/\/+$/, '') || '/';
      return !!(disk && disk.id === 'sdb' && (mnt === '/var/lib/booking' || mnt === '/var'));
    });
  },

  umountExtras(guest) {
    (guest.disks || []).forEach((d) => {
      if (d.id !== 'sda' && d.mount) this.umount(guest, d.mount);
    });
  },

  applyFstab(guest) {
    this.umountExtras(guest);
    this.fstabLines(guest).forEach((line) => {
      const p = line.split(/\s+/);
      if (p.length < 2) return;
      const disk = this.findDisk(guest, p[0]);
      if (!disk || disk.id === 'sda') return;
      this.mount(guest, p[0], p[1]);
    });
  },

  reboot(guest) {
    if (!guest) return { ok: false, error: 'no guest' };
    guest.rebooted = true;
    guest.reboots = (guest.reboots || 0) + 1;
    this.applyFstab(guest);
    return { ok: true };
  },

  bookingPersisted(guest) {
    return !!(guest && guest.rebooted && this.fstabReady(guest) && this.bookingSettled(guest));
  },

  mount(guest, device, target) {
    if (!guest) return { ok: false, error: 'no guest' };
    const disk = this.findDisk(guest, device);
    if (!disk) return { ok: false, error: device + ': No such device' };
    if (disk.id === 'sda') return { ok: false, error: 'mount: / is busy' };
    if (disk.mount) return { ok: false, error: 'mount: already mounted on ' + disk.mount };
    const path = VFS.abs('/', target || '');
    const res = VFS.resolve(guest.vfs, '/', path);
    if (!res) return { ok: false, error: "mount: mount point '" + target + "' does not exist" };
    if (res.node.type !== 'dir') return { ok: false, error: 'mount: not a directory' };
    if (!res.parent) return { ok: false, error: 'mount: cannot replace /' };
    disk.tree = disk.tree || VFS.dir({});
    disk.shadow = { parent: res.parent, name: res.name, node: res.node };
    res.parent.children[res.name] = disk.tree;
    disk.mount = res.path;
    return { ok: true };
  },

  umount(guest, target) {
    if (!guest) return { ok: false, error: 'no guest' };
    const path = target ? VFS.abs('/', target) : '';
    const disk = (guest.disks || []).find((d) => (
      d.mount === path ||
      d.device === target ||
      d.id === String(target || '').replace(/^\/dev\//, '')
    ));
    if (!disk || !disk.mount || !disk.shadow) {
      return { ok: false, error: 'umount: ' + target + ': not mounted' };
    }
    disk.shadow.parent.children[disk.shadow.name] = disk.shadow.node;
    disk.mount = null;
    disk.shadow = null;
    return { ok: true };
  },

  dfRows(guest) {
    if (!guest) return [];
    const extras = new Set((guest.disks || []).filter((d) => d.id !== 'sda' && d.tree).map((d) => d.tree));
    return (guest.disks || []).map((d) => {
      const used = d.id === 'sda' ? VFS.sizeOf(guest.vfs, extras) : VFS.sizeOf(d.tree);
      const total = d.total || used;
      const avail = Math.max(0, total - used);
      const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
      return { disk: d, used, total, avail, pct, mount: d.mount || '' };
    });
  },

  dfTable(guest) {
    const fmt = (n) => `${Math.max(0, Math.round(n / 1024))}K`;
    const lines = ['Filesystem     1K-blocks    Used Available Use% Mounted on'];
    this.dfRows(guest).forEach((r) => {
      lines.push(
        `${r.disk.device.padEnd(14)} ${fmt(r.total).padStart(9)} ${fmt(r.used).padStart(7)} ${fmt(r.avail).padStart(9)}  ${String(r.pct).padStart(3)}% ${r.mount}`
      );
    });
    return lines.join('\n');
  },

  bookingSettled(guest) {
    if (!guest) return false;
    const sdb = (guest.disks || []).find((d) => d.id === 'sdb');
    if (!sdb || !sdb.mount) return false;
    if (sdb.mount !== '/var/lib/booking' && sdb.mount !== '/var') return false;
    const cases = VFS.resolve(guest.vfs, '/', '/var/lib/booking/cases.db');
    const text = cases && cases.node.type === 'file' ? cases.node.content : '';
    return text.includes('do not purge');
  },

  ticketNo(mission) {
    return 'TKT-' + String(100 + (mission.order || 0)).padStart(3, '0');
  },

  ticketStatus(mission, completed, currentId) {
    if ((completed || []).includes(mission.id)) return 'CLOSED';
    if (currentId === mission.id) return 'INPROG';
    if (Missions.isUnlocked(mission, completed || [])) return 'OPEN';
    return 'WAIT';
  },

  setUrl(href, title) {
    const loc = typeof document !== 'undefined' ? document.getElementById('virt-url') : null;
    if (loc) loc.value = href;
    const bar = typeof document !== 'undefined' ? document.getElementById('virt-title') : null;
    if (bar) bar.textContent = 'netmoth — ' + title;
  },

  paint(guest) {
    const el = typeof document !== 'undefined' ? document.getElementById('virt-body') : null;
    if (!el) return;
    if (this.page === 'ticket') return this.paintTicket(el);
    if (this.page === 'guest') {
      this.page = 'virt';
      this.sel = this.GUEST;
    }
    if (this.page === 'virt' || this.page === 'boxyard' || this.page === 'vcenter') {
      return this.paintVirt(el, guest);
    }
    return this.paintTickets(el);
  },

  shiftDue(mission, day) {
    const d = Missions.shiftDayOf(mission);
    if (d < day) return 'ROLL';
    if (d > day) return 'LATER';
    return 'TODAY';
  },

  shiftLine() {
    if (typeof Game === 'undefined' || !Game.shiftStamp) return 'Internal use only. Do not file cats as assets.';
    return 'SHIFT ' + Game.shiftStamp(true) + ' · punch out 16:00';
  },

  paintTickets(el) {
    this.setUrl('http://tickets.precinct/queue', 'tickets.precinct');
    const done = (typeof Game !== 'undefined' && Game.state && Game.state.completed) || [];
    const current = (typeof Game !== 'undefined' && Game.state && Game.state.currentMissionId) || null;
    const day = (typeof Game !== 'undefined' && Game.state && Game.state.shiftDay) || 0;
    const filter = this.ticketFilter || 'open';
    const rows = Missions.list().map((m) => {
      const st = this.ticketStatus(m, done, current);
      return { m, st, no: this.ticketNo(m), due: this.shiftDue(m, day) };
    }).filter((r) => {
      if (filter === 'closed') return r.st === 'CLOSED';
      if (filter === 'open') {
        return (r.st === 'OPEN' || r.st === 'INPROG') && Missions.shiftDayOf(r.m) <= day;
      }
      return true;
    });
    const tab = (id, label) => (
      '<a href="#" class="tkt-tab' + (filter === id ? ' on' : '') + '" onclick="Game.intranetGo(\'tickets\');Virt.ticketFilter=\'' + id + '\';Virt.paint();return false">' + label + '</a>'
    );
    el.innerHTML =
      '<div class="tkt-banner">PRECINCT HELP DESK — TicketQueue 4.01</div>' +
      '<div class="tkt-sub">' + this.shiftLine() + '</div>' +
      '<div class="tkt-tabs">' + tab('open', 'Today') + tab('all', 'All') + tab('closed', 'Closed') + '</div>' +
      '<table class="tkt-table">' +
        '<tr><th>Ticket</th><th>St</th><th>Summary</th><th>Due</th></tr>' +
        (rows.length ? rows.map((r) => (
          '<tr class="tkt-' + r.st.toLowerCase() + '" onclick="Game.openTicket(\'' + r.m.id + '\')">' +
            '<td>' + r.no + '</td><td>' + r.st + '</td>' +
            '<td>' + r.m.title.replace(/</g, '&lt;') + '</td><td>' + r.due + '</td>' +
          '</tr>'
        )).join('') : '<tr><td colspan="4">No tickets this shift.</td></tr>') +
      '</table>' +
      '<p class="tkt-foot">Queue owner: itguy@precinct-13 · SMTP down since Tuesday · <a href="#" onclick="Game.openAppHelp(\'tickets\');return false">help</a></p>';
  },

  paintTicket(el) {
    const mission = Missions.get(this.ticketId);
    if (!mission) return this.paintTickets(el);
    const done = (typeof Game !== 'undefined' && Game.state && Game.state.completed) || [];
    const current = (typeof Game !== 'undefined' && Game.state && Game.state.currentMissionId) || null;
    const st = this.ticketStatus(mission, done, current);
    const unlocked = Missions.isUnlocked(mission, done);
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.setUrl('http://tickets.precinct/' + this.ticketNo(mission), 'tickets.precinct');
    const env = (typeof Game !== 'undefined' && Game.ticketEnv) ? Game.ticketEnv() : null;
    const live = !!(env && env.id === mission.id);
    const ctx = live ? env.ctx : null;
    const vfs = live ? env.vfs : null;
    const items = Missions.tracker(mission, ctx, vfs);
    const tdone = items.filter((i) => i.done).length;
    const tracker = items.length
      ? '<div class="objective">' +
          '<div class="objective-kicker">TRACKER <span>' + tdone + '/' + items.length + '</span></div>' +
          '<ul class="tracker">' + items.map((i) => (
            '<li class="' + (i.done ? 'done' : '') + '">' +
              '<span class="box">' + (i.done ? '[x]' : '[ ]') + '</span>' +
              '<span>' + esc(i.label) + '</span></li>'
          )).join('') + '</ul></div>'
      : '';
    const notes = (typeof Game !== 'undefined' && Game._ticketNotes && Game._ticketNotes[mission.id]) || { hints: [], help: '' };
    const helpBlock = notes.help
      ? '<pre class="tkt-help">' + esc(notes.help) + '</pre>'
      : '';
    const hintBlock = (notes.hints && notes.hints.length)
      ? '<div class="tkt-hints">' + notes.hints.map((h) => '<div>' + esc(h) + '</div>').join('') + '</div>'
      : '';
    let action = '';
    if (st === 'CLOSED') {
      const close = notes.closeout || {};
      const finale = mission.id === 'root-of-crime' && Missions.campaignDone(done);
      action =
        '<div class="tkt-closeout">' +
          '<div class="tkt-updated">' + (close.first === false ? 'ALREADY ON FILE' : 'TICKET UPDATED') + '</div>' +
          (close.flavor ? '<p>' + esc(close.flavor) + '</p>' : '') +
          (close.learned ? '<div class="objective"><div class="objective-kicker">YOU LEARNED</div><div>' + close.learned + '</div></div>' : '') +
          (close.chief || mission.chiefNote ? '<p class="tkt-note">CHIEF: ' + esc(close.chief || mission.chiefNote) + '</p>' : '') +
          (finale
            ? '<p class="tkt-note">The case is closed. The board is not. Monday\'s tickets are on the queue.</p>' +
              '<button type="button" class="btn" onclick="Game.openEpilogue()">Read the closing report</button>' +
              '<button type="button" class="btn" onclick="Game.intranetGo(\'tickets\')">Back to queue</button>'
            : '<p class="tkt-note">' +
                (typeof Game !== 'undefined' && Game._punchNote
                  ? 'Punched out. Log off to end the day. Log in tomorrow.'
                  : 'Closed. Next job is in the queue.') +
              '</p>' +
              '<button type="button" class="btn" onclick="Game.intranetGo(\'tickets\')">Back to queue</button>') +
        '</div>';
    } else if (st === 'INPROG') {
      const ready = !!(ctx && vfs && mission.isWon(ctx, vfs));
      action =
        '<div class="tkt-actions">' +
          '<button type="button" class="btn" onclick="Game.ticketHelp()">Job notes</button>' +
          '<button type="button" class="btn" onclick="Game.ticketHint()">Hint (−' + Missions.HINT_COST + ')</button>' +
          (mission.virt ? '<button type="button" class="btn" onclick="Game.intranetGo(\'virt\')">Open virt</button>' : '') +
          '<button type="button" class="btn' + (ready ? ' tkt-close' : '') + '" onclick="Game.closeTicket()"' +
            (ready ? '' : ' disabled') + '>Close ticket</button>' +
        '</div>' +
        (ready ? '<p class="tkt-note">Tracker is done. Close the ticket to turn it in.</p>' : '');
    } else if (unlocked) {
      action = '<button type="button" class="btn" onclick="Game.workTicket(\'' + mission.id + '\')">Work this ticket</button>';
    } else {
      action = '<p class="tkt-note">Not assigned to you yet. Clear the earlier tickets.</p>';
    }
    el.innerHTML =
      '<div class="tkt-banner">PRECINCT HELP DESK — TicketQueue 4.01</div>' +
      '<div class="tkt-sub"><a href="#" onclick="Game.intranetGo(\'tickets\');return false">&lt; back to queue</a>' +
        ' · ' + Missions.code(mission) + ' · ' + this.shiftLine() + '</div>' +
      '<div class="tkt-detail">' +
        '<p><b>' + this.ticketNo(mission) + '</b> · ' + st + ' · Queue IT · Pri ' + (mission.act >= 3 ? '1' : '3') + '</p>' +
        '<h3>' + esc(mission.title) + '</h3>' +
        '<p class="tkt-meta">Requester: ' + (mission.act >= 2 ? 'dispatch@precinct-13' : 'chief@precinct-13') + '<br>' +
        'Asset: ' + Missions.assetOf(mission) + '<br>' +
        'Connect: ' + (Missions.assetOf(mission) === 'closet'
          ? '<a href="#" onclick="Game.openXterm();return false">open xterm</a> (this closet)'
          : '<a href="#" onclick="Game.openXterm();return false">open xterm</a>, then ssh ' + Missions.assetOf(mission)) + '<br>' +
        'Pay: ' + (Missions.ticketPay(mission) + (mission.id === 'root-of-crime' ? 100 : 0)) +
          ' · clean +' + Missions.CLEAN_BONUS +
          ' · hint −' + Missions.HINT_COST + '</p>' +
        '<p>' + esc(mission.description) + '</p>' +
        tracker +
        action +
        helpBlock +
        hintBlock +
      '</div>';
  },

  _virtUrl(sel) {
    if (sel === 'booking-vm') return 'http://virt.precinct/guests/booking-vm';
    if (sel === 'precinct-13') return 'http://virt.precinct/hosts/precinct-13';
    if (sel === 'coffee.lan') return 'http://virt.precinct/appliances/coffee.lan';
    if (sel === 'copier-vlan') return 'http://virt.precinct/clusters/copier-vlan';
    return 'http://virt.precinct/';
  },

  paintTree(guest) {
    const sel = this.sel || 'on-prem';
    const vmState = guest ? String(guest.state || 'running').toUpperCase() : '—';
    const node = (id, label, depth, meta) => (
      '<button type="button" class="virt-node d' + depth + (sel === id ? ' on' : '') +
        '" onclick="Virt.select(\'' + id + '\')">' +
        '<span>' + label + '</span>' +
        (meta ? '<span class="virt-node-meta">' + meta + '</span>' : '') +
      '</button>'
    );
    return (
      '<div class="virt-tree-head">Inventory</div>' +
      node('on-prem', '[-] on-prem', 0, 'cluster') +
      node('precinct-13', 'precinct-13', 1, 'HV') +
      node('booking-vm', 'booking-vm', 2, vmState) +
      node('copier-vlan', '[-] copier-vlan', 0, 'cluster') +
      node('coffee.lan', 'coffee.lan', 1, 'APPL')
    );
  },

  paintVirt(el, guest) {
    if (!this.sel) this.sel = 'on-prem';
    const g = guest || this.currentGuest();
    this.setUrl(this._virtUrl(this.sel), 'virt.precinct');
    el.innerHTML =
      '<div class="virt-banner">PRECINCT VIRT 0.9 — VM manager</div>' +
      '<div class="virt-split">' +
        '<div class="virt-tree">' + this.paintTree(g) + '</div>' +
        '<div class="virt-detail">' + this.paintDetail(this.sel, g) + '</div>' +
      '</div>';
  },

  paintDetail(sel, guest) {
    if (sel === 'booking-vm') return this.paintGuest(null, guest);
    if (sel === 'precinct-13') return this.paintHost();
    if (sel === 'coffee.lan') return this.paintAppliance();
    if (sel === 'copier-vlan') return this.paintCluster('copier-vlan');
    return this.paintCluster('on-prem', guest);
  },

  paintCluster(id, guest) {
    const onPrem = id === 'on-prem';
    const rows = guest ? this.dfRows(guest) : [];
    const root = rows.find((r) => r.disk && r.disk.id === 'sda') || rows[0];
    const disk = root ? root.pct + '%' : (guest ? '?' : '—');
    const vmState = guest ? String(guest.state || 'running').toUpperCase() : 'UNREG';
    if (onPrem) {
      return (
        '<div class="vc-path">Inventory / on-prem</div>' +
        '<div class="virt-panel">' +
          '<div class="virt-row"><strong>on-prem</strong> <span class="virt-run">UP</span></div>' +
          '<p class="virt-blurb">DuctTape cluster. The HV is precinct-13. Guests live here.</p>' +
          '<table class="tkt-table">' +
            '<tr><th>Object</th><th>State</th><th>Type</th><th>Disk</th></tr>' +
            '<tr class="tkt-open" onclick="Virt.select(\'precinct-13\')"><td>precinct-13</td><td>UP</td><td>HV</td><td>—</td></tr>' +
            '<tr class="tkt-open" onclick="Virt.select(\'booking-vm\')"><td>booking-vm</td><td>' +
              vmState + '</td><td>guest</td><td>' + disk + '</td></tr>' +
          '</table>' +
          '<p class="tkt-foot">Select a guest in the tree to attach disks and open a console. · ' +
            '<a href="#" onclick="Game.openAppHelp(\'virt\');return false">help</a></p>' +
        '</div>'
      );
    }
    return (
      '<div class="vc-path">Inventory / copier-vlan</div>' +
      '<div class="virt-panel">' +
        '<div class="virt-row"><strong>copier-vlan</strong> <span class="virt-run">UP</span></div>' +
        '<p class="virt-blurb">Appliance VLAN. Not a hypervisor. coffee.lan is already on the wire.</p>' +
        '<table class="tkt-table">' +
          '<tr><th>Object</th><th>State</th><th>Type</th><th>Disk</th></tr>' +
          '<tr class="tkt-open" onclick="Virt.select(\'coffee.lan\')"><td>coffee.lan</td><td>UP</td><td>appliance</td><td>—</td></tr>' +
        '</table>' +
        '<p class="tkt-foot"><a href="#" onclick="Game.openAppHelp(\'virt\');return false">help</a></p>' +
      '</div>'
    );
  },

  paintHost() {
    return (
      '<div class="vc-path">Inventory / on-prem / precinct-13</div>' +
      '<div class="virt-panel">' +
        '<div class="virt-row"><strong>precinct-13</strong> <span class="virt-run">UP</span></div>' +
        '<p class="virt-blurb">DuctTape HV 1.5. ssh precinct-13 from the closet. virsh list from that box.</p>' +
        '<table class="tkt-table">' +
          '<tr><th>Guest</th><th>State</th><th>Host</th></tr>' +
          '<tr class="tkt-open" onclick="Virt.select(\'booking-vm\')"><td>booking-vm</td><td>RUNNING</td><td>precinct-13</td></tr>' +
        '</table>' +
        '<p class="tkt-foot">Connect: <a href="#" onclick="Game.openXterm();return false">open xterm</a>, then ssh precinct-13</p>' +
      '</div>'
    );
  },

  paintAppliance() {
    return (
      '<div class="vc-path">Inventory / copier-vlan / coffee.lan</div>' +
      '<div class="virt-panel">' +
        '<div class="virt-row"><strong>coffee.lan</strong> <span class="virt-run">UP</span></div>' +
        '<p class="virt-blurb">BeanTek appliance. Not a guest. No disks to attach. The kettle is a computer.</p>' +
        '<p class="tkt-meta">10.13.0.8 · BrewOS 0.4 · default password still mocha123</p>' +
        '<div class="virt-actions">' +
          '<button type="button" class="btn" onclick="Game.openXterm()">open xterm</button>' +
        '</div>' +
        '<p class="tkt-foot">Connect: ssh coffee.lan</p>' +
      '</div>'
    );
  },

  paintGuest(_el, guest) {
    const g = guest || this.currentGuest();
    if (!g) {
      return (
        '<div class="vc-path">Inventory / on-prem / booking-vm</div>' +
        '<div class="virt-panel">' +
          '<p>Inventory is still coming up. Try again in a second.</p>' +
        '</div>'
      );
    }
    const rows = this.dfRows(g);
    const hasSdb = (g.disks || []).some((d) => d.id === 'sdb');
    const bars = rows.map((r) => {
      const label = r.disk.id + '  ' + (r.mount || 'unmounted');
      const cls = r.pct >= 90 ? 'hot' : (r.pct ? 'ok' : '');
      return (
        '<div class="virt-disk">' +
          '<div class="virt-disk-meta"><span>' + label + '</span>' +
          '<span>' + r.pct + '% of ' + Math.round(r.total / 1024) + 'K</span></div>' +
          '<div class="virt-bar ' + cls + '"><i style="width:' + r.pct + '%"></i></div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="vc-path">Inventory / on-prem / ' + g.hostname + '</div>' +
      '<div class="virt-panel">' +
        '<div class="virt-row"><strong>' + g.hostname + '</strong> <span class="virt-run">' + g.state.toUpperCase() + '</span></div>' +
        '<p class="virt-blurb">' + (g.blurb || 'The booking appliance. Detectives file incidents here. The disk is the problem. The cases are not.') + '</p>' +
        bars +
        (hasSdb
          ? ''
          : '<div class="virt-form">' +
              '<div class="virt-form-title">Attach new volume</div>' +
              '<label class="virt-field">Size ' +
                '<input id="virt-size" type="text" value="" size="6" maxlength="8" placeholder="200">' +
                '<select id="virt-unit">' +
                  '<option value="M" selected>MB</option>' +
                  '<option value="G">GB</option>' +
                  '<option value="K">KB</option>' +
                '</select>' +
              '</label>' +
              '<p class="virt-form-hint">Pick a size larger than the data you need to move. Empty size will not attach.</p>' +
            '</div>') +
        '<div class="virt-actions">' +
          (hasSdb
            ? '<button type="button" class="btn" disabled>Volume attached</button>'
            : '<button type="button" class="btn" onclick="Game.virtAttach()">Attach volume</button>') +
          '<button type="button" class="btn" onclick="Game.virtConsole()">Console</button>' +
          '<button type="button" class="btn" onclick="Game.virtReboot()">Reboot</button>' +
        '</div>' +
      '</div>'
    );
  }
};
