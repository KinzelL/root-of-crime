/* ROOT OF CRIME – help / identity / man pages */

Object.assign(Terminal, {
  _globalHelp() {
    return `Available commands:
  help, hint, man      help / contextual hint / manual
  ls, cd, pwd, cat     navigate and read
  less, more           page through a file (space / b / q)
  grep, find, wc       search and count
  chmod, rm, mkdir     change the system
  ps, kill, pkill      processes
  df, du, netstat, ss  disk and network
  ssh, ping            the LAN is up. jump to a host
  virsh, mount, lsblk  guests and disks
  reboot               guest only. the host refuses.
  history, clear       terminal`;
  },

  _cmdHelp() {
    if (this.ctx) this.ctx.usedHelp = true;
    const text = Missions.get(this.missionId)?.getHelp() || this._globalHelp();
    if (typeof Game !== 'undefined' && Game.ticketHelp) {
      const id = this.missionId;
      if (id) Game._notesFor(id).help = text;
      if (typeof Virt !== 'undefined' && Virt.page === 'ticket') Virt.paint();
      return this._ok('help filed on the ticket.');
    }
    return this._ok(text);
  },

  _cmdHint() {
    const mission = Missions.get(this.missionId);
    if (!mission) return this._err('no mission loaded');
    if (this.ctx) this.ctx.usedHint = true;
    const lines = mission.getHint(this.ctx, this.vfs);
    Game.onHintUsed();
    if (typeof Game !== 'undefined' && Game.recordTicketHint) {
      Game.recordTicketHint(lines);
      return this._ok('hint filed on the ticket.');
    }
    lines.forEach(({ text, cls }) => this.print(text, cls || 'info'));
    return this._ok('');
  },

  _cmdMan(args) {
    const topic = (args[0] || '').toLowerCase();
    const pages = MAN_PAGES;
    if (!topic) return this._ok('What manual page do you want?\nTry: man ls   man grep   man chmod   man ps');
    if (this.ctx) this.ctx.usedMan = true;
    if (!pages[topic]) return this._err(`No manual entry for ${topic}`);
    return this._ok(pages[topic]);
  },

  _cmdUname(args) {
    if (args.includes('-a')) {
        return this._ok('Linux ' + this.host + ' 6.1.0-23-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.99-1 (2024) x86_64 GNU/Linux');
    }
    if (args.includes('-r')) return this._ok('6.1.0-23-amd64');
    return this._ok('Linux');
  }
});

