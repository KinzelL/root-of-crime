//! Host catalog. Matches `Infra.CATALOG` / `ALIAS` in `js/infra.js`.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Host {
    pub id: &'static str,
    pub kind: &'static str,
    pub user: &'static str,
    pub home: &'static str,
    pub addr: &'static str,
    pub cluster: &'static str,
    pub role: &'static str,
}

pub const CATALOG: &[Host] = &[
    Host {
        id: "closet",
        kind: "jump",
        user: "itguy",
        home: "/home/itguy",
        addr: "10.13.0.1",
        cluster: "closet",
        role: "jump host",
    },
    Host {
        id: "precinct-13",
        kind: "host",
        user: "root",
        home: "/home/itguy",
        addr: "10.13.0.4",
        cluster: "on-prem",
        role: "HV / ticket box",
    },
    Host {
        id: "booking-vm",
        kind: "guest",
        user: "root",
        home: "/root",
        addr: "10.13.0.20",
        cluster: "on-prem",
        role: "booking guest",
    },
    Host {
        id: "coffee.lan",
        kind: "appliance",
        user: "root",
        home: "/opt/coffee",
        addr: "10.13.0.8",
        cluster: "copier-vlan",
        role: "BeanTek appliance",
    },
];

pub fn resolve(name: &str) -> String {
    let lower = name.trim().to_ascii_lowercase();
    let n = lower.rsplit('@').next().unwrap_or(&lower);
    match n {
        "precinct" | "precinct13" => "precinct-13".into(),
        "booking" => "booking-vm".into(),
        "coffee" => "coffee.lan".into(),
        "localhost" | "127.0.0.1" => "closet".into(),
        _ => n.to_string(),
    }
}

pub fn catalog(id: &str) -> Option<&'static Host> {
    let key = resolve(id);
    CATALOG.iter().find(|h| h.id == key)
}
