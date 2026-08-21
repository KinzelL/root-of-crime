//! Ops commands. Matches `js/commands/ops.js`.

use roc_kernel::{proc, Shell};

fn sh() -> Shell {
    Shell::with_base()
}

#[test]
fn ps_lists_base_table() {
    let mut sh = sh();
    let out = sh.run("ps");
    assert!(out.success());
    assert!(out.stdout.contains("PID"));
    assert!(out.stdout.contains("2048"));
    let aux = sh.run("ps aux");
    assert!(aux.stdout.contains("USER"));
    assert!(aux.stdout.contains("coffee_machine_daemon"));
}

#[test]
fn kill_and_pkill() {
    let mut sh = sh();
    let denied = sh.run("kill 1");
    assert!(denied.stderr.contains("Operation not permitted"));

    let out = sh.run("kill 2048");
    assert!(out.success());
    assert!(out.stdout.contains("Terminated"));
    assert!(out.stdout.contains("coffee_machine_daemon"));
    assert!(sh.ctx.killed.iter().any(|p| p.pid == 2048));
    let ps = sh.run("ps");
    assert!(!ps.stdout.contains("2048"));

    let mut sh = sh();
    let mut extra = proc(
        1337,
        "root",
        "97.4",
        "3.1",
        "pts/2",
        "19:01",
        "00:12:44",
        "/usr/local/bin/wanted_cat_printer --loop",
    );
    extra.highlight = true;
    sh.ctx.processes.as_mut().unwrap().push(extra);
    let k = sh.run("kill -9 1337");
    assert!(k.stdout.contains("Killed"));
    assert!(k.stdout.contains("wanted_cat_printer"));
}

#[test]
fn pkill_by_name() {
    let mut sh = sh();
    let out = sh.run("pkill coffee");
    assert!(out.success());
    assert!(sh.ctx.killed.iter().any(|p| p.pid == 2048));
    let miss = sh.run("pkill nope");
    assert!(miss.stderr.contains("no process found matching"));
}

#[test]
fn df_and_du() {
    let mut sh = sh();
    let df = sh.run("df");
    assert!(df.stdout.contains("/dev/sda1"));
    assert!(df.stdout.contains("Use%"));
    let du = sh.run("du -s /home/itguy");
    assert!(du.success());
    assert!(du.stdout.contains("/home/itguy"));
}

#[test]
fn netstat_and_ss() {
    let mut sh = sh();
    let out = sh.run("netstat");
    assert!(out.stdout.contains("sshd"));
    assert!(out.stdout.contains("LISTEN"));
    assert!(sh.ctx.used_netstat);
    let ss = sh.run("ss");
    assert!(ss.stdout.contains("cupsd"));
}

#[test]
fn crontab_last_who() {
    let mut sh = sh();
    let cron = sh.run("crontab -l");
    assert!(cron.stdout.contains("/etc/crontab") || cron.stdout.contains("cron"));
    assert!(cron.stdout.contains("rotate-logs"));
    assert!(sh.ctx.used_crontab);
    let bad = sh.run("crontab");
    assert!(bad.stderr.contains("usage: crontab -l"));
    let last = sh.run("last");
    assert!(last.stdout.contains("still logged in"));
    assert!(sh.ctx.used_last);
    let who = sh.run("who");
    assert!(who.stdout.contains("chief"));
}

#[test]
fn passwd_coffee_only() {
    let mut sh = sh();
    let deny = sh.run("passwd root");
    assert!(deny.stderr.contains("Authentication token manipulation error"));
    let ok = sh.run("passwd coffee");
    assert!(ok.success());
    assert!(ok.stdout.contains("password updated successfully"));
    assert!(sh.ctx.password_changed.iter().any(|a| a == "coffee"));
}

#[test]
fn ping_lan() {
    let mut sh = sh();
    let out = sh.run("ping precinct-13");
    assert!(out.success());
    assert!(out.stdout.contains("10.13.0.4"));
    let alias = sh.run("ping coffee");
    assert!(alias.stdout.contains("coffee.lan"));
    assert!(alias.stdout.contains("10.13.0.8"));
    let miss = sh.run("ping nope.example");
    assert!(miss.stderr.contains("Name or service not known"));
}
