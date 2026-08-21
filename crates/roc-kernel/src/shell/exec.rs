//! Headless executor. Parses a line, expands globs, runs segments, pipes, redirects.

use crate::ctx::ShellCtx;
use crate::infra::{Infra, RemoteSession};
use crate::proc::base_procs;
use crate::vfs::{self, expand_glob, Node, WriteOpts, DEFAULT_HOME};

use super::output::Output;
use super::parse::{parse_line, ParsedLine, Redirect, RedirOp};

/// A headless terminal session: one VFS tree, cwd, and command table.
#[derive(Debug, Clone)]
pub struct Shell {
    pub vfs: Node,
    pub cwd: String,
    pub home: String,
    pub user: String,
    pub host: String,
    pub ctx: ShellCtx,
    pub history: Vec<String>,
    pub pager: Option<Pager>,
    pub infra: Infra,
    pub attached: Option<String>,
    pub remote: Option<String>,
    pub mission_id: Option<String>,
    stack: Vec<SessionSnap>,
}

#[derive(Debug, Clone)]
struct SessionSnap {
    vfs: Node,
    cwd: String,
    host: String,
    home: String,
    user: String,
    ctx: ShellCtx,
    attached: Option<String>,
    remote: Option<String>,
    mission_id: Option<String>,
}

/// Headless `less`/`more` state. Page size 20 matches JS when there is no DOM.
#[derive(Debug, Clone)]
pub struct Pager {
    pub lines: Vec<String>,
    pub pos: usize,
    pub title: String,
    pub page_size: usize,
}

impl Pager {
    pub fn visible(&self) -> String {
        let end = (self.pos + self.page_size).min(self.lines.len());
        self.lines[self.pos..end].join("\n")
    }

    pub fn at_end(&self) -> bool {
        self.pos + self.page_size >= self.lines.len()
    }

    pub fn status_line(&self) -> String {
        let slice_len = self.lines.len().saturating_sub(self.pos).min(self.page_size);
        let pct = if self.lines.is_empty() {
            100
        } else {
            let shown = self.pos + slice_len;
            let pct = ((shown as f64 / self.lines.len() as f64) * 100.0).round() as i32;
            pct.min(100)
        };
        if self.at_end() {
            format!("--END-- {}", self.title)
        } else {
            format!("--More--({pct}%) {}", self.title)
        }
    }

    fn clamp_pos(&mut self) {
        let max = self.lines.len().saturating_sub(self.page_size);
        if self.pos > max {
            self.pos = max;
        }
    }

    pub fn page(&mut self, dir: i32) {
        let delta = dir * self.page_size as i32;
        let next = self.pos as i32 + delta;
        self.pos = next.max(0) as usize;
        self.clamp_pos();
    }

    pub fn step_line(&mut self, dir: i32) {
        let next = self.pos as i32 + dir;
        self.pos = next.max(0) as usize;
        self.clamp_pos();
    }
}

impl Shell {
    pub fn new(vfs: Node) -> Self {
        Self {
            vfs,
            cwd: DEFAULT_HOME.to_string(),
            home: DEFAULT_HOME.to_string(),
            user: "itguy".to_string(),
            host: "closet".to_string(),
            ctx: ShellCtx {
                processes: Some(base_procs()),
                ..ShellCtx::default()
            },
            history: Vec::new(),
            pager: None,
            infra: Infra::new(),
            attached: None,
            remote: None,
            mission_id: None,
            stack: Vec::new(),
        }
    }

    pub fn with_base() -> Self {
        Self::new(vfs::create_base())
    }

    /// Closet jump host with the LAN booted. Matches `Terminal.ensureDesk`.
    pub fn with_desk() -> Self {
        let mut infra = Infra::new();
        let sess = infra.closet_session();
        let mut sh = Self::new(sess.vfs);
        sh.cwd = sess.cwd;
        sh.home = sess.home;
        sh.user = sess.user;
        sh.host = sess.host;
        sh.ctx = sess.ctx;
        sh.infra = infra;
        sh
    }

    fn snap(&self) -> SessionSnap {
        SessionSnap {
            vfs: self.vfs.clone(),
            cwd: self.cwd.clone(),
            host: self.host.clone(),
            home: self.home.clone(),
            user: self.user.clone(),
            ctx: self.ctx.clone(),
            attached: self.attached.clone(),
            remote: self.remote.clone(),
            mission_id: self.mission_id.clone(),
        }
    }

