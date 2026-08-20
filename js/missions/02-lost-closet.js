/* ---------- 02 Lost in the Closet ---------- */
Missions.register({
  id: 'lost-closet',
  order: 2,
  act: 1,
  lesson: 2,
  chapter: '1.2',
  title: 'Lost in the Closet',
  short: 'The chief said “the file in etc.” He meant /etc.',
  description:
    'The chief barked “read the file in etc” and hung up. There is no folder named etc next to your sandwich. There is one at the root of the disk.',
  objective: 'Find the chief’s file in etc. A path from the root, not the folder next to lunch.',
  difficulty: 'Tutorial',
  unlock: false,
  requires: ['badge-day'],
  skills: ['pwd', 'cd', 'ls', '/'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const etc = VFS.resolve(vfs, '/', '/etc').node;
    etc.children['orders.txt'] = VFS.file(
      'FROM THE CHIEF\n' +
      '==============\n\n' +
      'When I say “the file in etc” I mean /etc.\n' +
      'A path that starts with / is absolute. It does not care where you are standing.\n' +
      'cd etc     looks next to you\n' +
      'cd /etc    goes to the root, then into etc\n' +
      'cd ~       is your home. cd / is the top of the disk. cd .. is up.\n\n' +
      'You found it. Get back to work.\n' +
      '— Briggs\n',
      { mtime: 'Aug 14 19:20' }
    );
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: { processes: baseProcs(), hintLevel: 0, readFiles: [] },
      intro: `You are in <span class="info">/home/itguy</span>.

The chief said <span class="highlight">the file in etc</span>.
Type <span class="info">pwd</span> if you forget where you are.
`
    };
  },

  isWon(ctx) {
    return hasRead(ctx, '/etc/orders.txt');
  },

  getHelp() {
    return `Paths:
  pwd              where am I?
  cd DIR           relative — next to you
  cd /DIR          absolute — from the root
  cd ~             home    cd /     root    cd ..    up
  cat /etc/orders.txt`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] You start in your home. etc is not here.', cls: 'info' },
        { text: 'Try:  pwd     then     ls', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] A path starting with / is from the root of the disk.', cls: 'info' },
        { text: 'Try:  cd /etc     or     cat /etc/orders.txt', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Read the order.', cls: 'info' },
        { text: 'Try:  cat /etc/orders.txt', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>cd etc</code> is relative — it looks in the current directory<br>' +
    '• <code>cd /etc</code> is absolute — from the root, always<br>' +
    '• <code>~</code> is home, <code>/</code> is the top, <code>..</code> is the parent<br>' +
    '• <code>pwd</code> when the prompt is lying to your memory',

  successFlavor:
    'The chief did not say “a folder named etc beside your lunch.” He said /etc. You now know the difference.',

  chiefNote: 'He found /etc. Maybe he can find the printer next.',

  caseTitle: "Training — absolute paths",
  caseBody: "Subject learned that “the file in etc” means /etc. Relative paths look next to you. Absolute paths start at the root. Chief claims he was always this clear."
});
