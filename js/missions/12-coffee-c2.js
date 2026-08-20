/* ---------- 08 Coffee C2 ---------- */
Missions.register({
  id: 'coffee-c2',
  order: 12,
  act: 2,
  lesson: 7,
  chapter: '2.7',
  title: 'The Appliance Problem',
  short: 'The coffee machine is calling home.',
  description:
    'Something on this LAN has an outbound session to 203.0.113.66 — the same address that logged in as mittens. Identify the socket and kill the process behind it.',
  objective: 'Identify the outbound session, then stop the process behind it.',
  difficulty: 'Medium',
  unlock: false,
  requires: ['disk-full'],
  skills: ['netstat', 'ss', 'ps', 'kill'],

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const processes = baseProcs();
    const coffee = processes.find((p) => p.pid === 2048);
    if (coffee) {
      coffee.cpu = '12.4';
      coffee.cmd = '/opt/coffee/coffee_machine_daemon --network --phone-home';
      coffee.highlight = true;
    }
    return {
      vfs,
      cwd: '/opt/coffee',
      ctx: {
        processes,
        hintLevel: 0,
        connections: [
          { proto: 'tcp', local: '0.0.0.0:22', remote: '0.0.0.0:*', state: 'LISTEN', proc: '42/sshd' },
          { proto: 'tcp', local: '127.0.0.1:631', remote: '0.0.0.0:*', state: 'LISTEN', proc: '631/cupsd' },
          { proto: 'tcp', local: '10.13.0.4:22', remote: '10.13.0.18:51022', state: 'ESTABLISHED', proc: '42/sshd' },
          {
            proto: 'tcp',
            local: '10.13.0.8:48221',
            remote: '203.0.113.66:4444',
            state: 'ESTABLISHED',
            proc: '2048/coffee_machine_daemon',
            highlight: true
          }
        ]
      },
      intro: `The kettle is a computer. Of course it is.

<span class="highlight">203.0.113.66:4444</span> is not a coffee vendor. Port 4444 is a cliché on purpose.

Use <span class="info">netstat</span> or <span class="info">ss</span>, then stop the process.
`
    };
  },

  isWon(ctx) {
    return isDead(ctx, (p) => p.pid === 2048 || (p.cmd || '').includes('coffee_machine_daemon'));
  },

  getHelp() {
    return `Network + process:
  netstat          sockets (also: ss)
  ps aux
  kill PID
  pkill coffee

Look at Foreign Address. Look at ESTABLISHED.`;
  },

  getHint(ctx) {
    return hintList(ctx, [
      [
        { text: '[HINT 1] List connections.', cls: 'info' },
        { text: 'Try:  netstat     or     ss', cls: 'muted' }
      ],
      [
        { text: '[HINT 2] One ESTABLISHED line goes to 203.0.113.66:4444.', cls: 'info' },
        { text: 'The last column is PID/program.', cls: 'muted' }
      ],
      [
        { text: '[HINT 3] Kill the appliance daemon.', cls: 'info' },
        { text: 'Try:  kill 2048     or    pkill coffee', cls: 'muted' }
      ]
    ]);
  },

  learned:
    '• <code>netstat</code> / <code>ss</code> — listening and established sockets<br>' +
    '• ESTABLISHED + a weird foreign IP is a conversation, not a setting<br>' +
    '• Port 4444 is a favorite of lazy reverse shells<br>' +
    '• IoT on the copier VLAN is how precincts get owned',

  successFlavor:
    'The outbound session drops. The coffee machine sulks and, against all odds, still brews.',

  chiefNote: 'The coffee machine was on a call. With whom, IT?'
,

  caseTitle: "C2 — 203.0.113.66:4444",
  caseBody: "coffee_machine_daemon held an ESTABLISHED session to the same host that logged in as mittens. Port 4444. Daemon killed. Coffee still pours. Unclear if that is good.",
  radio: [
    "[22:10] Netwatch: outbound 203.0.113.66:4444",
    "[22:11] You: That is the kettle.",
    "[22:18] Chief: Unplug it after this cup.",
    "[22:22] Miller: The cat dropped a USB. I picked it up. Sorry."
  ]
});
