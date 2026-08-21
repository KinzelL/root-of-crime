#!/usr/bin/env node
/* xterm lives on the desktop; the taskbar raises and iconifies it. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGame } = require('./lib/load-js');

const root = path.join(__dirname, '..');

class El {
  constructor(id, className = '') {
    this.id = id || '';
    this.className = className;
    this.innerHTML = '';
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.selectionStart = 0;
    this.children = [];
    this.parent = null;
    const set = new Set(className.split(/\s+/).filter(Boolean));
    const sync = () => { this.className = [...set].join(' '); };
    this.classList = {
      add: (...xs) => { xs.forEach((x) => set.add(x)); sync(); },
      remove: (...xs) => { xs.forEach((x) => set.delete(x)); sync(); },
      toggle: (x, on) => {
        if (on === false || (on === undefined && set.has(x))) set.delete(x);
        else set.add(x);
        sync();
      },
      contains: (x) => set.has(x)
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.innerHTML = this._text; }
  addEventListener() {}
  querySelector(sel) {
    if (typeof sel === 'string' && sel.startsWith('.')) {
      const cls = sel.slice(1).split('.')[0];
      return this.children.find((c) => (c.className || '').split(/\s+/).includes(cls)) || null;
    }
    return new El();
  }
  querySelectorAll() { return []; }
  appendChild(child) { this.children.push(child); return child; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }; }
  focus() {}
  remove() {
    if (this.id) delete els[this.id];
  }
  closest() { return null; }
  setAttribute() {}
  getAttribute() { return null; }
}

const els = {};
function el(id, className) {
  if (els[id]) return els[id];
  els[id] = new El(id, className);
  return els[id];
}

[
  'screen-title', 'screen-boot', 'screen-desktop',
  'taskbar', 'task-list', 'task-mail', 'task-clock', 'task-start', 'task-pager',
  'root-menu', 'desktop-icons', 'progress-text', 'rank-text', 'score-text',
  'desktop-clock', 'xbiff-alert', 'mission-list', 'mission-title-bar', 'mission-tag',
  'mission-name', 'mission-desc', 'mission-tracker', 'mission-track-count', 'mission-stamp', 'xterm-title',
  'success-title', 'success-flavor', 'success-learned', 'success-chief',
  'success-extra', 'case-body', 'notes-body', 'radio-body', 'manual-body',
  'xconsole-log', 'toast', 'boot-log', 'xclock-ticks', 'xload-bars',
  'hand-h', 'hand-m', 'hand-s', 'opt-crt', 'opt-sound',
  'term-output', 'termInput', 'term-screen',
  'win-xterm', 'win-brief', 'win-virt', 'virt-body', 'virt-url', 'virt-title', 'virt-size', 'virt-unit', 'win-xclock', 'win-xeyes', 'win-xload',
  'win-status', 'win-xmessage', 'mail-list', 'mail-read', 'mail-title', 'win-xconsole',
  'win-timeclock', 'timeclock-body', 'timeclock-title', 'timeclock-led',
  'welcome-overlay', 'welcome-view', 'walkthrough-view', 'welcome-title-bar',
  'shift-report', 'shift-report-body', 'shift-report-title',
  'xdm-sub', 'xdm-flavor', 'xdm-login',
  'win-case', 'win-notes', 'win-radio', 'win-manual', 'win-prefs',
  'mission-board', 'case-overlay', 'notes-overlay',
  'radio-overlay', 'manual-overlay', 'settings-overlay',
  'success-overlay', 'epilogue-overlay', 'epilogue-body'
].forEach((id) => el(id));

el('screen-title', 'screen active x-root');
el('screen-boot', 'screen');
el('screen-desktop', 'screen x-root');
el('win-xterm', 'xwin terminal x-gadget x-drag x-client iconified withdrawn');
el('win-brief', 'xwin x-gadget x-drag x-client iconified withdrawn');
el('win-virt', 'xwin x-gadget x-drag x-client iconified withdrawn');
el('win-timeclock', 'xwin x-gadget x-drag x-client iconified withdrawn');
['win-xterm', 'win-brief', 'win-virt', 'win-timeclock', 'win-case', 'win-notes', 'win-radio', 'win-manual', 'win-prefs', 'win-xconsole'].forEach((id) => {
  const node = els[id];
  if (!node) return;
  node.classList.add('iconified');
  node.classList.add('withdrawn');
});
el('win-xclock', 'xwin x-gadget x-drag');
el('win-xeyes', 'xwin x-gadget x-drag');
el('win-xload', 'xwin x-gadget x-drag');
el('win-status', 'xwin x-gadget x-drag');
el('win-xmessage', 'xwin x-gadget x-drag');
el('win-xconsole', 'xwin x-gadget x-drag x-client iconified withdrawn');
el('termInput').value = '';
el('xterm-title').textContent = 'xterm — root@precinct-13';
el('mission-title-bar').textContent = 'xmessage';

const screens = [els['screen-title'], els['screen-boot'], els['screen-desktop']];
const overlays = [
  els['welcome-overlay'], els['shift-report'],
  els['mission-board'], els['case-overlay'], els['notes-overlay'],
  els['radio-overlay'], els['manual-overlay'], els['settings-overlay'],
  els['success-overlay'], els['epilogue-overlay']
];
overlays.forEach((o) => { o.classList.add('overlay'); });

const prompt = new El();
prompt.textContent = 'root@precinct-13:~#';
const body = new El('body');

const document = {
  body,
  title: 'ROOT OF CRIME',
  getElementById(id) { return els[id] || null; },
  querySelector(sel) {
    if (sel === '.term-prompt') return prompt;
    if (sel === '.terminal') return els['win-xterm'];
    if (sel === '#win-xmessage .xmessage-body') return els['mail-read'] || new El();
    if (sel.startsWith('#')) return els[sel.slice(1)] || new El();
    return new El();
  },
  querySelectorAll(sel) {
    if (sel === '.screen') return screens;
    if (sel === '.overlay') return overlays;
    if (sel === '.x-drag') {
      return [els['win-xterm'], els['win-brief'], els['win-virt'], els['win-timeclock'], els['win-xclock'], els['win-xeyes'], els['win-xload'], els['win-status'], els['win-xmessage']];
    }
    if (sel === '.eye') return [];
    if (sel === '.twm-icon') return [];
    return [];
  },
  addEventListener() {},
  createElement() { return new El(); }
};

const ctx = {
  console,
  document,
  window: { innerWidth: 1200, innerHeight: 800, AudioContext: function () { throw new Error('no audio'); } },
  localStorage: { getItem() { return null; }, setItem() {} },
  Date,
  setTimeout: (fn) => { fn(); return 0; },
  setInterval: () => 0,
  clearTimeout() {},
  AudioContext: function () { throw new Error('no audio'); }
};
ctx.window = Object.assign(ctx.window, ctx);
ctx.globalThis = ctx;

vm.createContext(ctx);
loadGame(ctx, root);

const { Game, Terminal, Missions } = ctx;
Game.init();
Game._arriveDesktop();
{
  assert(ctx.Infra && ctx.Infra.booted, 'infra did not boot with the desktop');
  const idle = Terminal._cmdSsh(['precinct-13']);
  assert(!idle.code, 'ssh precinct-13 refused with no ticket: ' + (idle.stderr || ''));
  assert(Terminal.host === 'precinct-13', 'ssh precinct-13 did not land');
  const ping = Terminal._cmdPing ? Terminal._cmdPing(['booking-vm']) : { code: 1 };
  assert(!ping.code && /10.13.0.20/.test(ping.stdout || ''), 'ping booking-vm failed');
  Terminal._execute('exit');
  Game.intranetGo('virt');
  assert(/booking-vm/.test(els['virt-body'].innerHTML || ''), 'virt inventory empty before any ticket');
  assert(/coffee.lan/.test(els['virt-body'].innerHTML || ''), 'virt missing copier-vlan cluster');
  assert(/virt-tree/.test(els['virt-body'].innerHTML || ''), 'virt missing inventory tree');
  assert(/virt-detail/.test(els['virt-body'].innerHTML || ''), 'virt missing details pane');
}
Game.startMission('badge-day');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sshIn(host) {
  Game.ensureDeskShell();
  Game.winOpen('win-xterm');
  if (!host || host === 'closet') return;
  const r = Terminal._cmdSsh([host]);
  if (r && r.code) throw new Error('ssh ' + host + ' failed: ' + (r.stderr || ''));
}

assert(Game.WINDOWS && Game.winMinimize && Game.winMaximize && Game.winRestore && Game.winClose && Game.winOpen, 'window contract missing');
Object.keys(Game.WINDOWS).forEach((id) => {
  assert(Game.WINDOWS[id].label, 'window ' + id + ' missing label');
});
assert(els['screen-desktop'].classList.contains('active'), 'desktop not active');
assert(!els['win-timeclock'].classList.contains('iconified'), 'timeclock should open with the desktop');
assert(!els['screen-mission'], 'legacy mission screen should not exist');
assert(els['win-xterm'].classList.contains('iconified'), 'startMission should not open xterm');
assert(els['win-xterm'].classList.contains('withdrawn'), 'startMission should leave xterm closed');
assert(/ssh precinct-13/.test(els['toast'].textContent || ''), 'startMission should tell you to ssh');
assert(els['win-brief'].classList.contains('iconified'), 'old case slip should stay down');
assert(!els['win-virt'].classList.contains('iconified'), 'ticket hub stayed iconified');
assert(/Badge Day/.test(els['virt-body'].innerHTML || ''), 'ticket case did not paint');
assert(/open xterm/.test(els['virt-body'].innerHTML || ''), 'ticket missing open-xterm connect');
assert(/data-action="xterm"/.test(els['desktop-icons'].innerHTML || ''), 'desk missing xterm icon');
assert(Game.state.currentScreen === 'desktop', 'currentScreen is ' + Game.state.currentScreen);
assert(Game.state.currentMissionId === 'badge-day', 'mission id ' + Game.state.currentMissionId);
assert(els['win-xterm'].children.filter((c) => /\bx-rsz\b/.test(c.className || '')).length === 8, 'xterm missing resize grips');
assert(/netmoth/.test(els['task-list'].innerHTML), 'taskbar missing netmoth');
assert(/timeclock/.test(els['task-list'].innerHTML), 'taskbar missing timeclock');
assert(!/casefile/.test(els['task-list'].innerHTML || ''), 'closed casefile should not sit on the taskbar');
assert(!/xconsole/.test(els['task-list'].innerHTML || ''), 'closed xconsole should not sit on the taskbar');
Game._desktopAction('xterm');
assert(!els['win-xterm'].classList.contains('withdrawn'), 'xterm icon should open xterm');
assert(els['win-xconsole'].classList.contains('withdrawn'), 'xterm icon opened xconsole instead');
assert(/mittens/.test(els['term-output'].innerHTML || ''), 'closet login missing motd art');
assert(/ssh precinct-13/.test(els['term-output'].innerHTML || ''), 'closet motd missing ssh hint');
els['term-output'].innerHTML = '';
Terminal._execute('cat /etc/motd');
assert(/mittens/.test(els['term-output'].innerHTML || ''), 'cat /etc/motd is not the login banner');
Game.winClose('win-xterm', true);
Game._desktopAction('xconsole');
assert(!els['win-xconsole'].classList.contains('withdrawn'), 'xconsole icon/menu should open it on a fresh desk');
Game.winClose('win-xconsole', true);
Game.intranetGo('tickets');
assert(/TicketQueue/.test(els['virt-body'].innerHTML || ''), 'helpdesk did not paint');
Game.intranetGo('mon');
assert(/mon\.precinct/.test(els['virt-body'].innerHTML || ''), 'mon.precinct did not paint');
assert(/PRECINCT NAGIOS/.test(els['virt-body'].innerHTML || ''), 'mon.precinct missing nagios chrome');
Game.intranetGo('tickets');
assert(/TKT-/.test(els['virt-body'].innerHTML || ''), 'helpdesk missing tickets');
assert(/Today/.test(els['virt-body'].innerHTML || ''), 'today tab missing');
assert(/How This Desk Works/.test(els['virt-body'].innerHTML || ''), 'today missing the desk');
assert(!/Endless Wanted/.test(els['virt-body'].innerHTML || ''), 'friday ticket leaked onto today');
assert(/SHIFT/.test(els['virt-body'].innerHTML || ''), 'ticket header missing shift clock');
assert(!/Punch out/.test(els['virt-body'].innerHTML || ''), 'queue still has punch out');
assert(/8\/14/.test(els['desktop-clock'].textContent || ''), 'xbiff not showing in-game date');
assert(/08:00/.test(els['desktop-clock'].textContent || ''), 'xbiff not showing shift start');
{
  const min = Game.state.shiftMin;
  Game.startMission('the-desk');
  Terminal.ctx.usedHelp = true;
  Terminal.ctx.usedMan = true;
  assert(Game.closeTicket(), 'close ticket should turn in the desk');
  assert(Game.state.completed.includes('the-desk'), 'desk was not filed');
  assert(Game.state.shiftMin === min + 60, 'closing a ticket should jump the clock');
  assert((Game.state.shiftClosed || []).some((row) => (row.id || row) === 'the-desk'), 'desk missing from today\'s timesheet');
  assert((Game.state.shiftScore || 0) >= 100, 'shift score did not move');
  assert(Game.state.score === 100, 'desk should pay 50 + 50 clean, got ' + Game.state.score);
  Game.startMission('badge-day');
}
Game.intranetGo('virt');
assert(/PRECINCT VIRT/.test(els['virt-body'].innerHTML || ''), 'virt inventory did not paint');
assert(/booking-vm/.test(els['virt-body'].innerHTML || ''), 'virt inventory missing guests');
assert(/mail/.test(els['task-list'].innerHTML), 'taskbar missing mail');
assert(/Today'?s work|Punch in/.test(els['mail-read'].innerHTML || ''), 'mailer missing job message');
assert(/Chief/.test(els['mail-list'].innerHTML || ''), 'mailer inbox empty');
assert(/8\/14/.test(els['mail-list'].innerHTML || ''), 'mailer missing in-game date');
{
  const box = Game._inbox();
  const times = box.map((m) => m.when);
  assert(times.every((t) => typeof t === 'number'), 'mail missing sortable when');
  Game.mailSort('when');
  const asc = Game._inbox().map((m) => m.when);
  assert(asc[0] <= asc[asc.length - 1], 'date sort asc failed');
  Game.mailSort('when');
  const desc = Game._inbox().map((m) => m.when);
  assert(desc[0] >= desc[desc.length - 1], 'date sort desc failed');
}
Game.state.completed = ['the-desk', 'badge-day', 'lost-closet', 'file-locker', 'long-statement', 'dont-eat', 'wanted-poster'];
Game._mailSeen = -1;
Game._paintXmessage();
assert(/8\/15/.test(els['mail-list'].innerHTML || ''), 'mailer did not advance the in-game day');
Game.state.completed = [];
Game._mailSeen = -1;
Game._paintXmessage();
Game.winOpen('win-xterm');
assert(/xterm/.test(els['task-list'].innerHTML), 'taskbar missing xterm');
assert(!/wanted_cat_printer/.test(els['task-list'].innerHTML), 'fake printer client still on the taskbar');
assert(/\[ \]/.test(els['mission-tracker'].innerHTML), 'slip tracker did not paint');
assert(/0\/1/.test(els['mission-track-count'].textContent), 'tracker count is ' + els['mission-track-count'].textContent);

Game.iconifyClient('win-xterm', true);
Game.iconifyClient('win-brief', true);
assert(els['win-xterm'].classList.contains('iconified'), 'iconify missed xterm');
assert(els['win-brief'].classList.contains('iconified'), 'iconify missed brief');

Game._focusGadget('win-xterm');
assert(!els['win-xterm'].classList.contains('iconified'), 'taskbar raise failed');
assert(Game.state.focusedWin === 'win-xterm', 'focusedWin not xterm');

Terminal._execute('less /etc/hostname');
assert(Terminal._pager, 'less did not enter pager');
assert((Terminal.ctx.readFiles || []).some((p) => p.includes('hostname')), 'less did not record the file');
assert(/More|END/.test(prompt.textContent), 'pager prompt missing --More--/--END--');

Game.startMission('badge-day');
sshIn('precinct-13');
els['term-output'].innerHTML = '';
Terminal._execute('less welcome.txt');
assert(Terminal._pager, 'less welcome.txt dismissed the pager');
assert(/WELCOME TO PRECINCT/.test(els['term-output'].innerHTML || ''), 'less welcome.txt showed no file');
Terminal._quitPager();
assert(/WELCOME TO PRECINCT/.test(els['term-output'].innerHTML || ''), 'q on less wiped the page');

Game.startMission('log-needle');
sshIn('precinct-13');
els['term-output'].innerHTML = '';
Terminal._execute('grep sunglasses');
assert(/Usage: grep/.test(els['term-output'].innerHTML || ''), 'bare grep was silent instead of usage');
els['term-output'].innerHTML = '';
Terminal._execute('grep -r sunglasses');
assert(/sunglasses/i.test(els['term-output'].innerHTML || ''), 'grep -r showed no hits');

Game.startMission('dont-eat');
sshIn('precinct-13');
assert((els['mission-tracker'].innerHTML.match(/<li/g) || []).length === 2, 'dont-eat tracker should have two jobs');
assert(/0\/2/.test(els['mission-track-count'].textContent), 'dont-eat count should start 0/2');
Terminal._execute('cp case_042.txt.bak case_042.txt');
assert(/1\/2/.test(els['mission-track-count'].textContent), 'restore should tick the first job');
assert(/class="done"/.test(els['mission-tracker'].innerHTML), 'restored job did not mark done');

Game.startMission('wanted-poster');
assert(!/wanted_cat_printer/.test(els['task-list'].innerHTML), 'printer process leaked onto the taskbar during CH 02');
Game.startMission('booking-vm');
assert(!els['win-virt'].classList.contains('iconified'), 'booking-vm should raise the ticket hub');
assert(/netmoth/.test(els['task-list'].innerHTML), 'taskbar missing netmoth during guest case');
assert(/Open virt/.test(els['virt-body'].innerHTML), 'virt ticket missing virt link');
Game.intranetGo('guest');
assert(/Attach volume/.test(els['virt-body'].innerHTML), 'virt page did not paint');
assert(/PRECINCT VIRT/.test(els['virt-body'].innerHTML), 'virt page missing web UI banner');
assert(/virt\.precinct/.test(els['virt-url'].value || els['virt-url'].textContent), 'location bar not set');
Game.virtAttach();
assert(/Attach new volume/.test(els['virt-body'].innerHTML), 'empty size should not attach');
els['virt-size'].value = '200';
els['virt-unit'].value = 'M';
Game.virtAttach();
assert(/Volume attached/.test(els['virt-body'].innerHTML), 'Attach volume did not stick');
assert(/1\/3/.test(els['mission-track-count'].textContent), 'attach should tick the first virt job');

Game.startMission('booking-fstab');
assert(!els['win-virt'].classList.contains('iconified'), 'fstab case should raise the ticket hub');
Game.intranetGo('guest');
assert(/Volume attached/.test(els['virt-body'].innerHTML), '3.2 should start with the disk already attached');
assert(/Reboot/.test(els['virt-body'].innerHTML), 'virt page missing Reboot');
assert(/0\/3/.test(els['mission-track-count'].textContent), 'fstab tracker should start 0/3');
sshIn('precinct-13');
Terminal._execute('virsh console booking-vm');
Terminal._execute("echo '/dev/sdb1 /var/lib/booking ext4 defaults 0 2' >> /etc/fstab");
assert(/1\/3/.test(els['mission-track-count'].textContent), 'fstab line should tick the first job');
Game.virtReboot();
assert(/3\/3/.test(els['mission-track-count'].textContent), 'reboot with fstab should settle the case');

els['success-overlay'].classList.add('active');
Game.backToDesktop();
assert(!els['win-xterm'].classList.contains('iconified'), 'leaving a case should leave xterm open');
assert(els['win-brief'].classList.contains('iconified'), 'leaving a case did not iconify the slip');
assert(!els['success-overlay'].classList.contains('active'), 'solved-case slip stayed open');
assert(Game.state.currentMissionId === null, 'mission id not cleared');

Game._showWelcome();
assert(els['welcome-overlay'].classList.contains('active'), 'welcome slip did not open');
assert(els['welcome-view'].hidden !== true, 'welcome page hidden');
assert(/CASE SLIP/.test(els['welcome-title-bar'].textContent), 'welcome title is not a case slip');
Game.openWalkthrough();
assert(els['walkthrough-view'].hidden !== true, 'walkthrough page did not show');
Game.dismissWelcome();
assert(!els['welcome-overlay'].classList.contains('active'), 'dismiss did not close welcome slip');

{
  const day = Game.state.shiftDay;
  Game.askPunchOut();
  assert(!els['win-timeclock'].classList.contains('iconified'), 'timeclock stayed iconified');
  assert(/PUNCH OUT/.test(els['timeclock-body'].innerHTML || ''), 'timeclock missing punch-out confirm');
  assert(Game.state.shiftDay === day, 'confirm must not punch out');
  Game.stayOnShift();
  assert(!/PUNCH OUT\?/.test(els['timeclock-title'].textContent || ''), 'stay left confirm up');
  assert(Game.state.shiftDay === day, 'stay must not punch out');
}

Game.state.completed = ['the-desk'];
Game.state.shiftDay = 0;
Game.state.shiftMin = 16 * 60;
Game.state.currentMissionId = null;
Game.state.shiftClosed = ['the-desk'];
Game.state.shiftScore = 150;
assert(Game.punchOut(), '16:00 punch-out failed');
assert(Game.state.shiftDay === 1, 'punch-out did not advance the day');
assert(Game.state.shiftMin === 8 * 60, 'punch-out did not reset to 08:00');
assert(!els['win-timeclock'].classList.contains('iconified'), 'timeclock stayed iconified after punch-out');
assert(els['shift-report'].classList.contains('active'), 'shift report did not open');
assert(/SHIFT CLOSED/.test(els['shift-report-body'].innerHTML || ''), 'report missing SHIFT CLOSED');
assert(/How This Desk Works/.test(els['shift-report-body'].innerHTML || ''), 'report missing solved tickets');
assert(/Log off/.test(els['shift-report-body'].innerHTML || ''), 'report missing log off');
assert(/SHIFT CLOSED/.test(els['timeclock-body'].innerHTML || ''), 'summary missing SHIFT CLOSED');
assert(/How This Desk Works/.test(els['timeclock-body'].innerHTML || ''), 'summary missing solved tickets');
assert(/\+150/.test(els['timeclock-body'].innerHTML || ''), 'summary missing shift score');
assert(!(Game.state.shiftClosed || []).length, 'today\'s timesheet should reset after punch-out');
Game.intranetGo('tickets');
assert(/Badge Day/.test(els['virt-body'].innerHTML || ''), 'leftover beginner did not roll');
assert(/ROLL/.test(els['virt-body'].innerHTML || ''), 'rolled ticket missing ROLL');
assert(!/Endless Wanted/.test(els['virt-body'].innerHTML || ''), 'friday ticket should stay locked behind leftovers');
Game.state.completed = ['the-desk', 'badge-day', 'lost-closet', 'file-locker', 'long-statement', 'dont-eat'];
Game.state.shiftDay = 0;
Game.state.shiftMin = 16 * 60 + 30;
Game.state.currentMissionId = null;
Game.workTicket('wanted-poster');
assert(Game.state.currentMissionId !== 'wanted-poster', 'friday ticket should stay off thursday board');
assert(Game._maybePunchOut({ first: true }), '16:00 should punch out');
assert(Game.state.shiftDay === 1, 'auto punch-out did not advance the day');
Game.intranetGo('tickets');
assert(/Endless Wanted/.test(els['virt-body'].innerHTML || ''), 'friday work did not appear after punch-out');
assert(/8\/15/.test(els['desktop-clock'].textContent || ''), 'clock did not move to friday');
Game.workTicket('wanted-poster');
assert(Game.state.currentMissionId === 'wanted-poster', 'today\'s friday ticket should be workable');
Game.state.shiftDay = 0;
Game.workTicket('disk-full');
assert(Game.state.currentMissionId === 'wanted-poster', 'future ticket should stay off today\'s board');
Game.state.shiftDay = 1;
Game.state.shiftMin = 10 * 60;
Game.punchOut();
assert(Game.state.shiftDay === 2, 'manual punch-out did not advance');
assert(Game.state.shiftMin === 8 * 60, 'manual punch-out did not reset the clock');

Game.state.completed = [
  'the-desk', 'badge-day', 'lost-closet', 'file-locker', 'long-statement', 'dont-eat',
  'wanted-poster', 'locked-evidence', 'log-needle', 'ghost-shift'
];
Game.state.shiftDay = 1;
Game.state.shiftMin = 14 * 60;
Game.state.shiftClosed = [{ id: 'wanted-poster', pay: 150, clean: 50, hints: 0 }];
Game.state.shiftScore = 200;
Game.state.shiftHints = 0;
const scoreBefore = Game.state.score;
Game.punchOut();
assert(Game._lastPunch && Game._lastPunch.ontime === 50, 'clear shift before 16:00 should pay on-time');
assert(Game.state.score === scoreBefore + 50, 'on-time bonus did not add to total');
assert(/On time/.test(els['timeclock-body'].innerHTML || els['shift-report-body'].innerHTML || ''), 'timesheet missing on-time line');

Game.state.completed = Missions.campaign().map((m) => m.id);
Game.state.shiftDay = 3;
Game.state.shiftMin = 16 * 60;
Game.state.currentMissionId = null;
Game.punchOut();
assert(Game.state.shiftDay === 4, 'post-campaign punch-out should open Monday');
assert(/8\/18/.test(els['desktop-clock'].textContent || ''), 'clock did not move to Monday');
assert(Missions.todayWork(Game.state.completed, 4).length === 2, 'Monday should have two returning jobs');
Game.intranetGo('tickets');
assert(/Night Shift Ate|No Space Left/.test(els['virt-body'].innerHTML || ''), 'Monday queue missing returning jobs');
assert(!/Endless Wanted/.test(els['virt-body'].innerHTML || ''), 'campaign cases leaked onto Monday today tab');

Game.closeClient('win-xclock');
assert(els['win-xclock'].classList.contains('withdrawn'), 'close did not withdraw xclock');
assert(!/xclock/.test(els['task-list'].innerHTML || ''), 'closed xclock stayed on the taskbar');
Game.iconifyClient('win-xmessage', true);
assert(/mail/.test(els['task-list'].innerHTML || ''), 'minimized mail left the taskbar');
Game.openClient('win-xclock');
assert(!els['win-xclock'].classList.contains('withdrawn'), 'reopen did not restore xclock');
assert(/xclock/.test(els['task-list'].innerHTML || ''), 'reopened xclock missing from taskbar');
Game.maximizeClient('win-xclock');
assert(els['win-xclock'].classList.contains('x-max'), 'maximize did not stick');
Game.restoreClient('win-xclock');
assert(!els['win-xclock'].classList.contains('x-max'), 'restore did not clear maximize');
Game.openCaseFile();
assert(!els['win-case'].classList.contains('withdrawn'), 'casefile did not open as a window');
assert(/casefile/.test(els['task-list'].innerHTML || ''), 'open casefile missing from taskbar');
Game.closeClient('win-case');
assert(!/casefile/.test(els['task-list'].innerHTML || ''), 'closed casefile stayed on the taskbar');
Game.openClient('win-xconsole');
assert(!els['win-xconsole'].classList.contains('withdrawn'), 'xconsole did not open');
assert(/xconsole/.test(els['task-list'].innerHTML || ''), 'open xconsole missing from taskbar');
Game.closeClient('win-xconsole');
assert(els['win-xconsole'].classList.contains('withdrawn'), 'xconsole close did not withdraw');
assert(!/xconsole/.test(els['task-list'].innerHTML || ''), 'closed xconsole stayed on the taskbar');
Game.openManual();
assert(!els['win-manual'].classList.contains('withdrawn'), 'xman did not open');
assert(/xman-item/.test(els['manual-body'].innerHTML || ''), 'xman missing topic list');
assert(/Right-click the teal root/.test(els['manual-body'].innerHTML || ''), 'xman missing twm tutorial');
Game.openAppHelp('xterm');
assert(/ssh precinct-13/.test(els['manual-body'].innerHTML || ''), 'xterm tutorial missing');
Game.openAppHelp('timeclock');
assert(/16:00/.test(els['manual-body'].innerHTML || ''), 'timeclock tutorial missing');
Game.closeClient('win-manual');
assert(!/xman/.test(els['task-list'].innerHTML || ''), 'closed xman stayed on the taskbar');
Game.logOff();
assert(els['screen-title'].classList.contains('active'), 'log off did not return to xdm');
assert(!els['shift-report'].classList.contains('active'), 'shift report stayed up after log off');
assert(/08:00/.test(els['xdm-sub'].textContent || ''), 'xdm missing next shift');
Game._arriveDesktop();
assert(els['screen-desktop'].classList.contains('active'), 'log in did not restore the desktop');
assert(!els['win-timeclock'].classList.contains('iconified'), 'timeclock should open on the new day');

console.log('ok — xterm is a desktop client, taskbar raises it, less pages');
