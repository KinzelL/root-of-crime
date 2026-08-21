//! Text commands + headless pager. Matches `js/commands/text.js`.

use regex::RegexBuilder;

use crate::shell::exec::{retarget_cat, Pager};
use crate::vfs::{self, js_len};

use super::super::exec::Shell;
use super::super::output::Output;

impl Shell {
    pub(crate) fn cmd_cat(&mut self, args: &[String], stdin: &str) -> Output {
        if args.is_empty() {
            return Output::ok(stdin);
        }
        let mut chunks = Vec::new();
        for a in args {
            match self.read_file(a) {
                Ok(got) => {
                    self.note_read(&got.path);
                    chunks.push(got.text);
                }
                Err(e) => return Output::err(e),
            }
        }
        Output::ok(chunks.join(""))
    }

    pub(crate) fn cmd_less(&mut self, args: &[String], stdin: &str) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        let (text, title) = if !paths.is_empty() {
            let mut chunks = Vec::new();
            let mut title = String::new();
            for a in &paths {
                match self.read_file(a) {
                    Ok(got) => {
                        self.note_read(&got.path);
                        chunks.push(got.text);
                        title = got.path;
                    }
                    Err(e) => return Output::err(e.replacen("cat:", "less:", 1)),
                }
            }
            let text = chunks.join("\n");
            if paths.len() > 1 {
                title = format!("{} files", paths.len());
            }
            (text, title)
        } else {
            let text = stdin.to_string();
            if text.is_empty() {
                return Output::err("less: missing filename (try: less FILE)");
            }
            (text, "(stdin)".to_string())
        };
        let lines: Vec<String> = split_lines_one_nl(&text)
            .into_iter()
            .map(str::to_string)
            .collect();
        self.pager = Some(Pager {
            lines,
            pos: 0,
            title,
            page_size: 20,
        });
        // JS returns empty stdout; the pager paints the screen.
        Output::ok("")
    }

    pub(crate) fn cmd_head_tail(&mut self, args: &[String], stdin: &str, kind: &str) -> Output {
        let mut n = 10usize;
        let mut paths = Vec::new();
        let mut i = 0;
        while i < args.len() {
            if args[i] == "-n" && i + 1 < args.len() {
                n = parse_count(&args[i + 1]);
                i += 2;
            } else if is_count_flag(&args[i]) {
                let digits = args[i].trim_start_matches("-n").trim_start_matches('-');
                n = parse_count(digits);
                i += 1;
            } else {
                paths.push(args[i].as_str());
                i += 1;
            }
        }
        let mut text = stdin.to_string();
        if let Some(path) = paths.first() {
            match self.read_file(path) {
                Ok(got) => {
                    self.note_read(&got.path);
                    text = got.text;
                }
                Err(e) => return Output::err(retarget_cat(&e, kind)),
            }
        }
        let lines = split_lines_one_nl(&text);
        let slice: Vec<&str> = if kind == "head" {
            lines.into_iter().take(n).collect()
        } else {
            let start = lines.len().saturating_sub(n);
            lines.into_iter().skip(start).collect()
        };
        Output::ok(slice.join("\n"))
    }

    pub(crate) fn cmd_wc(&mut self, args: &[String], stdin: &str) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        if paths.is_empty() {
            return Output::ok(wc_line(stdin, None));
        }
        let mut rows = Vec::new();
        for p in paths {
            match self.read_file(p) {
                Ok(got) => rows.push(wc_line(&got.text, Some(p))),
                Err(e) => return Output::err(retarget_cat(&e, "wc")),
            }
        }
        Output::ok(rows.join("\n"))
    }

    pub(crate) fn cmd_sort(&mut self, args: &[String], stdin: &str) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        let mut text = stdin.to_string();
        if let Some(path) = paths.first() {
            match self.read_file(path) {
                Ok(got) => text = got.text,
                Err(e) => return Output::err(retarget_cat(&e, "sort")),
            }
        }
        let mut lines: Vec<&str> = split_lines_one_nl(&text);
        lines.sort();
        Output::ok(lines.join("\n"))
    }

    pub(crate) fn cmd_uniq(&mut self, args: &[String], stdin: &str) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        let mut text = stdin.to_string();
        if let Some(path) = paths.first() {
            match self.read_file(path) {
                Ok(got) => text = got.text,
                Err(e) => return Output::err(retarget_cat(&e, "uniq")),
            }
        }
        let lines = split_lines_one_nl(&text);
        let mut out: Vec<&str> = Vec::new();
        for line in lines {
            if out.last() != Some(&line) {
                out.push(line);
            }
        }
        Output::ok(out.join("\n"))
    }

    pub(crate) fn cmd_grep(&mut self, args: &[String], stdin: &str) -> Output {
        let mut flags = std::collections::HashSet::new();
        let mut rest = Vec::new();
        for a in args {
            if a.starts_with('-') && a != "-" {
                for c in a.chars().skip(1) {
                    flags.insert(c);
                }
            } else {
                rest.push(a.as_str());
            }
        }
        let recursive = flags.contains(&'r') || flags.contains(&'R');
        if rest.is_empty() && stdin.is_empty() {
            return Output::err("Usage: grep [ -i ] [ -r ] PATTERN [FILE...]");
        }
        if rest.is_empty() {
            return Output::err("Usage: grep [ -i ] [ -r ] PATTERN [FILE...]");
        }
        let pattern = rest[0];
        let mut files: Vec<String> = rest[1..].iter().map(|s| (*s).to_string()).collect();
        if files.is_empty() && stdin.is_empty() && !recursive {
            return Output::err("Usage: grep [ -i ] [ -r ] PATTERN [FILE...]");
        }
        let re = match RegexBuilder::new(pattern)
            .case_insensitive(flags.contains(&'i'))
            .build()
        {
            Ok(re) => re,
            Err(_) => return Output::err("grep: invalid pattern"),
        };

        let mut hits = Vec::new();
        let search_text = |text: &str, label: &str, hits: &mut Vec<String>| {
            for line in text.split('\n') {
                if re.is_match(line) {
                    if label.is_empty() {
                        hits.push(line.to_string());
                    } else {
                        hits.push(format!("{label}:{line}"));
                    }
                }
            }
        };

        if files.is_empty() {
            if recursive {
                files.push(".".to_string());
            } else {
                search_text(stdin, "", &mut hits);
                if !hits.is_empty() {
                    self.ctx.grep_hits += hits.len() as i32;
                }
                return Output::ok(hits.join("\n"));
            }
        }

        let label_paths = files.len() + usize::from(recursive) > 1;
        let mut newly_read = Vec::new();
        for path_arg in &files {
            match vfs::resolve(&self.vfs, &self.cwd, path_arg, &self.home) {
                None => hits.push(format!("grep: {path_arg}: No such file or directory")),
                Some(res) if res.node.is_dir() => {
                    if recursive {
                        vfs::walk(res.node, &res.path, |node, path| {
                            if node.is_file() && vfs::readable(node) {
                                let before = hits.len();
                                search_text(node.content().unwrap_or(""), path, &mut hits);
                                if hits.len() > before {
                                    newly_read.push(path.to_string());
                                }
                            }
                        });
                    } else {
                        hits.push(format!("grep: {path_arg}: Is a directory"));
                    }
                }
                Some(res) if !vfs::readable(res.node) => {
                    hits.push(format!("grep: {path_arg}: Permission denied"));
                }
                Some(res) => {
                    newly_read.push(res.path.clone());
                    let label = if label_paths { res.path.as_str() } else { "" };
                    search_text(res.node.content().unwrap_or(""), label, &mut hits);
                }
            }
        }
        for p in newly_read {
            self.note_read(&p);
        }
        if !hits.is_empty() {
            self.ctx.grep_hits += hits.len() as i32;
            self.ctx.grep_patterns.push(pattern.to_lowercase());
        }
        Output::ok(hits.join("\n"))
    }
}

fn split_lines_one_nl(text: &str) -> Vec<&str> {
    let t = text.strip_suffix('\n').unwrap_or(text);
    t.split('\n').collect()
}

fn is_count_flag(arg: &str) -> bool {
    // JS `/^-n?\d+$/`
    let Some(rest) = arg.strip_prefix('-') else {
        return false;
    };
    let rest = rest.strip_prefix('n').unwrap_or(rest);
    !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit())
}

fn parse_count(s: &str) -> usize {
    match s.parse::<usize>() {
        Ok(0) | Err(_) => 10,
        Ok(n) => n,
    }
}

fn wc_line(text: &str, label: Option<&str>) -> String {
    let lines = if text.is_empty() {
        0
    } else {
        split_lines_one_nl(text).len()
    };
    let words = if text.trim().is_empty() {
        0
    } else {
        text.trim().split_whitespace().count()
    };
    let bytes = js_len(text);
    let row = format!("{lines:>7} {words:>7} {bytes:>7}");
    match label {
        Some(p) => format!("{row} {p}"),
        None => row,
    }
}
