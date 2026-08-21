//! Filesystem commands + executor. Matches `js/commands/fs.js` and pipe/redirect in `js/terminal.js`.

use roc_kernel::{resolve, Shell, DEFAULT_HOME};

fn sh() -> Shell {
    Shell::with_base()
}

#[test]
fn pwd_and_cd() {
    let mut sh = sh();
    let out = sh.run("pwd");
    assert!(out.success());
    assert_eq!(out.stdout, format!("{DEFAULT_HOME}\n"));

    assert_eq!(sh.run("cd /tmp").code, 0);
    assert_eq!(sh.cwd, "/tmp");
    assert_eq!(sh.run("pwd").stdout, "/tmp\n");

    assert_eq!(sh.run("cd ~").code, 0);
    assert_eq!(sh.cwd, DEFAULT_HOME);

    let err = sh.run("cd /nope");
    assert_eq!(err.code, 1);
    assert_eq!(err.stderr, "cd: /nope: No such file or directory");

    let err = sh.run("cd /home/itguy/welcome.txt");
    assert_eq!(err.stderr, "cd: /home/itguy/welcome.txt: Not a directory");
}

#[test]
fn ls_hides_dotfiles_unless_a() {
    let mut sh = sh();
    let out = sh.run("ls /home/itguy");
    assert!(out.success());
    assert!(out.stdout.contains("welcome.txt"));
    assert!(out.stdout.contains("sticky_note.txt"));
    assert!(!out.stdout.contains(".bashrc"));

    let all = sh.run("ls -a /home/itguy");
    assert!(all.stdout.contains(".bashrc"));
    assert!(all.stdout.contains("welcome.txt"));
}

#[test]
fn ls_long_and_file_target() {
    let mut sh = sh();
    let out = sh.run("ls -l /bin/ls");
    assert!(out.stdout.starts_with("-rwxr-xr-x"));
    assert!(out.stdout.contains(" ls\n"));

    let dir = sh.run("ls -la /tmp");
    assert!(dir.stdout.contains("total "));
    assert!(dir.stdout.contains(" ..\n") || dir.stdout.contains(" .."));
}

#[test]
fn mkdir_touch_rm_rmdir() {
    let mut sh = sh();
    assert_eq!(sh.run("mkdir /tmp/box").code, 0);
    assert_eq!(sh.run("touch /tmp/box/a.txt").code, 0);
    assert!(resolve(&sh.vfs, "/", "/tmp/box/a.txt", DEFAULT_HOME).is_some());

    let err = sh.run("rmdir /tmp/box");
    assert!(err.stderr.contains("Directory not empty"));

    assert_eq!(sh.run("rm /tmp/box/a.txt").code, 0);
    assert_eq!(sh.run("rmdir /tmp/box").code, 0);
    assert!(resolve(&sh.vfs, "/", "/tmp/box", DEFAULT_HOME).is_none());
    assert_eq!(sh.ctx.removed.last().unwrap(), "/tmp/box");
}

#[test]
fn rm_recursive_and_refuses_root() {
    let mut sh = sh();
    sh.run("mkdir /tmp/box");
    sh.run("touch /tmp/box/a.txt");
    assert_eq!(sh.run("rm -r /tmp/box").code, 0);
    assert!(resolve(&sh.vfs, "/", "/tmp/box", DEFAULT_HOME).is_none());

    let err = sh.run("rm -r /etc");
    assert_eq!(err.stderr, "rm: refusing to remove '/etc'");
}

#[test]
fn cp_and_mv() {
    let mut sh = sh();
    assert_eq!(sh.run("cp /home/itguy/welcome.txt /tmp/w.txt").code, 0);
    let copy = resolve(&sh.vfs, "/", "/tmp/w.txt", DEFAULT_HOME).unwrap();
    assert!(copy.node.content().unwrap().starts_with("WELCOME"));

    sh.run("mkdir /tmp/out");
    assert_eq!(sh.run("mv /tmp/w.txt /tmp/out").code, 0);
    assert!(resolve(&sh.vfs, "/", "/tmp/w.txt", DEFAULT_HOME).is_none());
    assert!(resolve(&sh.vfs, "/", "/tmp/out/w.txt", DEFAULT_HOME).is_some());
}

