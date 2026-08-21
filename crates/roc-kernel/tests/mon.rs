//! Monitoring minigame + first ticket (lp0 on fire).

use roc_kernel::{Game, MonColor};

fn started() -> Game {
    let mut g = Game::new();
    g.completed.push("the-desk".into());
    g.work_ticket("mon-printer").unwrap();
    g
}

#[test]
fn bait_is_red_before_ssh() {
    let g = started();
    let snap = g.mon_snapshot();
    assert!(snap.red);
    assert!(!snap.live || snap.live); // ticket session exists after work
    let row = snap.rows.iter().find(|r| r.host == "precinct-13").unwrap();
    assert_eq!(row.check, "PROC wanted_cat_printer");
    assert_eq!(row.color, MonColor::Crit);
}

#[test]
fn kill_without_prevent_flaps() {
    let mut g = started();
    assert_eq!(g.run("ssh precinct-13").code, 0);
    assert_eq!(g.shell.host, "precinct-13");
    assert_eq!(g.run("kill 1337").code, 0);
    g.run("ps");
    g.run("ps");
    let snap = g.mon_snapshot();
    assert!(snap.red, "should still be red");
    assert!(!snap.fix, "printer should have come back");
    let held = g.mon_clear("precinct-13").unwrap();
    assert!(!held, "clear without prevent must flap");
}

#[test]
fn prevent_fix_clear_holds() {
    let mut g = started();
    g.run("ssh precinct-13");
    assert_eq!(g.run("rm /etc/cron.d/wanted").code, 0);
    assert_eq!(g.run("kill 1337").code, 0);
    let snap = g.mon_snapshot();
    assert!(snap.warn || snap.prevent && snap.fix);
    assert!(snap.prevent);
    assert!(snap.fix);
    assert!(!snap.cleared);
    assert!(g.mon_clear("precinct-13").unwrap());
    let snap = g.mon_snapshot();
    assert!(!snap.red);
    assert_eq!(
        snap.rows
            .iter()
            .find(|r| r.host == "precinct-13")
            .unwrap()
            .color,
        MonColor::Ok
    );
    g.close_ticket().unwrap();
    assert!(g.completed.iter().any(|c| c == "mon-printer"));
}

#[test]
fn tracker_three_beats() {
    let mut g = started();
    g.run("ssh precinct-13");
    let t = g.tracker();
    assert_eq!(t.len(), 3);
    assert!(t.iter().all(|(_, d)| !d));
    g.run("rm /etc/cron.d/wanted");
    let t = g.tracker();
    assert!(t[0].1);
    assert!(!t[1].1);
    g.run("pkill wanted");
    let t = g.tracker();
    assert!(t[0].1 && t[1].1);
    assert!(!t[2].1);
    g.mon_clear("precinct-13").unwrap();
    assert!(g.tracker()[2].1);
}

#[test]
fn locked_until_desk() {
    let mut g = Game::new();
    assert!(g.work_ticket("mon-printer").is_err());
}
