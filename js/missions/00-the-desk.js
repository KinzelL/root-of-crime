/* ---------- 0.1 How This Desk Works ---------- */
Missions.register({
  id: 'the-desk',
  order: 0,
  act: 0,
  lesson: 1,
  chapter: '0.1',
  title: 'How This Desk Works',
  short: 'The board, the slip, help / hint / man.',
  description:
    'Before Linux, the closet. This is not a real precinct terminal. It is close enough. Learn the desk: help for the job, hint if you stall (it costs), man ls for the book.',
  objective: 'Learn the desk: ask it what it can do, then open a manual page.',
  difficulty: 'Tutorial',
  unlock: true,
  requires: [],
  skills: ['help', 'hint', 'man'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: { processes: baseProcs(), hintLevel: 0, usedHelp: false, usedMan: false, usedHint: false },
      intro: `This is <span class="info">xterm</span> on the closet jump host.

The grey slip is the job. This black box is the tool. Later tickets live on other boxes — you <span class="info">ssh</span> there.

Type <span class="info">help</span>. Then <span class="info">man ls</span>.
<span class="info">hint</span> also counts, but it costs score. Esc iconifies. The taskbar raises you again.
`
    };
  },

  isWon(ctx) {
    return !!(ctx.usedHelp && (ctx.usedMan || ctx.usedHint));
  },

  objectives(ctx) {
    return [
      { label: 'Ask the desk what it can do', done: !!ctx.usedHelp },
      { label: 'Open a manual page (or take a hint)', done: !!(ctx.usedMan || ctx.usedHint) }
    ];
  },

  getHelp() {
    return `The desk:
  help             this text — what THIS job wants
  hint             a nudge. costs score. gets more specific
  man COMMAND      a manual page (try: man ls)
  xman             the book for every app on the desk
  Esc              iconify this xterm
  twm / right-click the root   the menu`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Ask the desk what it can do.', cls: 'info' },
        { text: 'Try:  help', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Read a manual page.', cls: 'info' },
        { text: 'Try:  man ls', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] help AND man ls (or hint). That clears this case.', cls: 'info' }
      ]
    ]);
  },

  learned:
    '• <code>help</code> is this job, not the whole Unix<br>' +
    '• <code>man ls</code> is the book for one command<br>' +
    '• <code>hint</code> is a crutch. It works. It costs<br>' +
    '• Esc iconifies. The taskbar is a real WM',

  successFlavor:
    'You found the light switch. The Linux starts after this.',

  chiefNote: 'He can read a man page. Hire him. Then make him file.',

  caseTitle: "Orientation — the closet",
  caseBody: "Subject found help, man, and the slip. The desk is not Linux. The desk is how you reach Linux."
});
