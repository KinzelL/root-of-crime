/* ============================================================
   ROOT OF CRIME – Campaign registry

   To add a chapter:
     1. Copy js/missions/01-badge-day.js
     2. Missions.register({ id, order, chapter, ... })
     3. Append the filename to Missions.SOURCES below
     4. Optional on the mission: caseTitle, caseBody, notes, radio, objectives(ctx, vfs)
   ============================================================ */

var Missions = {
  data: {},
  templates: {},

  ACTS: [
    { id: 0, title: 'The Desk', blurb: 'The closet. The board. The keys. Game mechanics, not Linux yet.' },
    { id: 1, title: 'Beginner', blurb: 'Where you are, what a file is, how not to eat the original.' },
    { id: 2, title: 'Intermediate', blurb: 'Processes, permissions, logs, cron, disk, sockets.' },
    { id: 3, title: 'Expert', blurb: 'Guests and disks, then persistence, credentials, the incident.' }
  ],

  SOURCES: [
    '00-the-desk.js',
    'm-printer.js',
    '01-badge-day.js',
    '02-lost-closet.js',
    '03-file-locker.js',
    '04-long-statement.js',
    '05-dont-eat.js',
    '06-wanted-poster.js',
    '07-locked-evidence.js',
    '08-log-needle.js',
    '09-ghost-shift.js',
    '10-cron-dead.js',
    '11-disk-full.js',
    '12-coffee-c2.js',
    '13-hidden-claws.js',
    '14-booking-vm.js',
    '15-booking-fstab.js',
    '16-root-of-crime.js'
  ],

  get(id) {
    return this.data[id] || null;
  },

  list() {
    return Object.values(this.data).sort((a, b) => a.order - b.order);
  },

  campaign() {
    return this.list().filter((m) => !m.repeatable);
  },

  campaignDone(completed) {
    return (completed || []).includes('root-of-crime');
  },

  registerJob(template) {
    if (!template || !template.template) throw new Error('job template needs a template id');
    this.templates[template.template] = template;
    return template;
  },

  jobPick(day) {
    const pool = this.JOB_POOL || Object.keys(this.templates);
    const a = Math.abs(day * 2) % pool.length;
    return [pool[a], pool[(a + 1) % pool.length]];
  },

  spawnJob(templateId, rec) {
    const t = this.templates[templateId];
    if (!t || !rec || !rec.id) return null;
    const flavor = typeof t.flavor === 'function' ? (t.flavor(rec.seed) || {}) : {};
    const inst = Object.assign({}, t, flavor, rec, {
      id: rec.id,
      template: templateId,
      repeatable: true,
      unlock: true,
      requires: [],
      shiftDay: rec.shiftDay,
      seed: rec.seed,
      order: 200 + (rec.seq || 0),
      chapter: 'R'
    });
    return this.register(inst);
  },

  forgetJobs() {
    Object.keys(this.data).forEach((id) => {
      if (this.data[id] && this.data[id].repeatable) delete this.data[id];
    });
  },

  SHIFT_START: 8 * 60,
  SHIFT_END: 16 * 60,
  HINT_COST: 15,
  CLEAN_BONUS: 50,
  ON_TIME_BONUS: 50,

  ticketPay(mission) {
    if (!mission) return 50;
    if ((mission.act || 0) >= 3) return 200;
    if ((mission.act || 0) === 2) return 150;
    if ((mission.act || 0) === 1) return 100;
    return 50;
  },

  isUnlocked(mission, completed) {
    if (mission.unlock) return true;
    return (mission.requires || []).every((req) => completed.includes(req));
  },

  shiftDayOf(mission) {
    if (!mission) return 0;
    if (mission.shiftDay != null) return mission.shiftDay;
    if (mission.act <= 1) return 0;
    if (mission.act === 2 && (mission.lesson || 0) <= 4) return 1;
    if (mission.act === 2) return 2;
    return 3;
  },

  ticketMinutes(mission) {
    if (!mission) return 60;
    if ((mission.act || 0) >= 2) return 120;
    if ((mission.act || 0) === 1) return 90;
    return 60;
  },

  assetOf(mission) {
    if (!mission) return 'precinct-13';
    if (mission.asset) return mission.asset;
    if (mission.virt) return 'booking-vm';
    if (mission.id === 'the-desk') return 'closet';
    return 'precinct-13';
  },

  todayWork(completed, day) {
    const d = day == null ? 0 : day;
    const done = completed || [];
    return this.list().filter((m) => (
      !done.includes(m.id) &&
      this.shiftDayOf(m) <= d &&
      this.isUnlocked(m, done)
    ));
  },

  register(mission) {
    if (!mission || !mission.id) throw new Error('mission needs an id');
    this.data[mission.id] = mission;
    return mission;
  },

  tracker(mission, ctx, vfs) {
    if (!mission) return [];
    if (typeof mission.objectives === 'function' && ctx && vfs) {
      return mission.objectives(ctx, vfs) || [];
    }
    const done = !!(ctx && vfs && typeof mission.isWon === 'function' && mission.isWon(ctx, vfs));
    return [{ label: mission.objective || 'Complete the job', done }];
  },

  code(mission) {
    if (!mission) return '';
    if (mission.repeatable) return mission.jobCode || 'R';
    if (mission.act != null && mission.lesson != null) return mission.act + '.' + mission.lesson;
    return String(mission.chapter || '');
  },

  byAct(actId) {
    return this.list().filter((m) => m.act === actId);
  },

  INTRO_NOTES: [
    'Fix the damn printer first',
    'Why does the coffee machine have network access?',
    'Do NOT touch /dev/null',
    'IT guy: stop making the terminals look scary',
    'Buy more paper'
  ],

  INTRO_RADIO: [
    '[19:02] Dispatch: Printer is still going.',
    '[19:05] Miller: There are cat posters everywhere.',
    '[19:08] Chief: WHERE IS IT?',
    '[19:11] You: Working on it.',
    '[19:14] Coffee Machine: Password changed to mocha123'
  ],

  latestStory(completed, field) {
    const done = this.campaign().filter((m) => completed.includes(m.id) && m[field] && m[field].length);
    if (!done.length) return field === 'notes' ? this.INTRO_NOTES : this.INTRO_RADIO;
    return done[done.length - 1][field];
  },

  cleared(completed, id) {
    return completed.includes(id);
  }
};

