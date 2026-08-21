//! help / hint / man / identity. Matches `js/commands/help.js`.

use crate::missions;

use super::super::exec::Shell;
use super::super::output::Output;

const GLOBAL_HELP: &str = "\
Available commands:
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
  history, clear       terminal";

/// Tab-complete names. Matches `Terminal.COMMANDS` in `js/terminal.js`.
pub const COMMANDS: &[&str] = &[
    "help", "hint", "man", "clear", "cls", "history", "whoami", "id", "hostname", "pwd",
    "date", "uptime", "uname", "echo", "cat", "less", "more", "head", "tail", "wc", "sort",
    "uniq", "ls", "cd", "mkdir", "rmdir", "touch", "rm", "cp", "mv", "chmod", "find", "grep",
    "file", "ps", "kill", "pkill", "df", "du", "netstat", "ss", "last", "who", "crontab",
    "env", "passwd", "ssh", "ping", "virsh", "mount", "umount", "lsblk", "reboot", "exit",
];

impl Shell {
    /// Completions for the last token of `value` (first word = commands, else paths).
    pub fn completions(&self, value: &str) -> Vec<String> {
        let trimmed_start = value.trim_start();
        let trailing_space = trimmed_start.ends_with(' ');
        let parts: Vec<&str> = trimmed_start.split_whitespace().collect();
        let is_first = parts.len() <= 1 && !trailing_space;
        let partial = if trailing_space {
            ""
        } else {
            parts.last().copied().unwrap_or("")
        };
        if is_first {
            let p = partial.to_ascii_lowercase();
            return COMMANDS
                .iter()
                .filter(|c| c.starts_with(&p))
                .map(|s| (*s).to_string())
                .collect();
        }
        let cmd = parts.first().copied().unwrap_or("").to_ascii_lowercase();
        if cmd == "man" {
            let p = partial.to_ascii_lowercase();
            return COMMANDS
                .iter()
                .filter(|c| c.starts_with(&p))
                .map(|s| (*s).to_string())
                .collect();
        }
        path_complete(&self.vfs, &self.cwd, &self.home, partial)
    }

    pub(crate) fn cmd_help(&mut self) -> Output {
        self.ctx.used_help = true;
        if let Some(id) = &self.mission_id {
            if let Some(m) = missions::get(id) {
                return Output::ok(m.help);
            }
        }
        Output::ok(GLOBAL_HELP)
    }

    pub(crate) fn cmd_hint(&mut self) -> Output {
        let Some(id) = self.mission_id.clone() else {
            return Output::err("no mission loaded");
        };
        let Some(m) = missions::get(&id) else {
            return Output::err("no mission loaded");
        };
        self.ctx.used_hint = true;
        self.ctx.hint_level = self.ctx.hint_level.saturating_add(1);
        Output::ok((m.hint)(&self.ctx, &self.vfs))
    }

    pub(crate) fn cmd_man(&mut self, args: &[String]) -> Output {
        let topic = args.first().map(|s| s.to_ascii_lowercase()).unwrap_or_default();
        if topic.is_empty() {
            return Output::ok(
                "What manual page do you want?\nTry: man ls   man grep   man chmod   man ps",
            );
        }
        self.ctx.used_man = true;
        match man_page(&topic) {
            Some(page) => Output::ok(page),
            None => Output::err(format!("No manual entry for {topic}")),
        }
    }

    pub(crate) fn cmd_clear(&mut self) -> Output {
        Output::clear_screen()
    }

    pub(crate) fn cmd_history(&self) -> Output {
        let body = self
            .history
            .iter()
            .enumerate()
            .map(|(i, h)| format!("  {}  {h}", i + 1))
            .collect::<Vec<_>>()
            .join("\n");
        Output::ok(body)
    }

    pub(crate) fn cmd_id(&self) -> Output {
        if self.user == "root" {
            Output::ok("uid=0(root) gid=0(root) groups=0(root)")
        } else {
            Output::ok("uid=1000(itguy) gid=1000(itguy) groups=1000(itguy)")
        }
    }

