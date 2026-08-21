//! Mutating VFS ops. Error strings match `js/vfs.js`.

use super::node::{
    dir, file_with, js_len, parse_mode, parse_mode_bits, readable as node_readable, Extra, Node,
};
use super::path::{abs, basename, dirname, glob_match, join, normalize_path, DEFAULT_HOME};

pub const WRITE_MTIME: &str = "Aug 14 21:14";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VfsError {
    pub message: String,
}

impl VfsError {
    pub fn msg(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for VfsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(f)
    }
}

impl std::error::Error for VfsError {}

#[derive(Clone, Debug, Default)]
pub struct WriteOpts {
    pub home: Option<String>,
    pub append: bool,
    pub mode: Option<u32>,
    pub mtime: Option<String>,
}

pub struct Resolve<'a> {
    pub node: &'a Node,
    pub name: String,
    pub path: String,
}

pub struct ResolveMut<'a> {
    pub node: &'a mut Node,
    pub name: String,
    pub path: String,
}

pub struct Hit<'a> {
    pub node: &'a Node,
    pub path: String,
}

fn home_of(opts: &WriteOpts) -> &str {
    opts.home.as_deref().unwrap_or(DEFAULT_HOME)
}

fn get_abs<'a>(tree: &'a Node, path: &str) -> Option<&'a Node> {
    let full = normalize_path(path);
    if full == "/" {
        return Some(tree);
    }
    let mut node = tree;
    for part in full.split('/').filter(|s| !s.is_empty()) {
        match node {
            Node::Dir { children, .. } => node = children.get(part)?,
            Node::File { .. } => return None,
        }
    }
    Some(node)
}

fn get_mut_abs<'a>(tree: &'a mut Node, path: &str) -> Option<&'a mut Node> {
    let full = normalize_path(path);
    if full == "/" {
        return Some(tree);
    }
    let mut node = tree;
    for part in full.split('/').filter(|s| !s.is_empty()) {
        match node {
            Node::Dir { children, .. } => node = children.get_mut(part)?,
            Node::File { .. } => return None,
        }
    }
    Some(node)
}

pub fn resolve<'a>(tree: &'a Node, cwd: &str, path: &str, home: &str) -> Option<Resolve<'a>> {
    let full = abs(cwd, path, home);
    let node = get_abs(tree, &full)?;
    let name = if full == "/" {
        "/".to_string()
    } else {
        basename(&full)
    };
    Some(Resolve {
        node,
        name,
        path: full,
    })
}

pub fn resolve_mut<'a>(
    tree: &'a mut Node,
    cwd: &str,
    path: &str,
    home: &str,
) -> Option<ResolveMut<'a>> {
    let full = abs(cwd, path, home);
    let name = if full == "/" {
        "/".to_string()
    } else {
        basename(&full)
    };
    let node = get_mut_abs(tree, &full)?;
    Some(ResolveMut {
        node,
        name,
        path: full,
    })
}

pub fn size_of(node: &Node) -> usize {
    size_of_skipping(node, &[])
}

pub fn size_of_skipping(node: &Node, skip: &[&Node]) -> usize {
    if skip.iter().any(|s| std::ptr::eq(*s, node)) {
        return 0;
    }
    match node {
        Node::File { content, .. } => js_len(content),
        Node::Dir { children, .. } => children
            .values()
            .map(|child| size_of_skipping(child, skip))
            .sum(),
    }
}

