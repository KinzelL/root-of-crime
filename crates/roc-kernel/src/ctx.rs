//! Session/mission flags shared by the shell and the LAN.

use std::collections::HashMap;

use crate::guest::Guest;
use crate::proc::{Conn, Proc};

#[derive(Debug, Clone, Default)]
pub struct ShellCtx {
    pub jail: Option<String>,
    pub removed: Vec<String>,
    pub chmod_count: i32,
    pub used_find: bool,
    pub read_files: Vec<String>,
    pub grep_hits: i32,
    pub grep_patterns: Vec<String>,
    pub processes: Option<Vec<Proc>>,
    pub killed: Vec<Proc>,
    pub disk_total: Option<u64>,
    pub connections: Option<Vec<Conn>>,
    pub last_log: String,
    pub used_netstat: bool,
    pub used_last: bool,
    pub used_crontab: bool,
    pub password_changed: Vec<String>,
    pub allow_passwd_for: Option<String>,
    pub guests: HashMap<String, Guest>,
    pub used_console: bool,
    pub used_help: bool,
    pub used_man: bool,
    pub used_hint: bool,
    pub hint_level: i32,
    pub mon_cleared: bool,
    pub mon_flap: bool,
    pub mon_quiet_ticks: u32,
}
