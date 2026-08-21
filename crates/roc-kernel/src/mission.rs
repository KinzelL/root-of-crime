//! Mission contract. Types land here one at a time. First: desk, then monitoring.

use serde::Serialize;

use crate::ctx::ShellCtx;
use crate::vfs::Node;

pub const SHIFT_START: i32 = 8 * 60;
pub const SHIFT_END: i32 = 16 * 60;
pub const HINT_COST: i32 = 15;
pub const CLEAN_BONUS: i32 = 50;
pub const ON_TIME_BONUS: i32 = 50;

#[derive(Clone)]
pub struct Setup {
    pub vfs: Node,
    pub cwd: String,
    pub ctx: ShellCtx,
    pub intro: String,
}

#[derive(Clone)]
pub struct Monitor {
    pub host: String,
    pub check: String,
    pub prevent: fn(&ShellCtx, &Node) -> bool,
    pub fix: fn(&ShellCtx, &Node) -> bool,
    pub respawn: fn(&mut ShellCtx, &mut Node),
}

#[derive(Clone)]
pub struct Mission {
    pub id: &'static str,
    pub order: f64,
    pub act: u32,
    pub lesson: u32,
    pub chapter: &'static str,
    pub title: &'static str,
    pub short: &'static str,
    pub description: &'static str,
    pub difficulty: &'static str,
    pub requires: &'static [&'static str],
    pub asset: &'static str,
    pub kind: &'static str,
    pub monitor: Option<Monitor>,
    pub setup: fn() -> Setup,
    pub help: &'static str,
    pub hint: fn(&ShellCtx, &Node) -> String,
    pub won: fn(&ShellCtx, &Node) -> bool,
    pub objectives: fn(&ShellCtx, &Node) -> Vec<(String, bool)>,
}

impl Mission {
    pub fn is_unlocked(&self, completed: &[String]) -> bool {
        self.requires.iter().all(|r| completed.iter().any(|c| c == r))
    }

    pub fn shift_day(&self) -> i32 {
        if self.act <= 1 {
            0
        } else if self.act == 2 && self.lesson <= 4 {
            1
        } else if self.act == 2 {
            2
        } else {
            3
        }
    }

    pub fn pay(&self) -> i32 {
        let base = if self.act >= 3 {
            200
        } else if self.act == 2 {
            150
        } else if self.act == 1 {
            100
        } else {
            50
        };
        if self.id == "root-of-crime" {
            base + 100
        } else {
            base
        }
    }

    pub fn minutes(&self) -> i32 {
        if self.act >= 2 {
            120
        } else if self.act == 1 {
            90
        } else {
            60
        }
    }

    pub fn code(&self) -> String {
        format!("{}.{}", self.act, self.lesson)
    }
}

/// One row on tickets.precinct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TicketCard {
    pub id: String,
    pub title: String,
    pub chapter: String,
    pub asset: String,
    pub kind: String,
    pub unlocked: bool,
    pub today: bool,
    pub done: bool,
}

/// Headless save blob. Matches the persistent fields of `js/game.js` (`roc_save_v1`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct Save {
    pub completed: Vec<String>,
    pub score: i32,
    pub hints_used: i32,
    pub shift_day: i32,
    pub shift_min: i32,
    pub seen_briefing: bool,
}

impl Default for Save {
    fn default() -> Self {
        Self {
            completed: Vec::new(),
            score: 0,
            hints_used: 0,
            shift_day: 0,
            shift_min: SHIFT_START,
            seen_briefing: false,
        }
    }
}
