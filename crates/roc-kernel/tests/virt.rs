//! Guest disks / virsh / mount. Matches `js/virt.js` and `js/commands/virt.js`.

use roc_kernel::{
    attach_volume, booking_persisted, ensure_space, parse_size, resolve, write, Guest, Shell,
    WriteOpts,
};

#[test]
fn parse_size_matches_js() {
    assert_eq!(parse_size("200", Some("M")).unwrap(), 200 * 1024 * 1024);
    assert_eq!(parse_size("200M", None).unwrap(), 200 * 1024 * 1024);
    assert!(parse_size("", None).is_err());
    assert!(parse_size("0", None).is_err());
}

#[test]
fn attach_without_size_fails() {
    let mut g = Guest::make_booking();
    assert!(attach_volume(&mut g, 0).is_err());
}

#[test]
fn tiny_volume_cannot_hold_cases() {
    let mut g = Guest::make_booking();
    attach_volume(&mut g, 2048).unwrap();
    roc_kernel::mount(&mut g, "/dev/sdb1", "/mnt").unwrap();
    let cases = resolve(&g.vfs, "/", "/var/lib/booking/cases.db", "/root").unwrap();
    let n = roc_kernel::js_len(cases.node.content().unwrap()) as u64;
    assert!(ensure_space(&g, "/mnt/cases.db", n).is_err());
}

#[test]
fn virsh_list_and_attach_disk() {
    let mut sh = Shell::with_desk();
    assert!(sh.run("virsh list").stdout.contains("no guests"));
    sh.run("ssh precinct-13");
    let list = sh.run("virsh list");
    assert!(list.stdout.contains("booking-vm"));
    assert!(list.stdout.contains("running"));

    let bad = sh.run("virsh attach-disk booking-vm");
    assert!(bad.stderr.contains("size is required") || bad.stderr.contains("virsh:"));

    let ok = sh.run("virsh attach-disk booking-vm 200M");
    assert!(ok.success());
    assert!(ok.stdout.contains("/dev/sdb"));
}

#[test]
fn console_lsblk_mount_umount() {
    let mut sh = Shell::with_desk();
    sh.run("ssh precinct-13");
    sh.run("virsh attach-disk booking-vm 200M");
    let cons = sh.run("virsh console booking-vm");
    assert!(cons.stdout.contains("Connected to booking-vm"));
    assert_eq!(sh.host, "booking-vm");

    let blk = sh.run("lsblk");
    assert!(blk.stdout.contains("sdb"));
    assert!(blk.stdout.contains("sda"));

    assert_eq!(sh.run("mkdir /mnt/new").code, 0);
    assert_eq!(sh.run("mount /dev/sdb1 /mnt/new").code, 0);
    assert_eq!(sh.run("cp /root/NOTE /mnt/new/NOTE").code, 0);
    assert!(sh.run("ls /mnt/new").stdout.contains("NOTE"));
    assert_eq!(sh.run("umount /mnt/new").code, 0);
    assert!(!sh.run("ls /mnt/new").stdout.contains("NOTE"));
    assert_eq!(sh.run("mount /dev/sdb1 /mnt/new").code, 0);
    assert!(sh.run("cat /mnt/new/NOTE").stdout.contains("booking guest"));
}

#[test]
fn host_reboot_refused_guest_reboot_ok() {
    let mut sh = Shell::with_desk();
    let host = sh.run("reboot");
    assert!(host.stderr.contains("refusing to reboot the host"));
    sh.run("ssh precinct-13");
    let r = sh.run("virsh reboot booking-vm");
    assert!(r.stdout.contains("is being rebooted"));
}

#[test]
fn fstab_survives_reboot() {
    let mut sh = Shell::with_desk();
    sh.run("ssh precinct-13");
    sh.run("virsh attach-disk booking-vm 200M");
    sh.run("virsh console booking-vm");
    sh.run("mkdir /mnt/new");
    sh.run("mount /dev/sdb1 /mnt/new");
    sh.run("cp /var/lib/booking/cases.db /mnt/new/cases.db");
    sh.run("umount /mnt/new");
    sh.run("mount /dev/sdb1 /var/lib/booking");
    write(
        &mut sh.vfs,
        "/",
        "/etc/fstab",
        "/dev/sdb1  /var/lib/booking  ext4  defaults  0  2\n",
        WriteOpts {
            append: true,
            ..WriteOpts::default()
        },
    )
    .unwrap();

    sh.run("exit");
    sh.run("virsh reboot booking-vm");
    sh.run("virsh console booking-vm");
    let g = sh.ctx.guests.get("booking-vm").expect("guest");
    assert!(booking_persisted(g));
    assert!(sh
        .run("cat /var/lib/booking/cases.db")
        .stdout
        .contains("do not purge"));
}

#[test]
fn df_on_guest_lists_disks() {
    let mut sh = Shell::with_desk();
    sh.run("ssh precinct-13");
    sh.run("virsh attach-disk booking-vm 200M");
    sh.run("virsh console booking-vm");
    let df = sh.run("df");
    assert!(df.stdout.contains("/dev/sda1"));
    assert!(df.stdout.contains("/dev/sdb1"));
}
