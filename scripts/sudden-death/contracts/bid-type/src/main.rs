#![no_std]
#![no_main]

//! Bid cell, version 4. It is the player's entry and also their run: each lap is sealed into it by
//! spending the player's key cell, which a throwaway session key in their browser signs for, so
//! laps need no wallet popup.
//! The lock is the Input Type Proxy Lock with args equal to this bid's own
//! type hash, so every spend is decided here and nowhere else. That is what lets a bid outlive its
//! match: version 1 pointed the lock at the match type, and once the match cell was gone a bid left
//! out of the close could never be spent again.

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::packed::Script;
use ckb_std::ckb_types::prelude::Entity;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_lock_hash, load_cell_occupied_capacity, load_cell_type,
    load_cell_type_hash, load_input_since, load_witness_args,
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
    if gi == 1 && go == 1 {
        return seal(&owner);
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

/// See `BID_VERSION` for the layout. Returns refund_after_ms once the owner script is checked.
fn parse_bid(data: &[u8], owner: &[u8; 32]) -> Result<u64, i8> {
    if data.first() != Some(&BID_VERSION) || data.len() <= BID_HEADER_LEN {
        return Err(ERR_LEN);
    }
    let body = &data[BID_HEADER_LEN..];
    if Script::from_slice(body).is_err() {
        return Err(ERR_LEN);
    }
    if blake2b_256(&[body]) != *owner {
        return Err(ERR_KING);
    }
    read_u64(data, 1)
}

fn create(match_type_hash: &[u8; 32], owner: &[u8; 32]) -> Result<(), i8> {
    if *owner == [0u8; 32] {
        return Err(ERR_KING);
    }
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let refund_after = parse_bid(&out, owner)?;
    proxy_guarded(0, Source::GroupOutput, &current_script_hash()?)?;
    // A new run: no laps yet, and a key cell to seal them with.
    if out[OFF_BID_LAPS] != 0
        || read_u64(&out, OFF_BID_LAP_START)? != 0
        || bytes::<32>(&out, OFF_BID_CHAIN)? != [0u8; 32]
        || bytes::<32>(&out, OFF_BID_KEY)? == [0u8; 32]
    {
        return Err(ERR_SEAL);
    }

    let mut buf = [0u8; MATCH_DATA_LEN];
    let (_, match_data) = find_match(match_type_hash, Source::CellDep, &mut buf)?.ok_or(ERR_BID)?;
    let deadline = read_u64(match_data, OFF_DEADLINE)?;
    if refund_after != deadline.checked_add(REFUND_GRACE_MS).ok_or(ERR_CLOCK)? {
        return Err(ERR_CLOCK);
    }
    // Proof of work: every entry, and so every road, costs the player some computing.
    let nonce = read_u64(&out, OFF_BID_NONCE)?;
    if pow_bits(match_type_hash, owner, &first_input()?, nonce) < match_data[OFF_POW_BITS] as u32 {
        return Err(ERR_WORK);
    }
    let fee = read_u64(match_data, OFF_FEE)?;
    let occupied = load_cell_occupied_capacity(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let cap = load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    // Room for the fee, storage and the steal's miner fee. Seals are paid for by the key cell.
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

/// Seals one lap into the run. The player's key cell must be spent in the same transaction, so CKB's
/// built-in lock checks the session key's signature and the player's wallet is not asked. The lap's
/// road was seeded by the block the entry last landed in; that block and the hash of the lap's
/// moves are folded into the lap chain, which the steal later replays against.
fn seal(owner: &[u8; 32]) -> Result<(), i8> {
    let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    parse_bid(&input, owner)?;
    parse_bid(&output, owner)?;
    // Everything but the lap count, lap start and chain stays as it was.
    if input[..OFF_BID_LAPS] != output[..OFF_BID_LAPS]
        || input[OFF_BID_KEY..OFF_BID_LAP_START] != output[OFF_BID_KEY..OFF_BID_LAP_START]
        || input[BID_HEADER_LEN..] != output[BID_HEADER_LEN..]
    {
        return Err(ERR_SEAL);
    }
    let laps = input[OFF_BID_LAPS];
    if laps >= LAPS || output[OFF_BID_LAPS] != laps + 1 {
        return Err(ERR_SEAL);
    }
    // The entry being spent landed when the last lap was sealed (or, before lap 1, when the entry
    // itself was locked). That block seeds this lap's road, and it closes the last lap's window.
    let (block, landed_ms) = postmark(0, Source::GroupInput)?;
    if laps > 0 && !lap_on_time(read_u64(&input, OFF_BID_LAP_START)?, landed_ms) {
        return Err(ERR_CLOCK);
    }
    if read_u64(&output, OFF_BID_LAP_START)? != landed_ms {
        return Err(ERR_SEAL);
    }

    let witness = load_witness_args(0, Source::GroupInput).map_err(|_| ERR_SEAL)?;
    let field = witness.input_type().to_opt().ok_or(ERR_SEAL)?;
    let raw = field.raw_data();
    if raw.len() != SEAL_WITNESS_LEN || raw[0] != SEAL_VERSION {
        return Err(ERR_SEAL);
    }
    let moves_hash = bytes::<32>(&raw, 1)?;
    let chain = fold_lap(&bytes::<32>(&input, OFF_BID_CHAIN)?, &block, &moves_hash);
    if bytes::<32>(&output, OFF_BID_CHAIN)? != chain {
        return Err(ERR_SEAL);
    }
    // The key cell is spent here, so its lock (CKB's built-in one) has checked the session key.
    let key = bytes::<32>(&input, OFF_BID_KEY)?;
    let mut keyed = false;
    for i in 0..tx_len(Source::Input) {
        if load_cell_lock_hash(i, Source::Input).map_err(|_| ERR_SEAL)? == key {
            keyed = true;
            break;
        }
    }
    if !keyed {
        return Err(ERR_SEAL);
    }

    // Same lock and the same capacity: the key cell pays the miner fee.
    if load_cell_lock_hash(0, Source::GroupInput).map_err(|_| ERR_SEAL)?
        != load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| ERR_SEAL)?
    {
        return Err(ERR_SEAL);
    }
    if load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?
        != load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)?
    {
        return Err(ERR_POT);
    }
    Ok(())
}

fn consume(match_type_hash: &[u8; 32], owner: &[u8; 32]) -> Result<(), i8> {
    let mut in_buf = [0u8; MATCH_DATA_LEN];
    let Some((match_index, data)) = find_match(match_type_hash, Source::Input, &mut in_buf)? else {
        return expire(owner);
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
    let winner = winner(data, match_index)?;
    let pot = read_u64(data, OFF_POT)?;
    let host = host_of(match_index)?;
    if winner == Some(*owner) {
        owed = owed.checked_add(pot).ok_or(ERR_POT)?;
    }
    if *owner == host {
        let match_cap = load_cell_capacity(match_index, Source::Input).map_err(|_| ERR_TREASURY)?;
        let treasury = bytes::<32>(data, OFF_TREASURY)?;
        let treasury_cap = treasury_capacity(&treasury, Source::Input)?;
        let share = if winner.is_none() {
            match_cap.checked_add(treasury_cap).ok_or(ERR_POT)?
        } else {
            match_cap
                .checked_add(treasury_cap)
                .ok_or(ERR_POT)?
                .checked_sub(pot)
                .ok_or(ERR_POT)?
        };
        // Same allowance as the pot script: the fee and the closer's reward come out of the host's share.
        owed = owed.checked_add(share).ok_or(ERR_POT)?.saturating_sub(HOST_ALLOWANCE);
    }
    if outputs_to_lock(owner)? < owed {
        return Err(ERR_POT);
    }
    Ok(())
}

/// No match in the transaction: the match was closed without this bid, or never closed. Anyone may
/// return the bid to its owner once its refund time has passed, paying at most `MAX_TX_FEE`.
fn expire(owner: &[u8; 32]) -> Result<(), i8> {
    let n = count(Source::GroupInput)?;
    let mut owed = 0u64;
    for i in 0..n {
        let data = load_cell_data(i, Source::GroupInput).map_err(|_| ERR_LEN)?;
        let refund_after = parse_bid(&data, owner)?;
        let since = load_input_since(i, Source::GroupInput).map_err(|_| ERR_SINCE)?;
        if !since_reaches_deadline(since, refund_after) {
            return Err(ERR_SINCE);
        }
        let cap = load_cell_capacity(i, Source::GroupInput).map_err(|_| ERR_POT)?;
        owed = owed.checked_add(cap).ok_or(ERR_POT)?;
    }
    let due = owed.checked_sub(MAX_TX_FEE).ok_or(ERR_POT)?;
    if outputs_to_lock(owner)? < due {
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
