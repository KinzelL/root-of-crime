/* ---------- 06 Cron of the Dead ---------- */
Missions.register({
  id: 'cron-dead',
  order: 10,
  act: 2,
  lesson: 5,
  chapter: '2.5',
  title: 'Cron of the Dead',
  short: 'The cat printer keeps coming back.',
  description:
    'You killed the process yesterday. It is back. Something is resurrecting wanted_cat_printer on a schedule. Find the cron job and delete it.',
  objective: 'Find what keeps resurrecting the printer, then remove it.',
  difficulty: 'Medium',
  unlock: false,
  requires: ['ghost-shift'],
  skills: ['crontab', 'ls', 'cat', 'rm'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const cronD = VFS.resolve(vfs, '/', '/etc/cron.d').node;
    cronD.children.beantek = VFS.file(
      '# BeanTek "maintenance" — do not remove\n' +
      '* * * * * root /usr/local/bin/wanted_cat_printer --loop --quiet\n' +
      '*/5 * * * * coffee /opt/coffee/coffee_machine_daemon --network --phone-home\n',
      { mtime: 'Aug 14 03:05' }
    );
    const processes = baseProcs();
    processes.splice(4, 0, proc(
      1338, 'root', '88.0', '2.8', '?', '21:01', '00:00:40',
      '/usr/local/bin/wanted_cat_printer --loop --quiet',
      { highlight: true }
    ));
    return {
      vfs,
      cwd: '/etc',
      ctx: { processes, hintLevel: 0, removed: [] },
      intro: `The posters started again. Killing the process is a painkiller.

<span class="highlight">Something respawns it.</span> Check scheduled jobs: <span class="info">crontab -l</span>, <span class="info">/etc/crontab</span>, <span class="info">/etc/cron.d/</span>.
`
    };
  },

  isWon(_ctx, vfs) {
    return pathGone(vfs, '/etc/cron.d/beantek');
  },

  getHelp() {
    return `Scheduled jobs:
  crontab -l
  ls /etc/cron.d
  cat /etc/cron.d/NAME
  rm /etc/cron.d/NAME

System cron lives in /etc. Per-user cron is crontab.`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] List system cron snippets.', cls: 'info' },
        { text: 'Try:  ls /etc/cron.d', cls: 'muted' },
        { text: 'Or:   crontab -l', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] One file is named like a coffee vendor.', cls: 'info' },
        { text: 'Try:  cat /etc/cron.d/beantek', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Delete the rogue job file.', cls: 'info' },
        { text: 'Try:  rm /etc/cron.d/beantek', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>crontab -l</code> — show scheduled jobs<br>' +
    '• <code>/etc/cron.d/</code> — drop-in system jobs, one file each<br>' +
    '• <code>* * * * *</code> — every minute<br>' +
    '• Persistence is the real malware. Killing a process is not cleanup.',

  successFlavor:
    'The job is gone. If the printer starts again, it is a ghost, and that is Miller\'s problem.',

  chiefNote: 'Cron file signed BeanTek. I did not sign a contract with a coffee machine.'
,

  caseTitle: "Persistence — /etc/cron.d/beantek",
  caseBody: "Vendor-shaped cron respawned the printer malware every minute and phoned home from the coffee daemon. File removed. Vendor did not invoice us for this."
});
