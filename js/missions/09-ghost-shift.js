/* ---------- 05 Ghost Shift ---------- */
Missions.register({
  id: 'ghost-shift',
  order: 9,
  act: 2,
  lesson: 4,
  chapter: '2.4',
  title: 'The 03:00 Login',
  short: 'A user appeared who is not on the roster.',
  description:
    'Auth logs show a login at 03:04. Personnel does not have that name. Check who exists on this box and who logged in last night.',
  objective: 'Find the user who is not on the roster. Confirm they logged in last night.',
  difficulty: 'Medium',
  unlock: false,
  requires: ['log-needle'],
  skills: ['cat', 'grep', 'last'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const passwd = VFS.resolve(vfs, '/', '/etc/passwd').node;
    passwd.content += 'mittens:x:1337:1337:???:/tmp/.mittens:/bin/bash\n';
    const auth = VFS.resolve(vfs, '/', '/var/log/auth.log').node;
    auth.content +=
      'Aug 14 03:04:01 precinct-13 useradd[8801]: new user: name=mittens, UID=1337\n' +
      'Aug 14 03:04:08 precinct-13 sshd[8804]: Accepted password for mittens from 203.0.113.66 port 44112\n' +
      'Aug 14 03:04:09 precinct-13 login[8804]: pam_unix: session opened for user mittens\n' +
      'Aug 14 03:11:44 precinct-13 sshd[8804]: session closed for user mittens\n';
    return {
      vfs,
      cwd: '/etc',
      ctx: {
        processes: baseProcs(),
        hintLevel: 0,
        readFiles: [],
        lastLog:
          'mittens  pts/4        Sat Aug 14 03:04 - 03:11  (00:07)\n' +
          'reboot   system boot  Fri Aug  1 06:00\n'
      },
      intro: `Personnel roster does not include a <span class="highlight">mittens</span>.
The box might.

Look at <span class="info">/etc/passwd</span>, <span class="info">last</span>, and <span class="info">/var/log/auth.log</span>.
`
    };
  },

  isWon(ctx) {
    const sawPasswd = hasRead(ctx, '/etc/passwd');
    const sawAuth = hasRead(ctx, 'auth.log') || ctx.usedLast;
    return sawPasswd && sawAuth;
  },

  objectives(ctx) {
    return [
      { label: 'See who exists on this box', done: hasRead(ctx, '/etc/passwd') },
      { label: 'Confirm they logged in last night', done: hasRead(ctx, 'auth.log') || !!ctx.usedLast }
    ];
  },

  afterCommand(line, ctx) {
    const l = line.toLowerCase();
    ctx.readFiles = ctx.readFiles || [];
    if ((l.includes('cat') || l.includes('grep') || l.includes('less') || l.includes('head') || l.includes('tail')) && l.includes('passwd')) {
      if (!ctx.readFiles.includes('/etc/passwd')) ctx.readFiles.push('/etc/passwd');
    }
    if ((l.includes('cat') || l.includes('grep') || l.includes('less') || l.includes('head') || l.includes('tail')) && l.includes('auth')) {
      if (!ctx.readFiles.includes('/var/log/auth.log')) ctx.readFiles.push('/var/log/auth.log');
    }
  },

  getHelp() {
    return `Identity tools:
  cat /etc/passwd
  grep mittens /etc/passwd
  grep mittens /var/log/auth.log
  last
  who
  id / whoami`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Local users live in a single text file.', cls: 'info' },
        { text: 'Try:  cat /etc/passwd', cls: 'muted' },
        { text: 'Or:   grep mittens /etc/passwd', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Logins are recorded.', cls: 'info' },
        { text: 'Try:  last', cls: 'muted' },
        { text: 'Or:   grep mittens /var/log/auth.log', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Do both. User file AND a login record.', cls: 'info' },
        { text: 'cat /etc/passwd     then     last', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>/etc/passwd</code> — local user database (name:x:uid:gid:...)<br>' +
    '• <code>last</code> — recent logins from the wtmp/auth trail<br>' +
    '• <code>/var/log/auth.log</code> — ssh, sudo, useradd<br>' +
    '• A user that is not in HR is still a user if the box says so',

  successFlavor:
    'UID 1337. Home in /tmp. Password accepted from 203.0.113.66. That is not a cat. That is an account.',

  chiefNote: 'We do not employ mittens. Someone else does.'
,

  caseTitle: "Account — mittens (UID 1337)",
  caseBody: "useradd at 03:04. Home /tmp/.mittens. SSH from 203.0.113.66. Not in personnel. The cat has an account. The cat does not have a badge.",
  notes: [
    "We do not employ mittens",
    "BeanTek sales guy is not returning calls",
    "Unplug the coffee machine? Miller would riot",
    "IT is actually useful. Do not tell them"
  ],
  radio: [
    "[21:40] Cron: wanted_cat_printer: restarting",
    "[21:41] You: Not today.",
    "[21:50] Miller: Who is mittens?",
    "[21:51] Chief: Not on my roster."
  ]
});
