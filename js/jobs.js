/* ROOT OF CRIME – returning job templates (not campaign chapters) */

Missions.JOB_POOL = ['job-redirect', 'job-needle', 'job-spool'];

var JobSeeds = {
  redirect: [
    {
      n: '088',
      file: 'case_088.txt',
      eaten: 'total 8\nusb_note.txt\nblurry_cat.jpg\n',
      body: 'Case #088\nSuspect: the copier\nUSB device logged at 02:17.\nA clerk listed the locker over the case.\n'
    },
    {
      n: '113',
      file: 'case_113.txt',
      eaten: 'total 4\nreadme.txt\n',
      body: 'Case #113\nSuspect: break room\nSomeone typed ls > and walked away.\nFridge cam still missing.\n'
    },
    {
      n: '207',
      file: 'case_207.txt',
      eaten: 'total 16\nphoto1.jpg\nphoto2.jpg\n',
      body: 'Case #207\nSuspect: the elevator\nA detective “backed it up” with one arrow.\nDo not do that.\n'
    }
  ],
  needle: [
    {
      word: 'raincoat',
      hit: 14,
      body:
        'INC-14  LOBBY\nTime: 04:11\nCamera 1: figure in a yellow RAINCOAT by the evidence cage.\nBadge not visible. Left through the copier hall.\nOperator note: "not ours. we do not issue yellow."\n'
    },
    {
      word: 'fedora',
      hit: 11,
      body:
        'INC-11  PARKING\nTime: 01:40\nCamera 7: a FEDORA on the hood of unit 13. Nobody under it.\nWind, or a joke. Miller wants it in the file anyway.\n'
    },
    {
      word: 'visor',
      hit: 8,
      body:
        'INC-08  BASEMENT\nTime: 05:02\nA visitor with a sun VISOR asked for the booking guest password.\nFront desk said no. They asked again.\n'
    }
  ],
  spool: [
    { dir: '/var/spool/printer', prefix: 'queue_', ext: '.ps', count: 40, label: 'the printer spool' },
    { dir: '/var/tmp/posters', prefix: 'cat_', ext: '.ps', count: 36, label: '/var/tmp/posters' },
    { dir: '/var/cache/print', prefix: 'job_', ext: '.bin', count: 42, label: 'the print cache' }
  ]
};

function jobPick(list, seed) {
  return list[Math.abs(seed || 0) % list.length];
}

function jobEnsureDir(vfs, path) {
  const parts = String(path).split('/').filter(Boolean);
  let cur = vfs;
  let walked = '';
  parts.forEach((part) => {
    walked += '/' + part;
    if (!cur.children[part] || cur.children[part].type !== 'dir') {
      cur.children[part] = VFS.dir({});
    }
    cur = cur.children[part];
  });
  return VFS.resolve(vfs, '/', path);
}

