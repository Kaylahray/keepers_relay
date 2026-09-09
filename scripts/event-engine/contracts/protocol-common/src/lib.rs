#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source,
    high_level::{
        load_cell_capacity, load_cell_data, load_cell_lock_hash, load_cell_occupied_capacity,
        load_cell_type, load_cell_type_hash, load_script, load_script_hash, QueryIter,
    },
};

pub const EVENT_DATA_LEN: usize = 2576;
pub const EVENT_BASE_LEN: usize = 528;
pub const MAX_PARTICIPANT_SLOTS: usize = 64;
pub const PARTICIPANT_SLOT_BASE: usize = EVENT_BASE_LEN;
pub const PARTICIPANT_SLOT_SIZE: usize = 32;

pub const EVENT_VERSION: u8 = 3;
pub const PARTICIPANT_VERSION: u8 = 1;
pub const CLAIM_VERSION: u8 = 1;

pub const STATUS_REGISTRATION: u8 = 0;
pub const STATUS_READY: u8 = 1;
pub const STATUS_LIVE: u8 = 2;
pub const STATUS_PAUSED: u8 = 3;
pub const STATUS_FINISHED: u8 = 4;
pub const STATUS_SETTLED: u8 = 5;

pub const TURN_IDLE: u8 = 0;
pub const TURN_PENDING: u8 = 1;
pub const TURN_ANSWERED: u8 = 2;
pub const TURN_TIMED_OUT: u8 = 3;

pub const EVENT_OFFSET_VERSION: usize = 0;
pub const EVENT_OFFSET_STATUS: usize = 1;
pub const EVENT_OFFSET_FLAGS: usize = 2;
pub const EVENT_OFFSET_MODE: usize = 3;
pub const EVENT_OFFSET_MIN_PLAYERS: usize = 4;
pub const EVENT_OFFSET_MAX_PLAYERS: usize = 6;
pub const EVENT_OFFSET_PLAYER_COUNT: usize = 8;
pub const EVENT_OFFSET_WINNERS_N: usize = 10;
pub const EVENT_OFFSET_WINNER_COUNT: usize = 12;
pub const EVENT_OFFSET_BASE_TURN_SECS: usize = 14;
pub const EVENT_OFFSET_SHRINK_STEP_SECS: usize = 22;
pub const EVENT_OFFSET_MIN_TURN_SECS: usize = 30;
pub const EVENT_OFFSET_ENTRY_FEE: usize = 38;
pub const EVENT_OFFSET_POT: usize = 46;
pub const EVENT_OFFSET_FINAL_POT: usize = 54;
pub const EVENT_OFFSET_START_TIME: usize = 62;
pub const EVENT_OFFSET_END_TIME: usize = 70;
pub const EVENT_OFFSET_EVENT_ID: usize = 78;
pub const EVENT_OFFSET_COMMUNITY_ID: usize = 110;
pub const EVENT_OFFSET_CREATOR_LOCK: usize = 142;
pub const EVENT_OFFSET_CONTROLLER_LOCK: usize = 174;
pub const EVENT_OFFSET_TREASURY_LOCK: usize = 206;
pub const EVENT_OFFSET_PARTICIPANT_CODE_HASH: usize = 238;
pub const EVENT_OFFSET_RULES_HASH: usize = 270;
pub const EVENT_OFFSET_QUESTION_SET_HASH: usize = 302;
pub const EVENT_OFFSET_RESULT_HASH: usize = 334;
pub const EVENT_OFFSET_TURN_NUMBER: usize = 366;
pub const EVENT_OFFSET_TURN_STATE: usize = 374;
pub const EVENT_OFFSET_SELECTED_INDEX: usize = 375;
pub const EVENT_OFFSET_TURN_STARTED: usize = 376;
pub const EVENT_OFFSET_TURN_DEADLINE: usize = 384;
pub const EVENT_OFFSET_CURRENT_HOLDER: usize = 392;
pub const EVENT_OFFSET_PREVIOUS_HOLDER: usize = 424;
pub const EVENT_OFFSET_ACTION_COMMIT: usize = 456;
pub const EVENT_OFFSET_REWARD_CLAIM_CODE_HASH: usize = 488;
pub const EVENT_OFFSET_PARTICIPANTS: usize = PARTICIPANT_SLOT_BASE;

pub const PARTICIPANT_DATA_LEN: usize = 56;
pub const PARTICIPANT_OFFSET_VERSION: usize = 0;
pub const PARTICIPANT_OFFSET_STATUS: usize = 1;
pub const PARTICIPANT_OFFSET_ENTRY_FEE: usize = 2;
pub const PARTICIPANT_OFFSET_JOINED_AT: usize = 10;
pub const PARTICIPANT_OFFSET_NONCE: usize = 18;
pub const PARTICIPANT_OFFSET_SLOT: usize = 50;

