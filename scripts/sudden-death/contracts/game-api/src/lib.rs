//! The game ABI between live-match and the game a match names, as a ckb-script-ipc service.
//!
//! live-match spawns the game from the cell dep with the match's game data hash as an IPC server and
//! makes one call. Any script that serves `LiveGame` can be named by a match: the match script never
//! needs to know how the game plays.
#![no_std]
extern crate alloc;

use alloc::vec::Vec;

#[ckb_script_ipc::service]
pub trait LiveGame {
    /// Judges a race record, `map u8 ‖ cars u8 ‖ per car: count u16 LE ‖ events`: one byte per car,
    /// its place (0 for first, ties share) with 0x80 set if it finished. An error code for a record
    /// the rules refuse or a map the game doesn't have.
    fn judge(record: Vec<u8>) -> Result<Vec<u8>, u64>;
}
