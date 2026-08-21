//! Stock trees: precinct base, booking guest, closet MOTD.

use indexmap::IndexMap;

use super::node::{dir, dir_with, file, file_with, Extra, Node};

const ELF: &str = "ELF 64-bit LSB executable";

fn t(pairs: impl IntoIterator<Item = (&'static str, Node)>) -> IndexMap<String, Node> {
    pairs.into_iter().map(|(k, n)| (k.to_string(), n)).collect()
}

fn elf() -> Node {
    file_with(ELF, Extra::new().mode(0o755))
}

pub fn create_base() -> Node {
    dir(t([
        (
            "bin",
            dir(t([("bash", elf()), ("ls", elf()), ("cat", elf())])),
        ),
        ("boot", dir(IndexMap::new())),
        (
            "dev",
            dir(t([
                (
                    "null",
                    file_with("", Extra::new().mode(0o666).mtime("Jun 19 00:00")),
                ),
                ("tty", file_with("", Extra::new().mode(0o666))),
            ])),
        ),
        (
            "etc",
            dir(t([
                ("hostname", file("precinct-13\n")),
                ("hosts", file("127.0.0.1 localhost\n127.0.1.1 precinct-13\n")),
                ("issue", file("PrecinctOS 13 GNU/Linux \\n \\l\n")),
                (
                    "os_release",
                    file("NAME=\"PrecinctOS\"\nVERSION=\"13 (Duct Tape)\"\nID=precinct\n"),
                ),
                (
                    "passwd",
                    file(
                        [
                            "root:x:0:0:root:/root:/bin/bash",
                            "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
                            "chief:x:1000:1000:Chief Harlan Briggs:/home/chief:/bin/bash",
                            "miller:x:1001:1001:Officer Dana Miller:/home/miller:/bin/bash",
                            "itguy:x:1002:1002:IT Temp:/home/itguy:/bin/bash",
                            "coffee:x:2000:2000:BeanTek Appliance:/opt/coffee:/usr/sbin/nologin",
                            "",
                        ]
                        .join("\n"),
                    ),
                ),
                (
                    "group",
                    file("root:x:0:\nchief:x:1000:\nmiller:x:1001:\nitguy:x:1002:\ndetectives:x:1100:chief,miller\ncoffee:x:2000:\n"),
                ),
                (
                    "shadow",
                    file_with("root:*:19900:0:99999:7:::\n", Extra::new().mode(0o640).group("shadow")),
                ),
                (
                    "crontab",
                    file("# /etc/crontab: system crontab\nSHELL=/bin/sh\nPATH=/usr/bin:/bin\n\n17 * * * * root    cd / && run-parts --report /etc/cron.hourly\n"),
                ),
                (
                    "cron.d",
                    dir(t([(
                        "precinct",
                        file("# precinct housekeeping\n5 4 * * * root /usr/local/bin/rotate-logs\n"),
                    )])),
                ),
                ("motd", file("Precinct 13 — If it works, do not reboot it.\n")),
            ])),
        ),
        (
            "home",
            dir(t([
                (
                    "itguy",
                    dir_with(
                        t([
                            ("welcome.txt", file(welcome_note())),
                            (
                                "sticky_note.txt",
                                file("Chief says: Fix the printer first. Then we talk about coffee.\n"),
                            ),
                            (
                                ".bash_history",
                                file_with("ls\npwd\ncat welcome.txt\n", Extra::new().mode(0o600)),
                            ),
                            (
                                ".bashrc",
                                file_with("export PS1=\"\\u@\\h:\\w\\$ \"\n", Extra::new().mode(0o644)),
                            ),
                        ]),
                        Extra::new().owner("itguy").group("itguy"),
                    ),
                ),
                (
                    "chief",
                    dir_with(
                        t([(
                            "todo.txt",
                            file("- yell at IT\n- find out who keeps printing cats\n- buy more paper\n- change coffee machine password (later)\n"),
                        )]),
                        Extra::new().owner("chief").group("chief"),
                    ),
                ),
                (
                    "miller",
                    dir_with(
                        t([(
                            "report_draft.txt",
                            file("I saw a cat. It looked guilty. It may have been carrying a USB stick.\n"),
                        )]),
                        Extra::new().owner("miller").group("miller"),
                    ),
                ),
            ])),
        ),
        (
            "evidence",
            dir_with(
                t([(
                    "README",
                    file("Evidence locker. Detectives only. Do not chmod 000 this again.\n"),
                )]),
                Extra::new().group("detectives"),
            ),
        ),
        (
            "opt",
            dir(t([(
                "coffee",
                dir(t([
                    (
                        "README",
                        file("BeanTek BrewMaster 3000 — management interface.\nDefault password is printed on the bottom of the unit.\n"),
                    ),
                    ("coffee_machine_daemon", elf()),
                ])),
            )])),
        ),
        (
            "proc",
            dir(t([
                (
                    "version",
                    file("Linux version 6.1.0-23-amd64 (precinct-13) (gcc 12.2.0)\n"),
                ),
                ("uptime", file("48291.12 120033.40\n")),
            ])),
        ),
        (
            "root",
            dir(t([(
                ".bash_history",
                file_with("whoami\npasswd\n# never again\n", Extra::new().mode(0o600)),
            )])),
        ),
        ("tmp", dir_with(IndexMap::new(), Extra::new().mode(0o1777))),
        (
            "usr",
            dir(t([
                (
                    "local",
                    dir(t([(
                        "bin",
                        dir(t([(
                            "rotate-logs",
                            file_with("#!/bin/sh\n# stub\n", Extra::new().mode(0o755)),
                        )])),
                    )])),
                ),
                ("share", dir(t([("man", dir(IndexMap::new()))]))),
            ])),
        ),
        (
            "var",
            dir(t([
                (
                    "log",
                    dir(t([
                        (
                            "syslog",
                            file(
                                "Aug 14 08:01:02 precinct-13 systemd[1]: Started PrecinctOS.\n\
                                 Aug 14 08:01:10 precinct-13 cron[3141]: (CRON) STARTUP (NICE)\n\
                                 Aug 14 18:55:01 precinct-13 thunderbird[4096]: mail sync ok\n\
                                 Aug 14 19:01:04 precinct-13 kernel: usb 1-3: new high-speed USB device\n",
                            ),
                        ),
                        (
                            "auth.log",
                            file(
                                "Aug 14 08:00:01 precinct-13 sshd[42]: Server listening on 0.0.0.0 port 22.\n\
                                 Aug 14 18:54:12 precinct-13 login[512]: pam_unix: session opened for user chief\n\
                                 Aug 14 19:02:14 precinct-13 login[880]: pam_unix: session opened for user root\n",
                            ),
                        ),
                        (
                            "incident",
                            dir(t([
                                ("incident_01.log", file("INC-01  noise complaint. closed.\n")),
                                (
                                    "incident_02.log",
                                    file("INC-02  missing stapler. suspect: everyone.\n"),
                                ),
                            ])),
                        ),
                    ])),
                ),
                (
                    "spool",
                    dir(t([("printer", dir(t([("queue.txt", file("idle\n"))])))])),
                ),
                ("tmp", dir(IndexMap::new())),
            ])),
        ),
    ]))
}

fn welcome_note() -> String {
    [
        "WELCOME TO PRECINCT 13 — IT CLOSET (yes, this is your office)\n",
        "============================================================\n\n",
        "You start in 10 minutes. The chief taped this to the CRT.\n\n",
        "  1. Do not reboot anything that is currently blinking.\n",
        "  2. The coffee machine is on the network. That is not a joke.\n",
        "  3. If a detective says \"the computer is broken\", ask which one.\n",
        "  4. Your first job is on the Mission Board. Open it.\n\n",
        "— Briggs\n",
    ]
    .concat()
}

pub fn create_guest() -> Node {
    let fat = "INC-042 case file — do not purge\n".repeat(1800);
    dir(t([
        ("bin", dir(t([("bash", elf()), ("ls", elf())]))),
        ("boot", dir(IndexMap::new())),
        (
            "dev",
            dir(t([
                ("sda", file_with("", Extra::new().mode(0o660).group("disk"))),
                ("sda1", file_with("", Extra::new().mode(0o660).group("disk"))),
                ("null", file_with("", Extra::new().mode(0o666))),
            ])),
        ),
        (
            "etc",
            dir(t([
                ("hostname", file("booking-vm\n")),
                ("hosts", file("127.0.0.1 localhost\n10.13.0.20 booking-vm\n")),
                (
                    "fstab",
                    file(
                        "# <file system> <mount point> <type> <options> <dump> <pass>\n\
                         /dev/sda1  /  ext4  defaults  0  1\n",
                    ),
                ),
                (
                    "os_release",
                    file("NAME=\"PrecinctOS\"\nVERSION=\"13 (Duct Tape)\"\nID=precinct\n"),
                ),
            ])),
        ),
        (
            "home",
            dir(t([(
                "booking",
                dir_with(
                    t([(
                        "README",
                        file("Booking service account. Data lives under /var/lib/booking.\n"),
                    )]),
                    Extra::new().owner("booking").group("booking"),
                ),
            )])),
        ),
        ("mnt", dir(IndexMap::new())),
        ("opt", dir(IndexMap::new())),
        (
            "root",
            dir(t([(
                "NOTE",
                file("This is the booking guest. The host is precinct-13.\nDo not delete the cases. Grow the disk.\n"),
            )])),
        ),
        ("tmp", dir_with(IndexMap::new(), Extra::new().mode(0o1777))),
        (
            "usr",
            dir(t([
                ("bin", dir(IndexMap::new())),
                ("sbin", dir(IndexMap::new())),
            ])),
        ),
        (
            "var",
            dir(t([
                (
                    "cache",
                    dir(t([(
                        "booking",
                        dir(t([("thumbs.cache", file("stale jpeg thumbs\n"))])),
                    )])),
                ),
                (
                    "lib",
                    dir(t([(
                        "booking",
                        dir(t([
                            (
                                "cases.db",
                                file_with(fat, Extra::new().mtime("Aug 14 21:40")),
                            ),
                            (
                                "booking.conf",
                                file("datadir=/var/lib/booking\nlisten=10.13.0.20:8080\n"),
                            ),
                            (
                                "README",
                                file("The booking database. Detectives will riot if this disappears.\n"),
                            ),
                        ])),
                    )])),
                ),
                (
                    "log",
                    dir(t([
                        (
                            "syslog",
                            file("Aug 14 21:40:01 booking-vm kernel: EXT4-fs warning: partition almost full\n"),
                        ),
                        (
                            "booking",
                            dir(t([(
                                "app.log",
                                file(
                                    "Aug 14 21:40:08 booking[880]: write failed: No space left on device\n\
                                     Aug 14 21:40:09 booking[880]: refusing new incident INC-043\n",
                                ),
                            )])),
                        ),
                    ])),
                ),
                (
                    "mail",
                    dir(t([("root", file("From cron: /var is full again\n"))])),
                ),
                (
                    "spool",
                    dir(t([(
                        "booking",
                        dir(t([("queue.dat", file("pending: INC-043\n"))])),
                    )])),
                ),
                ("tmp", dir(IndexMap::new())),
                (
                    "www",
                    dir(t([(
                        "html",
                        dir(t([(
                            "index.html",
                            file("<html><body>Precinct 13 Booking</body></html>\n"),
                        )])),
                    )])),
                ),
            ])),
        ),
    ]))
}

pub fn closet_motd() -> String {
    [
        "",
        "  ******************************************",
        "  *  P13 IT CLOSET              [##] [##]  *",
        "  * +------------------------+    #   #    *",
        "  * |########################|     ###     *",
        "  * |##  o          o     ###|    #   #    *",
        "  * |##        __         ###|   ## # ##   *",
        "  * |########################|    mittens  *",
        "  * +------------------------+             *",
        "  *   (o) (o)  ==========    sandwich in   *",
        "  *                          the 5.25\"     *",
        "  ******************************************",
        "",
        "Linux closet 6.1.0-23-amd64  tty1",
        "Authorized IT only. This box is a JUMP. The LAN is already up.",
        "  ssh precinct-13      HV / ticket box",
        "  ssh booking-vm       booking guest",
        "  ssh coffee.lan       copier VLAN",
        "If it works, do not reboot it.",
        "",
    ]
    .join("\n")
}
