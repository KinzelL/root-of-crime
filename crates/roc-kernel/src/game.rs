//! Headless game loop: desk + tickets + monitoring + save.

use crate::ctx::ShellCtx;
use crate::infra::TicketOverlay;
use serde::Serialize;

use crate::mission::{
    Mission, Save, TicketCard, CLEAN_BONUS, HINT_COST, ON_TIME_BONUS, SHIFT_END, SHIFT_START,
};
use crate::missions;
use crate::mon::{self, MonSnapshot};
use crate::shell::{Output, Shell};
use crate::vfs::Node;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrackerRow {
    pub label: String,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PunchReport {
    pub leftover: usize,
    pub on_time: bool,
    pub score: i32,
    pub next_day: i32,
}

/// One command's result plus the desk fields the Motif UI reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Frame {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
    pub clear: bool,
    pub host: String,
    pub cwd: String,
    pub prompt: String,
    pub toast: String,
    pub current_id: Option<String>,
    pub score: i32,
    pub tracker: Vec<TrackerRow>,
    pub pager_active: bool,
    pub pager_view: String,
    pub pager_status: String,
}

#[derive(Clone)]
pub struct Game {
    pub shell: Shell,
    pub completed: Vec<String>,
    pub current_id: Option<String>,
    pub shift_day: i32,
    pub shift_min: i32,
    pub score: i32,
    pub hints_used: i32,
    pub mission_hints: i32,
    pub seen_briefing: bool,
    pub last_toast: String,
    pub last_intro: String,
    pub shift_closed: Vec<String>,
}

impl Game {
    pub fn new() -> Self {
        Self {
            shell: Shell::with_desk(),
            completed: Vec::new(),
            current_id: None,
            shift_day: 0,
            shift_min: SHIFT_START,
            score: 0,
            hints_used: 0,
            mission_hints: 0,
            seen_briefing: false,
            last_toast: String::new(),
            last_intro: String::new(),
            shift_closed: Vec::new(),
        }
    }

    pub fn mission(&self, id: &str) -> Option<Mission> {
        missions::get(id)
    }

    pub fn tickets(&self) -> Vec<TicketCard> {
        missions::list()
            .into_iter()
            .map(|m| {
                let done = self.completed.iter().any(|c| c == m.id);
                let unlocked = m.is_unlocked(&self.completed);
                let today = m.shift_day() <= self.shift_day;
                TicketCard {
                    id: m.id.to_string(),
                    title: m.title.to_string(),
                    chapter: m.chapter.to_string(),
                    asset: m.asset.to_string(),
                    kind: m.kind.to_string(),
                    unlocked,
                    today,
                    done,
                }
            })
            .collect()
    }

    pub fn today_work(&self) -> Vec<Mission> {
        missions::list()
            .into_iter()
            .filter(|m| {
                !self.completed.iter().any(|c| c == m.id)
                    && m.shift_day() <= self.shift_day
                    && m.is_unlocked(&self.completed)
            })
            .collect()
    }

    fn active_monitor_mission(&self) -> Option<Mission> {
        if let Some(id) = &self.current_id {
            if let Some(m) = missions::get(id) {
                if m.monitor.is_some() {
                    return Some(m);
                }
            }
        }
        self.today_work().into_iter().find(|m| m.monitor.is_some())
    }

    fn on_host(&self, host: &str) -> bool {
        self.shell.host == host
            || self.shell.remote.as_deref() == Some(host)
            || self.shell.attached.as_deref() == Some(host)
    }

    fn live_pair(&self) -> Option<(&ShellCtx, &Node)> {
        let id = self.current_id.as_deref()?;
        let mission = missions::get(id)?;
        if mission.asset == "closet" {
            return Some((&self.shell.ctx, &self.shell.vfs));
        }
        let ticket_ok = self
            .shell
            .infra
            .ticket
            .as_ref()
            .is_some_and(|t| t.id == id);
        if !ticket_ok {
            return None;
        }
        if self.on_host(&mission.asset) {
            Some((&self.shell.ctx, &self.shell.vfs))
        } else {
            let t = self.shell.infra.ticket.as_ref()?;
            Some((&t.ctx, &t.vfs))
        }
    }

