/* ---------- 01 Badge Day ---------- */
Missions.register({
  id: 'badge-day',
  order: 1,
  act: 1,
  lesson: 1,
  chapter: '1.1',
  title: 'Badge Day',
  short: 'Log in. Read the note. Learn the room.',
  description:
    'First day. The closet smells like toner and regret. Someone taped a welcome note in your home directory. Read it before the chief notices you are standing still.',
  objective: 'Read the welcome note in your home directory.',
  difficulty: 'Tutorial',
  unlock: false,
  requires: ['the-desk'],
  skills: ['pwd', 'ls', 'cat', 'cd'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: {
        processes: baseProcs(),
        hintLevel: 0,
        readFiles: []
      },
      intro: `Last login: Fri Aug 14 19:02:14 2026 from 127.0.0.1
Welcome to Precinct 13 Terminal — PrecinctOS 13 (GNU/Linux)

You are <span class="highlight">root@precinct-13</span>. That is not a promotion. That is a warning.

Type <span class="info">help</span> for commands, <span class="info">hint</span> if you get stuck, <span class="info">man ls</span> for a manual page.
`
    };
  },

  isWon(ctx) {
    return hasRead(ctx, '/home/itguy/welcome.txt');
  },

  getHelp() {
    return `Today you only need the basics:
  pwd              where am I?
  ls / ls -la      what is here?  (-la shows hidden files)
  cat FILE         read a file
  less FILE        same, one page at a time (space / b / q)
  cd DIR           change directory
  help, hint, man  survival tools`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] You start in your home directory. See what is there.', cls: 'info' },
        { text: 'Try:  ls', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Long listing is nicer. Hidden files start with a dot.', cls: 'info' },
        { text: 'Try:  ls -la', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Read the welcome note the chief left you.', cls: 'info' },
        { text: 'Try:  cat welcome.txt', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>pwd</code> — print working directory<br>' +
    '• <code>ls</code> / <code>ls -la</code> — list files, including hidden ones<br>' +
    '• <code>cat FILE</code> — print a file<br>' +
    '• <code>cd DIR</code> — move around. <code>~</code> is home, <code>/</code> is the root of the disk.',

  successFlavor:
    'You can read a file. The chief will pretend this was always the hiring bar.',

  chiefNote: 'He found the note. Hire him. Or at least do not lose him before lunch.'
,

  caseTitle: "Personnel — new hire",
  caseBody: "IT closet occupied. Subject can open a text file. Chief remains unimpressed, which is the local weather."
});
