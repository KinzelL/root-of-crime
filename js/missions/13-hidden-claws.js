/* ---------- 09 Hidden Claws ---------- */
Missions.register({
  id: 'hidden-claws',
  order: 13,
  act: 2,
  lesson: 8,
  chapter: '2.8',
  title: 'Hidden in Plain Sight',
  short: 'Find the stolen files in a hidden directory.',
  description:
    'The daemon is dead. The data it took is probably still on disk. Hidden directories start with a dot. ls without -a will lie to you.',
  objective: 'Find the hidden stash and read what it took.',
  difficulty: 'Medium',
  unlock: false,
  requires: ['coffee-c2'],
  skills: ['ls', 'find', 'cat'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const coffee = VFS.resolve(vfs, '/', '/opt/coffee').node;
    coffee.children['.scratch'] = VFS.dir({
      'exfil.log': VFS.file(
        'BEANTEK SCRATCH PAD — phone home buffer\n' +
        '======================================\n' +
        '03:05  packed /evidence/case_042.txt\n' +
        '03:06  packed /evidence/witness_statement.log\n' +
        '03:07  packed /home/chief/todo.txt\n' +
        '03:08  packed /etc/shadow  (failed: perm)\n' +
        '03:09  C2 203.0.113.66:4444  ACK\n' +
        '03:10  default creds still live: coffee / mocha123\n' +
        '03:11  note: operator used USB dropped by animal\n' +
        '       "physical access is a feature"\n',
        { mode: 0o600, mtime: 'Aug 14 03:11' }
      ),
      'case_042.txt.copy': VFS.file('Case #042 — stolen copy. See original locker.\n', { mode: 0o600 })
    }, { mode: 0o700, mtime: 'Aug 14 03:05' });
    coffee.children['.keep'] = VFS.file('vendor leftovers\n', { mode: 0o644 });
    return {
      vfs,
      cwd: '/opt/coffee',
      ctx: { processes: baseProcs(), hintLevel: 0, readFiles: [] },
      intro: `You are in <span class="info">/opt/coffee</span>.

<span class="highlight">ls</span> is not the whole story. Hidden names begin with <span class="info">.</span>
Try <span class="info">ls -la</span> or <span class="info">find . -name ".*"</span>.
`
    };
  },

  isWon(ctx) {
    return hasRead(ctx, 'exfil.log');
  },

  getHelp() {
    return `Hidden files:
  ls -la
  ls -la /opt/coffee
  find /opt/coffee -name ".*"
  cat /opt/coffee/.scratch/exfil.log`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Show hidden names.', cls: 'info' },
        { text: 'Try:  ls -la', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] There is a directory called .scratch.', cls: 'info' },
        { text: 'Try:  ls -la .scratch', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Read the loot log.', cls: 'info' },
        { text: 'Try:  cat /opt/coffee/.scratch/exfil.log', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• Names starting with <code>.</code> are hidden from plain <code>ls</code><br>' +
    '• <code>ls -la</code> is the difference between "empty" and "owned"<br>' +
    '• <code>find -name ".*"</code> hunts hidden names on purpose<br>' +
    '• Attackers hide in convention, not magic',

  successFlavor:
    'Default password mocha123. The radio said it first. You just did not want it to be true.',

  chiefNote: 'They copied the locker. Change every password that came from a cartoon.'
,

  caseTitle: "Exfil — /opt/coffee/.scratch",
  caseBody: "Hidden scratch pad packed evidence files and the chief’s todo. Default credentials still live: coffee / mocha123. Physical vector: USB the animal actually carried.",
  notes: [
    "Default passwords are a policy violation. Also our policy.",
    "Ban BeanTek from the building",
    "The cat is not fired. The cat has tenure.",
    "Write a nice thing about IT. Delete it. Fine, keep it."
  ]
});
