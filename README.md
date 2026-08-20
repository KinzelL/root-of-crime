# ROOT OF CRIME

A browser Linux-terminal mystery. You are the new IT hire at Precinct 13. The printer is screaming, the evidence locker is mode `000`, and the coffee machine has a login. Learn real commands. Find the root of the crime.

This is an expanded remake of `root-of-the-crime`: same precinct voice, a real virtual filesystem, and a campaign that follows a Linux tutorial ladder — the desk, then beginner paths and files, then intermediate ops, then the incident.

No build step. Static HTML + vanilla JS. Motif / twm desktop.

## Play

Open `index.html` in a browser, or from this directory:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

Progress is stored in `localStorage` (`roc_save_v1`). Reset from **twm → Preferences**. First login opens a case slip; **twm → Help…** brings it back.

### The desk

You punch in on a fake twm session. Right-click the root for the menu.

| Client | What it is |
|--------|------------|
| **NetMoth** | Ugly intranet. `tickets.precinct` is the job board. `virt.precinct` is VM inventory. |
| **xterm** | The shell. Open it yourself (desk icon or twm menu). Not xconsole. |
| **timeclock** | Shift clock and punch-out. |
| **mail** | Inbox. Dates are in-game. |
| **xconsole** | `/dev/console` log. Not a shell. |
| **xman** | The book. A page for every app, plus command notes. Help in an app jumps here. |

Window chrome is mandatory: minimize, maximize, restore, close. Close withdraws the client from the taskbar until you open it again. Only open windows sit on the bar.

### A shift

One in-game day is 08:00–16:00. Closing a ticket jumps the clock. At 16:00 you punch out: a SHIFT CLOSED wrap-up, then log off. Next Log In is the next morning. Leftover tickets roll.

After chapter 3.3 the campaign is over. The closet stays open. Monday and later are returning jobs (restore a file, find a line, clear a spool).

### A ticket

1. NetMoth → tickets.precinct is today’s work.
2. Work a ticket. The slip names the **asset**.
3. Open **xterm** if it is not already open. You land as `itguy@closet`.
4. `ssh` the asset. `exit` comes back one hop.
5. Close the ticket when the tracker is done.

Tickets do not spawn a new terminal. They do not spawn the machine. The LAN is already up.

### Scoring

Pay by act (desk 50, beginner 100, intermediate 150, expert 200, finale +100). Clean close +50. Each hint −15 and kills clean. On-time +50 if you punch out by 16:00 with no leftovers and at least one close.

`hint` costs score and gets more specific. `man ls` is a real (short) manual page.

## The LAN

Machines boot with the shift. Tickets overlay a problem; they do not create the box.

| Host | Addr | Role |
|------|------|------|
| `closet` | 10.13.0.1 | Jump host. You. |
| `precinct-13` | 10.13.0.4 | HV / most tickets |
| `booking-vm` | 10.13.0.20 | Guest on precinct-13 |
| `coffee.lan` | 10.13.0.8 | Copier-VLAN appliance |

`ssh precinct-13` works before you take a ticket. `ping booking-vm` answers. virt.precinct shows **on-prem** and **copier-vlan** from day one. `/etc/hosts` and `jump.txt` on closet list the same map. Closet prints `/etc/motd` on login.

A ticket on an asset overlays that host for the job. Close it and the idle machine is still there.

New clusters (and later, migrate-a-guest jobs) go in `js/infra.js`.

## Campaign

Four chapters. Cases are numbered `act.lesson`.

| Case | Title | You learn |
|------|--------|-----------|
| **Ch 0 — The Desk** | | Game mechanics, not Linux yet |
| 0.1 | How This Desk Works | `help`, `hint`, `man`, the slip |
| **Ch 1 — Beginner** | | Paths and files |
| 1.1 | Badge Day | `pwd`, `ls`, `cat`, `cd` |
| 1.2 | Lost in the Closet | `/`, `~`, `..`, absolute vs relative |
| 1.3 | File the Locker | `mkdir`, `mv`, `cp` |
| 1.4 | The Long Statement | `less`, `head`, `tail` |
| 1.5 | Don't Eat the Original | `>`, `>>`, restore from backup |
| **Ch 2 — Intermediate** | | Ops |
| 2.1 | The Endless Wanted Poster | `ps`, `kill`, `pkill` |
| 2.2 | The Locked Evidence Locker | `ls -l`, `chmod` |
| 2.3 | Needle in the Logs | `grep`, `find` |
| 2.4 | The 03:00 Login | `/etc/passwd`, `last`, `auth.log` |
| 2.5 | Cron of the Dead | `crontab`, `/etc/cron.d`, `rm` |
| 2.6 | No Space Left on Device | `df`, `du`, `rm` |
| 2.7 | The Appliance Problem | `netstat` / `ss` |
| 2.8 | Hidden in Plain Sight | `ls -la`, hidden dirs |
| **Ch 3 — Expert** | | Guests, then the incident |
| 3.1 | No Space Left on the Guest | `virsh`, `lsblk`, `mount` — grow the booking VM |
| 3.2 | After the Reboot | `/etc/fstab`, `virsh reboot` — mount is for now |
| 3.3 | The Root of Crime | persistence + process + creds |

