//! Virtual filesystem. Behavior matches `js/vfs.js`.

mod node;
mod ops;
mod path;
mod trees;

pub use node::{
    dir, dir_with, file, file_with, format_long, js_len, mode_string, parse_mode, parse_mode_bits,
    readable, Extra, Node, DEFAULT_MTIME,
};
pub use ops::{
    chmod, chmod_bits, copy_file, expand_glob, find, mkdir, move_file, resolve, resolve_mut,
    rm_recursive, size_of, size_of_skipping, touch, unlink, walk, write, Hit, Resolve, ResolveMut,
    VfsError, WriteOpts, WRITE_MTIME,
};
pub use path::{abs, basename, dirname, expand_home, join, normalize_path, DEFAULT_HOME};
pub use trees::{closet_motd, create_base, create_guest};