    fn apply_snap(&mut self, s: SessionSnap) {
        self.vfs = s.vfs;
        self.cwd = s.cwd;
        self.host = s.host;
        self.home = s.home;
        self.user = s.user;
        self.ctx = s.ctx;
        self.attached = s.attached;
        self.remote = s.remote;
        self.mission_id = s.mission_id;
    }

    fn apply_remote(&mut self, sess: RemoteSession, attached: Option<String>) {
        self.vfs = sess.vfs;
        self.cwd = sess.cwd;
        self.host = sess.host;
        self.home = sess.home;
        self.user = sess.user;
        self.ctx = sess.ctx;
        self.attached = attached;
        self.remote = Some(sess.id);
    }

    fn write_back(&mut self) {
        if let Some(t) = self.infra.ticket.as_mut() {
            let on_ticket = self.attached.as_deref() == Some(t.host.as_str())
                || self.remote.as_deref() == Some(t.host.as_str())
                || (self.host == t.host && (self.remote.is_some() || self.attached.is_some()));
            if on_ticket {
                t.vfs = self.vfs.clone();
                t.ctx = self.ctx.clone();
                t.cwd = self.cwd.clone();
            }
        }
        if self.attached.is_none() && self.remote.is_none() && self.host == "closet" {
            self.infra
                .save_host("closet", self.vfs.clone(), self.ctx.clone(), self.cwd.clone());
            return;
        }
        if let Some(att) = self.attached.clone() {
            self.infra.save_guest(&att, self.vfs.clone());
            self.infra.save_precinct_ctx(self.ctx.clone());
            return;
        }
        if let Some(remote) = self.remote.clone() {
            if remote != "closet" && remote != "booking-vm" {
                self.infra
                    .save_host(&remote, self.vfs.clone(), self.ctx.clone(), self.cwd.clone());
            }
        }
    }

    pub(crate) fn push_session(&mut self, sess: RemoteSession, attached: Option<String>) {
        self.write_back();
        self.stack.push(self.snap());
        self.apply_remote(sess, attached);
    }

    pub(crate) fn pop_session(&mut self) -> bool {
        if self.stack.is_empty() {
            return false;
        }
        self.write_back();
        let prev = self.stack.pop().unwrap();
        self.apply_snap(prev);
        self.sync_guests_from_infra();
        true
    }

    pub(crate) fn drop_to_desk(&mut self) {
        while self.pop_session() {}
        self.attached = None;
        self.remote = None;
        let sess = self.infra.closet_session();
        self.apply_remote(sess, None);
        self.remote = None;
    }

    fn sync_guests_from_infra(&mut self) {
        if self.host != "precinct-13" {
            return;
        }
        if let Some(g) = self.infra.guest("booking-vm").cloned() {
            self.ctx.guests.insert(g.id.clone(), g);
        }
    }

    pub(crate) fn stack_is_empty(&self) -> bool {
        self.stack.is_empty()
    }

    pub(crate) fn attach_guest(&mut self, sess: RemoteSession) -> Output {
        let id = sess.id.clone();
        let hostname = sess
            .guest
            .as_ref()
            .map(|g| g.hostname.clone())
            .unwrap_or_else(|| sess.host.clone());
        if self.remote.as_deref() == Some(id.as_str()) || self.attached.as_deref() == Some(id.as_str())
        {
            return Output::ok(format!("already on {hostname}"));
        }
        self.ctx.used_console = true;
        let mut ctx = sess.ctx.clone();
        ctx.used_console = true;
        let mut sess = sess;
        sess.ctx = ctx;
        self.push_session(sess, Some(id));
        Output::ok(format!("Connected to {hostname}. Type exit to return."))
    }

    pub(crate) fn attached_guest_id(&self) -> Option<String> {
        self.attached.clone()
    }

    /// Run `f` on a guest. If that guest is the attached session, `guest.vfs` is
    /// the live shell VFS for the duration of `f`.
    pub(crate) fn with_guest_mut<F, R>(&mut self, id: &str, f: F) -> Option<R>
    where
        F: FnOnce(&mut crate::guest::Guest) -> R,
    {
        let attached = self.attached.as_deref() == Some(id);
        let mut g = self.ctx.guests.remove(id)?;
        if attached {
            g.vfs = self.vfs.clone();
        }
        let r = f(&mut g);
        if attached {
            self.vfs = g.vfs.clone();
        }
        self.ctx.guests.insert(id.to_string(), g);
        Some(r)
    }

