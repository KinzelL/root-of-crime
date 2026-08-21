/* ---------- 0.2 Printer flood (monitoring type) ---------- */
Missions.register({
  id: 'mon-printer',
  order: 0.5,
  act: 0,
  lesson: 2,
  chapter: '0.2',
  title: 'lp0 on fire',
  short: 'mon.precinct is red. Make it stay green.',
  description:
    'precinct-13 is CRITICAL on mon.precinct. The printer is screaming. Clear will not hold until the job cannot come back, the noise is dead, and you mash Clear on the board.',
  objective: 'Prevent the reprint, stop the job, Clear precinct-13 on mon.precinct.',
  difficulty: 'Easy',
  unlock: false,
  requires: ['the-desk'],
  skills: ['ssh', 'crontab', 'rm', 'ps', 'kill'],
  type: 'monitoring',
  asset: 'precinct-13',

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const cronD = VFS.resolve(vfs, '/', '/etc/cron.d').node;
    cronD.children.wanted = VFS.file(
      '# precinct print shop — DO NOT DISABLE (Miller will yell)\n' +
      '* * * * * root /usr/local/bin/wanted_cat_printer --loop --image=blurry_cat.jpg\n',
      { mtime: 'Aug 14 08:02' }
    );
    const bin = VFS.resolve(vfs, '/', '/usr/local/bin').node;
    bin.children.wanted_cat_printer = VFS.file('ELF 64-bit LSB executable', { mode: 0o755 });
    const processes = baseProcs();
    processes.splice(4, 0, proc(
      1337, 'root', '97.4', '3.1', 'pts/2', '08:03', '00:12:44',
      '/usr/local/bin/wanted_cat_printer --loop --image=blurry_cat.jpg'
    ));
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: {
        processes,
        hintLevel: 0,
        monCleared: false,
        monFlap: false,
        monQuietTicks: 0
      },
      intro: `mon.precinct is red. That is the job.

ssh precinct-13. Stop it coming back. Stop the noise. Then Clear the host on the board.
`
    };
  },

  monitor: {
    host: 'precinct-13',
    check: 'PROC wanted_cat_printer',
    prevent(ctx, vfs) {
      return pathGone(vfs, '/etc/cron.d/wanted');
    },
    fix(ctx) {
      return isDead(ctx, (p) => p.pid === 1337 || (p.cmd || '').includes('wanted_cat_printer'));
    },
    respawn(ctx) {
      const list = ctx.processes || [];
      let p = list.find((x) => x.pid === 1337 || (x.cmd || '').includes('wanted_cat_printer'));
      if (p) p.dead = false;
      else {
        list.push(proc(
          1337, 'root', '97.4', '3.1', 'pts/2', '08:03', '00:00:02',
          '/usr/local/bin/wanted_cat_printer --loop --image=blurry_cat.jpg'
        ));
      }
      ctx.processes = list;
      ctx.killed = (ctx.killed || []).filter((k) => k.pid !== 1337 && !(k.cmd || '').includes('wanted_cat_printer'));
    }
  },

  isWon(ctx, vfs) {
    const mon = this.monitor;
    return !!(mon.prevent(ctx, vfs) && mon.fix(ctx) && ctx && ctx.monCleared);
  },

  objectives(ctx, vfs) {
    const mon = this.monitor;
    return [
      { label: 'Stop it coming back', done: !!(ctx && vfs && mon.prevent(ctx, vfs)) },
      { label: 'Stop the noise', done: !!(ctx && mon.fix(ctx)) },
      { label: 'Clear precinct-13 on mon.precinct', done: !!(ctx && ctx.monCleared) }
    ];
  },

  getHelp() {
    return `The board is the job. The shell is the hands.

  NetMoth → mon.precinct     the red host
  ssh precinct-13            the asset
  crontab -l / /etc/cron.d   why it comes back
  rm the job                 prevent
  ps / kill / pkill          the noise
  Clear on the board         only sticks if both are done`;
  },

  getHint(ctx, vfs) {
    const mon = this.monitor;
    if (!vfs || !mon.prevent(ctx, vfs)) {
      return hintList(ctx, [
        [
          { text: '[HINT] It reprints. Something is scheduling the job.', cls: 'info' },
          { text: 'Look under /etc/cron.d on precinct-13.', cls: 'muted' }
        ]
      ]);
    }
    if (!mon.fix(ctx)) {
      return [
        { text: '[HINT] The schedule is gone. The job is still screaming.', cls: 'info' },
        { text: 'ps aux, then kill it.', cls: 'muted' }
      ];
    }
    if (!ctx.monCleared) {
      return [
        { text: '[HINT] The host is UNACK. Go back to the desk.', cls: 'info' },
        { text: 'NetMoth → mon.precinct → Clear precinct-13.', cls: 'muted' }
      ];
    }
    return [{ text: '[HINT] It held. Close the ticket.', cls: 'info' }];
  },

  learned:
    '• Clear is a desk action. It lies if the cause is still there<br>' +
    '• Kill without deleting cron is a painkiller<br>' +
    '• mon.precinct is the board. xterm is how you cheat it',

  successFlavor:
    'precinct-13 stays green. The printer stops. Miller can hear himself think. Clear held. That is the whole job.',

  chiefNote: 'Monitoring is quiet. Do not tell me how.',

  caseTitle: 'MON — precinct-13 PROC',
  caseBody: 'wanted_cat_printer looped MOST WANTED cats. Cron in /etc/cron.d/wanted was the reprint. Job killed, schedule gone, host cleared. Paper budget may recover.',
  notes: [
    'mon.precinct is the board. Clear is not a fix.',
    'If it flaps, you skipped the schedule.',
    'Buy more paper anyway'
  ],
  radio: [
    '[08:11] mon: precinct-13 PROC CRITICAL',
    '[08:12] Miller: I can hear the printer from the lot.',
    '[08:40] You: It held.',
    '[08:41] Chief: Good enough.'
  ]
});