Terminal.define(['help', '?'], function () { return this._cmdHelp(); });
Terminal.define('hint', function () { return this._cmdHint(); });
Terminal.define('man', function (args) { return this._cmdMan(args); });
Terminal.define('clear', function () { this.clear(); return this._ok(''); });
Terminal.define('cls', function () { this.clear(); return this._ok(''); });
Terminal.define('history', function () {
  return this._ok(this.history.map((h, i) => '  ' + (i + 1) + '  ' + h).join('\n'));
});
Terminal.define('whoami', function () { return this._ok(this.user); });
Terminal.define('id', function () {
  if (this.user === 'root') return this._ok('uid=0(root) gid=0(root) groups=0(root)');
  return this._ok('uid=1000(itguy) gid=1000(itguy) groups=1000(itguy)');
});
Terminal.define('hostname', function () { return this._ok(this.host); });
Terminal.define('pwd', function () { return this._ok(this.cwd); });
Terminal.define('date', function () { return this._ok(new Date().toString()); });
Terminal.define('uptime', function () {
  return this._ok(' 21:14:02 up 13 days,  4:18,  3 users,  load average: 1.13, 0.88, 0.42');
});
Terminal.define('uname', function (args) { return this._cmdUname(args); });
Terminal.define('echo', function (args) { return this._ok(args.join(' ')); });
Terminal.define('env', function () {
  return this._ok('USER=' + this.user + '\nHOME=' + this.home + '\nPWD=' + this.cwd + '\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
});

const MAN_PAGES = {
  ls: `LS(1)\n\nNAME\n    ls — list directory contents\n\nSYNOPSIS\n    ls [-l] [-a] [FILE...]\n\n    -l   long listing (permissions, owner, size)\n    -a   include hidden files (names starting with .)\n    -la  both`,
  cd: `CD(1)\n\nNAME\n    cd — change the working directory\n\nSYNOPSIS\n    cd [DIR]\n    cd ~     home\n    cd /     root\n    cd ..    parent`,
  cat: `CAT(1)\n\nNAME\n    cat — concatenate and print files\n\nSYNOPSIS\n    cat FILE...`,
  less: `LESS(1)\n\nNAME\n    less — view a file one page at a time\n\nSYNOPSIS\n    less FILE\n    command | less\n\n    space, f    next page\n    b           previous page\n    q           quit\n    more        same idea, older name`,
  more: `MORE(1)\n\nNAME\n    more — page through a file\n\n    space    next page\n    b        previous page\n    q        quit`,
  chmod: `CHMOD(1)\n\nNAME\n    chmod — change file mode bits\n\nSYNOPSIS\n    chmod MODE FILE...\n\n    644  rw-r--r--   normal file\n    755  rwxr-xr-x   executable / directory\n    600  rw-------   private\n    000  ---------   nobody can read\n\n    chmod 644 *      all files in this directory`,
  grep: `GREP(1)\n\nNAME\n    grep — print lines that match a pattern\n\nSYNOPSIS\n    grep [-i] [-r] PATTERN [FILE...]\n    command | grep PATTERN\n\n    -i   ignore case\n    -r   recurse into directories. No FILE means the current directory.`,
  find: `FIND(1)\n\nNAME\n    find — search for files in a directory hierarchy\n\nSYNOPSIS\n    find [PATH] [-name GLOB] [-type f|d]\n\n    find /var/log -name "*.log"\n    find /opt -name ".*"`,
  ps: `PS(1)\n\nNAME\n    ps — report a snapshot of current processes\n\nSYNOPSIS\n    ps\n    ps aux     full list with CPU, user, command`,
  kill: `KILL(1)\n\nNAME\n    kill — send a signal to a process\n\nSYNOPSIS\n    kill PID\n    kill -9 PID     SIGKILL, cannot be ignored\n    pkill NAME      kill by command name`,
  pkill: `PKILL(1)\n\nNAME\n    pkill — signal processes by name\n\nSYNOPSIS\n    pkill PATTERN`,
  df: `DF(1)\n\nNAME\n    df — report file system disk space usage\n\nSYNOPSIS\n    df -h`,
  du: `DU(1)\n\nNAME\n    du — estimate file space usage\n\nSYNOPSIS\n    du -sh PATH     summary, human readable\n    du *            each entry`,
  rm: `RM(1)\n\nNAME\n    rm — remove files or directories\n\nSYNOPSIS\n    rm FILE...\n    rm -r DIR       recursive\n    rm -rf DIR      recursive, no prompt`,
  head: `HEAD(1)\n\n    head -n 20 FILE     first 20 lines`,
  tail: `TAIL(1)\n\n    tail -n 20 FILE     last 20 lines`,
  wc: `WC(1)\n\n    wc FILE     lines, words, bytes`,
  netstat: `NETSTAT(8)\n\n    netstat     list sockets\n    ss          same idea, modern spelling`,
  ss: `SS(8)\n\n    ss     list sockets (alias of netstat here)`,
  crontab: `CRONTAB(1)\n\n    crontab -l     list cron jobs\n    Also check /etc/crontab and /etc/cron.d/`,
  last: `LAST(1)\n\n    last     show recent logins`,
  mount: `MOUNT(8)\n\nNAME\n    mount — mount a filesystem\n\nSYNOPSIS\n    mount\n    mount DEVICE DIR\n    umount DIR|DEVICE`,
  umount: `UMOUNT(8)\n\n    umount DIR     detach a filesystem`,
  lsblk: `LSBLK(8)\n\n    lsblk     list block devices and mount points`,
  virsh: `VIRSH(1)\n\nNAME\n    virsh — guest manager (tiny)\n\nSYNOPSIS\n    virsh list\n    virsh console GUEST\n    virsh attach-disk GUEST SIZE\n    virsh reboot GUEST\n\n    SIZE is 200M, 1G, or a number of megabytes.`,
  reboot: `REBOOT(8)\n\n    reboot          reboot the guest (from its console)\n    virsh reboot VM  reboot a guest from the host\n\n    The host will refuse. That is policy.`,
  fstab: `FSTAB(5)\n\n    /etc/fstab     filesystems mounted at boot\n\n    device  mount-point  type  options  dump  pass\n    /dev/sdb1  /var/lib/booking  ext4  defaults  0  2\n\n    mount is for now. fstab is for next boot.`,
  ssh: `SSH(1)\n\nNAME\n    ssh — log into a remote host\n\nSYNOPSIS\n    ssh HOST\n    ssh user@HOST\n\n    ssh precinct-13     the HV / ticket box\n    ssh booking-vm      the booking guest\n    ssh coffee.lan      copier VLAN appliance\n    ping HOST           the box is already up\n    exit                come back one hop\n\n    The LAN is running before you sit down. Tickets are problems on those boxes.`,
  ping: `PING(8)\n\n    ping HOST     two packets. The LAN is already up.`,
  man: `MAN(1)\n\n    man COMMAND     read the manual`
};
