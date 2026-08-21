//! 0.2 lp0 on fire — first monitoring ticket.

use crate::ctx::ShellCtx;
use crate::mission::{Mission, Monitor, Setup};
use crate::proc::{base_procs, is_dead, proc};
use crate::vfs::{self, file, file_with, Extra, Node};

const CRON: &str = "/etc/cron.d/wanted";
const CMD: &str = "/usr/local/bin/wanted_cat_printer --loop --image=blurry_cat.jpg";

fn printer_line() -> crate::proc::Proc {
    proc(
        1337,
        "root",
        "97.4",
        "3.1",
        "pts/2",
        "08:03",
        "00:12:44",
        CMD,
    )
}

fn prevent(_ctx: &ShellCtx, vfs: &Node) -> bool {
    vfs::resolve(vfs, "/", CRON, "/").is_none()
}

fn fix(ctx: &ShellCtx, _vfs: &Node) -> bool {
    is_dead(ctx, |p| p.pid == 1337 || p.cmd.contains("wanted_cat_printer"))
}

fn won(ctx: &ShellCtx, vfs: &Node) -> bool {
    prevent(ctx, vfs) && fix(ctx, vfs) && ctx.mon_cleared
}

fn objectives(ctx: &ShellCtx, vfs: &Node) -> Vec<(String, bool)> {
    vec![
        ("Stop it coming back".into(), prevent(ctx, vfs)),
        ("Stop the noise".into(), fix(ctx, vfs)),
        (
            "Clear precinct-13 on mon.precinct".into(),
            ctx.mon_cleared,
        ),
    ]
}

fn hint(ctx: &ShellCtx, vfs: &Node) -> String {
    if !prevent(ctx, vfs) {
        return "[HINT] It reprints. Something is scheduling the job.\nLook under /etc/cron.d on precinct-13.".into();
    }
    if !fix(ctx, vfs) {
        return "[HINT] The schedule is gone. The job is still screaming.\nps aux, then kill it.".into();
    }
    if !ctx.mon_cleared {
        return "[HINT] The host is UNACK. Go back to the desk.\nNetMoth → mon.precinct → Clear precinct-13.".into();
    }
    "[HINT] It held. Close the ticket.".into()
}

fn respawn(ctx: &mut ShellCtx, _vfs: &mut Node) {
    let list = ctx.processes.get_or_insert_with(Vec::new);
    if let Some(p) = list
        .iter_mut()
        .find(|p| p.pid == 1337 || p.cmd.contains("wanted_cat_printer"))
    {
        p.dead = false;
    } else {
        list.push(printer_line());
    }
    ctx.killed
        .retain(|k| k.pid != 1337 && !k.cmd.contains("wanted_cat_printer"));
}

fn setup() -> Setup {
    let mut vfs = vfs::create_base();
    if let Some(cron) = vfs::resolve_mut(&mut vfs, "/", "/etc/cron.d", "/") {
        if let Some(ch) = cron.node.children_mut() {
            ch.insert(
                "wanted".into(),
                file(
                    "# precinct print shop — DO NOT DISABLE (Miller will yell)\n\
                     * * * * * root /usr/local/bin/wanted_cat_printer --loop --image=blurry_cat.jpg\n",
                ),
            );
        }
    }
    if let Some(bin) = vfs::resolve_mut(&mut vfs, "/", "/usr/local/bin", "/") {
        if let Some(ch) = bin.node.children_mut() {
            ch.insert(
                "wanted_cat_printer".into(),
                file_with("ELF 64-bit LSB executable", Extra::new().mode(0o755)),
            );
        }
    }
    let mut processes = base_procs();
    processes.insert(4, printer_line());
    Setup {
        vfs,
        cwd: "/home/itguy".into(),
        ctx: ShellCtx {
            processes: Some(processes),
            ..ShellCtx::default()
        },
        intro: "mon.precinct is red. That is the job.\n\nssh precinct-13. Stop it coming back. Stop the noise. Then Clear the host on the board.\n".into(),
    }
}

pub fn mission() -> Mission {
    Mission {
        id: "mon-printer",
        order: 0.5,
        act: 0,
        lesson: 2,
        chapter: "0.2",
        title: "lp0 on fire",
        short: "mon.precinct is red. Make it stay green.",
        description:
            "precinct-13 is CRITICAL on mon.precinct. The printer is screaming. Clear will not hold until the job cannot come back, the noise is dead, and you mash Clear on the board.",
        difficulty: "Easy",
        requires: &["the-desk"],
        asset: "precinct-13",
        kind: "monitoring",
        monitor: Some(Monitor {
            host: "precinct-13".into(),
            check: "PROC wanted_cat_printer".into(),
            prevent,
            fix,
            respawn,
        }),
        setup,
        help: "The board is the job. The shell is the hands.\n\n  NetMoth → mon.precinct     the red host\n  ssh precinct-13            the asset\n  crontab -l / /etc/cron.d   why it comes back\n  rm the job                 prevent\n  ps / kill / pkill          the noise\n  Clear on the board         only sticks if both are done",
        hint,
        won,
        objectives,
    }
}