    pub(crate) fn guest_space(&mut self, path: &str, extra: u64) -> Result<(), String> {
        let Some(id) = self.attached.clone() else {
            return Ok(());
        };
        match self.with_guest_mut(&id, |g| crate::virt::ensure_space(g, path, extra)) {
            Some(Err(e)) => Err(e),
            _ => Ok(()),
        }
    }

    pub(crate) fn session_from_guest(&self, id: &str) -> Option<crate::infra::RemoteSession> {
        let g = self.ctx.guests.get(id)?;
        Some(crate::infra::RemoteSession {
            kind: crate::infra::SessionKind::Guest,
            id: g.id.clone(),
            host: g.hostname.clone(),
            user: "root".into(),
            home: "/root".into(),
            cwd: "/root".into(),
            vfs: g.vfs.clone(),
            ctx: self.ctx.clone(),
            guest: Some(g.clone()),
        })
    }


    /// Run one raw line. Empty / comments succeed with no output.
    pub fn run(&mut self, raw: &str) -> Output {
        if self.pager.is_some() {
            self.quit_pager();
        }
        if !raw.trim().is_empty() {
            self.history.push(raw.to_string());
        }
        match parse_line(raw) {
            ParsedLine::Empty => Output::ok(""),
            ParsedLine::Pipeline(p) => self.run_pipeline(p.segments, p.redirect),
        }
    }

    fn run_pipeline(
        &mut self,
        segments: Vec<super::Segment>,
        redirect: Option<Redirect>,
    ) -> Output {
        let mut stdin = String::new();
        let mut last = Output::ok("");
        for (i, seg) in segments.iter().enumerate() {
            last = self.run_segment(&seg.tokens, &stdin);
            stdin = last.stdout.clone();
            if last.code != 0 && i + 1 < segments.len() && stdin.is_empty() {
                break;
            }
        }
        if let Some(redir) = redirect {
            let body = last.stdout.clone();
            match self.write_redirect(&redir, &body) {
                Ok(()) => {
                    last.stdout.clear();
                }
                Err(msg) => {
                    last.stderr = format!("{}: {msg}", redir.op);
                    last.code = 1;
                    last.stdout.clear();
                }
            }
        }
        last
    }

    fn run_segment(&mut self, tokens: &[String], stdin: &str) -> Output {
        if tokens.is_empty() {
            return Output::ok("");
        }
        let name = tokens[0].as_str();
        let args = self.expand_args(&tokens[1..]);
        self.dispatch(name, &args, stdin)
    }

    fn expand_args(&self, args: &[String]) -> Vec<String> {
        let mut out = Vec::new();
        for a in args {
            if a.contains('*') || a.contains('?') {
                out.extend(expand_glob(&self.vfs, &self.cwd, a, &self.home));
            } else {
                out.push(a.clone());
            }
        }
        out
    }

    fn write_redirect(&mut self, redir: &Redirect, stdout: &str) -> Result<(), String> {
        let dest = vfs::abs(&self.cwd, &redir.path, &self.home);
        self.guest_space(&dest, crate::vfs::js_len(stdout) as u64)?;
        vfs::write(
            &mut self.vfs,
            &self.cwd,
            &redir.path,
            stdout,
            WriteOpts {
                home: Some(self.home.clone()),
                append: redir.op == RedirOp::Append,
                ..WriteOpts::default()
            },
        )
        .map_err(|e| e.message)
    }

    pub(crate) fn read_file(&self, path: &str) -> Result<OpenedFile, String> {
        let Some(res) = vfs::resolve(&self.vfs, &self.cwd, path, &self.home) else {
            return Err(format!("cat: {path}: No such file or directory"));
        };
        if res.node.is_dir() {
            return Err(format!("cat: {path}: Is a directory"));
        }
        if !vfs::readable(res.node) {
            return Err(format!("cat: {path}: Permission denied"));
        }
        Ok(OpenedFile {
            text: res.node.content().unwrap_or("").to_string(),
            path: res.path,
        })
    }

