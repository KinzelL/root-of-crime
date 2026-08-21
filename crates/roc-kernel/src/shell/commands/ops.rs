//! Process / disk / net / cron. Matches `js/commands/ops.js`.

use crate::lan;
use crate::proc::{default_connections, Proc};
use crate::vfs::{self, size_of};

use super::super::exec::Shell;
use super::super::output::Output;

impl Shell {
    fn live_processes(&self) -> Vec<&Proc> {
        self.ctx
            .processes
            .as_ref()
            .map(|ps| ps.iter().filter(|p| !p.dead).collect())
            .unwrap_or_default()
    }

    fn kill_pid(&mut self, pid: i32, signal: &str) -> Output {
        if self.ctx.processes.is_none() {
            return Output::err("kill: no process table in this context");
        }
        let snapshot = {
            let procs = self.ctx.processes.as_mut().unwrap();
            let Some(proc) = procs.iter_mut().find(|p| p.pid == pid && !p.dead) else {
                return Output::err(format!("kill: ({pid}) - No such process"));
            };
            if pid == 1 || proc.protected {
                return Output::err(format!("kill: ({pid}) - Operation not permitted"));
            }
            proc.dead = true;
            proc.clone()
        };
        self.ctx.killed.push(snapshot.clone());
        let name = snapshot
            .cmd
            .split(' ')
            .next()
            .unwrap_or("")
            .rsplit('/')
            .next()
            .unwrap_or("");
        let word = if signal == "KILL" { "Killed" } else { "Terminated" };
        Output::ok(format!("[1]  + {word}                 {name}"))
    }

    pub(crate) fn cmd_ps(&mut self, args: &[String]) -> Output {
        let procs = self.live_processes();
        if procs.is_empty() {
            return Output::ok("  PID TTY          TIME CMD\n    1 ?            00:00:12 init");
        }
        let long = args.iter().any(|a| {
            let flags = a.trim_start_matches('-');
            flags.chars().any(|c| matches!(c, 'a' | 'u' | 'x' | 'e' | 'f'))
                || a == "aux"
                || a == "-aux"
                || a == "-ef"
        });
        if long {
            let mut lines = vec!["USER         PID %CPU %MEM    TTY      STAT START   TIME COMMAND".to_string()];
            for p in &procs {
                let line = format!(
                    "{:<12}{:<6}{:<5}{:<5}  {:<7} S    {:<7}{} {}",
                    p.user, p.pid, p.cpu, p.mem, p.tty, p.start, p.time, p.cmd
                );
                lines.push(line);
            }
            return Output::ok(lines.join("\n"));
        }
        let mut lines = vec!["  PID TTY          TIME CMD".to_string()];
        for p in &procs {
            let cmd0 = p.cmd.split(' ').next().unwrap_or("");
            lines.push(format!(
                " {:>5} {:<12} {} {cmd0}",
                p.pid, p.tty, p.time
            ));
        }
        Output::ok(lines.join("\n"))
    }

    pub(crate) fn cmd_kill(&mut self, args: &[String]) -> Output {
        if self.ctx.processes.is_none() {
            return Output::err("kill: no process table in this context");
        }
        let mut signal = "TERM";
        let mut rest = Vec::new();
        for a in args {
            if matches!(a.as_str(), "-9" | "-KILL" | "-SIGKILL") {
                signal = "KILL";
            } else if matches!(a.as_str(), "-15" | "-TERM" | "-SIGTERM") {
                signal = "TERM";
            } else {
                rest.push(a.as_str());
            }
        }
        if rest.is_empty() {
            return Output::err("kill: usage: kill [-9] <PID>");
        }
        let pid: i32 = match rest[0].parse() {
            Ok(n) if n != 0 => n,
            _ => return Output::err("kill: usage: kill [-9] <PID>"),
        };
        self.kill_pid(pid, signal)
    }

