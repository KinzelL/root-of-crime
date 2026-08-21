//! Persistent precinct LAN. Matches `js/infra.js`.
//! Tickets overlay a problem; they do not create the box.

use std::collections::HashMap;

use crate::ctx::ShellCtx;
use crate::guest::Guest;
use crate::lan::{self, CATALOG};
use crate::proc::{base_procs, proc};
use crate::vfs::{self, file, Node};

#[derive(Debug, Clone)]
pub struct Machine {
    pub host: String,
    pub user: String,
    pub home: String,
    pub cwd: String,
    pub vfs: Node,
    pub ctx: ShellCtx,
    pub guest: Option<Guest>,
}

#[derive(Debug, Clone)]
pub struct RemoteSession {
    pub kind: SessionKind,
    pub id: String,
    pub host: String,
    pub user: String,
    pub home: String,
    pub cwd: String,
    pub vfs: Node,
    pub ctx: ShellCtx,
    pub guest: Option<Guest>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionKind {
    Host,
    Guest,
}

/// Optional ticket overlay (Game.ticketSession).
#[derive(Debug, Clone)]
pub struct TicketOverlay {
    pub id: String,
    pub host: String,
    pub vfs: Node,
    pub ctx: ShellCtx,
    pub cwd: String,
}

#[derive(Debug, Clone)]
pub struct Infra {
    booted: bool,
    machines: HashMap<String, Machine>,
    pub ticket: Option<TicketOverlay>,
}

impl Default for Infra {
    fn default() -> Self {
        Self::new()
    }
}

impl Infra {
    pub fn new() -> Self {
        Self {
            booted: false,
            machines: HashMap::new(),
            ticket: None,
        }
    }

    pub fn boot(&mut self) -> &mut Self {
        if self.booted {
            return self;
        }
        self.machines.insert("closet".into(), Self::make_closet());
        self.machines.insert("precinct-13".into(), Self::make_precinct());
        let booking = Self::make_booking();
        let guest = booking.guest.clone().expect("booking guest");
        if let Some(p) = self.machines.get_mut("precinct-13") {
            p.ctx.guests.insert(Guest::BOOKING.into(), guest);
        }
        self.machines.insert("booking-vm".into(), booking);
        self.machines.insert("coffee.lan".into(), Self::make_coffee());
        self.booted = true;
        self
    }

    pub fn reboot(&mut self) -> &mut Self {
        self.booted = false;
        self.machines.clear();
        self.boot()
    }

    pub fn get(&mut self, id: &str) -> Option<&Machine> {
        self.boot();
        let key = lan::resolve(id);
        self.machines.get(&key)
    }

    pub fn guest(&mut self, id: &str) -> Option<&Guest> {
        let key = lan::resolve(id);
        self.get(&key).and_then(|m| m.guest.as_ref())
    }

    pub fn hosts_file(&self) -> String {
        let mut lines = vec!["127.0.0.1\tlocalhost".to_string()];
        for h in CATALOG {
            lines.push(format!("{}\t{}", h.addr, h.id));
        }
        lines.join("\n") + "\n"
    }

    pub fn jump_note(&self) -> String {
        let rows: Vec<String> = CATALOG
            .iter()
            .filter(|h| h.id != "closet")
            .map(|h| format!("  ssh {:<16}{}", h.id, h.role))
            .collect();
        format!(
            "This closet is a jump host. The LAN is already up.\n\n{}\n\nvirt.precinct has the inventory. ping HOST if you doubt it.\n",
            rows.join("\n")
        )
    }

    pub fn login_banner(&self, sess: &RemoteSession) -> String {
        let mut lines = vec!["Last login: from closet".to_string()];
        let code = self
            .ticket
            .as_ref()
            .map(|t| t.id.as_str())
            .unwrap_or("");
        if sess.host == "precinct-13"
            && self.ticket.as_ref().is_some_and(|t| t.host != "closet")
            && !code.is_empty()
        {
            lines.push(format!(
                "root@precinct-13. Ticket {code}. Type exit to return to closet."
            ));
        } else if sess.host == "coffee.lan" {
            lines.push("BeanTek BrewOS 0.4. Please do not unplug.".into());
        } else {
            lines.push(format!(
                "{}@{}. Type exit to return to closet.",
                sess.user, sess.host
            ));
        }
        lines.join("\n")
    }

