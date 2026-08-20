/* ---------- 15 After the Reboot ---------- */
Missions.register({
  id: 'booking-fstab',
  order: 15,
  act: 3,
  lesson: 2,
  chapter: '3.2',
  title: 'After the Reboot',
  short: 'Night shift rebooted. The mount did not come back.',
  description:
    'You grew the disk. Night shift rebooted the guest “just to be sure.” The extra volume is still attached. The cases are still on it. Nothing is mounted. mount is for now. The file that remembers is /etc/fstab.',
  objective: 'Record the new disk so it survives a reboot, then reboot the guest and check.',
  difficulty: 'Hard',
  unlock: false,
  requires: ['booking-vm'],
  skills: ['fstab', 'reboot', 'virsh', 'mount'],
  virt: true,

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const guest = Virt.stageUnmountedVolume(Virt.makeBooking());
    const processes = baseProcs();
    processes.push(proc(
      2201, 'root', '4.1', '12.0', '?', '22:40', '00:02:11',
      '/usr/bin/qemu-system-x86_64 -name booking-vm -m 512',
      { highlight: true }
    ));
    return {
      vfs,
      cwd: '/home/itguy',
      ctx: {
        processes,
        hintLevel: 0,
        guests: { 'booking-vm': guest },
        usedConsole: false
      },
      intro: `Night shift rebooted <span class="info">booking-vm</span>. They are proud of themselves.

<span class="error">booking: database missing. /var/lib/booking is empty.</span>

The extra disk is still attached. The cases are on it. Nothing is mounted.
Write it down so the next boot finds it. Then reboot the guest — not the host.
`
    };
  },

  isWon(ctx) {
    return Virt.bookingPersisted(Virt.get(ctx));
  },

  objectives(ctx) {
    const guest = Virt.get(ctx);
    const persisted = Virt.bookingPersisted(guest);
    return [
      { label: 'Record the new disk so it comes back after a reboot', done: Virt.fstabReady(guest) },
      { label: 'Reboot the guest', done: !!(guest && guest.rebooted) },
      { label: 'Confirm the case database survived', done: persisted }
    ];
  },

  getHelp() {
    return `Mount is temporary:
  cat /etc/fstab
  echo '/dev/sdb1 /var/lib/booking ext4 defaults 0 2' >> /etc/fstab
  reboot                 from the guest console
  virsh reboot booking-vm
  (the Reboot button on the virt page is the same)

  The host will refuse to reboot. That is policy.
  After the guest comes back: df and ls /var/lib/booking`;
  },

  getHint(ctx) {
    const guest = Virt.get(ctx);
    if (!ctx.usedConsole && !Virt.fstabReady(guest)) {
      return [
        { text: '[HINT] The guest forgot the mount. You write that down inside the guest.', cls: 'info' },
        { text: 'Try:  virsh console booking-vm', cls: 'muted' }
      ];
    }
    if (!Virt.fstabReady(guest)) {
      return hintList(ctx, [
        [
          { text: '[HINT 1] Filesystems that should come back live in one file.', cls: 'info' },
          { text: 'Try:  cat /etc/fstab', cls: 'muted' }
        ],
        [
          { text: '[HINT 2] Append a line. Two arrows. Device, then where booking expects the data.', cls: 'info' },
          { text: "Try:  echo '/dev/sdb1 /var/lib/booking ext4 defaults 0 2' >> /etc/fstab", cls: 'muted' }
        ]
      ]);
    }
    if (!guest.rebooted) {
      return [
        { text: '[HINT] A line in fstab does nothing until the guest boots again.', cls: 'info' },
        { text: 'Try:  reboot     or from the host:  virsh reboot booking-vm', cls: 'muted' }
      ];
    }
    if (!Virt.bookingSettled(guest)) {
      return [
        { text: '[HINT] It came back wrong. Check the fstab line and reboot again.', cls: 'info' },
        { text: 'The mount point should be /var/lib/booking.', cls: 'muted' }
      ];
    }
    return [{ text: '[HINT] It survived. That is the whole lesson.', cls: 'info' }];
  },

  learned:
    '• <code>mount</code> lasts until reboot<br>' +
    '• <code>/etc/fstab</code> is what the next boot reads<br>' +
    '• device, mount point, type, options — one line<br>' +
    '• Reboot the guest. The host has a note about that',

  successFlavor:
    'The guest comes back. The cases are where booking left them. Night shift asks if they should reboot it again. You say no.',

  chiefNote: 'It stayed mounted. I still do not know what a guest is. File it anyway.',

  caseTitle: "Availability — booking-vm fstab",
  caseBody: "Night shift rebooted booking-vm after the disk grow. Mount did not come back. Subject wrote /etc/fstab and rebooted the guest. Cases survived. Night shift is not allowed to reboot the guest again.",
  notes: [
    "mount is now. fstab is next boot.",
    "Do not let night shift reboot the guest for fun.",
    "The host still refuses to reboot. Keep it that way.",
    "Booking filed INC-043. Miller wants a sandwich."
  ],
  radio: [
    "[22:41] Night desk: I rebooted the booking box. You're welcome.",
    "[22:42] Booking: database missing.",
    "[22:43] You: That is not how mounts work.",
    "[22:50] Chief: Is it back? Then I do not want the lecture."
  ]
});
