/* ---------- 02 Wanted Poster ---------- */
Missions.register({
  id: 'wanted-poster',
  order: 6,
  act: 2,
  lesson: 1,
  chapter: '2.1',
  title: 'The Endless Wanted Poster',
  short: 'Stop the rogue printer process.',
  description:
    'A script is printing blurry MOST WANTED cat posters on a loop. The printer has eaten three reams. Miller is using a poster as a coaster. The chief is not.',
  objective: 'Find the runaway process and stop it.',
  difficulty: 'Easy',
  unlock: false,
  requires: ['dont-eat'],
  skills: ['ps', 'kill', 'pkill'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const processes = baseProcs();
    processes.splice(4, 0, proc(
      1337, 'root', '97.4', '3.1', 'pts/2', '19:01', '00:12:44',
      '/usr/local/bin/wanted_cat_printer --loop --interval=3 --image=blurry_cat.jpg',
      { highlight: true }
    ));
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: { processes, hintLevel: 0 },
      intro: `SESSION OPEN — print shop emergency

<span class="highlight">A wild process is flooding the printer with cat posters...</span>

Paper is a budget line. The chief has circled it in red.
`
    };
  },

  isWon(ctx) {
    return isDead(ctx, (p) => p.pid === 1337 || (p.cmd || '').includes('wanted_cat_printer'));
  },

  afterCommand(_line, ctx) {
    if (isDead(ctx, (p) => p.pid === 1337)) {
      ctx._silenced = true;
    }
  },

  getHelp() {
    return `Process tools:
  ps / ps aux      list processes
  kill PID         send SIGTERM
  kill -9 PID      force kill (SIGKILL)
  pkill NAME       kill by name

Look for high CPU. Look for the word "wanted".`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] List everything that is running.', cls: 'info' },
        { text: 'Try:  ps aux', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] One process is using ~97% CPU and mentions "wanted" or "cat".', cls: 'info' },
        { text: 'Note its PID — the number in the second column.', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] End it.', cls: 'info' },
        { text: 'Try:  kill 1337     or    pkill wanted', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>ps aux</code> — snapshot of running processes<br>' +
    '• <code>kill PID</code> — polite stop (SIGTERM)<br>' +
    '• <code>kill -9 PID</code> — cannot be ignored (SIGKILL)<br>' +
    '• <code>pkill NAME</code> — kill by command name, not number',

  successFlavor:
    'The printer falls silent. The chief walks past the paper mountain, sighs, and mutters “Good enough.”',

  chiefNote: 'Printer stopped. Ask IT why a cat is our most wanted.'
,

  caseTitle: "INC-12 — printer flood",
  caseBody: "Process wanted_cat_printer looped MOST WANTED posters of a blurry cat. Terminated. Question remains: who started it, and why a cat?",
  notes: [
    "Printer is quiet. For now.",
    "Ask legal if a cat can be a suspect",
    "Coffee machine password is still mocha123. Later.",
    "Buy more paper (urgent)"
  ]
});
