/* ---------- 14 The Booking Guest ---------- */
Missions.register({
  id: 'booking-vm',
  order: 14,
  act: 3,
  lesson: 1,
  chapter: '3.1',
  title: 'No Space Left on the Guest',
  short: 'The booking VM is full. Do not delete the cases.',
  description:
    'The booking appliance is a guest on this host. Its /var is a real /var — logs, cache, the case database — and the disk is full. Detectives cannot file INC-043. Do not delete the cases. Grow the guest.',
  objective: 'Give the booking guest a new disk and put the case database on it.',
  difficulty: 'Hard',
  unlock: false,
  requires: ['hidden-claws'],
  skills: ['virsh', 'lsblk', 'df', 'mount', 'mv'],
  virt: true,

  setup() {
    const vfs = VFS.clone(VFS.createBase());
    const guest = Virt.makeBooking();
    const processes = baseProcs();
    processes.push(proc(
      2201, 'root', '8.2', '12.0', '?', '19:00', '01:12:08',
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
      intro: `The host is fine. The <span class="info">booking-vm</span> guest is not.

<span class="error">booking: write failed: No space left on device</span>

The grey intranet page is Precinct Virt. Attach a volume there (or with virsh).
Then open a console and put the booking data on the new disk. Do not delete the cases.
`
    };
  },

  isWon(ctx) {
    return Virt.bookingSettled(Virt.get(ctx));
  },

  objectives(ctx) {
    const guest = Virt.get(ctx);
    const attached = !!(guest && guest.volumeAttached);
    const settled = Virt.bookingSettled(guest);
    return [
      { label: 'Give the booking guest another disk', done: attached },
      { label: 'Open a console on the guest', done: !!ctx.usedConsole },
      { label: 'Put the case database on the new disk', done: settled }
    ];
  },

  getHelp() {
    return `Host vs guest:
  virsh list                 guests on this host
  virsh attach-disk NAME SIZE   same as the form (example: 200M)
  virsh console NAME         same as the Console button
  exit                       leave the guest console

Inside the guest:
  df / lsblk                 disks and space
  mkdir /mnt/new
  mount /dev/sdb1 /mnt/new
  mv /var/lib/booking/* /mnt/new/
  umount /mnt/new
  mount /dev/sdb1 /var/lib/booking

The cases must stay. The new disk has to carry them.`;
  },

  getHint(ctx) {
    const guest = Virt.get(ctx);
    if (!guest || !guest.volumeAttached) {
      return hintList(ctx, [
        [
          { text: '[HINT 1] This is a guest. The host disk is not the problem.', cls: 'info' },
          { text: 'Look at the Precinct Virt page, or:  virsh list', cls: 'muted' }
        ],
        [
          { text: '[HINT 2] Attach a second disk. You have to pick a size first.', cls: 'info' },
          { text: 'Weigh the booking data (du), then type a bigger size on the virt page.', cls: 'muted' }
        ],
        [
          { text: '[HINT 3] The form wants megabytes. Or use virsh.', cls: 'info' },
          { text: 'Try:  virsh attach-disk booking-vm 200M', cls: 'muted' }
        ]
      ]);
    }
    if (!ctx.usedConsole) {
      return [
        { text: '[HINT] Disk is on the guest. You are still on the host.', cls: 'info' },
        { text: 'Try:  virsh console booking-vm     or hit Console on the page.', cls: 'muted' }
      ];
    }
    if (!guest.disks.some((d) => d.id === 'sdb' && d.mount)) {
      return [
        { text: '[HINT] Mount the new disk somewhere you can copy onto.', cls: 'info' },
        { text: 'Try:  mkdir /mnt/new     then     mount /dev/sdb1 /mnt/new', cls: 'muted' }
      ];
    }
    return [
      { text: '[HINT] Move the booking data onto the new disk, then mount that disk where booking expects it.', cls: 'info' },
      { text: 'Try:  mv /var/lib/booking/* /mnt/new/', cls: 'muted' },
      { text: 'Then: umount /mnt/new     and     mount /dev/sdb1 /var/lib/booking', cls: 'muted' }
    ];
  },

  learned:
    '• A guest has its own disk. <code>df</code> on the host will lie to you<br>' +
    '• <code>virsh</code> is the host side. <code>mount</code> is the guest side<br>' +
    '• Attaching a volume is not the same as using it<br>' +
    '• Delete is not the only fix. Sometimes the data has to stay',

  successFlavor:
    'INC-043 files. A detective swears the computer is fixed. The computer was two computers.',

  chiefNote: 'The booking box is a guest. I do not know what that means. IT does. Keep it that way.',

  caseTitle: "Availability — booking-vm disk",
  caseBody: "booking-vm /var was a real /var and it filled the only disk. Subject attached a second volume and moved the case database onto it. Cases were not deleted. INC-043 filed.",
  notes: [
    "Booking is a guest. Do not format the host.",
    "The cases stayed. That was the point.",
    "Ask virt.precinct why the appliance shipped with an 80M disk.",
    "Coffee machine is still a separate problem."
  ],
  radio: [
    "[22:28] Booking: No space left on device",
    "[22:29] Miller: I cannot file INC-043.",
    "[22:30] You: It is a guest. I am growing the disk.",
    "[22:36] Chief: I do not speak guest. File the incident."
  ]
});
