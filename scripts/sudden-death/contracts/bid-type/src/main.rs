#![no_std]
#![no_main]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::packed::Script;
use ckb_std::ckb_types::prelude::Entity;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_occupied_capacity, load_cell_type,
    load_cell_type_hash,
};
use sudden_death_common::*;

entry!(program_entry);
default_alloc!();

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn validate() -> Result<(), i8> {
    let args = script_args()?;
    if args.len() != 64 {
        return Err(ERR_LEN);
    }
    let match_type_hash = bytes::<32>(&args, 0)?;
    let owner = bytes::<32>(&args, 32)?;

    let gi = count(Source::GroupInput)?;
    let go = count(Source::GroupOutput)?;
    if gi == 0 && go == 1 {
        return create(&match_type_hash, &owner);
    }
    if gi >= 1 && go == 0 {
        return consume(&match_type_hash, &owner);
    }
    Err(ERR_MODE)
}

fn count(source: Source) -> Result<usize, i8> {
    let mut n = 0usize;
    loop {
        match load_cell_data(n, source) {
            Ok(_) => n += 1,
            Err(_) => return Ok(n),
        }
    }
}

fn owner_script_matches(data: &[u8], owner: &[u8; 32]) -> Result<(), i8> {
    if data.first() != Some(&BID_VERSION) || data.len() < 2 {
        return Err(ERR_LEN);
    }
    let body = &data[1..];
    if Script::from_slice(body).is_err() {
        return Err(ERR_LEN);
    }
    if blake2b_256(&[body]) != *owner {
        return Err(ERR_KING);
    }
    Ok(())
}

fn create(match_type_hash: &[u8; 32], owner: &[u8; 32]) -> Result<(), i8> {
    if *owner == [0u8; 32] {
        return Err(ERR_KING);
    }
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    owner_script_matches(&out, owner)?;
    proxy_guarded(0, Source::GroupOutput, match_type_hash)?;

    let mut buf = [0u8; MATCH_DATA_LEN];
    let (_, match_data) = find_match(match_type_hash, Source::CellDep, &mut buf)?.ok_or(ERR_BID)?;
    let fee = read_u64(match_data, OFF_FEE)?;
    let occupied = load_cell_occupied_capacity(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let cap = load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let need = fee
        .checked_add(occupied)
        .ok_or(ERR_POT)?
        .checked_add(MAX_TX_FEE)
        .ok_or(ERR_POT)?;
    if cap < need {
        return Err(ERR_POT);
    }
    Ok(())
}

fn consume(match_type_hash: &[u8; 32], owner: &[u8; 32]) -> Result<(), i8> {
    let mut in_buf = [0u8; MATCH_DATA_LEN];
    let Some((match_index, data)) = find_match(match_type_hash, Source::Input, &mut in_buf)? else {
        return Err(ERR_BID);
    };
    let input_hash = load_cell_type_hash(match_index, Source::Input).map_err(|_| ERR_BID)?;
    if input_hash != Some(*match_type_hash) {
        return Err(ERR_BID);
    }
    let mut out_buf = [0u8; MATCH_DATA_LEN];
    if find_match(match_type_hash, Source::Output, &mut out_buf)?.is_some() {
        return steal(owner, data);
    }
    refund(owner, match_index, data)
}

fn steal(owner: &[u8; 32], data: &[u8]) -> Result<(), i8> {
    if count(Source::GroupInput)? != 1 {
        return Err(ERR_BID);
    }
    let bid_cap = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    let fee = read_u64(data, OFF_FEE)?;
    let min = bid_cap
        .checked_sub(fee)
        .ok_or(ERR_POT)?
        .checked_sub(MAX_TX_FEE)
        .ok_or(ERR_POT)?;
    if outputs_to_lock(owner)? < min {
        return Err(ERR_POT);
    }
    Ok(())
}

fn refund(owner: &[u8; 32], match_index: usize, data: &[u8]) -> Result<(), i8> {
    let mut owed = 0u64;
    let n = count(Source::GroupInput)?;
    for i in 0..n {
        let cap = load_cell_capacity(i, Source::GroupInput).map_err(|_| ERR_POT)?;
        owed = owed.checked_add(cap).ok_or(ERR_POT)?;
    }
    let king = bytes::<32>(data, OFF_KING)?;
    let pot = read_u64(data, OFF_POT)?;
    let host = host_of(match_index)?;
    if king != [0u8; 32] && *owner == king {
        owed = owed.checked_add(pot).ok_or(ERR_POT)?;
    }
    if *owner == host {
        let match_cap = load_cell_capacity(match_index, Source::Input).map_err(|_| ERR_TREASURY)?;
        let treasury = bytes::<32>(data, OFF_TREASURY)?;
        let treasury_cap = treasury_capacity(&treasury, Source::Input)?;
        let share = if king == [0u8; 32] {
            match_cap.checked_add(treasury_cap).ok_or(ERR_POT)?
        } else {
            match_cap
                .checked_add(treasury_cap)
                .ok_or(ERR_POT)?
                .checked_sub(pot)
                .ok_or(ERR_POT)?
        };
        owed = owed.checked_add(share).ok_or(ERR_POT)?;
    }
    if outputs_to_lock(owner)? < owed {
        return Err(ERR_POT);
    }
    Ok(())
}

fn host_of(match_index: usize) -> Result<[u8; 32], i8> {
    let script = load_cell_type(match_index, Source::Input).map_err(|_| ERR_LEN)?.ok_or(ERR_LEN)?;
    let args = script.args().raw_data();
    if args.len() != 64 {
        return Err(ERR_LEN);
    }
    bytes::<32>(&args, 32)
}