    pub(crate) fn note_read(&mut self, path: &str) {
        if !self.ctx.read_files.iter().any(|p| p == path) {
            self.ctx.read_files.push(path.to_string());
        }
    }

    pub fn quit_pager(&mut self) {
        self.pager = None;
    }

    /// Feed a pager key (` `, `b`, `q`, `j`, `k`, `g`, `G`, …). No-op if idle.
    pub fn pager_key(&mut self, key: &str) {
        if self.pager.is_none() {
            return;
        }
        match key {
            "q" | "Q" | "Escape" | "Ctrl-C" => {
                self.pager = None;
                return;
            }
            _ => {}
        }
        let pager = self.pager.as_mut().unwrap();
        match key {
            " " | "f" | "F" | "PageDown" => pager.page(1),
            "b" | "B" | "PageUp" => pager.page(-1),
            "Enter" | "j" | "ArrowDown" => pager.step_line(1),
            "k" | "ArrowUp" => pager.step_line(-1),
            "g" => pager.pos = 0,
            "G" => pager.pos = pager.lines.len().saturating_sub(pager.page_size),
            _ => {}
        }
    }

    fn dispatch(&mut self, name: &str, args: &[String], stdin: &str) -> Output {
        match name.to_ascii_lowercase().as_str() {
            "help" | "?" => self.cmd_help(),
            "hint" => self.cmd_hint(),
            "man" => self.cmd_man(args),
            "clear" | "cls" => self.cmd_clear(),
            "history" => self.cmd_history(),
            "whoami" => Output::ok(self.user.clone()),
            "id" => self.cmd_id(),
            "hostname" => Output::ok(self.host.clone()),
            "date" => Output::ok("Thu Aug 14 08:03:00 UTC 2025"),
            "uptime" => Output::ok(
                " 21:14:02 up 13 days,  4:18,  3 users,  load average: 1.13, 0.88, 0.42",
            ),
            "uname" => self.cmd_uname(args),
            "echo" => self.cmd_echo(args),
            "env" => self.cmd_env(),
            "cd" => self.cmd_cd(args),
            "ls" => self.cmd_ls(args),
            "pwd" => Output::ok(self.cwd.clone()),
            "mkdir" => self.cmd_mkdir(args),
            "rmdir" => self.cmd_rmdir(args),
            "touch" => self.cmd_touch(args),
            "rm" => self.cmd_rm(args),
            "cp" => self.cmd_cp(args),
            "mv" => self.cmd_mv(args),
            "chmod" => self.cmd_chmod(args),
            "find" => self.cmd_find(args),
            "file" => self.cmd_file(args),
            "cat" => self.cmd_cat(args, stdin),
            "less" | "more" => self.cmd_less(args, stdin),
            "head" => self.cmd_head_tail(args, stdin, "head"),
            "tail" => self.cmd_head_tail(args, stdin, "tail"),
            "wc" => self.cmd_wc(args, stdin),
            "sort" => self.cmd_sort(args, stdin),
            "uniq" => self.cmd_uniq(args, stdin),
            "grep" => self.cmd_grep(args, stdin),
            "ps" => self.cmd_ps(args),
            "kill" => self.cmd_kill(args),
            "pkill" => self.cmd_pkill(args),
            "df" => self.cmd_df(args),
            "du" => self.cmd_du(args),
            "netstat" | "ss" => self.cmd_netstat(),
            "last" => self.cmd_last(),
            "who" => self.cmd_who(),
            "crontab" => self.cmd_crontab(args),
            "passwd" => self.cmd_passwd(args),
            "ping" => self.cmd_ping(args),
            "ssh" => self.cmd_ssh(args),
            "exit" => self.cmd_exit(),
            "virsh" => self.cmd_virsh(args),
            "lsblk" => self.cmd_lsblk(),
            "mount" => self.cmd_mount(args),
            "umount" | "unmount" => self.cmd_umount(args),
            "reboot" => self.cmd_reboot(),
            _ => Output::err_code(
                format!("{name}: command not found\nType 'help' if you are lost."),
                127,
            ),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct OpenedFile {
    pub text: String,
    pub path: String,
}

pub(crate) fn retarget_cat(err: &str, cmd: &str) -> String {
    if let Some(rest) = err.strip_prefix("cat") {
        format!("{cmd}{rest}")
    } else {
        err.to_string()
    }
}
