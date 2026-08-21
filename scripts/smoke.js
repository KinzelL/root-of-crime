#!/usr/bin/env node
/* Load VFS + Missions in a sandbox and check each chapter can be won. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadCampaign } = require('./lib/load-js');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
loadCampaign(ctx, root);

const { VFS, Missions, Virt, Infra } = ctx;
const list = Missions.list();
if (list.length !== Missions.SOURCES.length) {
  throw new Error('expected ' + Missions.SOURCES.length + ' missions, got ' + list.length);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function win(id, apply) {
  const m = Missions.get(id);
  const setup = m.setup();
  assert(!m.isWon(setup.ctx, setup.vfs), id + ' should start unsolved');
  apply(setup.ctx, setup.vfs);
  assert(m.isWon(setup.ctx, setup.vfs), id + ' should be winnable');
}

win('the-desk', (ctx) => {
  ctx.usedHelp = true;
  ctx.usedMan = true;
});

win('mon-printer', (ctx, vfs) => {
  delete VFS.resolve(vfs, '/', '/etc/cron.d').node.children.wanted;
  const p = ctx.processes.find((x) => x.pid === 1337);
  p.dead = true;
  ctx.killed = [p];
  ctx.monCleared = true;
});

win('badge-day', (ctx) => {
  ctx.readFiles = ['/home/itguy/welcome.txt'];
});

win('lost-closet', (ctx) => {
  ctx.readFiles = ['/etc/orders.txt'];
});

win('file-locker', (_ctx, vfs) => {
  const tmp = VFS.resolve(vfs, '/', '/tmp').node;
  const dest = VFS.dir({});
  VFS.resolve(vfs, '/', '/evidence').node.children.sorted = dest;
  ['usb_note.txt', 'case_scrap.txt', 'blurry_cat.jpg'].forEach((n) => {
    dest.children[n] = tmp.children[n];
    delete tmp.children[n];
  });
  VFS.resolve(vfs, '/', '/home/itguy').node.children['usb_note.txt'] = VFS.file('copy\n');
});

win('long-statement', (ctx) => {
  ctx.readFiles = ['/var/log/incident/miller_statement.log'];
});

win('dont-eat', (_ctx, vfs) => {
  const f = VFS.resolve(vfs, '/', '/evidence/case_042.txt').node;
  f.content =
    'Case #042\nSuspect: unknown\nUSB device logged at 03:04.\nnight shift ate the original\n';
});

win('wanted-poster', (ctx) => {
  const p = ctx.processes.find((x) => x.pid === 1337);
  p.dead = true;
  ctx.killed = [p];
});

win('locked-evidence', (_ctx, vfs) => {
  Object.values(VFS.resolve(vfs, '/', '/evidence').node.children).forEach((n) => {
    if (n.type === 'file') n.mode = 0o644;
  });
});

win('log-needle', (ctx) => {
  ctx.readFiles = ['/var/log/incident/incident_17.log'];
});

win('ghost-shift', (ctx) => {
  ctx.readFiles = ['/etc/passwd', '/var/log/auth.log'];
});

win('cron-dead', (_ctx, vfs) => {
  delete VFS.resolve(vfs, '/', '/etc/cron.d').node.children.beantek;
});

{
  const m = Missions.get('disk-full');
  const setup = m.setup();
  const used = VFS.sizeOf(setup.vfs);
  const pct = Math.round((used / setup.ctx.diskTotal) * 100);
  assert(pct === 99, 'disk-full should start at 99%, got ' + pct);
  const spool = VFS.sizeOf(VFS.resolve(setup.vfs, '/', '/var/spool').node);
  assert(spool > used - spool, 'spool should be most of the disk');
  const posters = Object.keys(VFS.resolve(setup.vfs, '/', '/var/spool/printer').node.children)
    .filter((n) => n.startsWith('wanted_'));
  assert(posters.length >= 40, 'printer queue too small: ' + posters.length);
}

win('disk-full', (_ctx, vfs) => {
  const spool = VFS.resolve(vfs, '/', '/var/spool/printer').node;
  Object.keys(spool.children).forEach((n) => {
    if (n.startsWith('wanted_')) delete spool.children[n];
  });
});

win('coffee-c2', (ctx) => {
  const p = ctx.processes.find((x) => x.pid === 2048);
  p.dead = true;
  ctx.killed = [p];
});

win('hidden-claws', (ctx) => {
  ctx.readFiles = ['/opt/coffee/.scratch/exfil.log'];
});

{
  const g = Virt.makeBooking();
  assert(!Virt.attachVolume(g).ok, 'attach without size should fail');
  assert(Virt.parseSize('200', 'M').bytes === 200 * 1024 * 1024, '200 MB parse');
  const tiny = Virt.makeBooking();
  Virt.attachVolume(tiny, 2048);
  VFS.mkdir(tiny.vfs, '/', '/mnt/new');
  Virt.mount(tiny, '/dev/sdb1', '/mnt/new');
  const cases = VFS.resolve(tiny.vfs, '/', '/var/lib/booking/cases.db');
  const space = Virt.ensureSpace(tiny, '/mnt/new/cases.db', cases.node.content.length);
  assert(!space.ok, 'tiny volume should not hold the case database');
}

win('booking-vm', (ctx) => {
  const guest = ctx.guests['booking-vm'];
  Virt.attachVolume(guest, 200 * 1024 * 1024);
  Virt.mount(guest, '/dev/sdb1', '/mnt/new');
  const src = VFS.resolve(guest.vfs, '/', '/var/lib/booking').node;
  Object.keys(src.children).forEach((n) => {
    guest.disks[1].tree.children[n] = src.children[n];
    delete src.children[n];
  });
  Virt.umount(guest, '/mnt/new');
  Virt.mount(guest, '/dev/sdb1', '/var/lib/booking');
});

{
  const m = Missions.get('booking-fstab');
  const setup = m.setup();
  Virt.reboot(setup.ctx.guests['booking-vm']);
  assert(!m.isWon(setup.ctx, setup.vfs), 'reboot without fstab should not win');
}

win('booking-fstab', (ctx) => {
  const guest = ctx.guests['booking-vm'];
  const f = VFS.resolve(guest.vfs, '/', '/etc/fstab').node;
  f.content += '/dev/sdb1  /var/lib/booking  ext4  defaults  0  2\n';
  Virt.reboot(guest);
});

win('root-of-crime', (ctx, vfs) => {
  delete VFS.resolve(vfs, '/', '/opt/coffee').node.children['.scratch'];
  delete VFS.resolve(vfs, '/', '/etc/cron.d').node.children.beantek;
  ctx.processes.forEach((p) => {
    if (p.pid === 2048 || p.pid === 4444) p.dead = true;
  });
  ctx.killed = ctx.processes.filter((p) => p.dead);
  ctx.passwordChanged = ['coffee'];
});

// VFS sanity
const tree = VFS.createBase();
assert(VFS.resolve(tree, '/', '/home/itguy/welcome.txt').node.type === 'file', 'welcome exists');
assert(typeof Infra !== 'undefined', 'Infra missing');
Infra.boot();
assert(Infra.get('precinct-13') && Infra.get('precinct-13').vfs, 'precinct-13 did not boot');
assert(Infra.guest('booking-vm') && Infra.guest('booking-vm').state === 'running', 'booking-vm not running');
assert(/10.13.0.4/.test(Infra.hostsFile()), 'hosts file missing precinct-13');
assert(/coffee.lan/.test(Infra.jumpNote()), 'jump note missing coffee.lan');
assert(typeof VFS.closetMotd === 'function', 'closet motd helper missing');
assert(/mittens/.test(VFS.closetMotd()), 'closet motd missing pixel cat');
assert(/ssh precinct-13/.test(VFS.closetMotd()), 'closet motd missing ssh');
assert(VFS.abs('/home/itguy', '~', '/home/itguy') === '/home/itguy', 'tilde');
assert(VFS.abs('/home/itguy', '..', '/home/itguy') === '/home', 'dotdot');
const hits = VFS.expandGlob(tree, '/home/itguy', '*', '/home/itguy');
assert(hits.some((h) => h.endsWith('welcome.txt')), 'glob home');

list.forEach((m) => {
  assert(m.caseTitle && m.caseBody, m.id + ' missing caseTitle/caseBody');
});
assert(Missions.latestStory([], 'notes')[0].includes('printer'), 'intro notes');
assert(Missions.latestStory(['file-locker'], 'radio').some((l) => l.includes('/tmp')), 'file-locker radio');
assert(Missions.latestStory(['wanted-poster', 'coffee-c2'], 'radio').some((l) => l.includes('4444')), 'latest radio is coffee-c2');

function track(id, expect, apply) {
  const m = Missions.get(id);
  const setup = m.setup();
  const before = Missions.tracker(m, setup.ctx, setup.vfs);
  assert(before.length === expect, id + ' tracker count, got ' + before.length);
  assert(before.every((i) => i.label && i.done === false), id + ' should start unchecked');
  apply(setup.ctx, setup.vfs);
  const after = Missions.tracker(m, setup.ctx, setup.vfs);
  assert(after.length === expect, id + ' tracker count after apply');
  assert(after.every((i) => i.done), id + ' tracker should complete');
}

track('the-desk', 2, (ctx) => { ctx.usedHelp = true; ctx.usedMan = true; });
track('mon-printer', 3, (ctx, vfs) => {
  delete VFS.resolve(vfs, '/', '/etc/cron.d').node.children.wanted;
  const p = ctx.processes.find((x) => x.pid === 1337);
  p.dead = true;
  ctx.killed = [p];
  ctx.monCleared = true;
});
track('file-locker', 3, (_ctx, vfs) => {
  const tmp = VFS.resolve(vfs, '/', '/tmp').node;
  const dest = VFS.dir({});
  VFS.resolve(vfs, '/', '/evidence').node.children.sorted = dest;
  ['usb_note.txt', 'case_scrap.txt', 'blurry_cat.jpg'].forEach((n) => {
    dest.children[n] = tmp.children[n];
    delete tmp.children[n];
  });
  VFS.resolve(vfs, '/', '/home/itguy').node.children['usb_note.txt'] = VFS.file('copy\n');
});
track('dont-eat', 2, (_ctx, vfs) => {
  const f = VFS.resolve(vfs, '/', '/evidence/case_042.txt').node;
  f.content =
    'Case #042\nSuspect: unknown\nUSB device logged at 03:04.\nnight shift ate the original\n';
});
track('ghost-shift', 2, (ctx) => {
  ctx.readFiles = ['/etc/passwd', '/var/log/auth.log'];
});
track('booking-vm', 3, (ctx) => {
  ctx.usedConsole = true;
  const guest = ctx.guests['booking-vm'];
  Virt.attachVolume(guest, 200 * 1024 * 1024);
  Virt.mount(guest, '/dev/sdb1', '/mnt/new');
  const src = VFS.resolve(guest.vfs, '/', '/var/lib/booking').node;
  Object.keys(src.children).forEach((n) => {
    guest.disks[1].tree.children[n] = src.children[n];
    delete src.children[n];
  });
  Virt.umount(guest, '/mnt/new');
  Virt.mount(guest, '/dev/sdb1', '/var/lib/booking');
});
track('booking-fstab', 3, (ctx) => {
  const guest = ctx.guests['booking-vm'];
  const f = VFS.resolve(guest.vfs, '/', '/etc/fstab').node;
  f.content += '/dev/sdb1  /var/lib/booking  ext4  defaults  0  2\n';
  Virt.reboot(guest);
});
track('root-of-crime', 4, (ctx, vfs) => {
  delete VFS.resolve(vfs, '/', '/opt/coffee').node.children['.scratch'];
  delete VFS.resolve(vfs, '/', '/etc/cron.d').node.children.beantek;
  ctx.processes.forEach((p) => {
    if (p.pid === 2048 || p.pid === 4444) p.dead = true;
  });
  ctx.killed = ctx.processes.filter((p) => p.dead);
  ctx.passwordChanged = ['coffee'];
});
assert(
  Missions.tracker(Missions.get('badge-day'), { readFiles: [] }, VFS.createBase()).length === 1,
  'single-job cases still get one tracker row'
);
assert(Missions.shiftDayOf(Missions.get('the-desk')) === 0, 'desk is thursday');
assert(Missions.shiftDayOf(Missions.get('dont-eat')) === 0, 'beginner is thursday');
assert(Missions.shiftDayOf(Missions.get('wanted-poster')) === 1, '2.1 is friday');
assert(Missions.shiftDayOf(Missions.get('disk-full')) === 2, '2.6 is saturday');
assert(Missions.shiftDayOf(Missions.get('booking-vm')) === 3, '3.1 is sunday');
assert(Missions.todayWork([], 0).some((m) => m.id === 'the-desk'), 'thursday work missing the desk');
assert(Missions.todayWork(['the-desk'], 0).some((m) => m.id === 'mon-printer'), 'printer alert missing after the desk');
{
  const m = Missions.get('mon-printer');
  const setup = m.setup();
  const p = setup.ctx.processes.find((x) => x.pid === 1337);
  p.dead = true;
  setup.ctx.killed = [p];
  assert(!m.monitor.prevent(setup.ctx, setup.vfs), 'cron should still be there');
  Mon.tick(setup.ctx, setup.vfs, m);
  Mon.tick(setup.ctx, setup.vfs, m);
  assert(!p.dead, 'killed printer should flap back without prevent');
  delete VFS.resolve(setup.vfs, '/', '/etc/cron.d').node.children.wanted;
  p.dead = true;
  setup.ctx.killed = [p];
  setup.ctx.monCleared = true;
  assert(m.isWon(setup.ctx, setup.vfs), 'prevent + fix + clear should win');
}
assert(!Missions.todayWork([], 0).some((m) => m.id === 'wanted-poster'), 'friday leaked onto thursday');
assert(Missions.ticketPay(Missions.get('the-desk')) === 50, 'desk pay');
assert(Missions.ticketPay(Missions.get('badge-day')) === 100, 'beginner pay');
assert(Missions.ticketPay(Missions.get('wanted-poster')) === 150, 'intermediate pay');
assert(Missions.ticketPay(Missions.get('booking-vm')) === 200, 'expert pay');

assert(Object.keys(Missions.templates).length === 3, 'expected 3 job templates');
assert(Missions.campaign().length === Missions.SOURCES.length, 'jobs leaked into the campaign');
{
  const rec = { id: 'job-redirect-test', template: 'job-redirect', seed: 0, shiftDay: 4, seq: 1 };
  const inst = Missions.spawnJob('job-redirect', rec);
  assert(inst && inst.repeatable, 'redirect job did not spawn');
  const setup = inst.setup();
  assert(!inst.isWon(setup.ctx, setup.vfs), 'redirect job should start unsolved');
  const c = setup.ctx.jobCase;
  const live = VFS.resolve(setup.vfs, '/', '/evidence/' + c.file).node;
  const bak = VFS.resolve(setup.vfs, '/', '/evidence/' + c.file + '.bak').node;
  live.content = bak.content + 'night shift ate the original\n';
  assert(inst.isWon(setup.ctx, setup.vfs), 'redirect job should be winnable');
  Missions.forgetJobs();
}
{
  const rec = { id: 'job-needle-test', template: 'job-needle', seed: 0, shiftDay: 4, seq: 2 };
  const inst = Missions.spawnJob('job-needle', rec);
  const setup = inst.setup();
  setup.ctx.readFiles = ['/var/log/incident/incident_14.log'];
  assert(inst.isWon(setup.ctx, setup.vfs), 'needle job should be winnable');
  Missions.forgetJobs();
}
{
  const rec = { id: 'job-spool-test', template: 'job-spool', seed: 0, shiftDay: 4, seq: 3 };
  const inst = Missions.spawnJob('job-spool', rec);
  const setup = inst.setup();
  const folder = VFS.resolve(setup.vfs, '/', '/var/spool/printer').node;
  Object.keys(folder.children).forEach((n) => {
    if (n.startsWith('queue_')) delete folder.children[n];
  });
  assert(inst.isWon(setup.ctx, setup.vfs), 'spool job should be winnable');
  Missions.forgetJobs();
}
assert(Missions.list().length === Missions.SOURCES.length, 'forgetJobs left instances behind');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(!/id="screen-mission"/.test(html), 'mission must not be a separate screen');
assert(/id="win-xterm"/.test(html), 'xterm client missing');
assert(/id="term-screen"/.test(html), 'xterm missing inline screen');
assert(!/term-input-row/.test(html), 'xterm still has a bottom input bar');
assert(/ssh the asset/.test(html), 'walkthrough missing ssh');
const deskSrc = fs.readFileSync(path.join(root, 'js/desktop.js'), 'utf8');
assert(/action: 'xterm'/.test(deskSrc), 'desk icons missing xterm');
assert(!/Work it and xterm opens/.test(html), 'walkthrough still auto-opens xterm');
assert(/id="win-brief"/.test(html), 'brief client missing');
assert(/id="welcome-overlay"/.test(html), 'welcome slip missing');
assert(/id="win-timeclock"/.test(html), 'timeclock client missing');
assert(/js\/windows\.js/.test(html), 'windows.js not loaded');
assert(/id="win-case"/.test(html), 'casefile client missing');
assert(/id="win-manual"/.test(html), 'xman client missing');
assert(/id="shift-report"/.test(html), 'shift report missing');
assert(/js\/jobs\.js/.test(html), 'jobs.js not loaded');
assert(/js\/infra\.js/.test(html), 'infra.js not loaded');
assert(/js\/mon\.js/.test(html), 'mon.js not loaded');
assert(/mon\.precinct/.test(html), 'mon.precinct bookmark missing');
const storySrc = fs.readFileSync(path.join(root, 'js/story.js'), 'utf8');
assert(/const APP_DOCS/.test(storySrc), 'APP_DOCS missing');
assert(/id: 'xterm'/.test(storySrc) && /id: 'tickets'/.test(storySrc) && /id: 'mon'/.test(storySrc), 'app tutorials incomplete');
assert(!/id="win-welcome"/.test(html), 'welcome is still a desktop gadget');
assert(!/id="briefing"/.test(html), 'legacy briefing overlay still in the DOM');
const gameSrc = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
assert(!/showScreen\('mission'\)/.test(gameSrc), 'game still swaps to a mission screen');

console.log('ok — ' + list.length + ' missions winnable, VFS sane, xterm is a desktop client');
