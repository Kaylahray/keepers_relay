//! Keepers Relay — Keeper lock.
//!
//! The lock on a live Chain Cell. It exists for one reason: a Cell whose lock
//! is simply the Keeper's own wallet can only ever be spent by that Keeper, so
//! a Keeper who walks away freezes the Cell forever and nobody can ever record
//! that it died. This lock adds a second door that only opens after the clock
//! has run out.
//!
//! args (64 bytes):
//!   0..32   keeper_lock_hash    — the Keeper's real lock (proxy ownership)
//!   32..64  chain_type_hash     — the Chain Cell type script hash
//!
//! Two ways to unlock:
//!   1. The Keeper. Satisfied when any input in the transaction is already
//!      locked by `keeper_lock_hash`, so the Keeper's own signature carries it.
//!   2. The reaper. Once `since` proves the deadline passed, anyone may spend
//!      it. This is only safe because the cell must carry `chain_type_hash`,
//!      and that type script pins every field except `status` on a reap — so a
//!      reaper can settle the run but can never move the Cell or its capacity.
#![no_std]
#![no_main]

use ckb_std::{
    ckb_constants::Source,
    default_alloc, entry,
    high_level::{
        load_cell_data, load_cell_lock_hash, load_cell_type_hash, load_input_since, load_script,
        QueryIter,
    },
};

const ARGS_LEN: usize = 64;
const DATA_LEN: usize = 168;
const VERSION: u8 = 2;
const STATUS_ALIVE: u8 = 0;

const SINCE_FLAG_MASK: u64 = 0xE000_0000_0000_0000;
const SINCE_ABSOLUTE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;
const SINCE_VALUE_MASK: u64 = 0x00FF_FFFF_FFFF_FFFF;

#[repr(i8)]
enum Error {
    BadArgs = 60,
    Unauthorized = 61,
    Syscall = 62,
    NotChainCell = 63,
    NotExpired = 64,
    BadSince = 65,
    InvalidData = 66,
}

impl From<Error> for i8 {
    fn from(err: Error) -> Self {
        err as i8
    }
}

default_alloc!();
entry!(program_entry);

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(err) => err.into(),
    }
}

fn validate() -> Result<(), Error> {
    let script = load_script().map_err(|_| Error::Syscall)?;
    let args = script.args().raw_data();
    if args.len() != ARGS_LEN {
        return Err(Error::BadArgs);
    }
    let mut keeper_lock_hash = [0u8; 32];
    keeper_lock_hash.copy_from_slice(&args[0..32]);
    let mut chain_type_hash = [0u8; 32];
    chain_type_hash.copy_from_slice(&args[32..64]);

    if keeper_is_present(&keeper_lock_hash) {
        return Ok(());
    }

    reap_path(&chain_type_hash)
}

/// Door one: the Keeper is spending something else of theirs in the same
/// transaction, which means their own lock already authorised it.
fn keeper_is_present(keeper_lock_hash: &[u8; 32]) -> bool {
    QueryIter::new(load_cell_lock_hash, Source::Input).any(|hash| &hash == keeper_lock_hash)
}

/// Door two: the deadline has demonstrably passed.
fn reap_path(chain_type_hash: &[u8; 32]) -> Result<(), Error> {
    // Refuse to open for anything that is not a Chain Cell. Without this a
    // plain capacity cell wearing this lock would become free money at expiry.
    let type_hash = load_cell_type_hash(0, Source::GroupInput)
        .map_err(|_| Error::Syscall)?
        .ok_or(Error::NotChainCell)?;
    if &type_hash != chain_type_hash {
        return Err(Error::NotChainCell);
    }

    let data = load_cell_data(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    if data.len() != DATA_LEN || data[0] != VERSION {
        return Err(Error::InvalidData);
    }
    if data[1] != STATUS_ALIVE {
        // Already settled — only the Keeper path applies from here.
        return Err(Error::Unauthorized);
    }
    let expires_at_ms = u64::from_le_bytes(data[8..16].try_into().map_err(|_| Error::InvalidData)?);

    let since = load_input_since(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    if since & SINCE_FLAG_MASK != SINCE_ABSOLUTE_TIMESTAMP {
        return Err(Error::BadSince);
    }
    let anchor_ms = (since & SINCE_VALUE_MASK).saturating_mul(1000);
    if anchor_ms < expires_at_ms {
        return Err(Error::NotExpired);
    }

    Ok(())
}
