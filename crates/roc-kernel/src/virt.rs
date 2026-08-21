//! Guest disks, mount, fstab, reboot. Matches `js/virt.js` (state half).

use indexmap::IndexMap;

use crate::guest::{Disk, Guest, MountShadow};
use crate::vfs::{self, dir, file_with, size_of, Extra, Node};

pub fn parse_size(raw: &str, unit: Option<&str>) -> Result<u64, String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err("size is required".into());
    }
    let (num, suffix) = split_size_token(s).ok_or_else(|| {
        "size must be a number (200, 200M, 1G)".to_string()
    })?;
    if num == 0.0 {
        return Err("size must be greater than zero".into());
    }
    let mut u = suffix
        .unwrap_or_else(|| unit.unwrap_or("M").to_string())
        .to_ascii_uppercase();
    if u.ends_with("IB") {
        u.truncate(u.len() - 2);
        u.push('B');
    }
    if u.ends_with('B') && u.len() > 1 {
        u.pop();
    }
    let mul: f64 = match u.chars().next() {
        Some('G') => 1024.0 * 1024.0 * 1024.0,
        Some('K') => 1024.0,
        _ => 1024.0 * 1024.0,
    };
    let bytes = (num * mul).round() as u64;
    if bytes < 1024 {
        return Err("size too small".into());
    }
    Ok(bytes)
}

fn split_size_token(s: &str) -> Option<(f64, Option<String>)> {
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
        i += 1;
    }
    if i == 0 {
        return None;
    }
    let n: f64 = s[..i].parse().ok()?;
    let rest = s[i..].trim();
    if rest.is_empty() {
        Some((n, None))
    } else if rest.chars().all(|c| c.is_ascii_alphabetic()) {
        Some((n, Some(rest.to_string())))
    } else {
        None
    }
}

pub fn find_disk<'a>(guest: &'a Guest, spec: &str) -> Option<&'a Disk> {
    find_disk_index(guest, spec).map(|i| &guest.disks[i])
}

fn find_disk_index(guest: &Guest, spec: &str) -> Option<usize> {
    let s = spec.trim_end_matches('/');
    let bare = s.trim_start_matches("/dev/");
    guest.disks.iter().position(|d| {
        d.device == s
            || d.device == format!("{s}1")
            || d.id == bare
            || format!("{}1", d.id) == bare
            || format!("/dev/{}", d.id) == s
    })
}

pub fn attach_volume(guest: &mut Guest, extra_total: u64) -> Result<(), String> {
    if guest.disks.iter().any(|d| d.id == "sdb") {
        return Err("guest already has a second disk".into());
    }
    if extra_total == 0 {
        return Err("size is required".into());
    }
    guest.disks.push(Disk {
        id: "sdb".into(),
        device: "/dev/sdb1".into(),
        total: extra_total,
        mount: None,
        tree: dir(IndexMap::new()),
        shadow: None,
    });
    if let Some(dev) = vfs::resolve_mut(&mut guest.vfs, "/", "/dev", "/root") {
        if let Some(children) = dev.node.children_mut() {
            children.insert(
                "sdb".into(),
                file_with("", Extra::new().mode(0o660).group("disk")),
            );
            children.insert(
                "sdb1".into(),
                file_with("", Extra::new().mode(0o660).group("disk")),
            );
        }
    }
    guest.volume_attached = true;
    Ok(())
}

pub fn disk_for_path<'a>(guest: &'a Guest, path: &str) -> Option<&'a Disk> {
    let full = vfs::abs("/", path, "/");
    guest.disks.iter().find(|d| {
        d.mount.as_ref().is_some_and(|m| full == *m || full.starts_with(&format!("{m}/")))
    })
}

pub fn disk_used(guest: &Guest, disk: &Disk) -> u64 {
    if disk.id == "sda" {
        sda_used(guest)
    } else if let Some(mnt) = &disk.mount {
        vfs::resolve(&guest.vfs, "/", mnt, "/root")
            .map(|r| size_of(r.node) as u64)
            .unwrap_or(0)
    } else {
        size_of(&disk.tree) as u64
    }
}