    fn live_pair_mut(&mut self) -> Option<(&mut ShellCtx, &mut Node)> {
        let id = self.current_id.clone()?;
        let mission = missions::get(&id)?;
        if mission.asset == "closet" {
            return Some((&mut self.shell.ctx, &mut self.shell.vfs));
        }
        let on_host = self.on_host(&mission.asset);
        let ticket_ok = self
            .shell
            .infra
            .ticket
            .as_ref()
            .is_some_and(|t| t.id == id);
        if !ticket_ok {
            return None;
        }
        if on_host {
            Some((&mut self.shell.ctx, &mut self.shell.vfs))
        } else {
            let t = self.shell.infra.ticket.as_mut()?;
            Some((&mut t.ctx, &mut t.vfs))
        }
    }

    pub fn work_ticket(&mut self, id: &str) -> Result<String, String> {
        let mission = missions::get(id).ok_or_else(|| format!("unknown ticket {id}"))?;
        if !mission.is_unlocked(&self.completed) {
            self.last_toast = "Ticket not assigned to you yet".into();
            return Err(self.last_toast.clone());
        }
        if mission.shift_day() > self.shift_day {
            self.last_toast = "Not on today's board".into();
            return Err(self.last_toast.clone());
        }
        let setup = (mission.setup)();
        self.current_id = Some(mission.id.to_string());
        self.shell.mission_id = Some(mission.id.to_string());
        self.mission_hints = 0;
        self.last_intro = setup.intro.clone();
        if mission.asset == "closet" {
            self.shell.drop_to_desk();
            self.shell.mission_id = Some(mission.id.to_string());
            self.shell.infra.ticket = None;
            self.last_toast = "This ticket is on closet. Double-click the xterm icon.".into();
            return Ok(setup.intro);
        }
        self.shell.infra.ticket = Some(TicketOverlay {
            id: mission.id.to_string(),
            host: mission.asset.to_string(),
            vfs: setup.vfs.clone(),
            ctx: setup.ctx.clone(),
            cwd: setup.cwd.clone(),
        });
        if self.on_host(mission.asset) {
            self.shell.vfs = setup.vfs;
            self.shell.ctx = setup.ctx;
            self.shell.cwd = setup.cwd;
        }
        self.last_toast = format!(
            "Asset {}. Open xterm, then ssh {}",
            mission.asset, mission.asset
        );
        Ok(setup.intro)
    }

    pub fn run(&mut self, line: &str) -> Output {
        let hint_before = self.shell.ctx.hint_level;
        let out = self.shell.run(line);
        if self.shell.ctx.hint_level > hint_before {
            self.on_hint();
        }
        self.sync_ticket_if_on_host();
        self.tick_mon();
        out
    }

    fn sync_ticket_if_on_host(&mut self) {
        let Some(id) = self.current_id.clone() else {
            return;
        };
        let Some(mission) = missions::get(&id) else {
            return;
        };
        if mission.asset == "closet" {
            return;
        }
        if !self.on_host(mission.asset) {
            return;
        }
        if let Some(t) = self.shell.infra.ticket.as_mut() {
            if t.id == id {
                t.vfs = self.shell.vfs.clone();
                t.ctx = self.shell.ctx.clone();
                t.cwd = self.shell.cwd.clone();
            }
        }
    }

    fn tick_mon(&mut self) {
        let Some(id) = self.current_id.clone() else {
            return;
        };
        let Some(mission) = missions::get(&id) else {
            return;
        };
        let Some(mon) = mission.monitor.clone() else {
            return;
        };
        if self.on_host(&mon.host) {
            mon::tick(&mut self.shell.ctx, &mut self.shell.vfs, &mon);
            if let Some(t) = self.shell.infra.ticket.as_mut() {
                if t.id == id {
                    t.vfs = self.shell.vfs.clone();
                    t.ctx = self.shell.ctx.clone();
                    t.cwd = self.shell.cwd.clone();
                }
            }
        } else if let Some(t) = self.shell.infra.ticket.as_mut() {
            if t.id == id {
                mon::tick(&mut t.ctx, &mut t.vfs, &mon);
            }
        }
    }

