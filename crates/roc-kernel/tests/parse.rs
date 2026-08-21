//! Public parser API. Mirrors `Terminal._execute` splitting in `js/terminal.js`.

use roc_kernel::{parse_line, ParsedLine, RedirOp};

fn tokens(raw: &str) -> Vec<Vec<String>> {
    match parse_line(raw) {
        ParsedLine::Pipeline(p) => p.segments.into_iter().map(|s| s.tokens).collect(),
        ParsedLine::Empty => panic!("expected pipeline from {raw:?}"),
    }
}

#[test]
fn quoted_pipe_and_append() {
    match parse_line(r#"echo "hello world" | cat >> /tmp/out"#) {
        ParsedLine::Pipeline(p) => {
            assert_eq!(
                p.segments
                    .iter()
                    .map(|s| s.tokens.clone())
                    .collect::<Vec<_>>(),
                vec![vec!["echo", "hello world"], vec!["cat"]]
            );
            let r = p.redirect.expect("append");
            assert_eq!(r.op, RedirOp::Append);
            assert_eq!(r.path, "/tmp/out");
        }
        ParsedLine::Empty => panic!("not empty"),
    }
}

#[test]
fn hash_and_blank_are_empty() {
    assert_eq!(parse_line(""), ParsedLine::Empty);
    assert_eq!(parse_line("# skip"), ParsedLine::Empty);
}

#[test]
fn simple_argv() {
    assert_eq!(tokens("ls -la ~"), vec![vec!["ls", "-la", "~"]]);
}
