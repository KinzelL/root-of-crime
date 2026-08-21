//! LAN + ssh. Matches `js/infra.js` and `_cmdSsh` / `_cmdExit`.

use roc_kernel::{resolve, Shell};

fn desk() -> Shell {
    Shell::with_desk()
}

#[test]
fn closet_has_jump_and_hosts() {
    let mut sh = desk();
    assert_eq!(sh.host, "closet");
    assert_eq!(sh.user, "itguy");
    let hn = resolve(&sh.vfs, "/", "/etc/hostname", sh.home.as_str()).unwrap();
    assert_eq!(hn.node.content(), Some("closet\n"));
    let jump = sh.run("cat ~/jump.txt");
    assert!(jump.stdout.contains("ssh precinct-13"));
    assert!(jump.stdout.contains("ssh coffee.lan"));
    let hosts = sh.run("cat /etc/hosts");
    assert!(hosts.stdout.contains("10.13.0.4"));
    assert!(hosts.stdout.contains("booking-vm"));
}

#[test]
fn ssh_precinct_and_exit() {
    let mut sh = desk();
    let out = sh.run("ssh precinct-13");
    assert!(out.success());
    assert!(out.stdout.contains("Last login"));
    assert_eq!(sh.host, "precinct-13");
    assert_eq!(sh.user, "root");
    let motd = sh.run("cat /etc/motd");
    assert!(motd.stdout.contains("booking-vm is on this host"));
    assert_eq!(sh.run("pwd").stdout, "/home/itguy\n");

    sh.run("touch /tmp/from-ssh.txt");
    let bye = sh.run("exit");
    assert!(bye.stdout.contains("Connection closed"));
    assert!(bye.stdout.contains("mittens") || bye.stdout.contains("CLOSET"));
    assert_eq!(sh.host, "closet");
    assert_eq!(sh.user, "itguy");

    sh.run("ssh precinct-13");
    assert!(resolve(&sh.vfs, "/", "/tmp/from-ssh.txt", "/home/itguy").is_some());
}

#[test]
fn ssh_coffee() {
    let mut sh = desk();
    let out = sh.run("ssh coffee.lan");
    assert!(out.stdout.contains("BeanTek"));
    assert_eq!(sh.host, "coffee.lan");
    assert_eq!(sh.cwd, "/opt/coffee");
    let hn = sh.run("cat /etc/hostname");
    assert!(hn.stdout.contains("coffee.lan"));
    let pw = sh.run("passwd coffee");
    assert!(pw.success());
    sh.run("exit");
    assert_eq!(sh.host, "closet");
}

#[test]
fn ssh_booking_vm() {
    let mut sh = desk();
    let out = sh.run("ssh booking-vm");
    assert!(out.stdout.contains("Connected to booking-vm"));
    assert_eq!(sh.host, "booking-vm");
    assert_eq!(sh.cwd, "/root");
    let note = sh.run("cat /root/NOTE");
    assert!(note.stdout.contains("booking guest"));
    sh.run("exit");
    assert_eq!(sh.host, "closet");
}

#[test]
fn ssh_aliases_and_unknown() {
    let mut sh = desk();
    assert_eq!(sh.run("ssh precinct").code, 0);
    assert_eq!(sh.host, "precinct-13");
    sh.run("exit");
    let miss = sh.run("ssh nope.example");
    assert!(miss.stderr.contains("Could not resolve hostname"));
}

#[test]
fn already_on_closet_and_ssh_home() {
    let mut sh = desk();
    let out = sh.run("ssh closet");
    assert_eq!(out.stdout, "already on closet\n");
    sh.run("ssh precinct-13");
    let home = sh.run("ssh closet");
    assert!(home.stdout.contains("Connection closed"));
    assert_eq!(sh.host, "closet");
}

#[test]
fn ssh_usage() {
    let mut sh = desk();
    let err = sh.run("ssh");
    assert!(err.stderr.contains("usage: ssh"));
    assert!(err.stderr.contains("precinct-13"));
}

#[test]
fn logout_on_closet() {
    let mut sh = desk();
    let out = sh.run("exit");
    assert_eq!(out.stdout, "logout\n");
}
