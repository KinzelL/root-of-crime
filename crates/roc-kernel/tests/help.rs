//! help / man / identity commands.

use roc_kernel::{Game, Shell};

#[test]
fn identity_and_echo() {
    let mut sh = Shell::with_desk();
    assert_eq!(sh.run("whoami").stdout, "itguy\n");
    assert_eq!(sh.run("hostname").stdout, "closet\n");
    assert!(sh.run("id").stdout.contains("uid=1000(itguy)"));
    assert_eq!(sh.run("echo hello precinct").stdout, "hello precinct\n");
    assert!(sh.run("env").stdout.contains("HOME=/home/itguy"));
    assert!(sh.run("uname -a").stdout.contains("closet"));
    let clear = sh.run("clear");
    assert!(clear.success());
    assert!(clear.clear);
    assert_eq!(sh.prompt(), "itguy@closet:~$");
}

#[test]
fn man_missing_and_empty() {
    let mut sh = Shell::with_desk();
    let empty = sh.run("man");
    assert!(empty.success());
    assert!(empty.stdout.contains("What manual page"));
    let miss = sh.run("man banana");
    assert_eq!(miss.code, 1);
    assert!(miss.stderr.contains("No manual entry for banana"));
}

#[test]
fn tab_completes_commands_and_paths() {
    let sh = Shell::with_desk();
    let hits = sh.completions("he");
    assert!(hits.iter().any(|h| h == "help"));
    assert!(hits.iter().any(|h| h == "head"));
    let paths = sh.completions("ls /etc/h");
    assert!(paths.iter().any(|p| p.contains("hostname") || p.contains("hosts")));
}

#[test]
fn empty_man_does_not_win_desk() {
    let mut g = Game::new();
    g.work_ticket("the-desk").unwrap();
    g.run("help");
    g.run("man");
    assert!(g.close_ticket().is_err());
    g.run("man ls");
    g.close_ticket().unwrap();
}
