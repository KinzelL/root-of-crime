//! Line parser. Matches `Terminal._execute` / `_parse` / `_splitPipes` in `js/terminal.js`.
//!
//! Does not run commands, expand globs, or handle `sudo`.

use std::sync::OnceLock;

use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedLine {
    /// Whitespace, empty, or a `#` comment (including `raw.trim().startsWith('#')`).
    Empty,
    Pipeline(Pipeline),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pipeline {
    pub segments: Vec<Segment>,
    pub redirect: Option<Redirect>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub tokens: Vec<String>,
}

impl Segment {
    pub fn name(&self) -> Option<&str> {
        self.tokens.first().map(String::as_str)
    }

    pub fn args(&self) -> &[String] {
        self.tokens.get(1..).unwrap_or(&[])
    }

    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedirOp {
    /// `>`
    Truncate,
    /// `>>`
    Append,
}

impl RedirOp {
    pub fn as_str(self) -> &'static str {
        match self {
            RedirOp::Truncate => ">",
            RedirOp::Append => ">>",
        }
    }
}

impl std::fmt::Display for RedirOp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Redirect {
    pub op: RedirOp,
    pub path: String,
}

fn token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?:[^\s"']+|"[^"]*"|'[^']*')+"#).unwrap())
}

fn unquote_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^["']|["']$"#).unwrap())
}

fn redirect_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(.*?)(>>|>)\s*(\S+)\s*$").unwrap())
}

/// Tokenize one pipeline segment. Same regex as `Terminal._parse`.
pub fn tokenize(line: &str) -> Vec<String> {
    token_re()
        .find_iter(line)
        .map(|m| unquote_re().replace_all(m.as_str(), "").into_owned())
        .collect()
}

/// Split on `|` that are not inside quotes. Empty segments from a `|` are kept
/// (JS always `parts.push(cur.trim())` on a pipe).
pub fn split_pipes(line: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for ch in line.chars() {
        if quote.is_some() {
            if Some(ch) == quote {
                quote = None;
            }
            cur.push(ch);
        } else if ch == '"' || ch == '\'' {
            quote = Some(ch);
            cur.push(ch);
        } else if ch == '|' {
            parts.push(cur.trim().to_string());
            cur.clear();
        } else {
            cur.push(ch);
        }
    }
    if !cur.trim().is_empty() {
        parts.push(cur.trim().to_string());
    }
    parts
}

fn split_redirect(line: &str) -> (&str, Option<Redirect>) {
    let Some(caps) = redirect_re().captures(line) else {
        return (line, None);
    };
    let rest = caps.get(1).map(|m| m.as_str()).unwrap_or("").trim();
    let op = match caps.get(2).map(|m| m.as_str()) {
        Some(">>") => RedirOp::Append,
        _ => RedirOp::Truncate,
    };
    let path = caps.get(3).map(|m| m.as_str()).unwrap_or("").to_string();
    (rest, Some(Redirect { op, path }))
}

