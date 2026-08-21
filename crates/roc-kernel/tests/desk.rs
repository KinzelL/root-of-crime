//! Hub tutorial (the-desk) + help/man/hint, then the printer ticket.

use roc_kernel::{Game, HINT_COST};

#[test]
fn help_without_ticket_is_global() {
    let mut g = Game::new();
    let out = g.run("help");
    assert!(out.success());
    assert!(out.stdout.contains("Available commands"));
    assert!(g.run("whoami").stdout.contains("itguy"));
    assert!(g.run("hostname").stdout.contains("closet"));
    assert_eq!(g.run("pwd").stdout, "/home/itguy\n");
    let man = g.run("man ls");
    assert!(man.stdout.contains("list directory contents"));
}

#[test]
fn desk_help_then_man_closes() {
    let mut g = Game::new();
    let intro = g.work_ticket("the-desk").unwrap();
    assert!(intro.contains("man ls"));
    assert_eq!(g.shell.host, "closet");
    assert_eq!(g.prompt(), "itguy@closet:~$");

    let t = g.tracker();
    assert_eq!(t.len(), 2);
    assert!(t.iter().all(|(_, d)| !d));

    let help = g.run("help");
    assert!(help.stdout.contains("this text"));
    assert!(g.tracker()[0].1);
    assert!(!g.tracker()[1].1);

    assert!(g.close_ticket().is_err());

    let man = g.run("man ls");
    assert!(man.stdout.contains("LS(1)"));
    assert!(g.tracker().iter().all(|(_, d)| *d));
    g.close_ticket().unwrap();
    assert!(g.completed.iter().any(|c| c == "the-desk"));
    assert_eq!(g.score, 100, "desk pay 50 + clean 50");
}

#[test]
fn hint_costs_and_still_clears_desk() {
    let mut g = Game::new();
    g.work_ticket("the-desk").unwrap();
    g.run("help");
    let hint = g.run("hint");
    assert!(hint.stdout.contains("[HINT"));
    assert_eq!(g.hints_used, 1);
    assert_eq!(g.score, 0, "hint from 0 score floors at 0 (cost {HINT_COST})");
    g.close_ticket().unwrap();
    assert!(g.completed.iter().any(|c| c == "the-desk"));
    assert_eq!(g.score, 50, "pay 50, no clean bonus after a hint");
}

#[test]
fn printer_stays_locked_until_desk() {
    let mut g = Game::new();
    assert!(g.work_ticket("mon-printer").is_err());
    let cards = g.tickets();
    let printer = cards.iter().find(|c| c.id == "mon-printer").unwrap();
    assert!(!printer.unlocked);
    assert!(!printer.done);

    g.work_ticket("the-desk").unwrap();
    g.run("help");
    g.run("man ls");
    g.close_ticket().unwrap();

    let printer = g.tickets().into_iter().find(|c| c.id == "mon-printer").unwrap();
    assert!(printer.unlocked);
    g.work_ticket("mon-printer").unwrap();
    assert_eq!(g.current_id.as_deref(), Some("mon-printer"));
}

#[test]
fn desk_then_printer_full_path() {
    let mut g = Game::new();
    g.work_ticket("the-desk").unwrap();
    g.run("help");
    g.run("man ls");
    g.close_ticket().unwrap();

    g.work_ticket("mon-printer").unwrap();
    assert!(g.mon_snapshot().red);
    assert_eq!(g.run("ssh precinct-13").code, 0);
    assert_eq!(g.prompt(), "root@precinct-13:~#");
    assert_eq!(g.run("rm /etc/cron.d/wanted").code, 0);
    assert_eq!(g.run("kill 1337").code, 0);
    assert!(g.mon_clear("precinct-13").unwrap());
    g.close_ticket().unwrap();
    assert!(g.completed.iter().any(|c| c == "mon-printer"));
}

#[test]
fn save_keeps_completed_resets_shell() {
    let mut g = Game::new();
    g.work_ticket("the-desk").unwrap();
    g.run("help");
    g.run("man ls");
    g.close_ticket().unwrap();
    let blob = g.save_json();
    let mut h = Game::new();
    h.load_json(&blob).unwrap();
    assert!(h.completed.iter().any(|c| c == "the-desk"));
    assert_eq!(h.shell.host, "closet");
    assert!(h.current_id.is_none());
    assert!(h.work_ticket("mon-printer").is_ok());
}

#[test]
fn punch_out_on_time_after_both() {
    let mut g = Game::new();
    g.work_ticket("the-desk").unwrap();
    g.run("help");
    g.run("man ls");
    g.close_ticket().unwrap();
    g.work_ticket("mon-printer").unwrap();
    g.run("ssh precinct-13");
    g.run("rm /etc/cron.d/wanted");
    g.run("kill 1337");
    g.mon_clear("precinct-13").unwrap();
    g.close_ticket().unwrap();
    let report = g.punch_out();
    assert_eq!(report.leftover, 0);
    assert!(report.on_time);
    assert_eq!(report.next_day, 1);
    assert_eq!(g.shift_min, roc_kernel::SHIFT_START);
}