    pub(crate) fn cmd_uname(&self, args: &[String]) -> Output {
        if args.iter().any(|a| a == "-a") {
            Output::ok(format!(
                "Linux {} 6.1.0-23-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.99-1 (2024) x86_64 GNU/Linux",
                self.host
            ))
        } else if args.iter().any(|a| a == "-r") {
            Output::ok("6.1.0-23-amd64")
        } else {
            Output::ok("Linux")
        }
    }

    pub(crate) fn cmd_env(&self) -> Output {
        Output::ok(format!(
            "USER={}\nHOME={}\nPWD={}\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            self.user, self.home, self.cwd
        ))
    }

    pub(crate) fn cmd_echo(&self, args: &[String]) -> Output {
        Output::ok(args.join(" "))
    }

    /// Motif prompt: `user@host:~$` / `root@precinct-13:/var#`.
    pub fn prompt(&self) -> String {
        let display = if self.cwd == self.home {
            "~".to_string()
        } else if let Some(rest) = self.cwd.strip_prefix(&format!("{}/", self.home)) {
            format!("~/{rest}")
        } else {
            self.cwd.clone()
        };
        let sigil = if self.user == "root" { '#' } else { '$' };
        format!("{}@{}:{display}{sigil}", self.user, self.host)
    }
}

fn path_complete(vfs: &crate::vfs::Node, cwd: &str, home: &str, partial: &str) -> Vec<String> {
    let (dir_raw, name_part) = match partial.rfind('/') {
        Some(cut) => (&partial[..=cut], &partial[cut + 1..]),
        None => ("", partial),
    };
    let dir_path = if dir_raw.is_empty() {
        cwd.to_string()
    } else {
        crate::vfs::abs(cwd, dir_raw, home)
    };
    let Some(res) = crate::vfs::resolve(vfs, "/", &dir_path, home) else {
        return Vec::new();
    };
    if !res.node.is_dir() {
        return Vec::new();
    }
    let Some(ch) = res.node.children() else {
        return Vec::new();
    };
    let stem = &partial[..partial.len() - name_part.len()];
    let mut out: Vec<String> = ch
        .iter()
        .filter(|(n, _)| {
            n.starts_with(name_part) && (!n.starts_with('.') || name_part.starts_with('.'))
        })
        .map(|(n, node)| {
            let slash = if node.is_dir() { "/" } else { "" };
            format!("{stem}{n}{slash}")
        })
        .collect();
    out.sort();
    out
}

