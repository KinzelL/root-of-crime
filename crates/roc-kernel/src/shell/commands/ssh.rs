//! ssh / exit. Matches `js/commands/virt.js` `_cmdSsh` / `_cmdExit`.

use crate::infra::SessionKind;
use crate::lan;
use crate::vfs;

use super::super::exec::Shell;
use super::super::output::Output;

impl Shell {
    pub(crate) fn cmd_ssh(&mut self, args: &[String]) -> Output {
        self.infra.boot();
        let raw = args.first().map(|s| s.trim()).unwrap_or("");
        if raw.is_empty() || raw.starts_with('-') {
            let listed = self.infra.usage_hosts();
            return Output::err(format!("usage: ssh [user@]HOST\n{listed}"));
        }
        let id = lan::resolve(raw);
        if id == "closet" || id == "localhost" || id == "127.0.0.1" {
            if self.stack_is_empty() {
                return Output::ok("already on closet");
            }
            self.drop_to_desk();
            let motd = vfs::closet_motd();
            return Output::ok(format!("Connection closed.\n{motd}"));
        }
        let Some(sess) = self.infra.session_for(&id) else {
            return Output::err(format!(
                "ssh: Could not resolve hostname {raw}\nTry:  ssh precinct-13   or   ssh booking-vm"
            ));
        };
        if sess.kind == SessionKind::Guest {
            return self.attach_guest(sess);
        }
        if self.attached.is_some() || self.host == "booking-vm" {
            self.pop_session();
        }
        if self.host == sess.host && self.remote.as_deref() == Some(sess.host.as_str()) {
            self.vfs = sess.vfs;
            self.ctx = sess.ctx;
            self.cwd = sess.cwd;
            self.home = sess.home;
            self.user = sess.user;
            return Output::ok(format!("already on {}", self.host));
        }
        let banner = self.infra.login_banner(&sess);
        self.push_session(sess, None);
        Output::ok(banner)
    }

    pub(crate) fn cmd_exit(&mut self) -> Output {
        if !self.stack_is_empty() {
            let r = self.detach();
            if self.host == "closet" && self.remote.is_none() {
                let closed = r.stdout.trim_end_matches('\n');
                return Output::ok(format!("{closed}\n{}", vfs::closet_motd()));
            }
            return r;
        }
        Output::ok("logout")
    }

    pub(crate) fn detach(&mut self) -> Output {
        if !self.pop_session() {
            return Output::ok("");
        }
        Output::ok("Connection closed.")
    }
}
