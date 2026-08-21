//! virsh / lsblk / mount / reboot. Matches `js/commands/virt.js` minus ssh/exit.

use crate::guest::Guest;
use crate::virt as vengine;

use super::super::exec::Shell;
use super::super::output::Output;

impl Shell {
    pub(crate) fn cmd_virsh(&mut self, args: &[String]) -> Output {
        let sub = args.first().map(|s| s.to_ascii_lowercase()).unwrap_or_default();
        let names: Vec<String> = self.ctx.guests.keys().cloned().collect();
        if sub.is_empty() || sub == "help" {
            return Output::ok(
                "usage: virsh list | virsh console <guest> | virsh attach-disk <guest> <size> | virsh reboot <guest>",
            );
        }
        if sub == "list" {
            let mut lines = vec![
                " Id    Name                           State".to_string(),
                "----------------------------------------------------".to_string(),
            ];
            if names.is_empty() {
                lines.push(" (no guests)".into());
            } else {
                for (i, n) in names.iter().enumerate() {
                    let state = self
                        .ctx
                        .guests
                        .get(n)
                        .map(|g| g.state.as_str())
                        .unwrap_or("running");
                    lines.push(format!(" {:<5}{:<31}{state}", i + 1, n));
                }
            }
            return Output::ok(lines.join("\n"));
        }
        if sub == "console" {
            let name = args
                .get(1)
                .cloned()
                .unwrap_or_else(|| Guest::BOOKING.to_string());
            let Some(sess) = self
                .session_from_guest(&name)
                .or_else(|| self.infra.session_for(&name))
            else {
                return Output::err("ssh: Could not resolve hostname ".to_string() + &name);
            };
            if sess.kind != crate::infra::SessionKind::Guest {
                return Output::err("virsh: failed to get domain");
            }
            return self.attach_guest(sess);
        }
        if sub == "attach-disk" || sub == "attach_disk" {
            let rest = &args[1..];
            let mut name = Guest::BOOKING.to_string();
            let mut size_tok = String::new();
            for a in rest {
                if a == "--size" || a == "-s" {
                    continue;
                }
                if self.ctx.guests.contains_key(a) {
                    name = a.clone();
                } else {
                    size_tok = a.trim_start_matches("--size=").to_string();
                }
            }
            let parsed = match vengine::parse_size(&size_tok, None) {
                Ok(b) => b,
                Err(e) => {
                    return Output::err(format!(
                        "virsh: {e} (example: virsh attach-disk booking-vm 200M)"
                    ));
                }
            };
            let r = self.with_guest_mut(&name, |g| vengine::attach_volume(g, parsed));
            match r {
                None => Output::err("virsh: failed to get domain"),
                Some(Err(e)) => Output::err(format!("virsh: {e}")),
                Some(Ok(())) => Output::ok(format!(
                    "Disk attached to '{name}' as /dev/sdb ({size_tok})"
                )),
            }
        } else if sub == "reboot" {
            let name = args
                .get(1)
                .cloned()
                .unwrap_or_else(|| Guest::BOOKING.to_string());
            self.reboot_guest(&name)
        } else {
            Output::err(format!("virsh: command '{sub}' not found"))
        }
    }

    fn reboot_guest(&mut self, name: &str) -> Output {
        if self.attached.as_deref() == Some(name) {
            self.detach();
        }
        match self.with_guest_mut(name, |g| vengine::reboot(g)) {
            None => Output::err("virsh: failed to get domain"),
            Some(Err(e)) => Output::err(format!("virsh: {e}")),
            Some(Ok(())) => Output::ok(format!("Domain '{name}' is being rebooted")),
        }
    }

    pub(crate) fn cmd_reboot(&mut self) -> Output {
        if let Some(id) = self.attached.clone() {
            let _ = self.with_guest_mut(&id, |g| vengine::reboot(g));
            self.detach();
            return Output::ok("The system is going down for reboot NOW!\nConnection closed.");
        }
        Output::err(
            "reboot: refusing to reboot the host. The last IT left a note about that.\n\
             Try:  virsh reboot booking-vm",
        )
    }

    pub(crate) fn cmd_lsblk(&mut self) -> Output {
        let mut lines = vec!["NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT".to_string()];
        if let Some(id) = self.attached.clone() {
            if let Some(rows) = self.with_guest_mut(&id, |g| {
                g.disks
                    .iter()
                    .map(|d| {
                        let kb = ((d.total as f64) / 1024.0).round().max(1.0) as u64;
                        let size = format!("{kb}K");
                        format!(
                            "{:<6}  8:0    0  {:>4}  0 disk\n└─{:<4} 8:1    0  {:>4}  0 part {}",
                            d.id,
                            size,
                            format!("{}1", d.id),
                            size,
                            d.mount.clone().unwrap_or_default()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }) {
                lines.push(rows);
                return Output::ok(lines.join("\n"));
            }
        }
        lines.push("sda      8:0    0  500M  0 disk".into());
        lines.push("└─sda1   8:1    0  500M  0 part /".into());
        Output::ok(lines.join("\n"))
    }

    pub(crate) fn cmd_mount(&mut self, args: &[String]) -> Output {
        if args.is_empty() {
            if let Some(id) = self.attached.clone() {
                if let Some(text) = self.with_guest_mut(&id, |g| {
                    g.disks
                        .iter()
                        .filter(|d| d.mount.is_some())
                        .map(|d| {
                            format!(
                                "{} on {} type ext4 (rw,relatime)",
                                d.device,
                                d.mount.as_deref().unwrap_or("")
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                }) {
                    return Output::ok(text);
                }
            }
            return Output::ok("/dev/sda1 on / type ext4 (rw,relatime)");
        }
        let Some(id) = self.attached.clone() else {
            return Output::err("mount: only the guest has extra disks. virsh console first.");
        };
        if args.len() < 2 {
            return Output::err("mount: usage: mount DEVICE DIR");
        }
        match self.with_guest_mut(&id, |g| vengine::mount(g, &args[0], &args[1])) {
            None => Output::err("mount: only the guest has extra disks. virsh console first."),
            Some(Err(e)) => Output::err(e),
            Some(Ok(())) => Output::ok(""),
        }
    }

    pub(crate) fn cmd_umount(&mut self, args: &[String]) -> Output {
        let Some(id) = self.attached.clone() else {
            return Output::err("umount: nothing to unmount on the host");
        };
        let Some(target) = args.first() else {
            return Output::err("umount: usage: umount DIR|DEVICE");
        };
        match self.with_guest_mut(&id, |g| vengine::umount(g, target)) {
            None => Output::err("umount: nothing to unmount on the host"),
            Some(Err(e)) => Output::err(e),
            Some(Ok(())) => Output::ok(""),
        }
    }
}
