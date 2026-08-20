/* ---------- 07 Disk Full ---------- */
Missions.register({
  id: 'disk-full',
  order: 11,
  act: 2,
  lesson: 6,
  chapter: '2.6',
  title: 'No Space Left on Device',
  short: 'The disk is full of posters. Free it.',
  description:
    'Saves fail. Logs fail. The booking system drew a sad face. df says the disk is exhausted. Something under /var/spool is obese.',
  objective: 'Find what ate the disk, then clear the poster dump.',
  difficulty: 'Medium',
  unlock: false,
  requires: ['cron-dead'],
  skills: ['df', 'du', 'rm'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const varNode = VFS.resolve(vfs, '/', '/var').node;
    const spool = varNode.children.spool;
    spool.children.mail = VFS.dir({
      root: VFS.file('From cron: /var is getting tight\n')
    });
    spool.children.cron = VFS.dir({
      root: VFS.file('# empty\n')
    });
    const printer = spool.children.printer;
    const page = '%!PS-Adobe-3.0\n%%Title: MOST WANTED (blurry cat)\n%%Pages: 1\n' +
      'WANTED CAT '.repeat(6500);
    for (let i = 1; i <= 48; i++) {
      printer.children[`wanted_${String(i).padStart(3, '0')}.ps`] = VFS.file(page, { mtime: 'Aug 14 19:04' });
    }
    printer.children['queue.txt'] = VFS.file('JAMMED\n48 jobs\nlp0 on fire\n');
    const used = VFS.sizeOf(vfs);
    return {
      vfs,
      cwd: '/var',
      ctx: { processes: baseProcs(), hintLevel: 0, diskTotal: Math.round(used / 0.99), removed: [] },
      intro: `<span class="error">No space left on device.</span>

<span class="info">df</span> for the filesystem. <span class="info">du -sh *</span> from here to blame a directory.
One folder is eating the disk. Find it. Then the files inside it.
`
    };
  },

  isWon(_ctx, vfs) {
    const spool = VFS.resolve(vfs, '/', '/var/spool/printer');
    if (!spool) return true;
    const posters = Object.keys(spool.node.children).filter((n) => n.startsWith('wanted_'));
    return posters.length === 0;
  },

  getHelp() {
    return `Disk tools:
  df / df -h       filesystem free space
  du -sh PATH      how big is this?
  du -sh *         each entry here
  rm FILE
  rm -r DIR        if you must

Do not rm -rf /  (the game will refuse. real life will not.)`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] See how full the disk is.', cls: 'info' },
        { text: 'Try:  df', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Weigh directories.', cls: 'info' },
        { text: 'Try:  du -sh /var/*', cls: 'muted' },
        { text: 'Then: du -sh /var/spool/printer/*', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Delete the poster dump.', cls: 'info' },
        { text: 'Try:  rm /var/spool/printer/wanted_*', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>df</code> — free space on filesystems<br>' +
    '• <code>du -sh PATH</code> — size of a path<br>' +
    '• Fill-up is often one directory. Find it before you delete at random.<br>' +
    '• Spool, logs, and /tmp are the usual suspects',

  successFlavor:
    'The booking system inhales. Somewhere a detective saves a form on the first try and does not believe it.',

  chiefNote: 'Disk space restored. If I see another cat poster I will eat it.'
,

  caseTitle: "Availability — disk exhaustion",
  caseBody: "Printer spool filled the root filesystem with poster dumps. Classic smoke screen: hide a theft behind a mess. Space restored."
});
