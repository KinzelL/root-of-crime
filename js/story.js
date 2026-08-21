/* ROOT OF CRIME – ranks and xman (case/notes/radio live on each mission) */

const RANKS = [
  { min: 0, name: 'RECRUIT' },
  { min: 1, name: 'IT TEMP' },
  { min: 3, name: 'DESK TECH' },
  { min: 6, name: 'SYSADMIN' },
  { min: 9, name: 'SENIOR' },
  { min: 12, name: 'INCIDENT LEAD' },
  { min: 15, name: 'ROOT' }
];

const APP_DOCS = [
  {
    id: 'twm',
    title: 'twm',
    body:
      'The window manager. Right-click the teal root for the menu. Desk icons open clients.\n\n' +
      'Every window has _, □/❐, and X. _ hides it and leaves it on the taskbar. □ fills the desk. X closes it and it leaves the bar until you open it again.\n\n' +
      'Esc iconifies the focused client. Click a task button to raise or minimize it. There is one workspace. Do not look for another.'
  },
  {
    id: 'netmoth',
    title: 'NetMoth',
    body:
      'The precinct intranet browser. It is ugly on purpose.\n\n' +
      'Bookmarks: tickets.precinct is the paper. mon.precinct is the board (red hosts). virt.precinct is the VM inventory. The location bar does not browse the real web.\n\n' +
      'File / Edit / View do nothing. Help opens this book on the page you are looking at.'
  },
  {
    id: 'tickets',
    title: 'TicketQueue',
    body:
      'Today’s work. Open NetMoth → mon.precinct for the red host. tickets.precinct is the paper trail.\n\n' +
      'The slip names the asset. ssh it in xterm. Stop it coming back, stop the noise, then Clear on the board.\n\n' +
      'Close ticket turns it in when the tracker is done. Clear is not close. Clear is the minigame.'
  },
  {
    id: 'mon',
    title: 'mon.precinct',
    body:
      'Shitty Nagios. Red host is the job.\n\n' +
      'Prevent: stop it coming back (cron, the looping job). Fix: kill the noise that is firing now. Clear: the button on this page.\n\n' +
      'If you Clear early it flaps. ACK is not a fix. xterm is how you cheat the board.'
  },
  {
    id: 'virt',
    title: 'Precinct Virt',
    body:
      'VM inventory. Tree on the left, details on the right. The LAN is already up: on-prem (precinct-13 + booking-vm) and copier-vlan (coffee.lan).\n\n' +
      'Select booking-vm in the tree to manage disks. Attach volume needs a size (200M). Console opens xterm and ssh’s the guest. Reboot is the guest, not the host.\n\n' +
      'Same jobs from the shell: virsh list, virsh attach-disk, virsh console, virsh reboot.'
  },
  {
    id: 'xterm',
    title: 'xterm',
    body:
      'The shell. Open the xterm icon on the desk (not xconsole). You land as itguy@closet. The prompt is the last line of the black scroll.\n\n' +
      'The LAN is up. ssh precinct-13, ssh booking-vm, ssh coffee.lan. ping HOST if you doubt it. exit comes back one hop.\n\n' +
      'Tab completes. Hidden names stay hidden unless you type a dot. hint costs score. man ls is the book for one command. Esc iconifies.'
  },
  {
    id: 'timeclock',
    title: 'timeclock',
    body:
      'The shift. 08:00–16:00. Close a ticket and the clock jumps. 16:00 punches you out.\n\n' +
      'Punch out asks first. Then SHIFT CLOSED: what you closed, leftovers that roll, score. Log off ends the day. Log in is tomorrow.\n\n' +
      'After 3.3 the campaign is over. Monday’s tickets are returning jobs. The closet stays open.'
  },
  {
    id: 'mail',
    title: 'mail',
    body:
      'NetMoth Mail. An ugly inbox from 2000.\n\n' +
      'Click a row to read it. Click From / Subject / Date to sort. Dates are in-game (Aug 14 and on). Get Msg checks the server and finds nothing.\n\n' +
      'Chief and Dispatch write here. Some messages point at the ticket board.'
  },
  {
    id: 'xconsole',
    title: 'xconsole',
    body:
      'The system log. /dev/console. It is not a shell and it does not take commands.\n\n' +
      'sshd and libvirtd lines mean the LAN is up. lp0 on fire is the printer. coffee.lan talking to a weird port is a later problem.\n\n' +
      'If you wanted to type, you wanted xterm.'
  },
  {
    id: 'casefile',
    title: 'casefile',
    body:
      'xedit — CASE.13. The incident file.\n\n' +
      'It fills when you close a case that wrote a caseTitle. Read it after a close. It is the story, not the job.'
  },
  {
    id: 'notes',
    title: 'notes',
    body:
      'The chief’s pad. Sticky notes from the latest case that left any.\n\n' +
      'It is flavor. The tracker on the ticket is the work.'
  },
  {
    id: 'radio',
    title: 'radio',
    body:
      'Dispatch chatter. Same rule as notes: the latest case that wrote radio lines.\n\n' +
      'The coffee machine talks here. That is not a joke.'
  },
  {
    id: 'xman',
    title: 'xman',
    body:
      'This book. Apps on the left. Commands under that.\n\n' +
      'Every fake app has a page. Help in that app jumps here. man COMMAND in xterm is the Unix page for one command.'
  },
  {
    id: 'twmprefs',
    title: 'twmprefs',
    body:
      'Preferences. CRT scanlines. Terminal beeps.\n\n' +
      'RESET PROGRESS wipes the save (roc_save_v1) and makes you a recruit again. The LAN reboots. The sandwich is still there.'
  },
  {
    id: 'gadgets',
    title: 'gadgets',
    body:
      'xclock is a clock. xeyes follow the pointer. xload is a load graph that is mostly decorative. xbiff is rank, score, and the in-game date.\n\n' +
      'They are furniture. They do not close tickets.'
  }
];