pub const CLAIM_DATA_LEN: usize = 96;
pub const CLAIM_OFFSET_VERSION: usize = 0;
pub const CLAIM_OFFSET_RECIPIENT: usize = 1;
pub const CLAIM_OFFSET_AMOUNT: usize = 33;
pub const CLAIM_OFFSET_EVENT_ID: usize = 41;
pub const CLAIM_OFFSET_NONCE: usize = 73;

pub const TREASURY_ARGS_LEN: usize = 64;
pub const TREASURY_ARG_EVENT_TYPE_HASH: usize = 0;
pub const TREASURY_ARG_EVENT_ID: usize = 32;

pub const ERR: i8 = 1;

pub fn read_u16(data: &[u8], offset: usize) -> Result<u16, i8> {
    let s = data.get(offset..offset + 2).ok_or(ERR)?;
    Ok(u16::from_le_bytes([s[0], s[1]]))
}

pub fn read_u64(data: &[u8], offset: usize) -> Result<u64, i8> {
    let s = data.get(offset..offset + 8).ok_or(ERR)?;
    Ok(u64::from_le_bytes([
        s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
    ]))
}

pub fn read_i8(data: &[u8], offset: usize) -> Result<i8, i8> {
    Ok(*data.get(offset).ok_or(ERR)? as i8)
}

pub fn bytes<const N: usize>(data: &[u8], offset: usize) -> Result<[u8; N], i8> {
    let s = data.get(offset..offset + N).ok_or(ERR)?;
    let mut out = [0u8; N];
    out.copy_from_slice(s);
    Ok(out)
}

pub fn script_args() -> Result<Vec<u8>, i8> {
    let script = load_script().map_err(|_| ERR)?;
    Ok(script.as_reader().args().raw_data().to_vec())
}

pub fn current_script_hash() -> Result<[u8; 32], i8> {
    load_script_hash().map_err(|_| ERR)
}

pub fn cell_exists(index: usize, source: Source) -> bool {
    load_cell_capacity(index, source).is_ok()
}

pub fn group_len(source: Source) -> usize {
    let mut n = 0usize;
    while cell_exists(n, source) {
        n += 1;
    }
    n
}

pub fn tx_len(source: Source) -> usize {
    QueryIter::new(load_cell_type_hash, source).count()
}

pub fn script_code_hash(index: usize, source: Source) -> Result<[u8; 32], i8> {
    let script = load_cell_type(index, source).map_err(|_| ERR)?.ok_or(ERR)?;
    let mut out = [0u8; 32];
    out.copy_from_slice(&script.code_hash().raw_data());
    Ok(out)
}

pub fn script_args_at(index: usize, source: Source) -> Result<Vec<u8>, i8> {
    let script = load_cell_type(index, source).map_err(|_| ERR)?.ok_or(ERR)?;
    Ok(script.args().raw_data().to_vec())
}

pub fn lock_hash(index: usize, source: Source) -> Result<[u8; 32], i8> {
    load_cell_lock_hash(index, source).map_err(|_| ERR)
}

pub fn event_is_at(
    index: usize,
    source: Source,
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
) -> Result<bool, i8> {
    let Some(type_hash) = load_cell_type_hash(index, source).map_err(|_| ERR)? else {
        return Ok(false);
    };
    if &type_hash != event_type_hash {
        return Ok(false);
    }
    let script = load_cell_type(index, source).map_err(|_| ERR)?.ok_or(ERR)?;
    let args = script.args().raw_data();
    if args.len() != 32 || &args[..32] != event_id {
        return Ok(false);
    }
    Ok(true)
}

pub fn find_event(
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
    source: Source,
) -> Result<Option<(usize, Vec<u8>)>, i8> {
    let n = tx_len(source);
    for i in 0..n {
        if event_is_at(i, source, event_type_hash, event_id)? {
            return Ok(Some((i, load_cell_data(i, source).map_err(|_| ERR)?)));
        }
    }
    Ok(None)
}

pub fn participant_output_matches(
    index: usize,
    source: Source,
    participant_code_hash: &[u8; 32],
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
) -> Result<Option<[u8; 32]>, i8> {
    if load_cell_type_hash(index, source).map_err(|_| ERR)?.is_none() {
        return Ok(None);
    }
    // Match by type script *code_hash* (not full type hash — args vary per player).
    if script_code_hash(index, source)? != *participant_code_hash {
        return Ok(None);
    }
    let args = script_args_at(index, source)?;
    if args.len() != 96 || &args[0..32] != event_type_hash || &args[32..64] != event_id {
        return Ok(None);
    }
    let mut player = [0u8; 32];
    player.copy_from_slice(&args[64..96]);
    let lock = lock_hash(index, source)?;
    if lock != player {
        return Err(ERR);
    }
    Ok(Some(player))
}