pub fn write(
    tree: &mut Node,
    cwd: &str,
    path: &str,
    content: &str,
    opts: WriteOpts,
) -> Result<(), VfsError> {
    let home = home_of(&opts);
    let full = abs(cwd, path, home);
    let parent_path = dirname(&full);
    let name = basename(&full);
    let parent = get_mut_abs(tree, &parent_path).ok_or_else(|| {
        VfsError::msg(format!("cannot create '{path}': No such file or directory"))
    })?;
    let children = parent.children_mut().ok_or_else(|| {
        VfsError::msg(format!("cannot create '{path}': No such file or directory"))
    })?;
    if let Some(existing) = children.get(&name) {
        if existing.is_dir() {
            return Err(VfsError::msg(format!("cannot write '{path}': Is a directory")));
        }
    }
    let mtime = opts
        .mtime
        .clone()
        .unwrap_or_else(|| WRITE_MTIME.to_string());
    if opts.append {
        if let Some(Node::File {
            content: body,
            meta,
        }) = children.get_mut(&name)
        {
            body.push_str(content);
            meta.mtime = mtime;
            return Ok(());
        }
    }
    let (mode, owner, group) = match children.get(&name) {
        Some(Node::File { meta, .. }) => (meta.mode, meta.owner.clone(), meta.group.clone()),
        _ => (
            opts.mode.unwrap_or(0o644),
            "root".to_string(),
            "root".to_string(),
        ),
    };
    children.insert(
        name,
        file_with(
            content,
            Extra::new()
                .mode(mode)
                .owner(owner)
                .group(group)
                .mtime(mtime),
        ),
    );
    Ok(())
}

pub fn unlink(tree: &mut Node, cwd: &str, path: &str, home: &str) -> Result<(), VfsError> {
    let full = abs(cwd, path, home);
    if full == "/" {
        let n = tree.children().map(|c| c.len()).unwrap_or(0);
        if n > 0 {
            return Err(VfsError::msg(format!(
                "cannot remove '{path}': Directory not empty"
            )));
        }
        return Err(VfsError::msg(format!(
            "cannot remove '{path}': Device or resource busy"
        )));
    }
    let parent_path = dirname(&full);
    let name = basename(&full);
    let parent = get_mut_abs(tree, &parent_path).ok_or_else(|| {
        VfsError::msg(format!("cannot remove '{path}': No such file or directory"))
    })?;
    let children = parent.children_mut().ok_or_else(|| {
        VfsError::msg(format!("cannot remove '{path}': No such file or directory"))
    })?;
    match children.get(&name) {
        None => {
            return Err(VfsError::msg(format!(
                "cannot remove '{path}': No such file or directory"
            )));
        }
        Some(node) if node.is_dir() && node.children().map(|c| !c.is_empty()).unwrap_or(false) => {
            return Err(VfsError::msg(format!(
                "cannot remove '{path}': Directory not empty"
            )));
        }
        Some(_) => {}
    }
    children.shift_remove(&name);
    Ok(())
}

pub fn rm_recursive(tree: &mut Node, cwd: &str, path: &str, home: &str) -> Result<(), VfsError> {
    let full = abs(cwd, path, home);
    if full == "/" {
        return Err(VfsError::msg(format!(
            "cannot remove '{path}': Device or resource busy"
        )));
    }
    let parent_path = dirname(&full);
    let name = basename(&full);
    let parent = get_mut_abs(tree, &parent_path).ok_or_else(|| {
        VfsError::msg(format!("cannot remove '{path}': No such file or directory"))
    })?;
    let children = parent.children_mut().ok_or_else(|| {
        VfsError::msg(format!("cannot remove '{path}': No such file or directory"))
    })?;
    if children.shift_remove(&name).is_none() {
        return Err(VfsError::msg(format!(
            "cannot remove '{path}': No such file or directory"
        )));
    }
    Ok(())
}

pub fn mkdir(tree: &mut Node, cwd: &str, path: &str, home: &str) -> Result<(), VfsError> {
    let full = abs(cwd, path, home);
    if get_abs(tree, &full).is_some() {
        return Err(VfsError::msg(format!(
            "cannot create directory '{path}': File exists"
        )));
    }
    let parent_path = dirname(&full);
    let name = basename(&full);
    let parent = get_mut_abs(tree, &parent_path).ok_or_else(|| {
        VfsError::msg(format!(
            "cannot create directory '{path}': No such file or directory"
        ))
    })?;
    let children = parent.children_mut().ok_or_else(|| {
        VfsError::msg(format!(
            "cannot create directory '{path}': No such file or directory"
        ))
    })?;
    children.insert(name, dir(indexmap::IndexMap::new()));
    Ok(())
}

