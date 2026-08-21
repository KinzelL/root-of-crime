//! 0.1 How This Desk Works — hub tutorial. help, then man (or hint).

use crate::ctx::ShellCtx;
use crate::mission::{Mission, Setup};
use crate::proc::base_procs;
use crate::vfs::{self, Node};

fn hint_list(ctx: &ShellCtx, steps: &[&str]) -> String {
    let i = (ctx.hint_level.saturating_sub(1) as usize).min(steps.len().saturating_sub(1));
    steps.get(i).copied().unwrap_or("").to_string()
}

fn won(ctx: &ShellCtx, _vfs: &Node) -> bool {
    ctx.used_help && (ctx.used_man || ctx.used_hint)
}

fn objectives(ctx: &ShellCtx, _vfs: &Node) -> Vec<(String, bool)> {
    vec![
        ("Ask the desk what it can do".into(), ctx.used_help),
        (
            "Open a manual page (or take a hint)".into(),
            ctx.used_man || ctx.used_hint,
        ),
    ]
}

fn hint(ctx: &ShellCtx, _vfs: &Node) -> String {
    hint_list(
        ctx,
        &[
            "[HINT 1] Ask the desk what it can do.\nTry:  help",
            "[HINT 2] Read a manual page.\nTry:  man ls",
            "[HINT 3] help AND man ls (or hint). That clears this case.",
        ],
    )
}

fn setup() -> Setup {
    Setup {
        vfs: vfs::create_base(),
        cwd: "/home/itguy".into(),
        ctx: ShellCtx {
            processes: Some(base_procs()),
            ..ShellCtx::default()
        },
        intro: "This is xterm on the closet jump host.\n\n\
The grey slip is the job. This black box is the tool. Later tickets live on other boxes — you ssh there.\n\n\
Type help. Then man ls.\n\
hint also counts, but it costs score. Esc iconifies. The taskbar raises you again.\n"
            .into(),
    }
}

pub fn mission() -> Mission {
    Mission {
        id: "the-desk",
        order: 0.0,
        act: 0,
        lesson: 1,
        chapter: "0.1",
        title: "How This Desk Works",
        short: "The board, the slip, help / hint / man.",
        description:
            "Before Linux, the closet. This is not a real precinct terminal. It is close enough. Learn the desk: help for the job, hint if you stall (it costs), man ls for the book.",
        difficulty: "Tutorial",
        requires: &[],
        asset: "closet",
        kind: "desk",
        monitor: None,
        setup,
        help: "The desk:\n  help             this text — what THIS job wants\n  hint             a nudge. costs score. gets more specific\n  man COMMAND      a manual page (try: man ls)\n  xman             the book for every app on the desk\n  Esc              iconify this xterm\n  twm / right-click the root   the menu",
        hint,
        won,
        objectives,
    }
}
