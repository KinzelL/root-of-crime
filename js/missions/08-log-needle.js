/* ---------- 04 Needle in the Logs ---------- */
Missions.register({
  id: 'log-needle',
  order: 8,
  act: 2,
  lesson: 3,
  chapter: '2.3',
  title: 'Needle in the Logs',
  short: 'Search the incident logs for the sunglasses.',
  description:
    'Miller swears the cat wore sunglasses. The incident folder is a pile of noise. Find every mention of sunglasses and read the file that actually matters.',
  objective: 'Find every mention of sunglasses, then read the file that actually matters.',
  difficulty: 'Easy',
  unlock: false,
  requires: ['locked-evidence'],
  skills: ['grep', 'find', 'cat'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const inc = VFS.resolve(vfs, '/', '/var/log/incident').node;
    for (let i = 3; i <= 20; i++) {
      const n = String(i).padStart(2, '0');
      let body = `INC-${n}  routine noise. nothing to see. closed by night shift.\n`;
      if (i === 9) body = 'INC-09  missing lunch from the fridge. suspect: humanity.\n';
      if (i === 12) body = 'INC-12  printer jam. paper depicts a cat. again.\n';
      if (i === 17) {
        body =
          'INC-17  NIGHT DESK\n' +
          'Time: 03:06\n' +
          'Camera 3 (break room): small animal, dark fur, SUNGLASSES.\n' +
          'It hops onto the counter beside the BeanTek coffee unit.\n' +
          'USB activity on coffee.lan immediately after.\n' +
          'Operator note: "mittens? we do not have a mittens."\n';
      }
      inc.children[`incident_${n}.log`] = VFS.file(body, { mtime: 'Aug 14 03:10' });
    }
    inc.children['notes.txt'] = VFS.file('TODO: index these. TODO: invent a better TODO.\n');
    return {
      vfs,
      cwd: '/var/log',
      ctx: { processes: baseProcs(), hintLevel: 0, readFiles: [] },
      intro: `You dropped into <span class="info">/var/log</span>.

Incident reports live in <span class="info">/var/log/incident/</span>.
Miller wants the word <span class="highlight">sunglasses</span>. Do not read twenty files by hand.
`
    };
  },

  isWon(ctx) {
    return hasRead(ctx, 'incident_17.log');
  },

  getHelp() {
    return `Search tools:
  grep PATTERN FILE
  grep -r PATTERN         recurse here (you are already in the tree)
  grep -r PATTERN DIR     recurse that directory
  find DIR -name "*.log"
  cat FILE
  ls /var/log/incident`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] Recurse the incident folder for a word.', cls: 'info' },
        { text: 'Try:  grep -r sunglasses /var/log/incident', cls: 'muted' },
        { text: 'Or:   cd /var/log/incident     then     grep -r sunglasses', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] find can list the logs if you want a map first.', cls: 'info' },
        { text: 'Try:  find /var/log/incident -name "*.log"', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] The hit is incident_17.log. Read the whole thing.', cls: 'info' },
        { text: 'Try:  cat /var/log/incident/incident_17.log', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>grep PATTERN FILE</code> — print matching lines<br>' +
    '• <code>grep -r PATTERN</code> — walk this directory. Add a path if you are elsewhere<br>' +
    '• <code>find DIR -name "*.log"</code> — find by name<br>' +
    '• <code>cmd | grep x</code> — filter any command output',

  successFlavor:
    'Sunglasses. USB. Coffee machine. 03:06. The case file just grew a pulse.',

  chiefNote: 'Miller was not hallucinating. The cat has taste. And a USB stick.'
,

  caseTitle: "INC-17 — 03:06 break room",
  caseBody: "Camera 3: small animal, sunglasses, hops onto the BeanTek unit. USB activity on coffee.lan immediately after. Operator wrote “mittens?”"
});
