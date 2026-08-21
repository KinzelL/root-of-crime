//! JS-facing handle around [`roc_kernel::Game`].
//!
//! Native tests use this as an rlib. The Motif desk loads `pkg/roc_wasm.js`
//! (wasm-bindgen, `--target web`) when that file exists; otherwise it keeps
//! the JS engine.

use roc_kernel::{Frame, Game, MonSnapshot, Output, PunchReport, Save, TicketCard, TrackerRow};
use wasm_bindgen::prelude::*;

/// Session the desk will own (one per tab).
#[wasm_bindgen]
pub struct Desk {
    game: Game,
}

impl Desk {
    pub fn boot() -> Self {
        Self { game: Game::new() }
    }

    pub fn work_ticket(&mut self, id: &str) -> Result<String, String> {
        self.game.work_ticket(id)
    }

    pub fn run(&mut self, line: &str) -> Output {
        self.game.run(line)
    }

    /// One command plus host/cwd/prompt/tracker — what xterm and NetMoth paint.
    pub fn run_json(&mut self, line: &str) -> String {
        let out = self.game.run(line);
        self.game.frame_json(&out)
    }

    pub fn frame(&self, out: &Output) -> Frame {
        self.game.frame(out)
    }

    pub fn mon_snapshot(&self) -> MonSnapshot {
        self.game.mon_snapshot()
    }

    pub fn mon_json(&self) -> String {
        self.game.mon_json()
    }

    pub fn mon_clear(&mut self, host: &str) -> Result<bool, String> {
        self.game.mon_clear(host)
    }

    pub fn close_ticket(&mut self) -> Result<(), String> {
        self.game.close_ticket()
    }

    pub fn host(&self) -> &str {
        &self.game.shell.host
    }

    pub fn cwd(&self) -> &str {
        &self.game.shell.cwd
    }

    pub fn prompt(&self) -> String {
        self.game.prompt()
    }

    pub fn toast(&self) -> &str {
        &self.game.last_toast
    }

    pub fn intro(&self) -> &str {
        &self.game.last_intro
    }

    pub fn tracker(&self) -> Vec<(String, bool)> {
        self.game.tracker()
    }

    pub fn tracker_rows(&self) -> Vec<TrackerRow> {
        self.game.tracker_rows()
    }

    pub fn tickets(&self) -> Vec<TicketCard> {
        self.game.tickets()
    }

    pub fn tickets_json(&self) -> String {
        self.game.tickets_json()
    }

    pub fn completed(&self) -> &[String] {
        &self.game.completed
    }

    pub fn score(&self) -> i32 {
        self.game.score
    }

    pub fn save(&self) -> Save {
        self.game.to_save()
    }

    pub fn save_json(&self) -> String {
        self.game.save_json()
    }

    pub fn load_json(&mut self, raw: &str) -> Result<(), String> {
        self.game.load_json(raw)
    }

    pub fn punch_out(&mut self) -> PunchReport {
        self.game.punch_out()
    }

    pub fn reset(&mut self) {
        self.game.reset();
    }
}

fn js_err(msg: String) -> JsValue {
    JsValue::from_str(&msg)
}

#[wasm_bindgen]
impl Desk {
    #[wasm_bindgen(constructor)]
    pub fn js_new() -> Desk {
        Desk::boot()
    }

    #[wasm_bindgen(js_name = workTicket)]
    pub fn js_work_ticket(&mut self, id: &str) -> Result<String, JsValue> {
        self.work_ticket(id).map_err(js_err)
    }

    #[wasm_bindgen(js_name = runJson)]
    pub fn js_run_json(&mut self, line: &str) -> String {
        self.run_json(line)
    }

    #[wasm_bindgen(js_name = monJson)]
    pub fn js_mon_json(&self) -> String {
        self.mon_json()
    }

    #[wasm_bindgen(js_name = monClear)]
    pub fn js_mon_clear(&mut self, host: &str) -> Result<bool, JsValue> {
        self.mon_clear(host).map_err(js_err)
    }

