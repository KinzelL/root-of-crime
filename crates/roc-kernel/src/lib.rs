//! Headless simulation kernel for ROOT OF CRIME.
//!
//! Headless ROOT OF CRIME engine: VFS, shell, LAN, virt, monitoring minigame.
//! The Motif desk is still HTML/JS; wasm (`crates/roc-wasm`) is the next wire.

pub mod ctx;
pub mod game;
pub mod guest;
pub mod infra;
pub mod lan;
pub mod mission;
pub mod missions;
pub mod mon;
pub mod proc;
pub mod shell;
pub mod vfs;
pub mod virt;

pub use vfs::{
    abs, basename, chmod, chmod_bits, closet_motd, copy_file, create_base, create_guest, dir,
    dir_with, dirname, expand_glob, expand_home, file, file_with, find, format_long, join, js_len,
    mkdir, mode_string, move_file, normalize_path, parse_mode, parse_mode_bits, readable, resolve,
    resolve_mut, rm_recursive, size_of, size_of_skipping, touch, unlink, walk, write, Extra, Hit,
    Node, Resolve, ResolveMut, VfsError, WriteOpts, DEFAULT_HOME, DEFAULT_MTIME, WRITE_MTIME,
};

pub use shell::{
    parse_line, split_pipes, tokenize, Output, Pager, ParsedLine, Pipeline, Redirect, RedirOp,
    Segment, Shell, ShellCtx,
};

pub use guest::{Disk, Guest, MountShadow};
pub use virt::{
    attach_volume, booking_persisted, booking_settled, df_table, ensure_space, fstab_ready, mount,
    parse_size, reboot, stage_unmounted_volume, umount,
};
pub use infra::{Infra, RemoteSession, SessionKind, TicketOverlay};
pub use game::{Frame, Game, PunchReport, TrackerRow};
pub use lan::{catalog as lan_catalog, resolve as lan_resolve, Host, CATALOG as LAN_CATALOG};
pub use mission::{
    Mission, Monitor, Save, Setup, TicketCard, CLEAN_BONUS, HINT_COST, ON_TIME_BONUS, SHIFT_END,
    SHIFT_START,
};
pub use mon::{MonColor, MonRow, MonSnapshot};
pub use proc::{base_procs, default_connections, is_dead, proc, Conn, Proc};

/// Crate identity for the harness smoke test until the crate grows more modules.
pub const NAME: &str = "roc-kernel";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crate_loads() {
        assert_eq!(NAME, "roc-kernel");
    }
}
