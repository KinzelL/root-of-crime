//! Campaign. New types land here one at a time. Desk hub, then monitoring.

mod desk;
mod printer;

use crate::mission::Mission;

pub fn all() -> Vec<Mission> {
    vec![desk::mission(), printer::mission()]
}

pub fn get(id: &str) -> Option<Mission> {
    all().into_iter().find(|m| m.id == id)
}

pub fn list() -> Vec<Mission> {
    let mut v = all();
    v.sort_by(|a, b| a.order.partial_cmp(&b.order).unwrap());
    v
}