#[test]
fn chmod_and_glob() {
    let mut sh = sh();
    let out = sh.run("chmod 600 /home/itguy/welcome.txt");
    assert!(out.success());
    assert_eq!(
        resolve(&sh.vfs, "/", "/home/itguy/welcome.txt", DEFAULT_HOME)
            .unwrap()
            .node
            .mode(),
        0o600
    );
    assert_eq!(sh.ctx.chmod_count, 1);

    let many = sh.run("chmod 644 /home/itguy/*.txt");
    assert!(many.stdout.contains("files changed"));
    assert!(sh.ctx.chmod_count >= 2);
}

#[test]
fn find_name_and_file() {
    let mut sh = sh();
    // Quoted globs are unquoted then expanded (same as JS). From `/`, `*.txt`
    // does not match, so `-name` still sees the pattern.
    assert_eq!(sh.run("cd /").code, 0);
    let out = sh.run("find /home/itguy -name '*.txt'");
    assert!(out.stdout.contains("/home/itguy/welcome.txt"));
    assert!(sh.ctx.used_find);

    let f = sh.run("file /bin/ls /home/itguy/welcome.txt /tmp");
    assert!(f.stdout.contains("ELF 64-bit LSB executable"));
    assert!(f.stdout.contains("ASCII text"));
    assert!(f.stdout.contains("directory"));
}

#[test]
fn redirect_ls_to_file() {
    let mut sh = sh();
    let out = sh.run("ls /home/itguy > /tmp/ls.out");
    assert!(out.success());
    assert!(out.stdout.is_empty());
    let body = resolve(&sh.vfs, "/", "/tmp/ls.out", DEFAULT_HOME)
        .unwrap()
        .node
        .content()
        .unwrap()
        .to_string();
    assert!(body.contains("welcome.txt"));
    assert!(body.ends_with('\n'));
}

#[test]
fn append_redirect() {
    let mut sh = sh();
    sh.run("ls /tmp > /tmp/log");
    sh.run("ls /home > /tmp/log");
    sh.run("ls /home >> /tmp/log");
    let body = resolve(&sh.vfs, "/", "/tmp/log", DEFAULT_HOME)
        .unwrap()
        .node
        .content()
        .unwrap()
        .to_string();
    // second line overwrote, third appended — two ls /home listings
    let hits = body.matches("itguy").count();
    assert!(hits >= 2);
}

#[test]
fn command_not_found_is_127() {
    let mut sh = sh();
    let out = sh.run("nope");
    assert_eq!(out.code, 127);
    assert!(out.stderr.contains("command not found"));
}

#[test]
fn jail_blocks_cd() {
    let mut sh = sh();
    sh.ctx.jail = Some("/home/itguy".into());
    let err = sh.run("cd /tmp");
    assert!(err.stderr.contains("cannot leave /home/itguy"));
    assert_eq!(sh.cwd, DEFAULT_HOME);
}

#[test]
fn unknown_does_not_break_cwd() {
    let mut sh = sh();
    sh.run("cd /tmp");
    sh.run("not-a-cmd");
    assert_eq!(sh.cwd, "/tmp");
}

#[test]
fn pipe_runs_second_command() {
    let mut sh = sh();
    sh.run("mkdir /tmp/box");
    let out = sh.run("mkdir /tmp/unused | ls /tmp");
    assert!(out.success());
    assert!(out.stdout.contains("box"));
}

#[test]
fn failed_pipe_stage_stops() {
    let mut sh = sh();
    let out = sh.run("ls /nope | ls /tmp");
    assert_eq!(out.code, 1);
    assert!(out.stderr.contains("cannot access '/nope'"));
}