function proc(pid, user, cpu, mem, tty, start, time, cmd, extra = {}) {
  return { pid, user, cpu, mem, tty, start, time, cmd, dead: false, ...extra };
}

function baseProcs() {
  return [
    proc(1, 'root', '0.0', '0.1', '?', 'Jun19', '00:00:12', '/sbin/init', { protected: true }),
    proc(42, 'root', '0.0', '0.2', '?', 'Jun19', '00:01:03', '/usr/sbin/sshd -D'),
    proc(631, 'root', '0.0', '0.3', '?', 'Jun19', '00:00:22', '/usr/sbin/cupsd -f'),
    proc(891, 'root', '0.1', '0.4', '?', 'Aug14', '00:00:08', '/usr/lib/systemd/systemd-journald'),
    proc(2048, 'coffee', '0.8', '1.2', '?', 'Aug10', '00:45:12', '/opt/coffee/coffee_machine_daemon --network'),
    proc(3141, 'root', '0.0', '0.1', '?', 'Jun19', '00:00:02', '/usr/sbin/cron -f'),
    proc(4096, 'chief', '0.3', '2.4', 'pts/0', '18:55', '00:03:21', 'thunderbird'),
    proc(5120, 'root', '0.0', '0.3', 'pts/1', '19:02', '00:00:01', '-bash')
  ];
}

function hintList(ctx, steps) {
  ctx.hintLevel = (ctx.hintLevel || 0) + 1;
  const i = Math.min(ctx.hintLevel - 1, steps.length - 1);
  return steps[i];
}

function hasRead(ctx, fragment) {
  return (ctx.readFiles || []).some((p) => p.includes(fragment));
}

function isDead(ctx, test) {
  return (ctx.killed || []).some(test) || (ctx.processes || []).some((p) => p.dead && test(p));
}

function pathGone(vfs, path) {
  return !VFS.resolve(vfs, '/', path);
}

if (typeof document !== 'undefined' && document.currentScript) {
  const dir = document.currentScript.src.replace(/[^/]+$/, 'missions/');
  Missions.SOURCES.forEach((file) => {
    document.write('<script src="' + dir + file + '"><\/script>');
  });
}
