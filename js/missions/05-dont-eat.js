/* ---------- 05 Don't Eat the Original ---------- */
Missions.register({
  id: 'dont-eat',
  order: 5,
  act: 1,
  lesson: 5,
  chapter: '1.5',
  title: 'Don\'t Eat the Original',
  short: 'Night shift redirected over the case file.',
  description:
    'Night shift ran ls > case_042.txt and ate the case. Two jobs, in order: put the backup back, then append a note with >> . One arrow (>) will eat it again.',
  objective: 'Restore the eaten case file, then append a note without replacing it again.',
  difficulty: 'Tutorial',
  unlock: false,
  requires: ['long-statement'],
  skills: ['cp', '>', '>>', 'echo', 'cat'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const locker = VFS.resolve(vfs, '/', '/evidence').node;
    locker.children['case_042.txt'] = VFS.file(
      'total 12\nusb_note.txt\ncase_scrap.txt\nblurry_cat.jpg\n',
      { mtime: 'Aug 14 21:02' }
    );
    locker.children['case_042.txt.bak'] = VFS.file(
      'Case #042\nSuspect: unknown\nLast seen near the coffee machine.\nUSB device logged at 03:04.\n',
      { mtime: 'Aug 14 14:22' }
    );
    locker.children['README'] = VFS.file(
      '>  replaces a file.\n>> appends.\nNight shift used the first one. Do not.\n'
    );
    return {
      vfs,
      cwd: '/evidence',
      ctx: { processes: baseProcs(), hintLevel: 0 },
      intro: `<span class="error">case_042.txt is a directory listing.</span> That is not a case file.

Two commands. Both of them.

  1. <span class="info">cp case_042.txt.bak case_042.txt</span>
  2. <span class="info">echo night shift ate the original &gt;&gt; case_042.txt</span>

One arrow <span class="error">&gt;</span> replaces. Two arrows <span class="info">&gt;&gt;</span> append. The slip tracks both.
`
    };
  },

  _progress(vfs) {
    const live = VFS.resolve(vfs, '/', '/evidence/case_042.txt');
    const bak = VFS.resolve(vfs, '/', '/evidence/case_042.txt.bak');
    const text = live && live.node.type === 'file' ? live.node.content : '';
    const bakText = bak && bak.node.type === 'file' ? bak.node.content : '';
    const restored = text.includes('USB device logged') && text.includes('Case #042');
    const appended = restored && (text.length > bakText.length || /night\s*shift/i.test(text));
    return { restored, appended };
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
    return `Redirects:
  cat FILE
  cp SRC DEST              safe restore
  cat FILE.bak > FILE      also a restore (overwrites FILE)
  echo TEXT >> FILE        append
  ls > FILE                replace FILE with a listing. This is how we got here.

  cp case_042.txt.bak case_042.txt
  echo "night shift ate the original" >> case_042.txt`;
  },

  getHint(ctx, vfs) {
    const p = vfs ? this._progress(vfs) : { restored: false, appended: false };
    if (!p.restored) {
      return [
        { text: '[HINT] Restore first. Copy the backup over the eaten file.', cls: 'info' },
        { text: 'Try:  cp case_042.txt.bak case_042.txt', cls: 'muted' },
        { text: 'Then: cat case_042.txt     — you should see Case #042.', cls: 'muted' }
      ];
    }
    return [
      { text: '[HINT] The case is back. Now append. Two arrows, not one.', cls: 'info' },
      { text: 'Try:  echo night shift ate the original >> case_042.txt', cls: 'muted' }
    ];
  },

  learned:
    '• <code>&gt;</code> replaces a file. The old bytes are gone<br>' +
    '• <code>&gt;&gt;</code> appends. The old bytes stay<br>' +
    '• <code>cp backup dest</code> is the polite restore<br>' +
    '• <code>ls &gt; important.txt</code> is how night shifts make work for morning',

  successFlavor:
    'The case file has a body again, plus a scar. That is what >> is for.',

  chiefNote: 'He knows > from >>. Promote him to “allowed near the printer.”',

  caseTitle: "Evidence — redirect accident",
  caseBody: "Night shift ran ls > case_042.txt. Subject restored from .bak and appended a scar with >>. One arrow eats. Two arrows remember."
});
