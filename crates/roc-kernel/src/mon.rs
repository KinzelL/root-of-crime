//! Monitoring minigame. Prevent → fix → Clear. Flap if you skip prevent.

use serde::Serialize;

use crate::ctx::ShellCtx;
use crate::mission::{Mission, Monitor};
use crate::vfs::Node;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum MonColor {
    Ok,
    Warn,
    Crit,
}

impl MonColor {
    pub fn as_str(self) -> &'static str {
        match self {
            MonColor::Ok => "OK",
            MonColor::Warn => "WARN",
            MonColor::Crit => "CRIT",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MonRow {
    pub host: String,
    pub check: String,
    pub status: String,
    pub color: MonColor,
    pub alert: bool,
    pub mission_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MonSnapshot {
    pub rows: Vec<MonRow>,
    pub red: bool,
    pub warn: bool,
    pub live: bool,
    pub prevent: bool,
    pub fix: bool,
    pub cleared: bool,
    pub mission_id: Option<String>,
}

pub fn idle_hosts() -> [&'static str; 4] {
    ["closet", "precinct-13", "booking-vm", "coffee.lan"]
}

pub fn snapshot(
    mission: Option<&Mission>,
    ctx: Option<&ShellCtx>,
    vfs: Option<&Node>,
    live: bool,
) -> MonSnapshot {
    let idle: Vec<MonRow> = idle_hosts()
        .iter()
        .map(|h| MonRow {
            host: (*h).into(),
            check: "PING".into(),
            status: "OK".into(),
            color: MonColor::Ok,
            alert: false,
            mission_id: None,
        })
        .collect();
    let Some(mission) = mission else {
        return MonSnapshot {
            rows: idle,
            red: false,
            warn: false,
            live: false,
            prevent: false,
            fix: false,
            cleared: false,
            mission_id: None,
        };
    };
    let Some(mon) = mission.monitor.as_ref() else {
        return MonSnapshot {
            rows: idle,
            red: false,
            warn: false,
            live: false,
            prevent: false,
            fix: false,
            cleared: false,
            mission_id: Some(mission.id.to_string()),
        };
    };
    let prevent = live && ctx.zip(vfs).is_some_and(|(c, v)| (mon.prevent)(c, v));
    let fix = live && ctx.zip(vfs).is_some_and(|(c, v)| (mon.fix)(c, v));
    let cleared = ctx.is_some_and(|c| c.mon_cleared);
    let flap = ctx.is_some_and(|c| c.mon_flap);
    let (color, status) = if prevent && fix && cleared {
        (MonColor::Ok, "OK")
    } else if prevent && fix {
        (MonColor::Warn, "UNACK")
    } else if live && flap {
        (MonColor::Crit, "FLAP")
    } else {
        (MonColor::Crit, "CRIT")
    };
    let rows = idle
        .into_iter()
        .map(|h| {
            if h.host != mon.host {
                return h;
            }
            MonRow {
                host: mon.host.clone(),
                check: mon.check.clone(),
                status: status.into(),
                color,
                alert: color != MonColor::Ok,
                mission_id: Some(mission.id.to_string()),
            }
        })
        .collect();
    MonSnapshot {
        rows,
        red: color == MonColor::Crit,
        warn: color == MonColor::Warn,
        live,
        prevent,
        fix,
        cleared,
        mission_id: Some(mission.id.to_string()),
    }
}

pub fn tick(ctx: &mut ShellCtx, vfs: &mut Node, mon: &Monitor) {
    if (mon.prevent)(ctx, vfs) {
        ctx.mon_quiet_ticks = 0;
        return;
    }
    if (mon.fix)(ctx, vfs) {
        ctx.mon_quiet_ticks = ctx.mon_quiet_ticks.saturating_add(1);
        if ctx.mon_quiet_ticks >= 2 {
            (mon.respawn)(ctx, vfs);
            ctx.mon_cleared = false;
            ctx.mon_flap = true;
            ctx.mon_quiet_ticks = 0;
        }
    }
}

pub fn clear(ctx: &mut ShellCtx, vfs: &mut Node, mon: &Monitor) -> bool {
    let prevent = (mon.prevent)(ctx, vfs);
    let fix = (mon.fix)(ctx, vfs);
    if prevent && fix {
        ctx.mon_cleared = true;
        ctx.mon_flap = false;
        true
    } else {
        ctx.mon_cleared = false;
        ctx.mon_flap = true;
        if !prevent {
            (mon.respawn)(ctx, vfs);
        }
        false
    }
}

pub fn won(ctx: &ShellCtx, vfs: &Node, mon: &Monitor) -> bool {
    (mon.prevent)(ctx, vfs) && (mon.fix)(ctx, vfs) && ctx.mon_cleared
}

pub fn objectives(ctx: &ShellCtx, vfs: &Node, mon: &Monitor) -> Vec<(String, bool)> {
    vec![
        ("Stop it coming back".into(), (mon.prevent)(ctx, vfs)),
        ("Stop the noise".into(), (mon.fix)(ctx, vfs)),
        (
            format!("Clear {} on mon.precinct", mon.host),
            ctx.mon_cleared,
        ),
    ]
}
