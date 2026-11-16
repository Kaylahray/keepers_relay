//! Game script for Crown Rally. Never a lock or type script: live-match spawns it.
//!
//! Serves `LiveGame` over ckb-script-ipc (see `crowns-game-api`): live-match spawns it as a server
//! and calls `judge` with the race record, `map u8 ‖ cars u8 ‖ per car: count u16 LE ‖ events`. The
//! answer is one byte per car, its place (0 for first, ties share) with 0x80 set if it finished every
//! lap, or an error for an illegal record or a map it doesn't have.

#![no_std]
#![no_main]

use alloc::vec::Vec;
use ckb_script_ipc_common::spawn::run_server;
use ckb_std::default_alloc;
use ckb_std::entry;
use crowns_game_api::LiveGame;

entry!(program_entry);
default_alloc!();

/// The record is empty or the rules refuse it (a bad map, too many cars, a bad tape).
const ERR_RECORD: u64 = 2;
/// The server stopped: the pipe to live-match broke.
const ERR_SERVER: i8 = 4;

struct Rally;

impl LiveGame for Rally {
    fn judge(&mut self, record: Vec<u8>) -> Result<Vec<u8>, u64> {
        if record.is_empty() {
            return Err(ERR_RECORD);
        }
        let race = crowns_rally_core::replay_map(&record).map_err(|_| ERR_RECORD)?;
        Ok(race.results()[..race.count].to_vec())
    }
}

fn program_entry() -> i8 {
    // Serves until live-match is done with it; the transaction ends with the root script.
    match run_server(Rally.server()) {
        Ok(()) => 0,
        Err(_) => ERR_SERVER,
    }
}