fn man_page(topic: &str) -> Option<&'static str> {
    Some(match topic {
        "ls" => "LS(1)\n\nNAME\n    ls — list directory contents\n\nSYNOPSIS\n    ls [-l] [-a] [FILE...]\n\n    -l   long listing (permissions, owner, size)\n    -a   include hidden files (names starting with .)\n    -la  both",
        "cd" => "CD(1)\n\nNAME\n    cd — change the working directory\n\nSYNOPSIS\n    cd [DIR]\n    cd ~     home\n    cd /     root\n    cd ..    parent",
        "cat" => "CAT(1)\n\nNAME\n    cat — concatenate and print files\n\nSYNOPSIS\n    cat FILE...",
        "less" => "LESS(1)\n\nNAME\n    less — view a file one page at a time\n\nSYNOPSIS\n    less FILE\n    command | less\n\n    space, f    next page\n    b           previous page\n    q           quit\n    more        same idea, older name",
        "more" => "MORE(1)\n\nNAME\n    more — page through a file\n\n    space    next page\n    b        previous page\n    q        quit",
        "chmod" => "CHMOD(1)\n\nNAME\n    chmod — change file mode bits\n\nSYNOPSIS\n    chmod MODE FILE...\n\n    644  rw-r--r--   normal file\n    755  rwxr-xr-x   executable / directory\n    600  rw-------   private\n    000  ---------   nobody can read\n\n    chmod 644 *      all files in this directory",
        "grep" => "GREP(1)\n\nNAME\n    grep — print lines that match a pattern\n\nSYNOPSIS\n    grep [-i] [-r] PATTERN [FILE...]\n    command | grep PATTERN\n\n    -i   ignore case\n    -r   recurse into directories. No FILE means the current directory.",
        "find" => "FIND(1)\n\nNAME\n    find — search for files in a directory hierarchy\n\nSYNOPSIS\n    find [PATH] [-name GLOB] [-type f|d]\n\n    find /var/log -name \"*.log\"\n    find /opt -name \".*\"",
        "ps" => "PS(1)\n\nNAME\n    ps — report a snapshot of current processes\n\nSYNOPSIS\n    ps\n    ps aux     full list with CPU, user, command",
        "kill" => "KILL(1)\n\nNAME\n    kill — send a signal to a process\n\nSYNOPSIS\n    kill PID\n    kill -9 PID     SIGKILL, cannot be ignored\n    pkill NAME      kill by command name",
        "pkill" => "PKILL(1)\n\nNAME\n    pkill — signal processes by name\n\nSYNOPSIS\n    pkill PATTERN",
        "df" => "DF(1)\n\nNAME\n    df — report file system disk space usage\n\nSYNOPSIS\n    df -h",
        "du" => "DU(1)\n\nNAME\n    du — estimate file space usage\n\nSYNOPSIS\n    du -sh PATH     summary, human readable\n    du *            each entry",
        "rm" => "RM(1)\n\nNAME\n    rm — remove files or directories\n\nSYNOPSIS\n    rm FILE...\n    rm -r DIR       recursive\n    rm -rf DIR      recursive, no prompt",
        "head" => "HEAD(1)\n\n    head -n 20 FILE     first 20 lines",
        "tail" => "TAIL(1)\n\n    tail -n 20 FILE     last 20 lines",
        "wc" => "WC(1)\n\n    wc FILE     lines, words, bytes",
        "netstat" => "NETSTAT(8)\n\n    netstat     list sockets\n    ss          same idea, modern spelling",
        "ss" => "SS(8)\n\n    ss     list sockets (alias of netstat here)",
        "crontab" => "CRONTAB(1)\n\n    crontab -l     list cron jobs\n    Also check /etc/crontab and /etc/cron.d/",
        "last" => "LAST(1)\n\n    last     show recent logins",
        "mount" => "MOUNT(8)\n\nNAME\n    mount — mount a filesystem\n\nSYNOPSIS\n    mount\n    mount DEVICE DIR\n    umount DIR|DEVICE",
        "umount" => "UMOUNT(8)\n\n    umount DIR     detach a filesystem",
        "lsblk" => "LSBLK(8)\n\n    lsblk     list block devices and mount points",
        "virsh" => "VIRSH(1)\n\nNAME\n    virsh — guest manager (tiny)\n\nSYNOPSIS\n    virsh list\n    virsh console GUEST\n    virsh attach-disk GUEST SIZE\n    virsh reboot GUEST\n\n    SIZE is 200M, 1G, or a number of megabytes.",
        "reboot" => "REBOOT(8)\n\n    reboot          reboot the guest (from its console)\n    virsh reboot VM  reboot a guest from the host\n\n    The host will refuse. That is policy.",
        "fstab" => "FSTAB(5)\n\n    /etc/fstab     filesystems mounted at boot\n\n    device  mount-point  type  options  dump  pass\n    /dev/sdb1  /var/lib/booking  ext4  defaults  0  2\n\n    mount is for now. fstab is for next boot.",
        "ssh" => "SSH(1)\n\nNAME\n    ssh — log into a remote host\n\nSYNOPSIS\n    ssh HOST\n    ssh user@HOST\n\n    ssh precinct-13     the HV / ticket box\n    ssh booking-vm      the booking guest\n    ssh coffee.lan      copier VLAN appliance\n    ping HOST           the box is already up\n    exit                come back one hop\n\n    The LAN is running before you sit down. Tickets are problems on those boxes.",
        "ping" => "PING(8)\n\n    ping HOST     two packets. The LAN is already up.",
        "man" => "MAN(1)\n\n    man COMMAND     read the manual",
        "help" => "HELP(1)\n\n    help     what THIS job wants. Not the whole Unix.",
        "hint" => "HINT(1)\n\n    hint     a nudge. costs score. gets more specific.",
        _ => return None,
    })
}
