//! Text commands. Matches `js/commands/text.js`.

use roc_kernel::{write, Shell, WriteOpts};

fn sh() -> Shell {
    Shell::with_base()
}

#[test]
fn cat_file_and_read_files() {
    let mut sh = sh();
    let out = sh.run("cat /home/itguy/welcome.txt");
    assert!(out.success());
    assert!(out.stdout.starts_with("WELCOME TO PRECINCT 13"));
    assert!(sh
        .ctx
        .read_files
        .iter()
        .any(|p| p == "/home/itguy/welcome.txt"));
}

#[test]
fn cat_missing() {
    let mut sh = sh();
    let err = sh.run("cat /nope");
    assert_eq!(err.code, 1);
    assert_eq!(err.stderr, "cat: /nope: No such file or directory");
}

#[test]
fn cat_stdin_from_pipe() {
    let mut sh = sh();
    let out = sh.run("ls /home | cat");
    assert!(out.stdout.contains("itguy"));
}

#[test]
fn head_tail_and_n() {
    let mut sh = sh();
    put_lines(&mut sh, "/tmp/n.txt", 20);
    let head = sh.run("head -n 3 /tmp/n.txt");
    assert_eq!(head.stdout, "line1\nline2\nline3\n");
    let head5 = sh.run("head -5 /tmp/n.txt");
    assert!(head5.stdout.starts_with("line1\n"));
    assert!(head5.stdout.contains("line5\n"));
    assert!(!head5.stdout.contains("line6"));
    let tail = sh.run("tail -n 2 /tmp/n.txt");
    assert_eq!(tail.stdout, "line19\nline20\n");
}

#[test]
fn wc_counts_lines_words_bytes() {
    let mut sh = sh();
    let out = sh.run("wc /home/itguy/sticky_note.txt");
    assert!(out.success());
    assert!(out.stdout.contains("sticky_note.txt"));
}

#[test]
fn sort_and_uniq_from_file() {
    let mut sh = sh();
    write(
        &mut sh.vfs,
        "/",
        "/tmp/dup.txt",
        "b\na\na\nc\n",
        WriteOpts::default(),
    )
    .unwrap();
    let sorted = sh.run("sort /tmp/dup.txt");
    assert_eq!(sorted.stdout, "a\na\nb\nc\n");
    let uniq = sh.run("uniq /tmp/dup.txt");
    assert_eq!(uniq.stdout, "b\na\nc\n");
    write(
        &mut sh.vfs,
        "/",
        "/tmp/sorted.txt",
        "a\na\nb\n",
        WriteOpts::default(),
    )
    .unwrap();
    let both = sh.run("sort /tmp/dup.txt | uniq");
    assert_eq!(both.stdout, "a\nb\nc\n");
}

#[test]
fn grep_file_and_stdin() {
    let mut sh = sh();
    let out = sh.run("grep WELCOME /home/itguy/welcome.txt");
    assert!(out.stdout.contains("WELCOME TO PRECINCT 13"));
    assert!(!out.stdout.contains("/home/itguy/welcome.txt:"));
    assert!(sh.ctx.grep_hits >= 1);
    assert!(sh
        .ctx
        .grep_patterns
        .iter()
        .any(|p| p == "welcome"));

    let piped = sh.run("ls /home | grep itguy");
    assert!(piped.stdout.contains("itguy"));
}

#[test]
fn grep_case_and_recursive() {
    let mut sh = sh();
    let ci = sh.run("grep -i welcome /home/itguy/welcome.txt");
    assert!(ci.success());
    assert!(ci.stdout.to_lowercase().contains("welcome"));

    let rec = sh.run("grep -r Briggs /home/itguy");
    assert!(rec.stdout.contains("/home/itguy/welcome.txt:"));
    assert!(rec.stdout.contains("Briggs"));
}

#[test]
fn less_is_headless_pager() {
    let mut sh = sh();
    put_lines(&mut sh, "/tmp/long.txt", 40);
    let out = sh.run("less /tmp/long.txt");
    assert!(out.success());
    assert!(out.stdout.is_empty());
    assert!(sh
        .ctx
        .read_files
        .iter()
        .any(|p| p == "/tmp/long.txt"));
    let pager = sh.pager.as_ref().expect("pager");
    assert!(pager.visible().starts_with("line1\n"));
    assert!(pager.visible().contains("line20"));
    assert!(!pager.visible().contains("line21"));
    assert!(pager.status_line().starts_with("--More--"));

    sh.pager_key(" ");
    let pager = sh.pager.as_ref().expect("still paging");
    assert!(pager.visible().contains("line21"));
    assert!(pager.status_line().starts_with("--END--"));

    sh.pager_key("q");
    assert!(sh.pager.is_none());
}

#[test]
fn more_alias_and_missing() {
    let mut sh = sh();
    assert_eq!(sh.run("more /home/itguy/welcome.txt").code, 0);
    assert!(sh.pager.is_some());
    let err = sh.run("less");
    assert!(err.stderr.contains("missing filename"));
}

fn put_lines(sh: &mut Shell, path: &str, n: usize) {
    let mut body = String::new();
    for i in 1..=n {
        body.push_str(&format!("line{i}\n"));
    }
    write(&mut sh.vfs, "/", path, &body, WriteOpts::default()).unwrap();
}
