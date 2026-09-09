//! Smoke: binaries load. Full matrix lives in TRANSACTION_CASES.md.

use super::Loader;

#[test]
fn binaries_present() {
    let loader = Loader::default();
    for name in [
        "event-type",
        "participant-type",
        "event-treasury-lock",
        "reward-claim-type",
    ] {
        let bin = loader.load_binary(name);
        assert!(!bin.is_empty(), "{name} empty");
    }
}