    #[wasm_bindgen(js_name = closeTicket)]
    pub fn js_close_ticket(&mut self) -> Result<(), JsValue> {
        self.close_ticket().map_err(js_err)
    }

    #[wasm_bindgen(js_name = host)]
    pub fn js_host(&self) -> String {
        self.host().to_string()
    }

    #[wasm_bindgen(js_name = cwd)]
    pub fn js_cwd(&self) -> String {
        self.cwd().to_string()
    }

    #[wasm_bindgen(js_name = prompt)]
    pub fn js_prompt(&self) -> String {
        self.prompt()
    }

    #[wasm_bindgen(js_name = toast)]
    pub fn js_toast(&self) -> String {
        self.toast().to_string()
    }

    #[wasm_bindgen(js_name = intro)]
    pub fn js_intro(&self) -> String {
        self.intro().to_string()
    }

    #[wasm_bindgen(js_name = ticketsJson)]
    pub fn js_tickets_json(&self) -> String {
        self.tickets_json()
    }

    #[wasm_bindgen(js_name = trackerJson)]
    pub fn js_tracker_json(&self) -> String {
        self.game.tracker_json()
    }

    #[wasm_bindgen(js_name = completedJson)]
    pub fn js_completed_json(&self) -> String {
        self.game.completed_json()
    }

    #[wasm_bindgen(js_name = score)]
    pub fn js_score(&self) -> i32 {
        self.score()
    }

    #[wasm_bindgen(js_name = currentId)]
    pub fn js_current_id(&self) -> String {
        self.game.current_id.clone().unwrap_or_default()
    }

    #[wasm_bindgen(js_name = saveJson)]
    pub fn js_save_json(&self) -> String {
        self.save_json()
    }

    #[wasm_bindgen(js_name = loadJson)]
    pub fn js_load_json(&mut self, raw: &str) -> Result<(), JsValue> {
        self.load_json(raw).map_err(js_err)
    }

    #[wasm_bindgen(js_name = punchOutJson)]
    pub fn js_punch_out_json(&mut self) -> String {
        self.game.punch_out_json()
    }

    #[wasm_bindgen(js_name = pagerJson)]
    pub fn js_pager_json(&mut self, key: &str) -> String {
        self.game.pager_json(key)
    }

    #[wasm_bindgen(js_name = completeJson)]
    pub fn js_complete_json(&self, line: &str) -> String {
        self.game.complete_json(line)
    }

    #[wasm_bindgen(js_name = reset)]
    pub fn js_reset(&mut self) {
        self.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desk_boots_on_closet() {
        let d = Desk::boot();
        assert_eq!(d.host(), "closet");
        assert!(d.prompt().starts_with("itguy@closet:"));
    }

    #[test]
    fn json_run_help_on_desk_ticket() {
        let mut d = Desk::boot();
        d.work_ticket("the-desk").unwrap();
        let raw = d.run_json("help");
        assert!(raw.contains("this text"));
        assert!(raw.contains("\"code\":0"));
        let tickets = d.tickets_json();
        assert!(tickets.contains("the-desk"));
        assert!(tickets.contains("mon-printer"));
    }

    #[test]
    fn save_roundtrip() {
        let mut d = Desk::boot();
        d.work_ticket("the-desk").unwrap();
        d.run("help");
        d.run("man ls");
        d.close_ticket().unwrap();
        let blob = d.save_json();
        let mut e = Desk::boot();
        e.load_json(&blob).unwrap();
        assert!(e.completed().iter().any(|c| c == "the-desk"));
        assert!(e.score() > 0);
        assert_eq!(e.host(), "closet");
    }

    #[test]
    fn complete_help_prefix() {
        let d = Desk::boot();
        let hits = d.game.completions("he");
        assert!(hits.iter().any(|h| h == "help"));
        assert!(hits.iter().any(|h| h == "head"));
    }
}
