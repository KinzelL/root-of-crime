//! Filesystem commands. Matches `js/commands/fs.js`.

use regex::Regex;

use crate::vfs::{self, WriteOpts};

use super::super::exec::Shell;
use super::super::output::Output;

impl Shell {
    pub(crate) fn cmd_cd(&mut self, args: &[String]) -> Output {
        let target = args.first().map(String::as_str).unwrap_or("~");
        let full = vfs::abs(&self.cwd, target, &self.home);
        let Some(res) = vfs::resolve(&self.vfs, "/", &full, &self.home) else {
            return Output::err(format!("cd: {target}: No such file or directory"));
        };
        if !res.node.is_dir() {
            return Output::err(format!("cd: {target}: Not a directory"));
        }
        if let Some(jail) = &self.ctx.jail {
            if !full.starts_with(jail) && full != *jail {
                return Output::err(format!(
                    "cd: permission denied: cannot leave {jail} during this task"
                ));
            }
        }
        self.cwd = full;
        Output::ok("")
    }

    pub(crate) fn cmd_ls(&mut self, args: &[String]) -> Output {
        let mut flags = std::collections::HashSet::new();
        let mut paths = Vec::new();
        for a in args {
            if a.starts_with('-') && a != "-" {
                for c in a.chars().skip(1) {
                    flags.insert(c);
                }
            } else {
                paths.push(a.as_str());
            }
        }
        let long = flags.contains(&'l');
        let all = flags.contains(&'a') || flags.contains(&'A');
        let default = ["."];
        let targets: Vec<&str> = if paths.is_empty() {
            default.to_vec()
        } else {
            paths
        };

        let mut blocks = Vec::new();
        for t in targets {
            let Some(res) = vfs::resolve(&self.vfs, &self.cwd, t, &self.home) else {
                return Output::err(format!("ls: cannot access '{t}': No such file or directory"));
            };
            if res.node.is_file() {
                let name = vfs::basename(&res.path);
                blocks.push(if long {
                    vfs::format_long(&name, res.node)
                } else {
                    name
                });
                continue;
            }
            let mut names: Vec<String> = res
                .node
                .children()
                .map(|c| c.keys().cloned().collect())
                .unwrap_or_default();
            names.sort();
            if !all {
                names.retain(|n| !n.starts_with('.'));
            }
            if all {
                let mut with_dots = vec![".".to_string(), "..".to_string()];
                with_dots.extend(names);
                names = with_dots;
            }
            if long {
                let mut lines = vec![format!("total {}", names.len() * 4)];
                for n in &names {
                    if n == "." {
                        lines.push(vfs::format_long(".", res.node));
                    } else if n == ".." {
                        lines.push(
                            "drwxr-xr-x 1 root       root          4096 Aug 14 09:00 .."
                                .to_string(),
                        );
                    } else {
                        let child = res.node.children().and_then(|c| c.get(n)).unwrap();
                        lines.push(vfs::format_long(n, child));
                    }
                }
                blocks.push(lines.join("\n"));
            } else {
                let shown: Vec<&str> = names
                    .iter()
                    .map(String::as_str)
                    .filter(|n| *n != "." && *n != "..")
                    .collect();
                blocks.push(shown.join("  "));
            }
        }
        Output::ok(blocks.join("\n\n"))
    }