fn sda_used(guest: &Guest) -> u64 {
    let mut extra = 0u64;
    for d in &guest.disks {
        if d.id != "sda" {
            if let Some(mnt) = &d.mount {
                if let Some(r) = vfs::resolve(&guest.vfs, "/", mnt, "/root") {
                    extra += size_of(r.node) as u64;
                }
            }
        }
    }
    (size_of(&guest.vfs) as u64).saturating_sub(extra)
}

pub fn ensure_space(guest: &Guest, path: &str, add_bytes: u64) -> Result<(), String> {
    let Some(disk) = disk_for_path(guest, path) else {
        return Ok(());
    };
    let used = disk_used(guest, disk);
    if used + add_bytes > disk.total {
        return Err("No space left on device".into());
    }
    Ok(())
}

pub fn mount(guest: &mut Guest, device: &str, target: &str) -> Result<(), String> {
    let idx = find_disk_index(guest, device).ok_or_else(|| format!("{device}: No such device"))?;
    if guest.disks[idx].id == "sda" {
        return Err("mount: / is busy".into());
    }
    if guest.disks[idx].mount.is_some() {
        return Err(format!(
            "mount: already mounted on {}",
            guest.disks[idx].mount.as_deref().unwrap_or("")
        ));
    }
    let path = vfs::abs("/", target, "/");
    {
        let res = vfs::resolve(&guest.vfs, "/", &path, "/root")
            .ok_or_else(|| format!("mount: mount point '{target}' does not exist"))?;
        if !res.node.is_dir() {
            return Err("mount: not a directory".into());
        }
        if path == "/" {
            return Err("mount: cannot replace /".into());
        }
    }
    let parent_path = vfs::dirname(&path);
    let name = vfs::basename(&path);
    let tree = std::mem::replace(&mut guest.disks[idx].tree, dir(IndexMap::new()));
    let old = replace_child(&mut guest.vfs, &parent_path, &name, tree).map_err(|e| {
        guest.disks[idx].tree = e.1;
        e.0
    })?;
    guest.disks[idx].shadow = Some(MountShadow {
        parent: parent_path,
        name,
        node: old,
    });
    guest.disks[idx].mount = Some(path);
    Ok(())
}

pub fn umount(guest: &mut Guest, target: &str) -> Result<(), String> {
    let path = if target.is_empty() {
        String::new()
    } else {
        vfs::abs("/", target, "/")
    };
    let bare = target.trim_start_matches("/dev/");
    let idx = guest.disks.iter().position(|d| {
        d.mount.as_deref() == Some(path.as_str())
            || d.device == target
            || d.id == bare
    });
    let Some(idx) = idx else {
        return Err(format!("umount: {target}: not mounted"));
    };
    if guest.disks[idx].mount.is_none() || guest.disks[idx].shadow.is_none() {
        return Err(format!("umount: {target}: not mounted"));
    }
    let shadow = guest.disks[idx].shadow.take().unwrap();
    let _ = guest.disks[idx].mount.take();
    let mounted = replace_child(&mut guest.vfs, &shadow.parent, &shadow.name, shadow.node)
        .map_err(|e| e.0)?;
    guest.disks[idx].tree = mounted;
    Ok(())
}

fn replace_child(
    vfs: &mut Node,
    parent_path: &str,
    name: &str,
    new: Node,
) -> Result<Node, (String, Node)> {
    let Some(parent) = vfs::resolve_mut(vfs, "/", parent_path, "/root") else {
        return Err((format!("mount: mount point '{name}' does not exist"), new));
    };
    let Some(children) = parent.node.children_mut() else {
        return Err(("mount: not a directory".into(), new));
    };
    let Some(old) = children.shift_remove(name) else {
        return Err((format!("mount: mount point '{name}' does not exist"), new));
    };
    children.insert(name.to_string(), new);
    Ok(old)
}

pub fn fstab_lines(guest: &Guest) -> Vec<String> {
    let text = vfs::resolve(&guest.vfs, "/", "/etc/fstab", "/root")
        .and_then(|r| r.node.content().map(str::to_string))
        .unwrap_or_default();
    text.split('\n')
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_string)
        .collect()
}

