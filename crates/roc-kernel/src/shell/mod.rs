//! Headless shell: parser (slice 3) + executor and filesystem commands (slice 4).

mod commands;
mod exec;
mod output;
mod parse;

pub use crate::ctx::ShellCtx;
pub use exec::{Pager, Shell};
pub use output::Output;
pub use parse::{
    parse_line, split_pipes, tokenize, ParsedLine, Pipeline, Redirect, RedirOp, Segment,
};
