//! Guest VM box. Matches `Virt.makeBooking` / `makeIdleBooking` in `js/virt.js`.

use indexmap::IndexMap;

use crate::vfs::{self, dir, size_of, Node};

#[derive(Debug, Clone)]
pub struct MountShadow {
    pub parent: String,
    pub name: String,
    pub node: Node,
}

#[derive(Debug, Clone)]
pub struct Disk {
    pub id: String,
    pub device: String,
    pub total: u64,
    pub mount: Option<String>,
    pub tree: Node,
    pub shadow: Option<MountShadow>,
}

#[derive(Debug, Clone)]
pub struct Guest {
    pub id: String,
    pub hostname: String,
    pub vfs: Node,
    pub state: String,
    pub volume_attached: bool,
    pub disks: Vec<Disk>,
    pub rebooted: bool,
    pub reboots: u32,
    pub blurb: String,
}

impl Guest {
    pub const BOOKING: &'static str = "booking-vm";

    pub fn make_booking() -> Self {
        let vfs = vfs::create_guest();
        let used = size_of(&vfs) as u64;
        Self {
            id: Self::BOOKING.into(),
            hostname: Self::BOOKING.into(),
            vfs,
            state: "running".into(),
            volume_attached: false,
            disks: vec![Disk {
                id: "sda".into(),
                device: "/dev/sda1".into(),
                total: used + 4000,
                mount: Some("/".into()),
                tree: dir(IndexMap::new()),
                shadow: None,
            }],
            rebooted: false,
            reboots: 0,
            blurb: String::new(),
        }
    }

    pub fn make_idle_booking() -> Self {
        let mut guest = Self::make_booking();
        let used = size_of(&guest.vfs) as u64;
        guest.disks[0].total = used + 200 * 1024;
        guest.state = "running".into();
        guest
    }
}
