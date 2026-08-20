/* ---------- 03 Locked Evidence ---------- */
Missions.register({
  id: 'locked-evidence',
  order: 7,
  act: 2,
  lesson: 2,
  chapter: '2.2',
  title: 'The Locked Evidence Locker',
  short: 'Restore permissions on the case files.',
  description:
    'Every file in /evidence suddenly has mode 000. Detectives can see the names and cannot open a single one. They are staring at you like you invented Unix.',
  objective: 'Give the detectives their files back. Nobody can open them.',
  difficulty: 'Easy',
  unlock: false,
  requires: ['wanted-poster'],
  skills: ['ls', 'chmod'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const locker = VFS.resolve(vfs, '/', '/evidence').node;
    locker.children = {
      'case_042.txt': VFS.file(
        'Case #042\nSuspect: unknown\nLast seen near the coffee machine.\nNotes: Possible feline involvement.\nUSB device logged at 03:04.\n',
        { mode: 0, owner: 'root', group: 'detectives', mtime: 'Aug 14 14:22' }
      ),
      'witness_statement.log': VFS.file(
        'I saw a cat.\nIt looked guilty.\nIt was carrying a USB stick.\n— Officer Miller\n',
        { mode: 0, owner: 'root', group: 'detectives', mtime: 'Aug 14 15:03' }
      ),
      'photo_blurry.jpg': VFS.file(
        '[binary data — extremely blurry JPEG of a cat wearing sunglasses]',
        { mode: 0, owner: 'root', group: 'detectives', mtime: 'Aug 14 15:10' }
      ),
      'evidence_list.csv': VFS.file(
        'id,item,location\n1,USB stick,cat\n2,sunglasses,cat\n3,dignity,missing\n',
        { mode: 0, owner: 'root', group: 'detectives', mtime: 'Aug 14 16:01' }
      )
    };
    return {
      vfs,
      cwd: '/evidence',
      ctx: {
        processes: baseProcs(),
        hintLevel: 0,
        jail: '/evidence'
      },
      intro: `You are in the evidence directory.

<span class="highlight">All case files are mode 000. Detectives cannot open anything.</span>

Start with <span class="info">ls -l</span>.
`
    };
  },

  isWon(_ctx, vfs) {
    const locker = VFS.resolve(vfs, '/', '/evidence');
    if (!locker) return false;
    const files = Object.entries(locker.node.children).filter(([, n]) => n.type === 'file');
    return files.length > 0 && files.every(([, n]) => (n.mode & 0o444) !== 0);
  },

  objectives(_ctx, vfs) {
    const locker = vfs ? VFS.resolve(vfs, '/', '/evidence') : null;
    const files = locker
      ? Object.entries(locker.node.children).filter(([, n]) => n.type === 'file')
      : [];
    return files.map(([name, n]) => ({
      label: 'Detectives can open ' + name,
      done: (n.mode & 0o444) !== 0
    }));
  },

  getHelp() {
    return `Permission tools:
  ls -l            see mode bits (rwx)
  chmod MODE FILE  change them
  chmod 644 *      all files here
  cat FILE         confirm you can read

  644 = rw-r--r--   000 = ---------`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Long listing shows the problem.', cls: 'info' },
        { text: 'Try:  ls -l', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] ---------- means mode 000. Nobody can read.', cls: 'info' },
        { text: 'Normal files are usually 644 (rw-r--r--).', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Fix them all at once.', cls: 'info' },
        { text: 'Try:  chmod 644 *', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>ls -l</code> — permissions, owner, size, date<br>' +
    '• <code>chmod 644 file</code> — owner rw, group r, other r<br>' +
    '• <code>chmod 644 *</code> — glob applies to every name in the directory<br>' +
    '• Common modes: 644 files, 755 dirs/executables, 600 private',

  successFlavor:
    'A detective opens a photo, squints, and says “I knew that cat looked suspicious.”',

  chiefNote: 'Evidence readable again. Ask who thought 000 was a filing system.'
,

  caseTitle: "Evidence locker — mode 000",
  caseBody: "Permissions on /evidence wiped. Restored to 644. Case 042 mentions the coffee machine and a USB stick. Detectives request a raise. Denied.",
  radio: [
    "[21:01] Miller: The locker opened. The cat is wearing sunglasses.",
    "[21:03] Chief: Of course it is.",
    "[21:10] Dispatch: Booking system is slow.",
    "[21:12] Night desk: Camera 3 is a fever dream."
  ]
});
