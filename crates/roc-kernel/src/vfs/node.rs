//! File and directory nodes. Matches `js/vfs.js` file / dir / mode / size.

use indexmap::IndexMap;

pub const DEFAULT_MTIME: &str = "Aug 14 09:00";

/// Optional metadata for [`file_with`] / [`dir_with`].
#[derive(Clone, Debug, Default)]
pub struct Extra {
    pub mode: Option<u32>,
    pub owner: Option<String>,
    pub group: Option<String>,
    pub mtime: Option<String>,
}

impl Extra {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mode(mut self, mode: u32) -> Self {
        self.mode = Some(mode);
        self
    }

    pub fn owner(mut self, owner: impl Into<String>) -> Self {
        self.owner = Some(owner.into());
        self
    }

    pub fn group(mut self, group: impl Into<String>) -> Self {
        self.group = Some(group.into());
        self
    }

    pub fn mtime(mut self, mtime: impl Into<String>) -> Self {
        self.mtime = Some(mtime.into());
        self
    }
}

#[derive(Clone, Debug)]
pub struct Meta {
    pub mode: u32,
    pub owner: String,
    pub group: String,
    pub mtime: String,
}

/// A file or directory. Children keep insertion order, like JS objects.
#[derive(Clone, Debug)]
pub enum Node {
    File {
        meta: Meta,
        content: String,
    },
    Dir {
        meta: Meta,
        children: IndexMap<String, Node>,
    },
}

impl Node {
    pub fn is_file(&self) -> bool {
        matches!(self, Node::File { .. })
    }

    pub fn is_dir(&self) -> bool {
        matches!(self, Node::Dir { .. })
    }

    pub fn kind(&self) -> &'static str {
        if self.is_dir() {
            "dir"
        } else {
            "file"
        }
    }

    pub fn meta(&self) -> &Meta {
        match self {
            Node::File { meta, .. } | Node::Dir { meta, .. } => meta,
        }
    }

    pub fn meta_mut(&mut self) -> &mut Meta {
        match self {
            Node::File { meta, .. } | Node::Dir { meta, .. } => meta,
        }
    }

    pub fn mode(&self) -> u32 {
        self.meta().mode
    }

    pub fn set_mode(&mut self, mode: u32) {
        self.meta_mut().mode = mode;
    }

    pub fn owner(&self) -> &str {
        &self.meta().owner
    }

    pub fn group(&self) -> &str {
        &self.meta().group
    }

    pub fn mtime(&self) -> &str {
        &self.meta().mtime
    }

    pub fn set_mtime(&mut self, mtime: impl Into<String>) {
        self.meta_mut().mtime = mtime.into();
    }

    pub fn content(&self) -> Option<&str> {
        match self {
            Node::File { content, .. } => Some(content),
            Node::Dir { .. } => None,
        }
    }

    pub fn content_mut(&mut self) -> Option<&mut String> {
        match self {
            Node::File { content, .. } => Some(content),
            Node::Dir { .. } => None,
        }
    }

    pub fn children(&self) -> Option<&IndexMap<String, Node>> {
        match self {
            Node::Dir { children, .. } => Some(children),
            Node::File { .. } => None,
        }
    }

    pub fn children_mut(&mut self) -> Option<&mut IndexMap<String, Node>> {
        match self {
            Node::Dir { children, .. } => Some(children),
            Node::File { .. } => None,
        }
    }
}

fn meta_from(extra: &Extra, default_mode: u32) -> Meta {
    Meta {
        mode: extra.mode.unwrap_or(default_mode),
        owner: extra.owner.clone().unwrap_or_else(|| "root".to_string()),
        group: extra.group.clone().unwrap_or_else(|| "root".to_string()),
        mtime: extra.mtime.clone().unwrap_or_else(|| DEFAULT_MTIME.to_string()),
    }
}

pub fn file(content: impl Into<String>) -> Node {
    file_with(content, Extra::new())
}

pub fn file_with(content: impl Into<String>, extra: Extra) -> Node {
    Node::File {
        meta: meta_from(&extra, 0o644),
        content: content.into(),
    }
}

pub fn dir(children: IndexMap<String, Node>) -> Node {
    dir_with(children, Extra::new())
}

pub fn dir_with(children: IndexMap<String, Node>, extra: Extra) -> Node {
    Node::Dir {
        meta: meta_from(&extra, 0o755),
        children,
    }
}

/// JS `String.length` (UTF-16 code units), used by `sizeOf` / `formatLong`.
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

pub fn parse_mode(raw: &str) -> Option<u32> {
    let s = raw.trim();
    if s.len() < 3 || s.len() > 4 {
        return None;
    }
    if !s.bytes().all(|b| (b'0'..=b'7').contains(&b)) {
        return None;
    }
    u32::from_str_radix(&s[s.len() - 3..], 8).ok()
}

pub fn parse_mode_bits(raw: u32) -> u32 {
    raw & 0o777
}

pub fn mode_string(node: &Node) -> String {
    let prefix = if node.is_dir() { 'd' } else { '-' };
    let mode = node.mode();
    let mut out = String::from(prefix);
    let mut shift = 6;
    loop {
        let n = (mode >> shift) & 7;
        out.push(if n & 4 != 0 { 'r' } else { '-' });
        out.push(if n & 2 != 0 { 'w' } else { '-' });
        out.push(if n & 1 != 0 { 'x' } else { '-' });
        if shift == 0 {
            break;
        }
        shift -= 3;
    }
    out
}

pub fn readable(node: &Node) -> bool {
    if node.is_dir() {
        return true;
    }
    (node.mode() & 0o444) != 0
}

pub fn format_long(name: &str, node: &Node) -> String {
    let perm = mode_string(node);
    let size = if node.is_dir() {
        4096
    } else {
        node.content().map(js_len).unwrap_or(0)
    };
    format!(
        "{perm} 1 {:<10} {:<10} {:>7} {} {name}",
        node.owner(),
        node.group(),
        size,
        node.mtime()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mode_octal_strings_and_bits() {
        assert_eq!(parse_mode("644"), Some(0o644));
        assert_eq!(parse_mode("0755"), Some(0o755));
        assert_eq!(parse_mode("1777"), Some(0o777));
        assert_eq!(parse_mode("18"), None);
        assert_eq!(parse_mode("7"), None);
        assert_eq!(parse_mode_bits(0o1644), 0o644);
    }

    #[test]
    fn mode_string_and_readable() {
        let f = file_with("x", Extra::new().mode(0o644));
        assert_eq!(mode_string(&f), "-rw-r--r--");
        assert!(readable(&f));
        let locked = file_with("x", Extra::new().mode(0o000));
        assert!(!readable(&locked));
        assert!(readable(&dir(IndexMap::new())));
        let d = dir_with(IndexMap::new(), Extra::new().mode(0o1777));
        assert_eq!(mode_string(&d), "drwxrwxrwx");
    }

    #[test]
    fn format_long_pads_like_js() {
        let d = dir(IndexMap::new());
        assert_eq!(
            format_long("bin", &d),
            "drwxr-xr-x 1 root       root          4096 Aug 14 09:00 bin"
        );
        let f = file("hi\n");
        assert_eq!(
            format_long("n", &f),
            "-rw-r--r-- 1 root       root              3 Aug 14 09:00 n"
        );
    }

    #[test]
    fn js_len_counts_em_dash_as_one() {
        assert_eq!(js_len("—"), 1);
        assert_eq!(js_len("INC-042 case file — do not purge\n"), 32);
    }
}