Missions.registerJob({
  template: 'job-redirect',
  act: 1,
  jobCode: 'R.1',
  skills: ['cp', '>', '>>', 'echo'],
  flavor(seed) {
    const c = jobPick(JobSeeds.redirect, seed);
    return {
      title: 'Night Shift Ate Case #' + c.n,
      short: 'Someone redirected over a case file again.',
      description:
        'Night shift ran ls > ' + c.file + ' and ate the case. Restore from the .bak, then append a note with >>. One arrow will eat it again.'
    };
  },
  setup() {
    const c = jobPick(JobSeeds.redirect, this.seed);
    const vfs = VFS.clone(VFS.createBase());
    const locker = VFS.resolve(vfs, '/', '/evidence').node;
    locker.children[c.file] = VFS.file(c.eaten, { mtime: 'Aug 17 21:10' });
    locker.children[c.file + '.bak'] = VFS.file(c.body, { mtime: 'Aug 17 14:02' });
    locker.children.README = VFS.file('> replaces. >> appends. They used the first one. Again.\n');
    return {
      vfs,
      cwd: '/evidence',
      ctx: { processes: baseProcs(), hintLevel: 0, jobCase: c },
      intro: '<span class="error">' + c.file + ' is a directory listing.</span> That is not a case file.\n\n' +
        'Restore from <span class="info">' + c.file + '.bak</span>, then append a note with <span class="info">&gt;&gt;</span>.'
    };
  },
  _progress(vfs) {
    const c = jobPick(JobSeeds.redirect, this.seed);
    const live = VFS.resolve(vfs, '/', '/evidence/' + c.file);
    const bak = VFS.resolve(vfs, '/', '/evidence/' + c.file + '.bak');
    const text = live && live.node.type === 'file' ? live.node.content : '';
    const bakText = bak && bak.node.type === 'file' ? bak.node.content : '';
    const restored = text.includes('Case #' + c.n) && text.includes(c.body.split('\n')[2] || 'Suspect');
    const appended = restored && (text.length > bakText.length || /night\s*shift/i.test(text));
    return { restored, appended, file: c.file };
  },
  isWon(_ctx, vfs) {
    const p = this._progress(vfs);
    return p.restored && p.appended;
  },
  objectives(_ctx, vfs) {
    const p = vfs ? this._progress(vfs) : { restored: false, appended: false };
    return [
      { label: 'Put the backup back over the eaten case', done: p.restored },
      { label: 'Append a note. Do not replace the file again', done: p.appended }
    ];
  },
  getHelp() {
    const c = jobPick(JobSeeds.redirect, this.seed);
    return 'Same as last time night shift did this.\n' +
      '  cp ' + c.file + '.bak ' + c.file + '\n' +
      '  echo night shift ate the original >> ' + c.file;
  },
  getHint(ctx, vfs) {
    const p = vfs ? this._progress(vfs) : { restored: false, appended: false, file: 'case.txt' };
    if (!p.restored) {
      return [
        { text: '[HINT] Restore first. Copy the backup over the eaten file.', cls: 'info' },
        { text: 'Try:  cp ' + p.file + '.bak ' + p.file, cls: 'muted' }
      ];
    }
    return [
      { text: '[HINT] The case is back. Append. Two arrows.', cls: 'info' },
      { text: 'Try:  echo night shift ate the original >> ' + p.file, cls: 'muted' }
    ];
  },
  successFlavor: 'The case has a body again. Night shift will do this next week too.',
  chiefNote: 'He still knows > from >>. Keep him.',
  caseTitle: 'Returning — redirect accident',
  caseBody: 'Night shift ate another case with ls >. Subject restored from .bak and appended with >>.'
});

Missions.registerJob({
  template: 'job-needle',
  act: 2,
  jobCode: 'R.2',
  skills: ['grep', 'cat'],
  flavor(seed) {
    const n = jobPick(JobSeeds.needle, seed);
    return {
      title: 'Needle in the Logs — ' + n.word,
      short: 'Find the word. Read the file that matters.',
      description:
        'Dispatch wants every mention of “' + n.word + '” in the incident pile. Do not read twenty files by hand. Then read the one that actually matters.'
    };
  },
  setup() {
    const n = jobPick(JobSeeds.needle, this.seed);
    const vfs = VFS.clone(VFS.createBase());
    const inc = VFS.resolve(vfs, '/', '/var/log/incident').node;
    for (let i = 3; i <= 20; i++) {
      const id = String(i).padStart(2, '0');
      let body = 'INC-' + id + '  routine noise. closed by night shift.\n';
      if (i === n.hit) body = n.body;
      inc.children['incident_' + id + '.log'] = VFS.file(body, { mtime: 'Aug 18 04:40' });
    }
    return {
      vfs,
      cwd: '/var/log',
      ctx: { processes: baseProcs(), hintLevel: 0, readFiles: [], jobNeedle: n },
      intro: 'Incident reports live in <span class="info">/var/log/incident/</span>.\n' +
        'Dispatch wants the word <span class="highlight">' + n.word + '</span>.'
    };
  },
  isWon(ctx) {
    const n = jobPick(JobSeeds.needle, this.seed);
    return hasRead(ctx, 'incident_' + String(n.hit).padStart(2, '0') + '.log');
  },
  getHelp() {
    const n = jobPick(JobSeeds.needle, this.seed);
    return '  grep -r ' + n.word + ' /var/log/incident\n  cat the file that hits.';
  },
  getHint(ctx) {
    const n = jobPick(JobSeeds.needle, this.seed);
    const hit = 'incident_' + String(n.hit).padStart(2, '0') + '.log';
    return hintList(ctx, [
      [
        { text: '[HINT 1] Recurse the incident folder for the word.', cls: 'info' },
        { text: 'Try:  grep -r ' + n.word + ' /var/log/incident', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] The hit is ' + hit + '. Read it.', cls: 'info' },
        { text: 'Try:  cat /var/log/incident/' + hit, cls: 'muted' }
      ]
    ]);
  },
  successFlavor: 'You found the line. The pile is still a pile. That is the job.',
  chiefNote: 'He can still grep. Good. I cannot.',
  caseTitle: 'Returning — log search',
  caseBody: 'Another word in the incident pile. Subject grepped, then read the file that mattered.'
});

