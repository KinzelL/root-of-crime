/* ---------- 03 File the Locker ---------- */
Missions.register({
  id: 'file-locker',
  order: 3,
  act: 1,
  lesson: 3,
  chapter: '1.3',
  title: 'File the Locker',
  short: 'Miller dumped evidence in /tmp. Put it away.',
  description:
    'Miller left three files on the /tmp counter “for just a second.” That was this morning. Make a folder in the locker, move the dump in, and keep a copy of the USB note in your home.',
  objective: 'Make a folder in the locker, move the dump in, keep a copy of the USB note at home.',
  difficulty: 'Tutorial',
  unlock: false,
  requires: ['lost-closet'],
  skills: ['mkdir', 'mv', 'cp', 'ls'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const tmp = VFS.resolve(vfs, '/', '/tmp').node;
    tmp.children['usb_note.txt'] = VFS.file('USB recovered from the break-room counter.\nDo not plug this into anything important.\n— Miller\n');
    tmp.children['case_scrap.txt'] = VFS.file('scribble: coffee machine? 03:00? cat??\n');
    tmp.children['blurry_cat.jpg'] = VFS.file('[binary data — extremely blurry JPEG of a cat wearing sunglasses]');
    return {
      vfs,
      cwd: '/tmp',
      ctx: { processes: baseProcs(), hintLevel: 0 },
      intro: `You are in <span class="info">/tmp</span>.

Miller's idea of filing is a pile. The locker is <span class="info">/evidence</span>.
Make <span class="info">/evidence/sorted</span>, move this mess into it, copy <span class="info">usb_note.txt</span> to your home.
`
    };
  },

  _progress(vfs) {
    const sorted = VFS.resolve(vfs, '/', '/evidence/sorted');
    const isDir = !!(sorted && sorted.node.type === 'dir');
    const names = isDir ? Object.keys(sorted.node.children) : [];
    const needed = ['usb_note.txt', 'case_scrap.txt', 'blurry_cat.jpg'];
    const filed = needed.every((n) => names.includes(n)) && !VFS.resolve(vfs, '/', '/tmp/usb_note.txt');
    const copy = VFS.resolve(vfs, '/', '/home/itguy/usb_note.txt');
    return { isDir, filed, copied: !!(copy && copy.node.type === 'file') };
  },

  isWon(_ctx, vfs) {
    const p = this._progress(vfs);
    return p.isDir && p.filed && p.copied;
  },

  objectives(_ctx, vfs) {
    const p = this._progress(vfs);
    return [
      { label: 'Make a folder in the locker', done: p.isDir },
      { label: 'Move the dump off the counter', done: p.filed },
      { label: 'Keep a copy of the USB note at home', done: p.copied }
    ];
  },

  getHelp() {
    return `Make, move, copy:
  mkdir DIR        create a folder
  mv SRC DEST      move or rename
  cp SRC DEST      copy
  ls /tmp
  ls /evidence

  mkdir /evidence/sorted
  mv /tmp/usb_note.txt /evidence/sorted/
  cp /evidence/sorted/usb_note.txt ~`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Make the folder first.', cls: 'info' },
        { text: 'Try:  mkdir /evidence/sorted', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Move the three files off the counter.', cls: 'info' },
        { text: 'Try:  mv /tmp/* /evidence/sorted/', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Keep a copy of the USB note in your home.', cls: 'info' },
        { text: 'Try:  cp /evidence/sorted/usb_note.txt ~', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>mkdir DIR</code> — make a directory<br>' +
    '• <code>mv SRC DEST</code> — move (or rename). The original is gone<br>' +
    '• <code>cp SRC DEST</code> — copy. The original stays<br>' +
    '• <code>~</code> in a destination is your home directory',

  successFlavor:
    'The counter is clear. Miller will dump something else there by lunch. That is a Miller problem.',

  chiefNote: 'He can file. Next we teach him not to overwrite the filing.',

  caseTitle: "Housekeeping — /tmp dump",
  caseBody: "Miller left evidence on the /tmp counter. Subject created /evidence/sorted, moved the pile, copied the USB note home. Counter will be dirty again by lunch.",
  notes: [
    "He can cd. He can file. Do not let him near > yet.",
    "Ask legal if a cat can be a suspect",
    "Coffee machine password is still mocha123. Later.",
    "Buy more paper (urgent)"
  ],
  radio: [
    "[19:40] Miller: I left some stuff in /tmp. It is fine.",
    "[19:41] Chief: It is not fine.",
    "[19:50] You: Filing.",
    "[19:52] Night desk: Someone redirected over case_042. Classic."
  ]
});