pub fn fstab_ready(guest: &Guest) -> bool {
    fstab_lines(guest).iter().any(|line| {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.len() < 2 {
            return false;
        }
        let disk = find_disk(guest, p[0]);
        let mnt = p[1].trim_end_matches('/');
        let mnt = if mnt.is_empty() { "/" } else { mnt };
        disk.is_some_and(|d| d.id == "sdb" && (mnt == "/var/lib/booking" || mnt == "/var"))
    })
}

pub fn umount_extras(guest: &mut Guest) {
    let mounts: Vec<String> = guest
        .disks
        .iter()
        .filter(|d| d.id != "sda" && d.mount.is_some())
        .filter_map(|d| d.mount.clone())
        .collect();
    for m in mounts {
        let _ = umount(guest, &m);
    }
}

pub fn apply_fstab(guest: &mut Guest) {
    umount_extras(guest);
    let lines = fstab_lines(guest);
    for line in lines {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.len() < 2 {
            continue;
        }
        let Some(disk) = find_disk(guest, p[0]) else {
            continue;
        };
        if disk.id == "sda" {
            continue;
        }
        let _ = mount(guest, p[0], p[1]);
    }
}

pub fn reboot(guest: &mut Guest) -> Result<(), String> {
    guest.rebooted = true;
    guest.reboots += 1;
    apply_fstab(guest);
    Ok(())
}

pub fn booking_settled(guest: &Guest) -> bool {
    let Some(sdb) = guest.disks.iter().find(|d| d.id == "sdb") else {
        return false;
    };
    let Some(mnt) = &sdb.mount else {
        return false;
    };
    if mnt != "/var/lib/booking" && mnt != "/var" {
        return false;
    }
    let text = vfs::resolve(&guest.vfs, "/", "/var/lib/booking/cases.db", "/root")
        .and_then(|r| r.node.content().map(str::to_string))
        .unwrap_or_default();
    text.contains("do not purge")
}

pub fn booking_persisted(guest: &Guest) -> bool {
    guest.rebooted && fstab_ready(guest) && booking_settled(guest)
}

pub fn df_table(guest: &Guest) -> String {
    let fmt = |n: u64| format!("{}K", (n as f64 / 1024.0).round().max(0.0) as u64);
    let mut lines = vec!["Filesystem     1K-blocks    Used Available Use% Mounted on".to_string()];
    for d in &guest.disks {
        let used = disk_used(guest, d);
        let total = if d.total == 0 { used } else { d.total };
        let avail = total.saturating_sub(used);
        let pct = if total == 0 {
            0
        } else {
            ((used as f64 / total as f64) * 100.0).round() as u64
        };
        let pct = pct.min(100);
        let mount = d.mount.clone().unwrap_or_default();
        lines.push(format!(
            "{:<14} {:>9} {:>7} {:>9}  {:>3}% {mount}",
            d.device,
            fmt(total),
            fmt(used),
            fmt(avail),
            pct
        ));
    }
    lines.join("\n")
}

pub fn stage_unmounted_volume(guest: &mut Guest) {
    let _ = attach_volume(guest, 200 * 1024 * 1024);
    let mut moved = IndexMap::new();
    if let Some(booking) = vfs::resolve_mut(&mut guest.vfs, "/", "/var/lib/booking", "/root") {
        if let Some(children) = booking.node.children_mut() {
            let names: Vec<String> = children.keys().cloned().collect();
            for n in names {
                if let Some(node) = children.shift_remove(&n) {
                    moved.insert(n, node);
                }
            }
            children.insert(
                "LOST".into(),
                vfs::file(
                    "Night shift rebooted.\nThe database is on the other disk.\nNothing is mounted.\n",
                ),
            );
        }
    }
    if let Some(sdb) = guest.disks.iter_mut().find(|d| d.id == "sdb") {
        if let Some(tree) = sdb.tree.children_mut() {
            for (n, node) in moved {
                tree.insert(n, node);
            }
        }
    }
    guest.blurb =
        "Night shift rebooted. The extra disk is still attached. Nothing is mounted.".into();
}