pub fn chmod(tree: &mut Node, cwd: &str, path: &str, mode: &str, home: &str) -> Result<(), VfsError> {
    let Some(res) = resolve_mut(tree, cwd, path, home) else {
        return Err(VfsError::msg(format!(
            "cannot access '{path}': No such file or directory"
        )));
    };
    let Some(parsed) = parse_mode(mode) else {
        return Err(VfsError::msg(format!(
            "invalid mode: \u{2018}{mode}\u{2019}"
        )));
    };
    res.node.set_mode(parsed);
    Ok(())
}

pub fn chmod_bits(
    tree: &mut Node,
    cwd: &str,
    path: &str,
    mode: u32,
    home: &str,
) -> Result<(), VfsError> {
    let Some(res) = resolve_mut(tree, cwd, path, home) else {
        return Err(VfsError::msg(format!(
            "cannot access '{path}': No such file or directory"
        )));
    };
    res.node.set_mode(parse_mode_bits(mode));
    Ok(())
}

pub fn touch(tree: &mut Node, cwd: &str, path: &str, home: &str) -> Result<(), VfsError> {
    let full = abs(cwd, path, home);
    if get_abs(tree, &full).is_some() {
        if let Some(node) = get_mut_abs(tree, &full) {
            node.set_mtime(WRITE_MTIME);
        }
        return Ok(());
    }
    write(
        tree,
        cwd,
        path,
        "",
        WriteOpts {
            home: Some(home.to_string()),
            ..WriteOpts::default()
        },
    )
}

pub fn walk<F>(node: &Node, path: &str, mut f: F)
where
    F: FnMut(&Node, &str),
{
    walk_inner(node, path, &mut f);
}

fn walk_inner<F>(node: &Node, path: &str, f: &mut F)
where
    F: FnMut(&Node, &str),
{
    f(node, path);
    if let Node::Dir { children, .. } = node {
        for (name, child) in children {
            let child_path = if path == "/" {
                format!("/{name}")
            } else {
                format!("{path}/{name}")
            };
            walk_inner(child, &child_path, f);
        }
    }
}

pub fn find<'a, F>(tree: &'a Node, start_path: &str, mut pred: F) -> Vec<Hit<'a>>
where
    F: FnMut(&Node, &str) -> bool,
{
    let Some(start) = resolve(tree, "/", start_path, DEFAULT_HOME) else {
        return Vec::new();
    };
    let mut hits = Vec::new();
    collect_find(start.node, &start.path, &mut pred, &mut hits);
    hits
}

fn collect_find<'a, F>(node: &'a Node, path: &str, pred: &mut F, hits: &mut Vec<Hit<'a>>)
where
    F: FnMut(&Node, &str) -> bool,
{
    if pred(node, path) {
        hits.push(Hit {
            node,
            path: path.to_string(),
        });
    }
    if let Node::Dir { children, .. } = node {
        for (name, child) in children {
            let child_path = if path == "/" {
                format!("/{name}")
            } else {
                format!("{path}/{name}")
            };
            collect_find(child, &child_path, pred, hits);
        }
    }
}