    pub(crate) fn cmd_pkill(&mut self, args: &[String]) -> Output {
        if self.ctx.processes.is_none() {
            return Output::err("pkill: no process table in this context");
        }
        let pattern = args.first().map(|s| s.to_ascii_lowercase()).unwrap_or_default();
        if pattern.is_empty() {
            return Output::err("pkill: usage: pkill <pattern>");
        }
        let pids: Vec<i32> = self
            .live_processes()
            .into_iter()
            .filter(|p| {
                let cmd = p.cmd.to_ascii_lowercase();
                let base = cmd.rsplit('/').next().unwrap_or("");
                cmd.contains(&pattern) || base.contains(&pattern)
            })
            .map(|p| p.pid)
            .collect();
        if pids.is_empty() {
            return Output::err(format!(
                "pkill: no process found matching '{}'",
                args.first().map(String::as_str).unwrap_or("")
            ));
        }
        let mut results = Vec::new();
        for pid in pids {
            let r = self.kill_pid(pid, "TERM");
            if !r.stdout.is_empty() {
                results.push(r.stdout.trim().to_string());
            }
        }
        Output::ok(results.join("\n"))
    }

    pub(crate) fn cmd_df(&mut self, args: &[String]) -> Output {
        if let Some(id) = self.attached.clone() {
            if let Some(table) = self.with_guest_mut(&id, |g| crate::virt::df_table(g)) {
                return Output::ok(table);
            }
        }
        let used = size_of(&self.vfs) as u64;
        let total = self.ctx.disk_total.unwrap_or(512_000);
        let avail = total.saturating_sub(used);
        let pct = ((used as f64 / total as f64) * 100.0).round() as u64;
        let pct = pct.min(99);
        let human = args.iter().any(|a| a == "-h" || a == "-H");
        let fmt = |n: u64| -> String {
            if !human {
                format!("{}K", (n as f64 / 1024.0).round().max(0.0) as u64)
            } else if n < 1024 {
                format!("{n}B")
            } else if n < 1024 * 1024 {
                format!("{}K", (n as f64 / 1024.0).round() as u64)
            } else {
                format!("{:.1}M", n as f64 / (1024.0 * 1024.0))
            }
        };
        if human {
            Output::ok(format!(
                "Filesystem      Size  Used Avail Use% Mounted on\n\
                 /dev/sda1      {:>5} {:>5} {:>5}  {:>3}% /",
                fmt(total),
                fmt(used),
                fmt(avail),
                pct
            ))
        } else {
            Output::ok(format!(
                "Filesystem     1K-blocks    Used Available Use% Mounted on\n\
                 /dev/sda1      {:>9} {:>7} {:>9}  {:>3}% /",
                fmt(total),
                fmt(used),
                fmt(avail),
                pct
            ))
        }
    }

    pub(crate) fn cmd_du(&mut self, args: &[String]) -> Output {
        let human = args.iter().any(|a| a == "-h" || a == "-sh" || a == "-hs");
        let summarize = args.iter().any(|a| a == "-s" || a == "-sh" || a == "-hs");
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        let default = ["."];
        let targets: Vec<&str> = if paths.is_empty() {
            default.to_vec()
        } else {
            paths
        };
        let format = |n: usize| -> String {
            if !human {
                (n as f64 / 1024.0).round().max(1.0).to_string()
            } else if n < 1024 {
                format!("{n}B")
            } else if n < 1024 * 1024 {
                format!("{}K", (n as f64 / 1024.0).round() as u64)
            } else {
                format!("{:.1}M", n as f64 / (1024.0 * 1024.0))
            }
        };
        let mut lines = Vec::new();
        for target in &targets {
            let Some(res) = vfs::resolve(&self.vfs, &self.cwd, target, &self.home) else {
                return Output::err(format!(
                    "du: cannot access '{target}': No such file or directory"
                ));
            };
            if summarize || res.node.is_file() || targets.len() > 1 {
                lines.push(format!("{}\t{target}", format(size_of(res.node))));
                continue;
            }
            if let Some(children) = res.node.children() {
                for (name, child) in children {
                    lines.push(format!("{}\t{name}", format(size_of(child))));
                }
            }
            lines.push(format!("{}\t.", format(size_of(res.node))));
        }
        Output::ok(lines.join("\n"))
    }