Missions.registerJob({
  template: 'job-spool',
  act: 2,
  jobCode: 'R.3',
  skills: ['df', 'du', 'rm'],
  flavor(seed) {
    const s = jobPick(JobSeeds.spool, seed);
    return {
      title: 'No Space Left — ' + s.label,
      short: 'The disk is full again. Clear the dump.',
      description:
        'Saves fail. df is red. Something under ' + s.dir + ' is obese. Find the dump. Clear it. Do not delete the disk.'
    };
  },
  setup() {
    const s = jobPick(JobSeeds.spool, this.seed);
    const vfs = VFS.clone(VFS.createBase());
    const folder = jobEnsureDir(vfs, s.dir);
    const page = '%!PS-Adobe-3.0\n%%Title: leftover dump\n' + 'WANTED CAT '.repeat(6500);
    for (let i = 1; i <= s.count; i++) {
      folder.node.children[s.prefix + String(i).padStart(3, '0') + s.ext] = VFS.file(page, { mtime: 'Aug 18 07:50' });
    }
    folder.node.children['queue.txt'] = VFS.file('JAMMED\n' + s.count + ' jobs\n');
    const used = VFS.sizeOf(vfs);
    return {
      vfs,
      cwd: '/var',
      ctx: { processes: baseProcs(), hintLevel: 0, diskTotal: Math.round(used / 0.99), jobSpool: s },
      intro: '<span class="error">No space left on device.</span>\n\n' +
        '<span class="info">df</span> then <span class="info">du -sh</span>. The dump is under <span class="info">' + s.dir + '</span>.'
    };
  },
  isWon(_ctx, vfs) {
    const s = jobPick(JobSeeds.spool, this.seed);
    const folder = VFS.resolve(vfs, '/', s.dir);
    if (!folder) return true;
    return !Object.keys(folder.node.children).some((n) => n.startsWith(s.prefix));
  },
  getHelp() {
    const s = jobPick(JobSeeds.spool, this.seed);
    return '  df\n  du -sh ' + s.dir + '\n  rm ' + s.dir + '/' + s.prefix + '*';
  },
  getHint(ctx) {
    const s = jobPick(JobSeeds.spool, this.seed);
    return hintList(ctx, [
      [
        { text: '[HINT 1] See how full the disk is.', cls: 'info' },
        { text: 'Try:  df', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] Weigh the dump, then delete the files.', cls: 'info' },
        { text: 'Try:  du -sh ' + s.dir, cls: 'muted' },
        { text: 'Then: rm ' + s.dir + '/' + s.prefix + '*', cls: 'muted' }
      ]
    ]);
  },
  successFlavor: 'The disk inhales. The dump will be back. That is also the job.',
  chiefNote: 'Space again. If I see another pile I will eat it.',
  caseTitle: 'Returning — disk exhaustion',
  caseBody: 'Another dump filled the disk. Subject found it with df/du and cleared the files.'
});