The case file, chief's notes, and radio log live **on each mission**. They update when you clear that case, not when a headcount ticks over.

## Terminal

The shell is fake. The commands are not. xterm is one black scroll; the prompt is the last line of text.

- Filesystem: `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `touch`, `chmod`, `find`, `file`
- Text: `cat`, `less`, `more`, `head`, `tail`, `grep`, `wc`, `sort`, `uniq`, pipes (`|`), redirects (`>`, `>>`)
- Ops: `ssh`, `ping`, `ps`, `kill`, `pkill`, `df`, `du`, `netstat`, `ss`, `crontab`, `last`, `passwd`, `virsh`, `lsblk`, `mount`, `reboot`, `exit`
- Help: `help`, `hint`, `man`
- Keys: Tab complete (hidden names stay hidden unless you type `.`), Up/Down history, Ctrl+L clear, Ctrl+C cancel, Esc iconify

`less` / `more`: space or `f` next page, `b` back, `q` quit.

## Add a case

1. Copy a file in `js/missions/` (e.g. `01-badge-day.js`).
2. `Missions.register({ id, order, act, lesson, caseTitle, caseBody, notes?, radio?, setup, isWon, objectives?, ... })`. Optional `objectives(ctx, vfs)` returns `[{ label, done }, ...]` for the tracker. Without it, the slip shows one row from `objective` and ticks it when `isWon` is true. Optional `asset` names the host (`precinct-13` by default; virt tickets use `booking-vm`).
3. Append the filename to `Missions.SOURCES` in `js/missions.js`.

Do not edit `js/story.js` for story text. Optional `notes` / `radio` arrays replace the chief’s pad and the radio when that case is the latest one that defined them.

Add a command the same way: a file under `js/commands/`, then one line in `Terminal.COMMAND_SOURCES` in `js/terminal.js`.

Add a host in `Infra.CATALOG` (`js/infra.js`) and a `_make*` builder. Tickets overlay that host; they should not create it.

Every desktop client must register in `Game.WINDOWS` (`js/windows.js`) and support minimize / maximize / restore / close.

## Tests

```bash
node scripts/smoke.js
node scripts/playthrough.js
node scripts/desktop-verify.js
```

Smoke checks every case is winnable and the LAN boots. Playthrough runs the intended (and some alternate) solutions, including `ssh` onto the asset. Desktop-verify checks the twm desk: windows, tickets, shift, xterm, ssh without a ticket.

## Layout

```
index.html
css/style.css          @import index
css/base.css           tokens, xwin chrome, login, boot
css/desktop.css        icons, gadgets, taskbar
css/apps.css           overlays, board, case slips
css/term.css           xterm
js/vfs.js              virtual filesystem
js/virt.js             guests, disks, fstab, reboot, virt.precinct
js/infra.js            persistent LAN (closet, precinct-13, booking-vm, coffee.lan)
js/terminal.js         shell engine (input, pipes, pager, sessions)
js/commands/           help.js, fs.js, text.js, ops.js, virt.js
js/missions.js         campaign registry
js/missions/*.js       one file per case
js/jobs.js             returning job templates
js/story.js            ranks, xman
js/game.js             save, shift, tickets, welcome
js/windows.js          window contract
js/desktop.js          twm icons, taskbar, gadgets
scripts/smoke.js
scripts/playthrough.js
scripts/desktop-verify.js
```

## Why it exists

`root-of-the-crime` taught two commands well and then stopped. This version keeps the joke (duct-tape precinct, guilty cat, mocha123) and treats it as a single incident: default credentials on an appliance, a USB on a counter, and a cron job that would not die.

The lesson at the end is the same one the radio log spoiled on minute one.