    pub fn usage_hosts(&self) -> String {
        CATALOG
            .iter()
            .filter(|h| h.id != "closet")
            .map(|h| format!("  ssh {:<16}{}", h.id, h.role))
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn session_for(&mut self, id: &str) -> Option<RemoteSession> {
        self.boot();
        let key = lan::resolve(id);
        if key == "closet" {
            return None;
        }
        if let Some(ticket) = self.ticket.clone() {
            if Self::ticket_covers(&ticket, &key) {
                return Some(self.from_ticket(&ticket, &key));
            }
        }
        self.idle_session(&key)
    }

    fn ticket_covers(ticket: &TicketOverlay, key: &str) -> bool {
        if ticket.host == key {
            return true;
        }
        if key == "booking-vm" && ticket.ctx.guests.contains_key("booking-vm") {
            return true;
        }
        if key == "precinct-13" && (ticket.host == "precinct-13" || ticket.host == "booking-vm") {
            return true;
        }
        false
    }

    fn from_ticket(&self, ticket: &TicketOverlay, key: &str) -> RemoteSession {
        if key == "booking-vm" {
            if let Some(guest) = ticket.ctx.guests.get("booking-vm") {
                return RemoteSession {
                    kind: SessionKind::Guest,
                    id: "booking-vm".into(),
                    host: "booking-vm".into(),
                    user: "root".into(),
                    home: "/root".into(),
                    cwd: "/root".into(),
                    vfs: guest.vfs.clone(),
                    ctx: ticket.ctx.clone(),
                    guest: Some(guest.clone()),
                };
            }
        }
        if key == "precinct-13" {
            let rec = lan::catalog(key);
            return RemoteSession {
                kind: SessionKind::Host,
                id: key.into(),
                host: "precinct-13".into(),
                user: rec.map(|h| h.user).unwrap_or("root").into(),
                home: "/home/itguy".into(),
                cwd: ticket.cwd.clone(),
                vfs: ticket.vfs.clone(),
                ctx: ticket.ctx.clone(),
                guest: None,
            };
        }
        if ticket.host == key {
            let rec = lan::catalog(key);
            let kind = if rec.is_some_and(|h| h.kind == "guest") {
                SessionKind::Guest
            } else {
                SessionKind::Host
            };
            return RemoteSession {
                kind,
                id: key.into(),
                host: key.into(),
                user: rec.map(|h| h.user).unwrap_or("root").into(),
                home: rec.map(|h| h.home).unwrap_or("/home/itguy").into(),
                cwd: ticket.cwd.clone(),
                vfs: ticket.vfs.clone(),
                ctx: ticket.ctx.clone(),
                guest: ticket.ctx.guests.get(key).cloned(),
            };
        }
        self.idle_session(key).expect("idle")
    }

    fn idle_session(&self, key: &str) -> Option<RemoteSession> {
        if key == "booking-vm" {
            let parent = self.machines.get("precinct-13")?;
            let box_ = self.machines.get("booking-vm")?;
            let guest = box_.guest.clone()?;
            return Some(RemoteSession {
                kind: SessionKind::Guest,
                id: "booking-vm".into(),
                host: "booking-vm".into(),
                user: "root".into(),
                home: "/root".into(),
                cwd: "/root".into(),
                vfs: guest.vfs.clone(),
                ctx: parent.ctx.clone(),
                guest: Some(guest),
            });
        }
        let m = self.machines.get(key)?;
        Some(RemoteSession {
            kind: SessionKind::Host,
            id: key.into(),
            host: m.host.clone(),
            user: m.user.clone(),
            home: m.home.clone(),
            cwd: m.cwd.clone(),
            vfs: m.vfs.clone(),
            ctx: m.ctx.clone(),
            guest: m.guest.clone(),
        })
    }

    pub fn closet_session(&mut self) -> RemoteSession {
        self.boot();
        let m = self.machines.get("closet").expect("closet");
        RemoteSession {
            kind: SessionKind::Host,
            id: "closet".into(),
            host: m.host.clone(),
            user: m.user.clone(),
            home: m.home.clone(),
            cwd: m.cwd.clone(),
            vfs: m.vfs.clone(),
            ctx: m.ctx.clone(),
            guest: None,
        }
    }

    pub fn save_host(&mut self, id: &str, vfs: Node, ctx: ShellCtx, cwd: String) {
        if let Some(m) = self.machines.get_mut(id) {
            m.vfs = vfs;
            m.ctx = ctx;
            m.cwd = cwd;
        }
    }

    pub fn save_guest(&mut self, id: &str, vfs: Node) {
        let key = lan::resolve(id);
        if let Some(m) = self.machines.get_mut(&key) {
            if let Some(g) = m.guest.as_mut() {
                g.vfs = vfs.clone();
            }
        }
        if let Some(p) = self.machines.get_mut("precinct-13") {
            if let Some(g) = p.ctx.guests.get_mut(&key) {
                g.vfs = vfs;
            }
        }
    }

    pub fn save_precinct_ctx(&mut self, ctx: ShellCtx) {
        if let Some(p) = self.machines.get_mut("precinct-13") {
            p.ctx = ctx;
        }
    }

    fn make_closet() -> Machine {
        let mut vfs = vfs::create_base();
        if let Some(hn) = vfs::resolve_mut(&mut vfs, "/", "/etc/hostname", "/home/itguy") {
            if let Some(c) = hn.node.content_mut() {
                *c = "closet\n".into();
            }
        }
        if let Some(motd) = vfs::resolve_mut(&mut vfs, "/", "/etc/motd", "/home/itguy") {
            if let Some(c) = motd.node.content_mut() {
                *c = vfs::closet_motd();
            }
        }
        if let Some(issue) = vfs::resolve_mut(&mut vfs, "/", "/etc/issue", "/home/itguy") {
            if let Some(c) = issue.node.content_mut() {
                *c = "ClosetOS 13 (Duct Tape) \\n \\l\n".into();
            }
        }
        let hosts = {
            let mut lines = vec!["127.0.0.1\tlocalhost".to_string()];
            for h in CATALOG {
                lines.push(format!("{}\t{}", h.addr, h.id));
            }
            lines.join("\n") + "\n"
        };
        if let Some(hf) = vfs::resolve_mut(&mut vfs, "/", "/etc/hosts", "/home/itguy") {
            if let Some(c) = hf.node.content_mut() {
                *c = hosts;
            }
        }
        let jump = {
            let rows: Vec<String> = CATALOG
                .iter()
                .filter(|h| h.id != "closet")
                .map(|h| format!("  ssh {:<16}{}", h.id, h.role))
                .collect();
            format!(
                "This closet is a jump host. The LAN is already up.\n\n{}\n\nvirt.precinct has the inventory. ping HOST if you doubt it.\n",
                rows.join("\n")
            )
        };
        if let Some(home) = vfs::resolve_mut(&mut vfs, "/", "/home/itguy", "/home/itguy") {
            if let Some(children) = home.node.children_mut() {
                children.insert("jump.txt".into(), file(jump));
            }
        }
        Machine {
            host: "closet".into(),
            user: "itguy".into(),
            home: "/home/itguy".into(),
            cwd: "/home/itguy".into(),
            vfs,
            ctx: ShellCtx {
                processes: Some(base_procs()),
                ..ShellCtx::default()
            },
            guest: None,
        }
    }

    fn make_precinct() -> Machine {
        let mut vfs = vfs::create_base();
        let mut processes = base_procs();
        processes.push(proc(
            2201,
            "root",
            "2.1",
            "8.0",
            "?",
            "Aug14",
            "04:12:08",
            "/usr/bin/qemu-system-x86_64 -name booking-vm -m 512",
        ));
        if let Some(motd) = vfs::resolve_mut(&mut vfs, "/", "/etc/motd", "/home/itguy") {
            if let Some(c) = motd.node.content_mut() {
                *c = "Precinct 13 — If it works, do not reboot it.\nbooking-vm is on this host. virsh list.\n"
                    .into();
            }
        }
        Machine {
            host: "precinct-13".into(),
            user: "root".into(),
            home: "/home/itguy".into(),
            cwd: "/home/itguy".into(),
            vfs,
            ctx: ShellCtx {
                processes: Some(processes),
                ..ShellCtx::default()
            },
            guest: None,
        }
    }

    fn make_booking() -> Machine {
        Machine {
            host: "booking-vm".into(),
            user: "root".into(),
            home: "/root".into(),
            cwd: "/root".into(),
            vfs: vfs::create_guest(),
            ctx: ShellCtx::default(),
            guest: Some(Guest::make_idle_booking()),
        }
    }

    fn make_coffee() -> Machine {
        let mut vfs = vfs::create_base();
        if let Some(hn) = vfs::resolve_mut(&mut vfs, "/", "/etc/hostname", "/home/itguy") {
            if let Some(c) = hn.node.content_mut() {
                *c = "coffee.lan\n".into();
            }
        }
        if let Some(motd) = vfs::resolve_mut(&mut vfs, "/", "/etc/motd", "/home/itguy") {
            if let Some(c) = motd.node.content_mut() {
                *c = "BeanTek BrewOS 0.4\nDefault password is still mocha123. The vendor said that is fine.\n"
                    .into();
            }
        }
        Machine {
            host: "coffee.lan".into(),
            user: "root".into(),
            home: "/opt/coffee".into(),
            cwd: "/opt/coffee".into(),
            vfs,
            ctx: ShellCtx {
                processes: Some(vec![
                    {
                        let mut p = proc(
                            1, "root", "0.0", "0.1", "?", "Jun19", "00:00:12", "/sbin/init",
                        );
                        p.protected = true;
                        p
                    },
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
                ]),
                ..ShellCtx::default()
            },
            guest: None,
        }
    }
}