pub fn expand_glob(tree: &Node, cwd: &str, token: &str, home: &str) -> Vec<String> {
    if token.is_empty() || (!token.contains('*') && !token.contains('?')) {
        return vec![token.to_string()];
    }
    let full = abs(cwd, token, home);
    let parent_path = dirname(&full);
    let pat = if token.contains('/') {
        basename(token)
    } else {
        basename(&full)
    };
    let Some(parent) = resolve(tree, "/", &parent_path, home) else {
        return vec![token.to_string()];
    };
    if !parent.node.is_dir() {
        return vec![token.to_string()];
    }
    let mut names: Vec<&str> = parent
        .node
        .children()
        .unwrap()
        .keys()
        .filter(|n| glob_match(&pat, n))
        .map(|s| s.as_str())
        .collect();
    names.sort_unstable();
    if names.is_empty() {
        return vec![token.to_string()];
    }
    names
        .into_iter()
        .map(|n| {
            if parent_path == "/" {
                format!("/{n}")
            } else {
                format!("{parent_path}/{n}")
            }
        })
        .collect()
}

pub fn copy_file(
    tree: &mut Node,
    cwd: &str,
    src: &str,
    dest: &str,
    home: &str,
) -> Result<(), VfsError> {
    let src_abs = abs(cwd, src, home);
    let content = match resolve(tree, cwd, src, home) {
        None => {
            return Err(VfsError::msg(format!(
                "cannot access '{src}': No such file or directory"
            )));
        }
        Some(res) if res.node.is_dir() => {
            return Err(VfsError::msg(format!("cannot write '{src}': Is a directory")));
        }
        Some(res) if !node_readable(res.node) => {
            return Err(VfsError::msg(format!(
                "cannot access '{src}': Permission denied"
            )));
        }
        Some(res) => res.node.content().unwrap_or("").to_string(),
    };
    let dest_path = match resolve(tree, cwd, dest, home) {
        Some(res) if res.node.is_dir() => join(&res.path, &basename(&src_abs)),
        _ => dest.to_string(),
    };
    write(
        tree,
        cwd,
        &dest_path,
        &content,
        WriteOpts {
            home: Some(home.to_string()),
            ..WriteOpts::default()
        },
    )
}

