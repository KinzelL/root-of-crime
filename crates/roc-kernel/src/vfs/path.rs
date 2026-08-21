//! Path helpers. Matches `js/vfs.js` join / abs / dirname / basename.

pub const DEFAULT_HOME: &str = "/home/itguy";

pub fn normalize_path(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            parts.pop();
        } else {
            parts.push(part);
        }
    }
    let mut out = String::from("/");
    out.push_str(&parts.join("/"));
    out
}

pub fn join(a: &str, b: &str) -> String {
    if b.is_empty() || b == "." {
        return a.to_string();
    }
    if b.starts_with('/') {
        return normalize_path(b);
    }
    let trimmed = a.trim_end_matches('/');
    normalize_path(&format!("{trimmed}/{b}"))
}

pub fn expand_home(path: &str, home: &str) -> String {
    if path == "~" {
        return home.to_string();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return join(home, rest);
    }
    path.to_string()
}

pub fn abs(cwd: &str, path: &str, home: &str) -> String {
    let raw = if path.is_empty() {
        cwd.to_string()
    } else {
        expand_home(path, home)
    };
    if raw.starts_with('/') {
        normalize_path(&raw)
    } else {
        join(cwd, &raw)
    }
}

pub fn dirname(path: &str) -> String {
    let full = normalize_path(path);
    if full == "/" {
        return full;
    }
    match full.rfind('/') {
        Some(0) | None => "/".to_string(),
        Some(i) => full[..i].to_string(),
    }
}

pub fn basename(path: &str) -> String {
    let full = normalize_path(path);
    if full == "/" {
        return full;
    }
    match full.rfind('/') {
        Some(i) => full[i + 1..].to_string(),
        None => full,
    }
}

/// `*` and `?` glob, same as `globToRegExp` in `js/vfs.js`.
pub fn glob_match(pat: &str, name: &str) -> bool {
    match_glob(pat, name)
}

fn match_glob(pat: &str, name: &str) -> bool {
    let mut p = pat;
    let mut n = name;
    loop {
        match p.chars().next() {
            None => return n.is_empty(),
            Some('*') => {
                p = &p[1..];
                if p.is_empty() {
                    return true;
                }
                let mut rest = n;
                loop {
                    if match_glob(p, rest) {
                        return true;
                    }
                    let Some(ch) = rest.chars().next() else {
                        return false;
                    };
                    rest = &rest[ch.len_utf8()..];
                }
            }
            Some('?') => {
                let Some(ch) = n.chars().next() else {
                    return false;
                };
                p = &p[1..];
                n = &n[ch.len_utf8()..];
            }
            Some(pc) => {
                let Some(nc) = n.chars().next() else {
                    return false;
                };
                if nc != pc {
                    return false;
                }
                p = &p[pc.len_utf8()..];
                n = &n[nc.len_utf8()..];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_abs_tilde_and_dotdot() {
        assert_eq!(abs("/home/itguy", "~", "/home/itguy"), "/home/itguy");
        assert_eq!(abs("/home/itguy", "..", "/home/itguy"), "/home");
    }

    #[test]
    fn normalize_drops_dots_and_pops_dotdot() {
        assert_eq!(normalize_path("/a/./b/../c"), "/a/c");
        assert_eq!(normalize_path("/../foo"), "/foo");
        assert_eq!(normalize_path(""), "/");
        assert_eq!(normalize_path("/"), "/");
    }

    #[test]
    fn join_absolute_replaces() {
        assert_eq!(join("/home/itguy", "/etc"), "/etc");
        assert_eq!(join("/home/itguy", "."), "/home/itguy");
        assert_eq!(join("/home/itguy/", "docs"), "/home/itguy/docs");
        assert_eq!(join("/", "foo"), "/foo");
    }

    #[test]
    fn dirname_basename_root() {
        assert_eq!(dirname("/"), "/");
        assert_eq!(basename("/"), "/");
        assert_eq!(dirname("/foo"), "/");
        assert_eq!(basename("/foo"), "foo");
        assert_eq!(dirname("/foo/bar"), "/foo");
        assert_eq!(basename("/foo/bar"), "bar");
    }

    #[test]
    fn expand_home_tilde_slash() {
        assert_eq!(expand_home("~", "/home/itguy"), "/home/itguy");
        assert_eq!(expand_home("~/welcome.txt", "/home/itguy"), "/home/itguy/welcome.txt");
        assert_eq!(expand_home("rel", "/home/itguy"), "rel");
    }

    #[test]
    fn abs_empty_is_cwd() {
        assert_eq!(abs("/home/itguy", "", "/home/itguy"), "/home/itguy");
    }

    #[test]
    fn glob_star_and_question() {
        assert!(glob_match("*", "welcome.txt"));
        assert!(glob_match("*", ".bashrc"));
        assert!(glob_match("*.txt", "welcome.txt"));
        assert!(!glob_match("*.txt", "welcome.log"));
        assert!(glob_match("a?c", "abc"));
        assert!(!glob_match("a?c", "ac"));
        assert!(glob_match("file.txt", "file.txt"));
        assert!(!glob_match("file.txt", "filextxt"));
    }
}
