//! Game script for the lane runner. Never a lock or type script: match-type spawns it.
//!
//! Game ABI v2 (see `score_run` in sudden-death-common): one argument, the hex of
//! `lap count u8` then per lap `seed u64 LE ‖ tape length u16 LE ‖ tape`, and one inherited fd.
//! Writes the score as u64 LE to the fd and exits 0; exits non-zero for an illegal run.

#![no_std]
#![no_main]

use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::env::argv;
use ckb_std::high_level::{decode_hex, inherited_fds};
use ckb_std::syscalls::write;

entry!(program_entry);
default_alloc!();

const ERR_ARGS: i8 = 1;
const ERR_TAPE: i8 = 2;
const ERR_FD: i8 = 3;

fn program_entry() -> i8 {
    let args = argv();
    if args.len() != 1 {
        return ERR_ARGS;
    }
    let Ok(raw) = decode_hex(&args[0]) else {
        return ERR_ARGS;
    };
    let Ok(outcome) = crowns_game_core::replay_encoded(&raw) else {
        return ERR_TAPE;
    };
    let fds = inherited_fds();
    if fds.len() != 1 {
        return ERR_FD;
    }
    let score = outcome.score.to_le_bytes();
    let mut sent = 0;
    while sent < score.len() {
        match write(fds[0], &score[sent..]) {
            Ok(0) | Err(_) => return ERR_FD,
            Ok(n) => sent += n,
        }
    }
    0
}