    pub(crate) fn cmd_mkdir(&mut self, args: &[String]) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        if paths.is_empty() {
            return Output::err("mkdir: missing operand");
        }
        for a in paths {
            if let Err(e) = vfs::mkdir(&mut self.vfs, &self.cwd, a, &self.home) {
                return Output::err(format!("mkdir: {}", e.message));
            }
        }
        Output::ok("")
    }

    pub(crate) fn cmd_rmdir(&mut self, args: &[String]) -> Output {
        if args.is_empty() {
            return Output::err("rmdir: missing operand");
        }
        for a in args {
            if let Err(e) = vfs::unlink(&mut self.vfs, &self.cwd, a, &self.home) {
                return Output::err(format!("rmdir: {}", e.message));
            }
        }
        Output::ok("")
    }

    pub(crate) fn cmd_touch(&mut self, args: &[String]) -> Output {
        if args.is_empty() {
            return Output::err("touch: missing file operand");
        }
        for a in args {
            if let Err(e) = vfs::touch(&mut self.vfs, &self.cwd, a, &self.home) {
                return Output::err(format!("touch: {}", e.message));
            }
        }
        Output::ok("")
    }

    pub(crate) fn cmd_rm(&mut self, args: &[String]) -> Output {
        let recursive = args.iter().any(|a| a == "-r" || a == "-rf" || a == "-fr");
        let force = args.iter().any(|a| a == "-f" || a == "-rf" || a == "-fr");
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        if paths.is_empty() {
            return Output::err("rm: missing operand");
        }
        for p in paths {
            let res = vfs::resolve(&self.vfs, &self.cwd, p, &self.home);
            if res.is_none() {
                if force {
                    continue;
                }
                return Output::err(format!("rm: cannot remove '{p}': No such file or directory"));
            }
            let path = res.unwrap().path.clone();
            if path == "/" || path == "/home" || path == "/etc" {
                return Output::err(format!("rm: refusing to remove '{p}'"));
            }
            let result = if recursive {
                vfs::rm_recursive(&mut self.vfs, &self.cwd, p, &self.home)
            } else {
                vfs::unlink(&mut self.vfs, &self.cwd, p, &self.home)
            };
            if let Err(e) = result {
                return Output::err(format!("rm: {}", e.message));
            }
            self.ctx.removed.push(path);
        }
        Output::ok("")
    }

    pub(crate) fn cmd_cp(&mut self, args: &[String]) -> Output {
        let mut paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        if paths.len() < 2 {
            return Output::err("cp: missing file operand");
        }
        let dest = paths.pop().unwrap();
        let src = paths[0];
        let text = match self.read_file(src) {
            Ok(f) => f.text,
            Err(e) => return Output::err(super::super::exec::retarget_cat(&e, "cp")),
        };
        let dest_path = match vfs::resolve(&self.vfs, &self.cwd, dest, &self.home) {
            Some(res) if res.node.is_dir() => vfs::join(
                &res.path,
                &vfs::basename(&vfs::abs(&self.cwd, src, &self.home)),
            ),
            _ => dest.to_string(),
        };
        let abs_dest = vfs::abs(&self.cwd, &dest_path, &self.home);
        if let Err(e) = self.guest_space(&abs_dest, crate::vfs::js_len(&text) as u64) {
            return Output::err(format!("cp: {e}"));
        }
        if let Err(e) = vfs::write(
            &mut self.vfs,
            &self.cwd,
            &dest_path,
            &text,
            WriteOpts {
                home: Some(self.home.clone()),
                ..WriteOpts::default()
            },
        ) {
            return Output::err(format!("cp: {}", e.message));
        }
        Output::ok("")
    }

    pub(crate) fn cmd_mv(&mut self, args: &[String]) -> Output {
        let paths: Vec<&str> = args
            .iter()
            .map(String::as_str)
            .filter(|a| !a.starts_with('-'))
            .collect();
        if paths.len() < 2 {
            return Output::err("mv: missing file operand");
        }
        let dest = paths[paths.len() - 1];
        let srcs = &paths[..paths.len() - 1];
        let (dest_is_dir, dest_dir_path) = match vfs::resolve(&self.vfs, &self.cwd, dest, &self.home)
        {
            Some(r) if r.node.is_dir() => (true, Some(r.path.clone())),
            _ => (false, None),
        };
        if srcs.len() > 1 && !dest_is_dir {
            return Output::err(format!("mv: target '{dest}' is not a directory"));
        }
        for src in srcs {
            let text = match self.read_file(src) {
                Ok(f) => f.text,
                Err(e) => return Output::err(super::super::exec::retarget_cat(&e, "mv")),
            };
            let dest_path = if dest_is_dir {
                vfs::join(
                    dest_dir_path.as_ref().unwrap(),
                    &vfs::basename(&vfs::abs(&self.cwd, src, &self.home)),
                )
            } else {
                dest.to_string()
            };
            let abs_dest = vfs::abs(&self.cwd, &dest_path, &self.home);
            if let Err(e) = self.guest_space(&abs_dest, crate::vfs::js_len(&text) as u64) {
                return Output::err(format!("mv: {e}"));
            }
            if let Err(e) = vfs::write(
                &mut self.vfs,
                &self.cwd,
                &dest_path,
                &text,
                WriteOpts {
                    home: Some(self.home.clone()),
                    ..WriteOpts::default()
                },
            ) {
                return Output::err(format!("mv: {}", e.message));
            }
            let _ = vfs::unlink(&mut self.vfs, &self.cwd, src, &self.home);
        }
        Output::ok("")
    }

    pub(crate) fn cmd_chmod(&mut self, args: &[String]) -> Output {
        if args.len() < 2 {
            return Output::err(
                "chmod: missing operand\nTry: chmod 644 file   or   chmod 644 *",
            );
        }
        let mode = &args[0];
        let targets = &args[1..];
        let mut count = 0;
        for t in targets {
            if let Err(e) = vfs::chmod(&mut self.vfs, &self.cwd, t, mode, &self.home) {
                return Output::err(format!("chmod: {}", e.message));
            }
            count += 1;
        }
        self.ctx.chmod_count += count;
        if count > 1 {
            Output::ok(format!("mode of {count} files changed to {mode}"))
        } else {
            Output::ok(format!("mode of '{}' changed to {mode}", targets[0]))
        }
    }

    pub(crate) fn cmd_find(&mut self, args: &[String]) -> Output {
        let mut start = ".";
        let mut name: Option<&str> = None;
        let mut kind: Option<&str> = None;
        let mut i = 0;
        while i < args.len() {
            if args[i] == "-name" && i + 1 < args.len() {
                name = Some(args[i + 1].as_str());
                i += 2;
            } else if args[i] == "-type" && i + 1 < args.len() {
                kind = Some(if args[i + 1] == "d" { "dir" } else { "file" });
                i += 2;
            } else if !args[i].starts_with('-') {
                start = args[i].as_str();
                i += 1;
            } else {
                i += 1;
            }
        }
        let Some(start_res) = vfs::resolve(&self.vfs, &self.cwd, start, &self.home) else {
            return Output::err(format!("find: '{start}': No such file or directory"));
        };
        let name_re = if let Some(pat) = name {
            let pat = pat.trim_matches(|c| c == '\'' || c == '"');
            let escaped = pat.replace('.', r"\.").replace('*', ".*").replace('?', ".");
            match Regex::new(&format!("^{escaped}$")) {
                Ok(re) => Some(re),
                Err(e) => return Output::err(e.to_string()),
            }
        } else {
            None
        };
        let mut hits = Vec::new();
        vfs::walk(start_res.node, &start_res.path, |node, path| {
            if let Some(k) = kind {
                if node.kind() != k {
                    return;
                }
            }
            if let Some(re) = &name_re {
                if !re.is_match(&vfs::basename(path)) {
                    return;
                }
            }
            hits.push(path.to_string());
        });
        self.ctx.used_find = true;
        Output::ok(hits.join("\n"))
    }

    pub(crate) fn cmd_file(&mut self, args: &[String]) -> Output {
        if args.is_empty() {
            return Output::err("file: missing operand");
        }
        let lines: Vec<String> = args
            .iter()
            .map(|a| {
                let Some(res) = vfs::resolve(&self.vfs, &self.cwd, a, &self.home) else {
                    return format!("{a}: cannot open (No such file or directory)");
                };
                if res.node.is_dir() {
                    return format!("{a}: directory");
                }
                let c = res.node.content().unwrap_or("");
                if c.starts_with("ELF") {
                    format!("{a}: ELF 64-bit LSB executable")
                } else if c.starts_with("[binary") || c.contains("JPEG") || a.ends_with(".jpg") {
                    format!("{a}: JPEG image data")
                } else {
                    format!("{a}: ASCII text")
                }
            })
            .collect();
        Output::ok(lines.join("\n"))
    }
}