    fn on_hint(&mut self) {
        self.hints_used += 1;
        self.mission_hints += 1;
        self.score = (self.score - HINT_COST).max(0);
        self.last_toast = "Hint filed on the ticket".into();
    }

    pub fn mon_snapshot(&self) -> MonSnapshot {
        let mission = self.active_monitor_mission();
        let live = mission.as_ref().is_some_and(|m| {
            self.current_id.as_deref() == Some(m.id)
                && (m.asset == "closet" || self.shell.infra.ticket.as_ref().is_some_and(|t| t.id == m.id))
        });
        let (ctx, vfs) = if live {
            self.live_pair()
                .map(|(c, v)| (Some(c), Some(v)))
                .unwrap_or((None, None))
        } else {
            (None, None)
        };
        mon::snapshot(mission.as_ref(), ctx, vfs, live)
    }

    pub fn mon_clear(&mut self, host: &str) -> Result<bool, String> {
        let snap = self.mon_snapshot();
        let Some(mid) = snap.mission_id.clone() else {
            self.last_toast = format!("Nothing to clear on {host}");
            return Err(self.last_toast.clone());
        };
        let mission = missions::get(&mid).ok_or("unknown ticket")?;
        let mon = mission
            .monitor
            .clone()
            .ok_or("not a monitoring ticket")?;
        if mon.host != host {
            self.last_toast = format!("Nothing to clear on {host}");
            return Err(self.last_toast.clone());
        }
        if self.current_id.as_deref() != Some(mission.id) {
            self.work_ticket(mission.id)?;
        }
        let held = {
            let Some((ctx, vfs)) = self.live_pair_mut() else {
                return Err("ssh the host first. Then prevent, then fix, then Clear.".into());
            };
            mon::clear(ctx, vfs, &mon)
        };
        self.sync_ticket_if_on_host();
        self.last_toast = if held {
            format!("{host} OK — it held")
        } else {
            format!("{host} FLAP — it came back. Stop it coming back, then the noise, then Clear.")
        };
        Ok(held)
    }

    pub fn close_ticket(&mut self) -> Result<(), String> {
        let id = self
            .current_id
            .clone()
            .ok_or_else(|| "No ticket in progress".to_string())?;
        let mission = missions::get(&id).ok_or("unknown ticket")?;
        let won = {
            let Some((ctx, vfs)) = self.live_pair() else {
                return Err("Work remaining. The tracker is not done.".into());
            };
            (mission.won)(ctx, vfs)
        };
        if !won {
            return Err("Work remaining. The tracker is not done.".into());
        }
        if !self.completed.iter().any(|c| c == &id) {
            self.completed.push(id.clone());
            let pay = mission.pay();
            let clean = if self.mission_hints == 0 {
                CLEAN_BONUS
            } else {
                0
            };
            self.score += pay + clean;
            self.shift_min += mission.minutes();
            self.shift_closed.push(id.clone());
        }
        self.current_id = None;
        self.shell.mission_id = None;
        self.shell.infra.ticket = None;
        self.last_toast = format!("{} closed", mission.title);
        Ok(())
    }

    pub fn tracker(&self) -> Vec<(String, bool)> {
        let Some(id) = &self.current_id else {
            return Vec::new();
        };
        let Some(mission) = missions::get(id) else {
            return Vec::new();
        };
        let Some((ctx, vfs)) = self.live_pair() else {
            return (mission.objectives)(&ShellCtx::default(), &self.shell.vfs)
                .into_iter()
                .map(|(l, _)| (l, false))
                .collect();
        };
        (mission.objectives)(ctx, vfs)
    }

    pub fn prompt(&self) -> String {
        self.shell.prompt()
    }

