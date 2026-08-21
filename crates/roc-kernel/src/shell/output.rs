//! Command result. Matches `Terminal._ok` / `_err` in `js/terminal.js`.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
    #[serde(default)]
    pub clear: bool,
}

impl Output {
    pub fn ok(stdout: impl Into<String>) -> Self {
        let stdout = stdout.into();
        let stdout = if stdout.is_empty() {
            String::new()
        } else if stdout.ends_with('\n') {
            stdout
        } else {
            format!("{stdout}\n")
        };
        Self {
            stdout,
            stderr: String::new(),
            code: 0,
            clear: false,
        }
    }

    pub fn clear_screen() -> Self {
        Self {
            stdout: String::new(),
            stderr: String::new(),
            code: 0,
            clear: true,
        }
    }

    pub fn err(stderr: impl Into<String>) -> Self {
        Self::err_code(stderr, 1)
    }

    pub fn err_code(stderr: impl Into<String>, code: i32) -> Self {
        Self {
            stdout: String::new(),
            stderr: stderr.into(),
            code,
            clear: false,
        }
    }

    pub fn success(&self) -> bool {
        self.code == 0
    }
}