pub fn move_file(
    tree: &mut Node,
    cwd: &str,
    src: &str,
    dest: &str,
    home: &str,
) -> Result<(), VfsError> {
    copy_file(tree, cwd, src, dest, home)?;
    unlink(tree, cwd, src, home)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::node::{dir, file};
    use indexmap::IndexMap;

    fn home() -> &'static str {
        DEFAULT_HOME
    }

    fn tiny() -> Node {
        dir(
            [
                (
                    "tmp".to_string(),
                    dir_with_empty(),
                ),
                (
                    "home".to_string(),
                    dir([(
                        "itguy".to_string(),
                        dir([(
                            "welcome.txt".to_string(),
                            file("hi\n"),
                        )]
                        .into_iter()
                        .collect()),
                    )]
                    .into_iter()
                    .collect()),
                ),
            ]
            .into_iter()
            .collect(),
        )
    }

    fn dir_with_empty() -> Node {
        dir(IndexMap::new())
    }

    #[test]
    fn mkdir_write_unlink_chmod_touch() {
        let mut tree = tiny();
        mkdir(&mut tree, "/", "/tmp/box", home()).unwrap();
        write(
            &mut tree,
            "/tmp/box",
            "note.txt",
            "one\n",
            WriteOpts {
                home: Some(home().into()),
                ..WriteOpts::default()
            },
        )
        .unwrap();
        write(
            &mut tree,
            "/tmp/box",
            "note.txt",
            "two\n",
            WriteOpts {
                home: Some(home().into()),
                append: true,
                ..WriteOpts::default()
            },
        )
        .unwrap();
        let note = resolve(&tree, "/", "/tmp/box/note.txt", home()).unwrap();
        assert_eq!(note.node.content(), Some("one\ntwo\n"));
        assert_eq!(note.node.mtime(), WRITE_MTIME);

        chmod(&mut tree, "/", "/tmp/box/note.txt", "600", home()).unwrap();
        let note = resolve(&tree, "/", "/tmp/box/note.txt", home()).unwrap();
        assert_eq!(note.node.mode(), 0o600);

        touch(&mut tree, "/", "/tmp/new", home()).unwrap();
        assert!(resolve(&tree, "/", "/tmp/new", home()).unwrap().node.is_file());

        unlink(&mut tree, "/", "/tmp/box/note.txt", home()).unwrap();
        assert!(resolve(&tree, "/", "/tmp/box/note.txt", home()).is_none());
        unlink(&mut tree, "/", "/tmp/box", home()).unwrap();
    }

    #[test]
    fn mkdir_and_unlink_errors_match_js() {
        let mut tree = tiny();
        let err = mkdir(&mut tree, "/", "/nope/x", home()).unwrap_err();
        assert_eq!(
            err.message,
            "cannot create directory '/nope/x': No such file or directory"
        );
        mkdir(&mut tree, "/", "/tmp/box", home()).unwrap();
        let err = mkdir(&mut tree, "/", "/tmp/box", home()).unwrap_err();
        assert_eq!(err.message, "cannot create directory '/tmp/box': File exists");
        write(
            &mut tree,
            "/",
            "/tmp/box/a.txt",
            "x",
            WriteOpts::default(),
        )
        .unwrap();
        let err = unlink(&mut tree, "/", "/tmp/box", home()).unwrap_err();
        assert_eq!(err.message, "cannot remove '/tmp/box': Directory not empty");
        rm_recursive(&mut tree, "/", "/tmp/box", home()).unwrap();
        assert!(resolve(&tree, "/", "/tmp/box", home()).is_none());
    }

    #[test]
    fn chmod_invalid_uses_curly_quotes() {
        let mut tree = tiny();
        let err = chmod(&mut tree, "/", "/home/itguy/welcome.txt", "18", home()).unwrap_err();
        assert_eq!(err.message, "invalid mode: \u{2018}18\u{2019}");
    }

    #[test]
    fn write_refuses_directory() {
        let mut tree = tiny();
        let err = write(&mut tree, "/", "/tmp", "x", WriteOpts::default()).unwrap_err();
        assert_eq!(err.message, "cannot write '/tmp': Is a directory");
    }

    #[test]
    fn copy_and_move_files() {
        let mut tree = tiny();
        copy_file(&mut tree, "/home/itguy", "welcome.txt", "/tmp/w.txt", home()).unwrap();
        assert_eq!(
            resolve(&tree, "/", "/tmp/w.txt", home())
                .unwrap()
                .node
                .content(),
            Some("hi\n")
        );
        mkdir(&mut tree, "/", "/tmp/out", home()).unwrap();
        move_file(&mut tree, "/", "/tmp/w.txt", "/tmp/out", home()).unwrap();
        assert!(resolve(&tree, "/", "/tmp/w.txt", home()).is_none());
        assert_eq!(
            resolve(&tree, "/", "/tmp/out/w.txt", home())
                .unwrap()
                .node
                .content(),
            Some("hi\n")
        );
    }

    #[test]
    fn find_walks_from_start() {
        let tree = tiny();
        let hits = find(&tree, "/home", |node, path| {
            node.is_file() && path.ends_with("welcome.txt")
        });
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "/home/itguy/welcome.txt");
    }

    #[test]
    fn size_of_skip_uses_pointer_identity() {
        let tree = tiny();
        let home_dir = resolve(&tree, "/", "/home", home()).unwrap().node;
        let full = size_of(&tree);
        let skipped = size_of_skipping(&tree, &[home_dir]);
        assert!(full > skipped);
        assert_eq!(skipped, 0);
    }

    #[test]
    fn clone_is_independent() {
        let tree = tiny();
        let mut copy = tree.clone();
        unlink(&mut copy, "/", "/home/itguy/welcome.txt", home()).unwrap();
        assert!(resolve(&tree, "/", "/home/itguy/welcome.txt", home()).is_some());
        assert!(resolve(&copy, "/", "/home/itguy/welcome.txt", home()).is_none());
    }
}
