#!/usr/bin/env node
/* Headless playthrough: run the intended solution commands for every chapter. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGame } = require('./lib/load-js');

const root = path.join(__dirname, '..');

class FakeEl {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.style = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.selectionStart = 0;
  }
  addEventListener() {}
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  focus() {}
}

const termOut = new FakeEl();
const termIn = new FakeEl();
const prompt = new FakeEl();
prompt.textContent = 'root@precinct-13:~#';

const body = new FakeEl();
const document = {
  body,
  getElementById(id) {
    if (id === 'term-output') return termOut;
    if (id === 'termInput') return termIn;
    return new FakeEl();
  },
  querySelector(sel) {
    if (sel === '.term-prompt') return prompt;
    return new FakeEl();
  },
  querySelectorAll() { return []; },
  addEventListener() {}
};

const wins = [];
const ctx = {
  console,
  document,
  window: {},
  localStorage: { getItem() { return null; }, setItem() {} },
  Date,
  setTimeout: (fn) => { fn(); return 0; },
  setInterval: () => 0,
  clearTimeout() {},
  AudioContext: function () { throw new Error('no audio'); }
};
ctx.window = ctx;
ctx.globalThis = ctx;

vm.createContext(ctx);
loadGame(ctx, root);

ctx.Game.onMissionSuccess = function () {
  wins.push(ctx.Terminal.missionId);
};
ctx.Game.onHintUsed = function () {};
ctx.Game.refreshMissionHud = function () {};

const { Terminal, Missions } = ctx;

function play(id, commands) {
  const mission = Missions.get(id);
  const setup = mission.setup();
  const asset = Missions.assetOf(mission);
  Terminal.outputEl = termOut;
  Terminal.inputEl = termIn;
  Terminal.promptEl = prompt;
  ctx.Game.ticketSession = null;
  Terminal.reset({
    missionId: id,
    intro: setup.intro,
    ctx: setup.ctx,
    vfs: setup.vfs,
    cwd: setup.cwd,
    host: asset === 'closet' ? 'closet' : 'precinct-13',
    user: asset === 'closet' ? 'itguy' : 'root',
    home: setup.home || '/home/itguy'
  });
  commands.forEach((line) => Terminal._execute(line));
  if (typeof ctx.Game.closeTicket === 'function') ctx.Game.closeTicket();
  if (!wins.includes(id)) {
    throw new Error('playthrough failed: ' + id + ' not won after: ' + commands.join(' ; '));
  }
}

play('the-desk', ['help', 'man ls']);
play('the-desk', ['help', 'hint']);
play('badge-day', ['pwd', 'ls', 'cat welcome.txt']);

{
  Terminal.outputEl = termOut;
  Terminal.inputEl = termIn;
  Terminal.promptEl = prompt;
  ctx.Game.ensureDeskShell();
  if (Terminal.host !== 'closet') throw new Error('desk should start on closet');
  Terminal._execute('ssh precinct-13');
  if (Terminal.host !== 'precinct-13') throw new Error('ssh precinct-13 refused with no ticket');
  Terminal._execute('exit');
  const setup = Missions.get('badge-day').setup();
  ctx.Game.ticketSession = {
    id: 'badge-day', host: 'precinct-13', vfs: setup.vfs, ctx: setup.ctx, cwd: setup.cwd || '/home/itguy'
  };
  Terminal.missionId = 'badge-day';
  Terminal._execute('ssh precinct-13');
  if (Terminal.host !== 'precinct-13') throw new Error('ssh did not land on precinct-13');
  Terminal._execute('cat welcome.txt');
  if (typeof ctx.Game.closeTicket === 'function') ctx.Game.closeTicket();
  if (!wins.includes('badge-day')) throw new Error('ssh playthrough failed: badge-day');
  Terminal._execute('exit');
  if (Terminal.host !== 'closet') throw new Error('exit should return to closet');
}
play('badge-day', ['less welcome.txt']);
play('lost-closet', ['pwd', 'cd /etc', 'cat orders.txt']);
play('lost-closet', ['cat /etc/orders.txt']);
play('file-locker', [
  'mkdir /evidence/sorted',
  'mv /tmp/* /evidence/sorted/',
  'cp /evidence/sorted/usb_note.txt ~'
]);
play('long-statement', ['less miller_statement.log']);
play('long-statement', ['head miller_statement.log', 'tail miller_statement.log']);
play('dont-eat', [
  'cp case_042.txt.bak case_042.txt',
  'echo night shift ate the original >> case_042.txt'
]);
play('dont-eat', [
  'cat case_042.txt.bak > case_042.txt',
  'echo night shift ate the original >> case_042.txt'
]);
play('wanted-poster', ['ps aux', 'kill 1337']);
play('locked-evidence', ['ls -l', 'chmod 644 *']);
{
  const m = Missions.get('log-needle');
  const setup = m.setup();
  Terminal.reset({ missionId: 'log-needle', intro: '', ctx: setup.ctx, vfs: setup.vfs, cwd: setup.cwd });
  termOut.innerHTML = '';
  Terminal._execute('grep -r sunglasses /var/log/incident');
  if (!termOut.innerHTML.includes('sunglasses')) throw new Error('grep -r did not find sunglasses');
  termOut.innerHTML = '';
  Terminal._execute('grep sunglasses');
  if (!/Usage: grep/.test(termOut.innerHTML)) throw new Error('bare grep was silent');
}
play('log-needle', ['grep -r sunglasses /var/log/incident', 'cat /var/log/incident/incident_17.log']);
play('log-needle', ['cd /var/log/incident', 'grep -r sunglasses', 'cat incident_17.log']);
play('log-needle', ['grep -r sunglasses', 'cat incident/incident_17.log']);
play('ghost-shift', ['grep mittens /etc/passwd', 'last']);
play('cron-dead', ['ls /etc/cron.d', 'cat /etc/cron.d/beantek', 'rm /etc/cron.d/beantek']);
play('disk-full', ['df', 'du -sh /var/spool/printer', 'rm /var/spool/printer/wanted_*']);
play('coffee-c2', ['netstat', 'pkill coffee']);
play('hidden-claws', ['ls -la', 'cat /opt/coffee/.scratch/exfil.log']);
play('booking-vm', [
  'virsh list',
  'virsh attach-disk booking-vm 200M',
  'virsh console booking-vm',
  'df',
  'lsblk',
  'mkdir /mnt/new',
  'mount /dev/sdb1 /mnt/new',
  'mv /var/lib/booking/* /mnt/new/',
  'umount /mnt/new',
  'mount /dev/sdb1 /var/lib/booking'
]);
play('booking-fstab', [
  'virsh console booking-vm',
  'cat /etc/fstab',
  "echo '/dev/sdb1 /var/lib/booking ext4 defaults 0 2' >> /etc/fstab",
  'reboot'
]);
play('booking-fstab', [
  'virsh console booking-vm',
  "echo /dev/sdb1 /var/lib/booking ext4 defaults 0 2 >> /etc/fstab",
  'exit',
  'virsh reboot booking-vm'
]);
play('root-of-crime', [
  'rm -r /opt/coffee/.scratch',
  'rm /etc/cron.d/beantek',
  'pkill coffee',
  'passwd coffee'
]);

// alternate solutions
play('wanted-poster', ['ps aux | grep wanted', 'kill 1337']);
play('wanted-poster', ['pkill wanted']);
play('ghost-shift', ['cat /etc/passwd', 'grep mittens /var/log/auth.log']);
play('disk-full', ['rm -r /var/spool/printer/wanted_001.ps', 'rm /var/spool/printer/wanted_*']);

{
  Missions.spawnJob('job-redirect', {
    id: 'job-redirect-play', template: 'job-redirect', seed: 0, shiftDay: 4, seq: 9
  });
  play('job-redirect-play', [
    'cp case_088.txt.bak case_088.txt',
    'echo night shift ate the original >> case_088.txt'
  ]);
  Missions.spawnJob('job-needle', {
    id: 'job-needle-play', template: 'job-needle', seed: 0, shiftDay: 4, seq: 10
  });
  play('job-needle-play', [
    'grep -r raincoat /var/log/incident',
    'cat /var/log/incident/incident_14.log'
  ]);
  Missions.spawnJob('job-spool', {
    id: 'job-spool-play', template: 'job-spool', seed: 0, shiftDay: 4, seq: 11
  });
  play('job-spool-play', [
    'df',
    'du -sh /var/spool/printer',
    'rm /var/spool/printer/queue_*'
  ]);
}

// hidden files stay hidden without -a
{
  const m = Missions.get('hidden-claws');
  const setup = m.setup();
  Terminal.reset({ missionId: 'hidden-claws', intro: '', ctx: setup.ctx, vfs: setup.vfs, cwd: setup.cwd });
  termOut.innerHTML = '';
  Terminal._execute('ls');
  if (termOut.innerHTML.includes('.scratch')) throw new Error('ls leaked hidden dir');
  Terminal._execute('ls -la');
  if (!termOut.innerHTML.includes('.scratch')) throw new Error('ls -la missed hidden dir');
}

// Tab does not leak hidden names unless the token starts with a dot
{
  const m = Missions.get('hidden-claws');
  const setup = m.setup();
  Terminal.reset({ missionId: 'hidden-claws', intro: '', ctx: setup.ctx, vfs: setup.vfs, cwd: setup.cwd });
  const visible = Terminal._pathCompletions('');
  if (visible.some((n) => n.includes('.scratch') || n.includes('.keep'))) {
    throw new Error('tab leaked hidden name: ' + visible.join(' '));
  }
  const dotted = Terminal._pathCompletions('.');
  if (!dotted.some((n) => n.includes('.scratch'))) {
    throw new Error('tab missed .scratch when prefix is dot: ' + dotted.join(' '));
  }
}

// du reports every glob match, not only the first
{
  const m = Missions.get('disk-full');
  const setup = m.setup();
  Terminal.reset({ missionId: 'disk-full', intro: '', ctx: setup.ctx, vfs: setup.vfs, cwd: setup.cwd });
  termOut.innerHTML = '';
  Terminal._execute('du -sh /var/spool/printer/*');
  const hits = (termOut.innerHTML.match(/wanted_/g) || []).length;
  if (hits < 40) throw new Error('du only reported ' + hits + ' poster(s), expected 48');
  termOut.innerHTML = '';
  Terminal._execute('df');
  if (!/99%/.test(termOut.innerHTML)) throw new Error('df did not show 99% full');
  termOut.innerHTML = '';
  Terminal._execute('du -sh /var/*');
  if (!/spool/.test(termOut.innerHTML)) throw new Error('du /var/* missed spool');
}

console.log('ok — playthrough cleared', [...new Set(wins)].length, 'unique chapters');