    pub(crate) fn cmd_netstat(&mut self) -> Output {
        let owned = self.ctx.connections.clone();
        let fallback = default_connections();
        let conns = owned.as_deref().unwrap_or(&fallback);
        let mut lines = vec![
            "Proto Local Address           Foreign Address         State       PID/Program name"
                .to_string(),
        ];
        for c in conns {
            lines.push(format!(
                "{:<5} {:<22} {:<23} {:<11} {}",
                c.proto, c.local, c.remote, c.state, c.proc
            ));
        }
        self.ctx.used_netstat = true;
        Output::ok(lines.join("\n"))
    }

    pub(crate) fn cmd_last(&mut self) -> Output {
        self.ctx.used_last = true;
        let base = "root     tty1         Fri Aug 14 19:02   still logged in\n\
                    chief    pts/0        Fri Aug 14 18:55   still logged in\n\
                    miller   pts/2        Fri Aug 14 17:10 - 17:44  (00:34)\n";
        Output::ok(format!("{base}{}", self.ctx.last_log))
    }

    pub(crate) fn cmd_who(&mut self) -> Output {
        Output::ok(
            "root     tty1         2026-08-14 19:02\nchief    pts/0        2026-08-14 18:55",
        )
    }

    pub(crate) fn cmd_crontab(&mut self, args: &[String]) -> Output {
        if !args.iter().any(|a| a == "-l") && args.first().map(String::as_str) != Some("-l") {
            return Output::err("crontab: usage: crontab -l");
        }
        let mut out = String::new();
        if let Some(file) = vfs::resolve(&self.vfs, "/", "/etc/crontab", &self.home) {
            if let Some(c) = file.node.content() {
                out.push_str(c);
            }
        }
        if let Some(dir) = vfs::resolve(&self.vfs, "/", "/etc/cron.d", &self.home) {
            if let Some(children) = dir.node.children() {
                for (name, node) in children {
                    out.push_str(&format!(
                        "\n# /etc/cron.d/{name}\n{}",
                        node.content().unwrap_or("")
                    ));
                }
            }
        }
        self.ctx.used_crontab = true;
        Output::ok(out)
    }

    pub(crate) fn cmd_passwd(&mut self, args: &[String]) -> Output {
        let target = args.first().map(String::as_str).unwrap_or("root");
        if let Some(allow) = self.ctx.allow_passwd_for.clone() {
            if target == allow || (args.is_empty() && allow == "root") {
                self.ctx.password_changed.push(allow.clone());
                return Output::ok(format!(
                    "Changing password for {allow}.\nNew password: ********\npasswd: password updated successfully"
                ));
            }
        }
        if target == "coffee" || target == "beantek" {
            self.ctx.password_changed.push("coffee".into());
            return Output::ok(
                "Changing password for coffee.\nNew password: ********\npasswd: password updated successfully",
            );
        }
        Output::err(
            "passwd: Authentication token manipulation error\n(This console only lets you rotate the appliance account.)",
        )
    }

    pub(crate) fn cmd_ping(&mut self, args: &[String]) -> Output {
        let raw = args.first().map(|s| s.trim()).unwrap_or("");
        if raw.is_empty() || raw.starts_with('-') {
            return Output::err("usage: ping HOST");
        }
        let Some(rec) = lan::catalog(raw) else {
            return Output::err(format!("ping: {raw}: Name or service not known"));
        };
        Output::ok(format!(
            "PING {id} ({addr}) 56(84) bytes of data.\n\
             64 bytes from {id} ({addr}): icmp_seq=1 ttl=64 time=0.4 ms\n\
             64 bytes from {id} ({addr}): icmp_seq=2 ttl=64 time=0.3 ms\n\
             --- {id} ping statistics ---\n\
             2 packets transmitted, 2 received, 0% packet loss",
            id = rec.id,
            addr = rec.addr
        ))
    }
}
