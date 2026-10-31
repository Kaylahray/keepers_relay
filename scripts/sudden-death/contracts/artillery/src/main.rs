//! Game script for the artillery duel. Never a lock or type script: duel-type spawns it.
//!
//! Duel game ABI v1: one argument, the hex of `seed u32 LE ‖ shot count u8 ‖ per shot: angle u8 ‖
//! power u8 ‖ wind i8`, and one inherited fd. Replays the duel and writes four bytes, `hp of side 0 ‖
//! hp of side 1 ‖ shots played ‖ verdict`, where the verdict is 0 or 1 for the winning side, 2 for a
//! draw and 3 while the duel is still on. Exits non-zero for a malformed duel or a shot out of range.

#![no_std]
#![no_main]

use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::env::argv;
use ckb_std::high_level::{decode_hex, inherited_fds};
use ckb_std::syscalls::write;
use crowns_artillery_core::{replay, Shot, Winner};

entry!(program_entry);
default_alloc!();

const ERR_ARGS: i8 = 1;
const ERR_SHOTS: i8 = 2;
const ERR_FD: i8 = 3;

pub const VERDICT_DRAW: u8 = 2;
pub const VERDICT_ON: u8 = 3;

fn program_entry() -> i8 {
    let args = argv();
    if args.len() != 1 {
        return ERR_ARGS;
    }
    let Ok(raw) = decode_hex(&args[0]) else {
        return ERR_ARGS;
    };
    if raw.len() < 5 {
        return ERR_ARGS;
    }
    let seed = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]);
    let count = raw[4] as usize;
    let body = &raw[5..];
    if body.len() != count * 3 {
        return ERR_ARGS;
    }
    let shots = body.chunks_exact(3).map(|shot| Shot {
        angle: shot[0] as i32,
        power: shot[1] as i32,
        wind: shot[2] as i8 as i32,
    });
    let Ok(state) = replay(seed, shots) else {
        return ERR_SHOTS;
    };
    let verdict = match state.winner {
        Some(Winner::Side(side)) => side,
        Some(Winner::Draw) => VERDICT_DRAW,
        None => VERDICT_ON,
    };
    let answer = [state.tanks[0].hp as u8, state.tanks[1].hp as u8, state.turn as u8, verdict];
    let fds = inherited_fds();
    if fds.len() != 1 {
        return ERR_FD;
    }
    let mut sent = 0;
    while sent < answer.len() {
        match write(fds[0], &answer[sent..]) {
            Ok(0) | Err(_) => return ERR_FD,
            Ok(n) => sent += n,
        }
    }
    0
}