    pub fn punch_out(&mut self) -> PunchReport {
        let leftover = self.today_work().len();
        let on_time =
            self.shift_min <= SHIFT_END && leftover == 0 && !self.shift_closed.is_empty();
        if on_time {
            self.score += ON_TIME_BONUS;
        }
        self.shift_day += 1;
        self.shift_min = SHIFT_START;
        self.shift_closed.clear();
        self.current_id = None;
        self.mission_hints = 0;
        self.shell = Shell::with_desk();
        self.last_toast = if leftover == 0 {
            "SHIFT CLOSED".into()
        } else {
            format!("SHIFT CLOSED — {leftover} leftover roll")
        };
        PunchReport {
            leftover,
            on_time,
            score: self.score,
            next_day: self.shift_day,
        }
    }

    pub fn to_save(&self) -> Save {
        Save {
            completed: self.completed.clone(),
            score: self.score,
            hints_used: self.hints_used,
            shift_day: self.shift_day,
            shift_min: self.shift_min,
            seen_briefing: self.seen_briefing,
        }
    }

    pub fn apply_save(&mut self, save: Save) {
        self.completed = save.completed;
        self.score = save.score;
        self.hints_used = save.hints_used;
        self.shift_day = save.shift_day;
        self.shift_min = save.shift_min;
        self.seen_briefing = save.seen_briefing;
        self.current_id = None;
        self.mission_hints = 0;
        self.shift_closed.clear();
        self.shell = Shell::with_desk();
        self.last_toast.clear();
        self.last_intro.clear();
    }

    pub fn save_json(&self) -> String {
        serde_json::to_string(&self.to_save()).expect("save json")
    }

    pub fn load_json(&mut self, raw: &str) -> Result<(), String> {
        let save: Save = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        self.apply_save(save);
        Ok(())
    }

    pub fn tracker_rows(&self) -> Vec<TrackerRow> {
        self.tracker()
            .into_iter()
            .map(|(label, done)| TrackerRow { label, done })
            .collect()
    }

    pub fn frame(&self, out: &Output) -> Frame {
        let (pager_active, pager_view, pager_status) = match &self.shell.pager {
            Some(p) => (true, p.visible(), p.status_line()),
            None => (false, String::new(), String::new()),
        };
        Frame {
            stdout: out.stdout.clone(),
            stderr: out.stderr.clone(),
            code: out.code,
            clear: out.clear,
            host: self.shell.host.clone(),
            cwd: self.shell.cwd.clone(),
            prompt: self.prompt(),
            toast: self.last_toast.clone(),
            current_id: self.current_id.clone(),
            score: self.score,
            tracker: self.tracker_rows(),
            pager_active,
            pager_view,
            pager_status,
        }
    }

    pub fn pager_key(&mut self, key: &str) -> Frame {
        self.shell.pager_key(key);
        self.frame(&Output::ok(""))
    }

    pub fn pager_json(&mut self, key: &str) -> String {
        serde_json::to_string(&self.pager_key(key)).expect("pager json")
    }

    pub fn completions(&self, line: &str) -> Vec<String> {
        self.shell.completions(line)
    }

    pub fn complete_json(&self, line: &str) -> String {
        serde_json::to_string(&self.completions(line)).expect("complete json")
    }

    pub fn tracker_json(&self) -> String {
        serde_json::to_string(&self.tracker_rows()).expect("tracker json")
    }

    pub fn completed_json(&self) -> String {
        serde_json::to_string(&self.completed).expect("completed json")
    }

    pub fn punch_out_json(&mut self) -> String {
        serde_json::to_string(&self.punch_out()).expect("punch json")
    }

    pub fn reset(&mut self) {
        *self = Game::new();
    }

    pub fn frame_json(&self, out: &Output) -> String {
        serde_json::to_string(&self.frame(out)).expect("frame json")
    }

    pub fn tickets_json(&self) -> String {
        serde_json::to_string(&self.tickets()).expect("tickets json")
    }

    pub fn mon_json(&self) -> String {
        serde_json::to_string(&self.mon_snapshot()).expect("mon json")
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}
