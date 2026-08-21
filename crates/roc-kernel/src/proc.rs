//! Process table. Matches `proc` / `baseProcs` in `js/missions.js`.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Proc {
    pub pid: i32,
    pub user: String,
    pub cpu: String,
    pub mem: String,
    pub tty: String,
    pub start: String,
    pub time: String,
    pub cmd: String,
    pub dead: bool,
    pub protected: bool,
    pub highlight: bool,
}

pub fn proc(
    pid: i32,
    user: impl Into<String>,
    cpu: impl Into<String>,
    mem: impl Into<String>,
    tty: impl Into<String>,
    start: impl Into<String>,
    time: impl Into<String>,
    cmd: impl Into<String>,
) -> Proc {
    Proc {
        pid,
        user: user.into(),
        cpu: cpu.into(),
        mem: mem.into(),
        tty: tty.into(),
        start: start.into(),
        time: time.into(),
        cmd: cmd.into(),
        dead: false,
        protected: false,
        highlight: false,
    }
}

pub fn is_dead(ctx: &crate::ctx::ShellCtx, test: impl Fn(&Proc) -> bool) -> bool {
    ctx.killed.iter().any(&test)
        || ctx
            .processes
            .as_ref()
            .map(|ps| ps.iter().any(|p| p.dead && test(p)))
            .unwrap_or(false)
}

pub fn base_procs() -> Vec<Proc> {
    vec![
        {
            let mut p = proc(1, "root", "0.0", "0.1", "?", "Jun19", "00:00:12", "/sbin/init");
            p.protected = true;
            p
        },
        proc(42, "root", "0.0", "0.2", "?", "Jun19", "00:01:03", "/usr/sbin/sshd -D"),
        proc(631, "root", "0.0", "0.3", "?", "Jun19", "00:00:22", "/usr/sbin/cupsd -f"),
        proc(
            891,
            "root",
            "0.1",
            "0.4",
            "?",
            "Aug14",
            "00:00:08",
            "/usr/lib/systemd/systemd-journald",
        ),
        proc(
            2048,
            "coffee",
            "0.8",
            "1.2",
            "?",
            "Aug10",
            "00:45:12",
            "/opt/coffee/coffee_machine_daemon --network",
        ),
        proc(3141, "root", "0.0", "0.1", "?", "Jun19", "00:00:02", "/usr/sbin/cron -f"),
        proc(4096, "chief", "0.3", "2.4", "pts/0", "18:55", "00:03:21", "thunderbird"),
        proc(5120, "root", "0.0", "0.3", "pts/1", "19:02", "00:00:01", "-bash"),
    ]
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conn {
    pub proto: String,
    pub local: String,
    pub remote: String,
    pub state: String,
    pub proc: String,
    pub highlight: bool,
}

pub fn default_connections() -> Vec<Conn> {
    vec![
        Conn {
            proto: "tcp".into(),
            local: "0.0.0.0:22".into(),
            remote: "0.0.0.0:*".into(),
            state: "LISTEN".into(),
            proc: "sshd".into(),
            highlight: false,
        },
        Conn {
            proto: "tcp".into(),
            local: "127.0.0.1:631".into(),
            remote: "0.0.0.0:*".into(),
            state: "LISTEN".into(),
            proc: "cupsd".into(),
            highlight: false,
        },
    ]
}
