//! Keepers Relay — Chain Cell type script.
//!
//! Cell.data layout (116 bytes, little-endian):
//!   0     u8    version (=1)
//!   1     u8    status: 0=alive, 1=dead, 2=returned
//!   2     u8    mode: 0=open, 1=return_home
//!   3     u8    reserved
//!   4..8  u32   owner_count
//!   8..16 u64   expires_at_ms
//!   16..20 u32  window_seconds
//!   20..52 bytes32 chain_id
//!   52..84 bytes32 lineage_root
//!   84..116 bytes32 artifact_root
//!
//! Lock = current Keeper. Type = this script.
//!
//! Header-timestamp expiry is deferred (tx `since` / app layer). High-level
//! header loads pull `bytes` atomics that break RISC-V LTO on rustc 1.97.
#![no_std]
#![no_main]

use ckb_std::{
    ckb_constants::Source,
    default_alloc, entry,
    high_level::{load_cell_data, load_cell_lock_hash},
};

const DATA_LEN: usize = 116;
const VERSION: u8 = 1;

const STATUS_ALIVE: u8 = 0;
const STATUS_RETURNED: u8 = 2;

#[repr(i8)]
enum Error {
    EmptyGroup = 40,
    InvalidCardinality = 41,
    InvalidData = 42,
    DeadCell = 43,
    #[allow(dead_code)]
    Expired = 44,
    BadSuccessor = 45,
    OwnerCount = 46,
    WindowMismatch = 47,
    ChainIdMismatch = 48,
    Unauthorized = 49,
    Syscall = 50,
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

struct ChainData {
    status: u8,
    mode: u8,
    owner_count: u32,
    expires_at_ms: u64,
    window_seconds: u32,
    chain_id: [u8; 32],
}

fn validate() -> Result<(), Error> {
    let input_count = count_group_cells(Source::GroupInput)?;
    let output_count = count_group_cells(Source::GroupOutput)?;

    if input_count == 0 && output_count == 0 {
        return Err(Error::EmptyGroup);
    }
    if input_count > 1 || output_count > 1 {
        return Err(Error::InvalidCardinality);
    }

    match (input_count, output_count) {
        (0, 1) => {
            let out = parse_data(0, Source::GroupOutput)?;
            validate_mint(&out)
        }
        (1, 0) => Ok(()),
        (1, 1) => {
            let input = parse_data(0, Source::GroupInput)?;
            let output = parse_data(0, Source::GroupOutput)?;
            validate_handoff(&input, &output)
        }
        _ => Err(Error::InvalidCardinality),
    }
}

fn validate_mint(out: &ChainData) -> Result<(), Error> {
    if out.status != STATUS_ALIVE {
        return Err(Error::InvalidData);
    }
    if out.owner_count < 1 {
        return Err(Error::OwnerCount);
    }
    if out.window_seconds < 60 {
        return Err(Error::WindowMismatch);
    }
    Ok(())
}

fn validate_handoff(input: &ChainData, output: &ChainData) -> Result<(), Error> {
    if input.status != STATUS_ALIVE {
        return Err(Error::DeadCell);
    }

    if output.status != STATUS_ALIVE && output.status != STATUS_RETURNED {
        return Err(Error::InvalidData);
    }
    if output.mode != input.mode {
        return Err(Error::InvalidData);
    }
    if output.window_seconds != input.window_seconds {
        return Err(Error::WindowMismatch);
    }
    if output.chain_id != input.chain_id {
        return Err(Error::ChainIdMismatch);
    }
    if output.owner_count != input.owner_count.saturating_add(1) {
        return Err(Error::OwnerCount);
    }

    // Successor expiry must move forward by roughly one window.
    let min_delta = (input.window_seconds as u64)
        .saturating_mul(1000)
        .saturating_sub(120_000);
    let max_delta = (input.window_seconds as u64)
        .saturating_mul(1000)
        .saturating_add(120_000);
    let delta = output.expires_at_ms.saturating_sub(input.expires_at_ms);
    if delta < min_delta || delta > max_delta {
        return Err(Error::BadSuccessor);
    }

    if output.status == STATUS_ALIVE {
        let in_lock = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
        let out_lock = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
        if in_lock == out_lock {
            return Err(Error::Unauthorized);
        }
    }

    Ok(())
}

fn parse_data(index: usize, source: Source) -> Result<ChainData, Error> {
    let data = load_cell_data(index, source).map_err(|_| Error::Syscall)?;
    if data.len() != DATA_LEN || data[0] != VERSION {
        return Err(Error::InvalidData);
    }

    let mut chain_id = [0u8; 32];
    chain_id.copy_from_slice(&data[20..52]);

    Ok(ChainData {
        status: data[1],
        mode: data[2],
        owner_count: u32::from_le_bytes(data[4..8].try_into().unwrap()),
        expires_at_ms: u64::from_le_bytes(data[8..16].try_into().unwrap()),
        window_seconds: u32::from_le_bytes(data[16..20].try_into().unwrap()),
        chain_id,
    })
}

fn count_group_cells(source: Source) -> Result<usize, Error> {
    let mut index = 0;
    loop {
        match load_cell_lock_hash(index, source) {
            Ok(_) => index += 1,
            Err(ckb_std::error::SysError::IndexOutOfBound) => return Ok(index),
            Err(_) => return Err(Error::Syscall),
        }
    }
}