const MANUAL = [
  { cmd: 'ls', why: 'See names. ls -l for permissions. ls -la for hidden files.' },
  { cmd: 'cd', why: 'Move. cd ~  home. cd /  root. cd ..  up.' },
  { cmd: 'pwd', why: 'Print where you are. Use it when you are lost.' },
  { cmd: 'cat', why: 'Print a file. If it says Permission denied, look at chmod.' },
  { cmd: 'less / more', why: 'Page through a file. space/f next page, b back, q quit.' },
  { cmd: 'head / tail', why: 'First lines. Last lines. The useful sentence is rarely line one.' },
  { cmd: 'mkdir / mv / cp', why: 'Make a folder. Move is gone-from-here. Copy keeps the original.' },
  { cmd: '>  >>', why: 'One arrow replaces a file. Two arrows append. Night shift used one.' },
  { cmd: 'grep', why: 'Find a string. grep -r word DIR walks a tree. Also: cmd | grep word' },
  { cmd: 'find', why: 'Find files by name. find /var/log -name "*.log"' },
  { cmd: 'chmod', why: 'Change mode. 644 file, 755 dir, 000 nobody. chmod 644 *' },
  { cmd: 'ps / kill', why: 'ps aux lists processes. kill PID stops one. pkill name if you hate numbers.' },
  { cmd: 'df / du', why: 'df is the disk. du -sh PATH is a directory. Delete the fat one.' },
  { cmd: 'ssh / ping', why: 'The LAN is already up. ssh precinct-13, booking-vm, or coffee.lan. ping HOST if you doubt it. exit comes back.' },
  { cmd: 'virsh / mount / lsblk', why: 'Host vs guest. Attach a disk on the host. Mount it inside the guest. Do not delete the cases.' },
  { cmd: 'fstab / reboot', why: 'mount is for now. /etc/fstab is for next boot. Then reboot the guest, not the host.' },
  { cmd: 'netstat / ss', why: 'Who is talking on the network. ESTABLISHED to a weird IP is a conversation.' },
  { cmd: 'crontab', why: 'crontab -l and /etc/cron.d/ — this is how dead processes come back.' },
  { cmd: 'last / passwd', why: 'last shows logins. passwd coffee rotates the appliance account.' },
  { cmd: 'rm', why: 'rm file. rm -r dir. The game will refuse to rm / . Real life will not.' },
  { cmd: 'hint / man', why: 'hint costs score and gets more specific. man ls is a real manual page.' }
];

