/* ---------- 04 The Long Statement ---------- */
Missions.register({
  id: 'long-statement',
  order: 4,
  act: 1,
  lesson: 4,
  chapter: '1.4',
  title: 'The Long Statement',
  short: 'Miller typed a novel. Do not cat the whole thing.',
  description:
    'Miller’s witness statement is a wall. The first lines are throat-clearing. The last line is the only one Dispatch cares about. Page it. Do not print the precinct’s paper budget into the xterm.',
  objective: 'Read Miller’s statement without dumping the whole wall at once.',
  difficulty: 'Tutorial',
  unlock: false,
  requires: ['file-locker'],
  skills: ['less', 'head', 'tail'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const lines = ['MILLER / WITNESS STATEMENT / INC-pending', '========================================', ''];
    for (let i = 1; i <= 40; i++) {
      lines.push('para ' + i + ': I was in the break room. There was coffee. There was a smell. Nothing else to report.');
    }
    lines.push('');
    lines.push('THEN: a cat. Sunglasses. A USB stick on the counter. I picked the stick up. Sorry.');
    lines.push('');
    for (let i = 41; i <= 55; i++) {
      lines.push('para ' + i + ': I would like that on the record. Also I would like a sandwich.');
    }
    lines.push('END OF STATEMENT — do not file this without reading the last page.');
    const inc = VFS.resolve(vfs, '/', '/var/log/incident').node;
    inc.children['miller_statement.log'] = VFS.file(lines.join('\n') + '\n', { mtime: 'Aug 14 16:40' });
    return {
      vfs,
      cwd: '/var/log/incident',
      ctx: { processes: baseProcs(), hintLevel: 0, readFiles: [] },
      intro: `Statement is in this directory: <span class="info">miller_statement.log</span>

<span class="highlight">cat</span> will drown you. <span class="info">less FILE</span> pages it (space / b / q).
<span class="info">head</span> is the start. <span class="info">tail</span> is the end.
`
    };
  },

  isWon(ctx) {
    return hasRead(ctx, 'miller_statement.log');
  },

  getHelp() {
    return `Long files:
  less FILE        page through (space / b / q)
  more FILE        same idea
  head FILE        first 10 lines
  head -n 20 FILE
  tail FILE        last 10 lines
  tail -n 5 FILE`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Open it in a pager.', cls: 'info' },
        { text: 'Try:  less miller_statement.log', cls: 'muted' },
        { text: 'space = next page. q = quit.', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Or steal the ends.', cls: 'info' },
        { text: 'Try:  head miller_statement.log', cls: 'muted' },
        { text: 'Then: tail miller_statement.log', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] The file is right here.', cls: 'info' },
        { text: 'Try:  less /var/log/incident/miller_statement.log', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>less FILE</code> — one page at a time. space / b / q<br>' +
    '• <code>head</code> / <code>tail</code> — first and last lines<br>' +
    '• <code>cat</code> is for short files. Long logs will scroll off the earth<br>' +
    '• The useful sentence is rarely line one',

  successFlavor:
    'Sunglasses. USB. Counter. Miller said sorry. He is not sorry.',

  chiefNote: 'Miller writes like he talks. Next time, tail first.',

  caseTitle: "INC-pending — Miller statement",
  caseBody: "Miller wrote a novel. Subject used a pager. The useful sentence was not on page one: sunglasses, USB, counter. Miller said sorry. He is not sorry."
});