pub fn count_participant_cells(
    participant_code_hash: &[u8; 32],
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
    source: Source,
) -> Result<usize, i8> {
    let n = tx_len(source);
    let mut count = 0;
    for i in 0..n {
        if participant_output_matches(i, source, participant_code_hash, event_type_hash, event_id)?
            .is_some()
        {
            count += 1;
        }
    }
    Ok(count)
}

pub fn treasury_stats(
    treasury_lock_hash: &[u8; 32],
    source: Source,
) -> Result<(usize, u64, u64), i8> {
    let n = tx_len(source);
    let mut count = 0usize;
    let mut capacity = 0u64;
    let mut occupied = 0u64;
    for i in 0..n {
        if lock_hash(i, source)? == *treasury_lock_hash {
            count += 1;
            capacity = capacity
                .checked_add(load_cell_capacity(i, source).map_err(|_| ERR)?)
                .ok_or(ERR)?;
            occupied = occupied
                .checked_add(load_cell_occupied_capacity(i, source).map_err(|_| ERR)?)
                .ok_or(ERR)?;
        }
    }
    Ok((count, capacity, occupied))
}

pub fn spendable_pot(treasury_lock_hash: &[u8; 32], source: Source) -> Result<(usize, u64), i8> {
    let (count, capacity, occupied) = treasury_stats(treasury_lock_hash, source)?;
    if count == 0 {
        return Ok((0, 0));
    }
    let spendable = capacity.checked_sub(occupied).ok_or(ERR)?;
    Ok((count, spendable))
}

pub fn participant_slot(data: &[u8], slot: usize) -> Result<[u8; 32], i8> {
    if slot >= MAX_PARTICIPANT_SLOTS {
        return Err(ERR);
    }
    bytes::<32>(data, PARTICIPANT_SLOT_BASE + slot * PARTICIPANT_SLOT_SIZE)
}

pub fn nonzero_slots(data: &[u8], max_players: usize) -> Result<usize, i8> {
    if max_players == 0 || max_players > MAX_PARTICIPANT_SLOTS {
        return Err(ERR);
    }
    let mut count = 0;
    for i in 0..max_players {
        if participant_slot(data, i)? != [0u8; 32] {
            count += 1;
        }
    }
    Ok(count)
}

pub fn has_participant(data: &[u8], max_players: usize, player: &[u8; 32]) -> Result<bool, i8> {
    if max_players == 0 || max_players > MAX_PARTICIPANT_SLOTS {
        return Err(ERR);
    }
    for i in 0..max_players {
        if participant_slot(data, i)? == *player {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn unique_slot_change(
    input: &[u8],
    output: &[u8],
    max_players: usize,
) -> Result<Option<(usize, [u8; 32])>, i8> {
    if input.len() != EVENT_DATA_LEN || output.len() != EVENT_DATA_LEN {
        return Err(ERR);
    }
    let mut changed = None;
    for i in 0..max_players {
        let a = participant_slot(input, i)?;
        let b = participant_slot(output, i)?;
        if a != b {
            if changed.is_some() {
                return Err(ERR);
            }
            if a != [0u8; 32] || b == [0u8; 32] {
                return Err(ERR);
            }
            changed = Some((i, b));
        }
    }
    Ok(changed)
}

/// CKB absolute-timestamp `since` value is **seconds**. Event deadlines are ms.
pub fn is_absolute_timestamp_since(since: u64, deadline_ms: u64) -> bool {
    if since == 0 {
        return false;
    }
    const RELATIVE_MASK: u64 = 0x8000_0000_0000_0000;
    const METRIC_MASK: u64 = 0x6000_0000_0000_0000;
    const RESERVED_MASK: u64 = 0x1F00_0000_0000_0000;
    const VALUE_MASK: u64 = 0x00FF_FFFF_FFFF_FFFF;
    const TIMESTAMP_METRIC: u64 = 0x4000_0000_0000_0000;
    if (since & RELATIVE_MASK) != 0 {
        return false;
    }
    if (since & METRIC_MASK) != TIMESTAMP_METRIC {
        return false;
    }
    if (since & RESERVED_MASK) != 0 {
        return false;
    }
    let since_secs = since & VALUE_MASK;
    let deadline_secs = deadline_ms / 1000;
    since_secs >= deadline_secs
}