/// Parse a raw command line. No execution.
pub fn parse_line(raw: &str) -> ParsedLine {
    let mut line = raw.trim();
    if line.is_empty() || line.starts_with('#') {
        return ParsedLine::Empty;
    }
    if let Some(hash) = line.find(" #") {
        line = line[..hash].trim();
        if line.is_empty() {
            return ParsedLine::Empty;
        }
    }

    let (line, redirect) = split_redirect(line);
    let segments: Vec<Segment> = split_pipes(line)
        .into_iter()
        .map(|part| Segment {
            tokens: tokenize(&part),
        })
        .collect();

    if segments.is_empty() && redirect.is_none() {
        return ParsedLine::Empty;
    }

    ParsedLine::Pipeline(Pipeline { segments, redirect })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pipeline(raw: &str) -> Pipeline {
        match parse_line(raw) {
            ParsedLine::Pipeline(p) => p,
            other => panic!("expected pipeline, got {other:?} from {raw:?}"),
        }
    }

    fn names(raw: &str) -> Vec<Vec<String>> {
        pipeline(raw)
            .segments
            .into_iter()
            .map(|s| s.tokens)
            .collect()
    }

    #[test]
    fn empty_and_comments() {
        assert_eq!(parse_line(""), ParsedLine::Empty);
        assert_eq!(parse_line("   \t  "), ParsedLine::Empty);
        assert_eq!(parse_line("# full line"), ParsedLine::Empty);
        assert_eq!(parse_line("  # indented"), ParsedLine::Empty);
    }

    #[test]
    fn strips_space_hash_comments() {
        assert_eq!(names("echo foo # bar"), vec![vec!["echo", "foo"]]);
        assert_eq!(names("echo foo#bar"), vec![vec!["echo", "foo#bar"]]);
    }

    #[test]
    fn comment_strip_does_not_respect_quotes() {
        // JS: indexOf(' #') is not quote-aware.
        assert_eq!(names(r#"echo "foo # bar""#), vec![vec!["echo", "foo"]]);
    }

    #[test]
    fn tokenize_splits_on_whitespace() {
        assert_eq!(tokenize("ls -la /tmp"), vec!["ls", "-la", "/tmp"]);
        assert_eq!(tokenize("echo   hello\tworld"), vec!["echo", "hello", "world"]);
    }

    #[test]
    fn tokenize_strips_matching_quotes() {
        assert_eq!(tokenize(r#"echo "hello world""#), vec!["echo", "hello world"]);
        assert_eq!(tokenize("echo 'hello world'"), vec!["echo", "hello world"]);
        assert_eq!(tokenize(r#"echo "'inner'""#), vec!["echo", "'inner'"]);
    }

    #[test]
    fn tokenize_concatenates_adjacent_atoms() {
        assert_eq!(tokenize(r#"foo"bar""#), vec!["foo\"bar"]);
        assert_eq!(tokenize(r#""hello"'world'"#), vec!["hello\"'world"]);
    }

    #[test]
    fn pipes_split_outside_quotes() {
        assert_eq!(
            names("echo a | cat"),
            vec![vec!["echo", "a"], vec!["cat"]]
        );
        assert_eq!(
            names(r#"echo "a|b" | cat"#),
            vec![vec!["echo", "a|b"], vec!["cat"]]
        );
        assert_eq!(
            names("grep foo | sort | uniq"),
            vec![vec!["grep", "foo"], vec!["sort"], vec!["uniq"]]
        );
    }

    #[test]
    fn pipes_keep_empty_segments_from_bar() {
        assert_eq!(split_pipes("| echo"), vec!["", "echo"]);
        assert_eq!(split_pipes("echo | | cat"), vec!["echo", "", "cat"]);
        assert_eq!(split_pipes("echo |"), vec!["echo"]);
    }

    #[test]
    fn redirect_truncate_and_append() {
        let p = pipeline("echo hi > out");
        assert_eq!(p.segments[0].tokens, ["echo", "hi"]);
        assert_eq!(
            p.redirect,
            Some(Redirect {
                op: RedirOp::Truncate,
                path: "out".into(),
            })
        );

        let p = pipeline("cat file >> dest");
        assert_eq!(p.segments[0].tokens, ["cat", "file"]);
        let redir = p.redirect.expect("append redirect");
        assert_eq!(redir.op, RedirOp::Append);
        assert_eq!(redir.path, "dest");
    }

    #[test]
    fn redirect_does_not_need_space_before_op() {
        let p = pipeline("echo hi>out");
        assert_eq!(p.segments[0].tokens, ["echo", "hi"]);
        let redir = p.redirect.expect("truncate redirect");
        assert_eq!(redir.path, "out");
        assert_eq!(redir.op, RedirOp::Truncate);
    }

    #[test]
    fn redirect_is_the_first_op_that_can_anchor_at_eol() {
        // `echo foo>bar>baz` → first `>` then `\S+` is `bar>baz`.
        let p = pipeline("echo foo>bar>baz");
        assert_eq!(p.segments[0].tokens, ["echo", "foo"]);
        assert_eq!(p.redirect.expect("path with extra >").path, "bar>baz");

        // The `>` that can still match `\S+\s*$` is the last one.
        let p = pipeline("echo a > b > c");
        assert_eq!(p.segments[0].tokens, ["echo", "a", ">", "b"]);
        assert_eq!(p.redirect.expect("eol redirect").path, "c");
    }

    #[test]
    fn redirect_does_not_respect_quotes() {
        let p = pipeline(r#"echo "x > y""#);
        assert_eq!(p.segments[0].tokens, ["echo", "x"]);
        assert_eq!(p.redirect.unwrap().path, "y\"");
    }

    #[test]
    fn redirect_after_pipes() {
        let p = pipeline("echo a | tee > out");
        assert_eq!(
            p.segments.iter().map(|s| s.tokens.clone()).collect::<Vec<_>>(),
            vec![vec!["echo", "a"], vec!["tee"]]
        );
        let redir = p.redirect.expect("pipe then redirect");
        assert_eq!(redir.op, RedirOp::Truncate);
        assert_eq!(redir.path, "out");
    }

    #[test]
    fn redirect_in_the_middle_is_not_a_redirect() {
        let p = pipeline("echo foo > out | cat");
        assert!(p.redirect.is_none());
        assert_eq!(
            names("echo foo > out | cat"),
            vec![vec!["echo", "foo", ">", "out"], vec!["cat"]]
        );
    }

    #[test]
    fn comment_then_redirect() {
        let p = pipeline("echo hi > out # nope");
        assert_eq!(p.segments[0].tokens, ["echo", "hi"]);
        assert_eq!(p.redirect.unwrap().path, "out");
    }

    #[test]
    fn redirect_only_line() {
        let p = pipeline("> out");
        assert!(p.segments.iter().all(|s| s.is_empty()) || p.segments.is_empty());
        assert_eq!(p.redirect.unwrap().path, "out");
    }

    #[test]
    fn segment_name_and_args() {
        let p = pipeline("chmod 644 a b");
        let s = &p.segments[0];
        assert_eq!(s.name(), Some("chmod"));
        assert_eq!(s.args(), &["644", "a", "b"]);
    }
}
