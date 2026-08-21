//! Parity tests against `js/vfs.js` and the VFS asserts in `scripts/smoke.js`.

use roc_kernel::*;

const HOME: &str = "/home/itguy";

#[test]
fn smoke_js_vfs_asserts() {
    let tree = create_base();
    let welcome = resolve(&tree, "/", "/home/itguy/welcome.txt", HOME).unwrap();
    assert_eq!(welcome.node.kind(), "file", "welcome exists");

    let motd = closet_motd();
    assert!(motd.contains("mittens"), "closet motd missing pixel cat");
    assert!(motd.contains("ssh precinct-13"), "closet motd missing ssh");

    assert_eq!(abs("/home/itguy", "~", HOME), "/home/itguy", "tilde");
    assert_eq!(abs("/home/itguy", "..", HOME), "/home", "dotdot");

    let hits = expand_glob(&tree, "/home/itguy", "*", HOME);
    assert!(
        hits.iter().any(|h| h.ends_with("welcome.txt")),
        "glob home"
    );
}

#[test]
fn base_tree_stock_files() {
    let tree = create_base();
    let welcome = resolve(&tree, "/", "/home/itguy/welcome.txt", HOME).unwrap();
    let text = welcome.node.content().unwrap();
    assert!(text.starts_with("WELCOME TO PRECINCT 13 — IT CLOSET"));
    assert!(text.contains("— Briggs"));

    let tmp = resolve(&tree, "/", "/tmp", HOME).unwrap();
    assert_eq!(tmp.node.mode(), 0o1777);

    let shadow = resolve(&tree, "/", "/etc/shadow", HOME).unwrap();
    assert_eq!(shadow.node.mode(), 0o640);
    assert_eq!(shadow.node.group(), "shadow");

    let locker = resolve(&tree, "/", "/evidence", HOME).unwrap();
    assert_eq!(locker.node.group(), "detectives");

    let cron = resolve(&tree, "/", "/etc/cron.d/precinct", HOME).unwrap();
    assert!(cron.node.content().unwrap().contains("rotate-logs"));
}

#[test]
fn guest_tree_and_js_string_size() {
    let guest = create_guest();
    let cases = resolve(&guest, "/", "/var/lib/booking/cases.db", HOME).unwrap();
    assert_eq!(cases.node.kind(), "file");
    let content = cases.node.content().unwrap();
    assert_eq!(content.matches("INC-042").count(), 1800);
    assert_eq!(size_of(cases.node), 32 * 1800);

    let fstab = resolve(&guest, "/", "/etc/fstab", HOME).unwrap();
    assert!(fstab.node.content().unwrap().contains("/dev/sda1"));
}

#[test]
fn glob_on_home_includes_hidden() {
    let tree = create_base();
    let hits = expand_glob(&tree, "/home/itguy", "*", HOME);
    assert!(hits.iter().any(|h| h.ends_with(".bashrc")));
    assert!(hits.iter().any(|h| h.ends_with("sticky_note.txt")));
    let no_glob = expand_glob(&tree, "/home/itguy", "welcome.txt", HOME);
    assert_eq!(no_glob, vec!["welcome.txt".to_string()]);
    let missing = expand_glob(&tree, "/home/itguy", "nope*", HOME);
    assert_eq!(missing, vec!["nope*".to_string()]);
}

#[test]
fn find_name_and_walk_order() {
    let tree = create_base();
    let logs = find(&tree, "/var/log/incident", |node, path| {
        node.is_file() && path.ends_with(".log")
    });
    assert_eq!(logs.len(), 2);
    assert_eq!(logs[0].path, "/var/log/incident/incident_01.log");
    assert_eq!(logs[1].path, "/var/log/incident/incident_02.log");
}

#[test]
fn mkdir_cp_mv_rm_chmod_on_base() {
    let mut tree = create_base();
    mkdir(&mut tree, HOME, "work", HOME).unwrap();
    copy_file(&mut tree, HOME, "welcome.txt", "work", HOME).unwrap();
    assert!(resolve(&tree, HOME, "work/welcome.txt", HOME).is_some());
    move_file(&mut tree, HOME, "work/welcome.txt", "work/copy.txt", HOME).unwrap();
    assert!(resolve(&tree, HOME, "work/welcome.txt", HOME).is_none());
    chmod(&mut tree, HOME, "work/copy.txt", "600", HOME).unwrap();
    assert_eq!(
        resolve(&tree, HOME, "work/copy.txt", HOME)
            .unwrap()
            .node
            .mode(),
        0o600
    );
    unlink(&mut tree, HOME, "work/copy.txt", HOME).unwrap();
    unlink(&mut tree, HOME, "work", HOME).unwrap();
}

#[test]
fn format_long_base_bin() {
    let tree = create_base();
    let bin = resolve(&tree, "/", "/bin", HOME).unwrap();
    assert_eq!(
        format_long("bin", bin.node),
        "drwxr-xr-x 1 root       root          4096 Aug 14 09:00 bin"
    );
    let cat = resolve(&tree, "/", "/bin/cat", HOME).unwrap();
    let line = format_long("cat", cat.node);
    assert!(line.starts_with("-rwxr-xr-x 1 root"));
    assert!(line.ends_with(" cat"));
}
