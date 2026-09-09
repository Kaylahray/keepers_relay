#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};
use ckb_std::ckb_constants::Source;
use ckb_std::high_level::{load_cell_data, load_cell_lock_hash, load_input_since};
use ckb_std::type_id::check_type_id;
use keepers_relay_protocol_common::*;

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
    if args.len() != 32 { return Err(ERR); }
    let mut event_id = [0u8;32];
    event_id.copy_from_slice(&args);
    let event_type_hash = current_script_hash()?;

    let gi = group_len(Source::GroupInput);
    let go = group_len(Source::GroupOutput);
    if gi > 1 || go > 1 { return Err(ERR); }

    match (gi, go) {
        (0, 1) => validate_creation(&event_id, &event_type_hash),
        (1, 1) => validate_update(&event_id, &event_type_hash),
        _ => Err(ERR), // Event cells are terminally retained after SETTLED; no burn.
    }
}

fn validate_creation(event_id: &[u8;32], event_type_hash: &[u8;32]) -> Result<(), i8> {
    check_type_id(0, 32).map_err(|_| ERR)?;
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR)?;
    if out.len() != EVENT_DATA_LEN { return Err(ERR); }
    validate_static(&out, event_id, event_type_hash, true)?;
    if load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| ERR)? != bytes::<32>(&out, EVENT_OFFSET_CONTROLLER_LOCK)? { return Err(ERR); }
    if out[EVENT_OFFSET_STATUS] != STATUS_REGISTRATION || out[EVENT_OFFSET_TURN_STATE] != TURN_IDLE { return Err(ERR); }
    if read_u16(&out, EVENT_OFFSET_PLAYER_COUNT)? != 0 { return Err(ERR); }
    if read_u16(&out, EVENT_OFFSET_WINNER_COUNT)? != 0 { return Err(ERR); }
    if read_u64(&out, EVENT_OFFSET_POT)? != 0 || read_u64(&out, EVENT_OFFSET_FINAL_POT)? != 0 { return Err(ERR); }
    if nonzero_slots(&out, read_u16(&out, EVENT_OFFSET_MAX_PLAYERS)? as usize)? != 0 { return Err(ERR); }
    let treasury_hash = bytes::<32>(&out, EVENT_OFFSET_TREASURY_LOCK)?;
    let (tc, pot) = spendable_pot(&treasury_hash, Source::Output)?;
    if tc != 1 || pot != 0 { return Err(ERR); }
    let participant_code_hash = bytes::<32>(&out, EVENT_OFFSET_PARTICIPANT_CODE_HASH)?;
    if count_participant_cells(&participant_code_hash, event_type_hash, event_id, Source::Output)? != 0 { return Err(ERR); }
    Ok(())
}

fn validate_update(event_id: &[u8;32], event_type_hash: &[u8;32]) -> Result<(), i8> {
    let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR)?;
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR)?;
    if input.len() != EVENT_DATA_LEN || output.len() != EVENT_DATA_LEN { return Err(ERR); }

    validate_static(&input, event_id, event_type_hash, false)?;
    validate_static(&output, event_id, event_type_hash, false)?;
    ensure_immutable_config(&input, &output)?;

    let input_status = input[EVENT_OFFSET_STATUS];
    let output_status = output[EVENT_OFFSET_STATUS];
    if input_status == STATUS_SETTLED { return Err(ERR); }
    if output_status > STATUS_SETTLED { return Err(ERR); }

    let max_players = read_u16(&output, EVENT_OFFSET_MAX_PLAYERS)? as usize;
    let in_count = nonzero_slots(&input, max_players)?;
    let out_count = nonzero_slots(&output, max_players)?;
    if read_u16(&input, EVENT_OFFSET_PLAYER_COUNT)? as usize != in_count { return Err(ERR); }
    if read_u16(&output, EVENT_OFFSET_PLAYER_COUNT)? as usize != out_count { return Err(ERR); }

    validate_status_transition(input_status, output_status)?;
    if input_status == STATUS_FINISHED && output_status == STATUS_FINISHED && input != output { return Err(ERR); }
    if input_status == STATUS_REGISTRATION && output_status == STATUS_READY {
        if read_u16(&output, EVENT_OFFSET_PLAYER_COUNT)? < read_u16(&output, EVENT_OFFSET_MIN_PLAYERS)? { return Err(ERR); }
    }

    // Treasury is the source of truth for the live spendable pot.
    let treasury_hash = bytes::<32>(&output, EVENT_OFFSET_TREASURY_LOCK)?;
    let (in_tc, in_pot) = spendable_pot(&treasury_hash, Source::Input)?;
    let (out_tc, out_pot) = spendable_pot(&treasury_hash, Source::Output)?;

    if output_status != STATUS_SETTLED {
        if out_tc != 1 || in_tc != 1 { return Err(ERR); }
        if out_pot < in_pot { return Err(ERR); }
        if read_u64(&output, EVENT_OFFSET_POT)? != out_pot { return Err(ERR); }
        if read_u64(&output, EVENT_OFFSET_FINAL_POT)? != 0 { return Err(ERR); }
        if input_status >= STATUS_FINISHED && out_pot != in_pot { return Err(ERR); }
    } else {
        if in_tc != 1 || out_tc != 0 { return Err(ERR); }
        if read_u64(&input, EVENT_OFFSET_POT)? != in_pot { return Err(ERR); }
        if read_u64(&output, EVENT_OFFSET_POT)? != 0 { return Err(ERR); }
        if read_u64(&output, EVENT_OFFSET_FINAL_POT)? != in_pot { return Err(ERR); }
        if read_u64(&output, EVENT_OFFSET_FINAL_POT)? != read_u64(&input, EVENT_OFFSET_POT)? { return Err(ERR); }
    }

    validate_join_delta(&input, &output, input_status, output_status, event_type_hash, event_id, in_pot, out_pot)?;
    validate_turn_transition(&input, &output, event_type_hash, event_id)?;
    if input_status == STATUS_FINISHED && output_status == STATUS_SETTLED { validate_settlement_freeze(&input, &output)?; }
    validate_result_transition(&input, &output)?;

    // The Event Cell's lock is the controller lock. The actual authorization is performed
    // by that lock script/witness; the type script only freezes the controller identity.
    let controller = bytes::<32>(&output, EVENT_OFFSET_CONTROLLER_LOCK)?;
    if load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| ERR)? != controller { return Err(ERR); }
    Ok(())
}

fn validate_static(data: &[u8], event_id: &[u8;32], event_type_hash: &[u8;32], creation: bool) -> Result<(), i8> {
    if data.len() != EVENT_DATA_LEN { return Err(ERR); }
    if data[EVENT_OFFSET_VERSION] != EVENT_VERSION { return Err(ERR); }
    let min_players = read_u16(data, EVENT_OFFSET_MIN_PLAYERS)?;
    let max_players = read_u16(data, EVENT_OFFSET_MAX_PLAYERS)?;
    if min_players == 0 || max_players == 0 || min_players > max_players || max_players as usize > MAX_PARTICIPANT_SLOTS { return Err(ERR); }
    let winners_n = read_u16(data, EVENT_OFFSET_WINNERS_N)?;
    if winners_n == 0 || winners_n > max_players { return Err(ERR); }
    let base = read_u64(data, EVENT_OFFSET_BASE_TURN_SECS)?;
    let step = read_u64(data, EVENT_OFFSET_SHRINK_STEP_SECS)?;
    let min_turn = read_u64(data, EVENT_OFFSET_MIN_TURN_SECS)?;
    if base == 0 || min_turn == 0 || min_turn > base { return Err(ERR); }
    if step > base { return Err(ERR); }
    let max_pot = read_u64(data, EVENT_OFFSET_ENTRY_FEE)?;
    let _ = max_pot;
    if bytes::<32>(data, EVENT_OFFSET_EVENT_ID)? != *event_id { return Err(ERR); }
    if bytes::<32>(data, EVENT_OFFSET_EVENT_ID)? != *event_id { return Err(ERR); }
    if creation && bytes::<32>(data, EVENT_OFFSET_CREATOR_LOCK)? == [0u8;32] { return Err(ERR); }
    if creation && bytes::<32>(data, EVENT_OFFSET_CONTROLLER_LOCK)? == [0u8;32] { return Err(ERR); }
    if bytes::<32>(data, EVENT_OFFSET_TREASURY_LOCK)? == [0u8;32] { return Err(ERR); }
    if bytes::<32>(data, EVENT_OFFSET_PARTICIPANT_CODE_HASH)? == [0u8;32] { return Err(ERR); }
    // Event type id and the event data id are the same identity.
    if bytes::<32>(data, EVENT_OFFSET_REWARD_CLAIM_CODE_HASH)? == [0u8;32] { return Err(ERR); }
    let _ = event_type_hash;
    Ok(())
}

fn ensure_immutable_config(a: &[u8], b: &[u8]) -> Result<(), i8> {
    const RANGES: &[(usize, usize)] = &[
        (EVENT_OFFSET_EVENT_ID, 32),
        (EVENT_OFFSET_COMMUNITY_ID, 32),
        (EVENT_OFFSET_CREATOR_LOCK, 32),
        (EVENT_OFFSET_CONTROLLER_LOCK, 32),
        (EVENT_OFFSET_TREASURY_LOCK, 32),
        (EVENT_OFFSET_PARTICIPANT_CODE_HASH, 32),
        (EVENT_OFFSET_RULES_HASH, 32),
        (EVENT_OFFSET_QUESTION_SET_HASH, 32),
        (EVENT_OFFSET_WINNERS_N, 2),
        (EVENT_OFFSET_MIN_PLAYERS, 2),
        (EVENT_OFFSET_MAX_PLAYERS, 2),
        (EVENT_OFFSET_MODE, 1),
        (EVENT_OFFSET_FLAGS, 1),
        (EVENT_OFFSET_BASE_TURN_SECS, 8),
        (EVENT_OFFSET_SHRINK_STEP_SECS, 8),
        (EVENT_OFFSET_MIN_TURN_SECS, 8),
        (EVENT_OFFSET_ENTRY_FEE, 8),
        (EVENT_OFFSET_REWARD_CLAIM_CODE_HASH, 32),
    ];
    for (off, len) in RANGES {
        if &a[*off..*off+*len] != &b[*off..*off+*len] { return Err(ERR); }
    }
    Ok(())
}

fn validate_status_transition(a: u8, b: u8) -> Result<(), i8> {
    match (a,b) {
        (STATUS_REGISTRATION, STATUS_REGISTRATION)
        | (STATUS_REGISTRATION, STATUS_READY)
        | (STATUS_READY, STATUS_READY)
        | (STATUS_READY, STATUS_LIVE)
        | (STATUS_LIVE, STATUS_LIVE)
        | (STATUS_LIVE, STATUS_PAUSED)
        | (STATUS_PAUSED, STATUS_LIVE)
        | (STATUS_PAUSED, STATUS_PAUSED)
        | (STATUS_LIVE, STATUS_FINISHED)
        | (STATUS_PAUSED, STATUS_FINISHED)
        | (STATUS_FINISHED, STATUS_FINISHED)
        | (STATUS_FINISHED, STATUS_SETTLED) => Ok(()),
        _ => Err(ERR),
    }
}

fn validate_join_delta(input: &[u8], output: &[u8], input_status: u8, output_status: u8, event_type_hash: &[u8;32], event_id: &[u8;32], in_pot: u64, out_pot: u64) -> Result<(), i8> {
    let max_players = read_u16(output, EVENT_OFFSET_MAX_PLAYERS)? as usize;
    let change = unique_slot_change(input, output, max_players)?;
    let diff = out_pot.checked_sub(in_pot).ok_or(ERR)?;
    match change {
        None => {
            // Sponsorship/top-up or an ordinary state transition.
            if read_u16(input, EVENT_OFFSET_PLAYER_COUNT)? != read_u16(output, EVENT_OFFSET_PLAYER_COUNT)? { return Err(ERR); }
            Ok(())
        }
        Some((slot, player)) => {
            if input_status != STATUS_REGISTRATION || output_status != STATUS_REGISTRATION { return Err(ERR); }
            if !is_zero_or_equal_unused(input, &player, slot, max_players)? { return Err(ERR); }
            let participant_code_hash = bytes::<32>(output, EVENT_OFFSET_PARTICIPANT_CODE_HASH)?;
            let mut found = 0usize;
            let n = tx_len(Source::Output);
            for i in 0..n {
                if let Some(p) = participant_output_matches(i, Source::Output, &participant_code_hash, event_type_hash, event_id)? {
                    if p != player { continue; }
                    let args = script_args_at(i, Source::Output)?;
                    let data = load_cell_data(i, Source::Output).map_err(|_| ERR)?;
                    if data.len() != PARTICIPANT_DATA_LEN { return Err(ERR); }
                    if read_u64(&data, PARTICIPANT_OFFSET_ENTRY_FEE)? != read_u64(output, EVENT_OFFSET_ENTRY_FEE)? { return Err(ERR); }
                    let ps = read_u16(&data, PARTICIPANT_OFFSET_SLOT)? as usize;
                    if ps != slot || &args[64..96] != &player { return Err(ERR); }
                    found += 1;
                }
            }
            if found != 1 { return Err(ERR); }
            let fee = read_u64(output, EVENT_OFFSET_ENTRY_FEE)?;
            if diff < fee { return Err(ERR); }
            Ok(())
        }
    }
}

fn is_zero_or_equal_unused(input: &[u8], player: &[u8;32], slot: usize, max_players: usize) -> Result<bool, i8> {
    if has_participant(input, max_players, player)? { return Err(ERR); }
    let _ = slot;
    Ok(true)
}

fn validate_turn_transition(input: &[u8], output: &[u8], event_type_hash: &[u8;32], event_id: &[u8;32]) -> Result<(), i8> {
    let a_state = input[EVENT_OFFSET_TURN_STATE];
    let b_state = output[EVENT_OFFSET_TURN_STATE];

    if input[EVENT_OFFSET_STATUS] == STATUS_REGISTRATION {
        if b_state != TURN_IDLE { return Err(ERR); }
    }
    if input[EVENT_OFFSET_STATUS] == STATUS_READY && output[EVENT_OFFSET_STATUS] == STATUS_READY {
        if b_state != TURN_IDLE { return Err(ERR); }
    }

    if input[EVENT_OFFSET_STATUS] == STATUS_READY && output[EVENT_OFFSET_STATUS] == STATUS_LIVE {
        if a_state != TURN_IDLE || b_state != TURN_PENDING { return Err(ERR); }
        if read_u64(output, EVENT_OFFSET_TURN_NUMBER)? != 0 { return Err(ERR); }
        let holder = bytes::<32>(output, EVENT_OFFSET_CURRENT_HOLDER)?;
        if holder == [0u8;32] { return Err(ERR); }
        if read_u64(output, EVENT_OFFSET_START_TIME)? == 0 { return Err(ERR); }
        let max = read_u16(output, EVENT_OFFSET_MAX_PLAYERS)? as usize;
        if !has_participant(output, max, &holder)? { return Err(ERR); }
        validate_new_deadline(input, output)?;
        return Ok(());
    }

    if input[EVENT_OFFSET_STATUS] == STATUS_LIVE && output[EVENT_OFFSET_STATUS] == STATUS_LIVE {
        match (a_state, b_state) {
            (TURN_PENDING, TURN_ANSWERED) => {
                if bytes::<32>(input, EVENT_OFFSET_CURRENT_HOLDER)? != bytes::<32>(output, EVENT_OFFSET_CURRENT_HOLDER)? { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_NUMBER)? != read_u64(output, EVENT_OFFSET_TURN_NUMBER)? { return Err(ERR); }
                if read_i8(&output, EVENT_OFFSET_SELECTED_INDEX)? < 0 { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_STARTED)? != read_u64(output, EVENT_OFFSET_TURN_STARTED)? || read_u64(input, EVENT_OFFSET_TURN_DEADLINE)? != read_u64(output, EVENT_OFFSET_TURN_DEADLINE)? { return Err(ERR); }
                if bytes::<32>(input, EVENT_OFFSET_ACTION_COMMIT)? != bytes::<32>(output, EVENT_OFFSET_ACTION_COMMIT)? { return Err(ERR); }
            }
            (TURN_PENDING, TURN_TIMED_OUT) => {
                if bytes::<32>(input, EVENT_OFFSET_CURRENT_HOLDER)? != bytes::<32>(output, EVENT_OFFSET_CURRENT_HOLDER)? { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_NUMBER)? != read_u64(output, EVENT_OFFSET_TURN_NUMBER)? { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_DEADLINE)? != read_u64(output, EVENT_OFFSET_TURN_DEADLINE)? { return Err(ERR); }
                if bytes::<32>(input, EVENT_OFFSET_ACTION_COMMIT)? != bytes::<32>(output, EVENT_OFFSET_ACTION_COMMIT)? { return Err(ERR); }
                let since = load_input_since(0, Source::GroupInput).map_err(|_| ERR)?;
                if !is_absolute_timestamp_since(since, read_u64(input, EVENT_OFFSET_TURN_DEADLINE)?) { return Err(ERR); }
            }
            (TURN_ANSWERED, TURN_PENDING) | (TURN_TIMED_OUT, TURN_PENDING) => {
                let a_num = read_u64(input, EVENT_OFFSET_TURN_NUMBER)?;
                let b_num = read_u64(output, EVENT_OFFSET_TURN_NUMBER)?;
                if b_num != a_num.checked_add(1).ok_or(ERR)? { return Err(ERR); }
                let previous = bytes::<32>(output, EVENT_OFFSET_PREVIOUS_HOLDER)?;
                let old = bytes::<32>(input, EVENT_OFFSET_CURRENT_HOLDER)?;
                let next = bytes::<32>(output, EVENT_OFFSET_CURRENT_HOLDER)?;
                if previous != old || next == [0u8;32] || next == old { return Err(ERR); }
                if read_i8(output, EVENT_OFFSET_SELECTED_INDEX)? != -1 { return Err(ERR); }
                let max = read_u16(output, EVENT_OFFSET_MAX_PLAYERS)? as usize;
                if !has_participant(output, max, &next)? { return Err(ERR); }
                validate_new_deadline(input, output)?;
            }
            (TURN_ANSWERED, TURN_ANSWERED) | (TURN_TIMED_OUT, TURN_TIMED_OUT) | (TURN_PENDING, TURN_PENDING) => {
                if bytes::<32>(input, EVENT_OFFSET_CURRENT_HOLDER)? != bytes::<32>(output, EVENT_OFFSET_CURRENT_HOLDER)? { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_NUMBER)? != read_u64(output, EVENT_OFFSET_TURN_NUMBER)? { return Err(ERR); }
                if read_u64(input, EVENT_OFFSET_TURN_STARTED)? != read_u64(output, EVENT_OFFSET_TURN_STARTED)? || read_u64(input, EVENT_OFFSET_TURN_DEADLINE)? != read_u64(output, EVENT_OFFSET_TURN_DEADLINE)? { return Err(ERR); }
            }
            _ => return Err(ERR),
        }
    }

    if input[EVENT_OFFSET_STATUS] == STATUS_LIVE && output[EVENT_OFFSET_STATUS] == STATUS_PAUSED {
        if !turn_fields_equal(input, output) { return Err(ERR); }
    }
    if input[EVENT_OFFSET_STATUS] == STATUS_PAUSED && output[EVENT_OFFSET_STATUS] == STATUS_LIVE {
        if !turn_fields_equal(input, output) { return Err(ERR); }
    }
    if output[EVENT_OFFSET_STATUS] == STATUS_FINISHED {
        if input[EVENT_OFFSET_STATUS] != STATUS_LIVE && input[EVENT_OFFSET_STATUS] != STATUS_PAUSED { return Err(ERR); }
        let in_state = input[EVENT_OFFSET_TURN_STATE];
        let out_state = output[EVENT_OFFSET_TURN_STATE];
        if in_state != TURN_ANSWERED && in_state != TURN_TIMED_OUT { return Err(ERR); }
        if out_state != in_state { return Err(ERR); }
    }
    let _ = (event_type_hash, event_id);
    Ok(())
}

fn turn_fields_equal(a:&[u8], b:&[u8]) -> bool {
    let offs = [EVENT_OFFSET_TURN_NUMBER, EVENT_OFFSET_TURN_STATE, EVENT_OFFSET_SELECTED_INDEX, EVENT_OFFSET_TURN_STARTED, EVENT_OFFSET_TURN_DEADLINE, EVENT_OFFSET_CURRENT_HOLDER, EVENT_OFFSET_PREVIOUS_HOLDER, EVENT_OFFSET_ACTION_COMMIT];
    for off in offs {
        let len = if off == EVENT_OFFSET_TURN_STATE || off == EVENT_OFFSET_SELECTED_INDEX { 1 } else if off == EVENT_OFFSET_TURN_NUMBER || off == EVENT_OFFSET_TURN_STARTED || off == EVENT_OFFSET_TURN_DEADLINE { 8 } else { 32 };
        if &a[off..off+len] != &b[off..off+len] { return false; }
    }
    true
}

fn validate_new_deadline(input: &[u8], output: &[u8]) -> Result<(), i8> {
    let base = read_u64(output, EVENT_OFFSET_BASE_TURN_SECS)?;
    let step = read_u64(output, EVENT_OFFSET_SHRINK_STEP_SECS)?;
    let min_turn = read_u64(output, EVENT_OFFSET_MIN_TURN_SECS)?;
    let turn_no = read_u64(output, EVENT_OFFSET_TURN_NUMBER)?;
    let shrink = step.checked_mul(turn_no).ok_or(ERR)?;
    let duration = if shrink >= base { min_turn } else { core::cmp::max(min_turn, base - shrink) };
    let started = read_u64(output, EVENT_OFFSET_TURN_STARTED)?;
    let deadline = read_u64(output, EVENT_OFFSET_TURN_DEADLINE)?;
    let expected_delta = duration.checked_mul(1000).ok_or(ERR)?;
    if deadline != started.checked_add(expected_delta).ok_or(ERR)? { return Err(ERR); }
    if started == 0 || deadline <= started { return Err(ERR); }
    if bytes::<32>(output, EVENT_OFFSET_ACTION_COMMIT)? == [0u8;32] { return Err(ERR); }
    if input[EVENT_OFFSET_STATUS] == STATUS_READY && output[EVENT_OFFSET_STATUS] == STATUS_LIVE && started == 0 { return Err(ERR); }
    Ok(())
}

fn validate_settlement_freeze(input:&[u8], output:&[u8])->Result<(),i8>{
    let ranges = [
        (EVENT_OFFSET_VERSION,1),(EVENT_OFFSET_FLAGS,1),(EVENT_OFFSET_MODE,1),
        (EVENT_OFFSET_MIN_PLAYERS,2),(EVENT_OFFSET_MAX_PLAYERS,2),(EVENT_OFFSET_PLAYER_COUNT,2),
        (EVENT_OFFSET_WINNERS_N,2),(EVENT_OFFSET_WINNER_COUNT,2),
        (EVENT_OFFSET_BASE_TURN_SECS,8),(EVENT_OFFSET_SHRINK_STEP_SECS,8),(EVENT_OFFSET_MIN_TURN_SECS,8),
        (EVENT_OFFSET_ENTRY_FEE,8),(EVENT_OFFSET_START_TIME,8),(EVENT_OFFSET_END_TIME,8),
        (EVENT_OFFSET_EVENT_ID,32),(EVENT_OFFSET_COMMUNITY_ID,32),(EVENT_OFFSET_CREATOR_LOCK,32),
        (EVENT_OFFSET_CONTROLLER_LOCK,32),(EVENT_OFFSET_TREASURY_LOCK,32),(EVENT_OFFSET_PARTICIPANT_CODE_HASH,32),
        (EVENT_OFFSET_REWARD_CLAIM_CODE_HASH,32),(EVENT_OFFSET_RULES_HASH,32),(EVENT_OFFSET_QUESTION_SET_HASH,32),
        (EVENT_OFFSET_RESULT_HASH,32),(EVENT_OFFSET_TURN_NUMBER,8),(EVENT_OFFSET_TURN_STATE,1),
        (EVENT_OFFSET_SELECTED_INDEX,1),(EVENT_OFFSET_TURN_STARTED,8),(EVENT_OFFSET_TURN_DEADLINE,8),
        (EVENT_OFFSET_CURRENT_HOLDER,32),(EVENT_OFFSET_PREVIOUS_HOLDER,32),(EVENT_OFFSET_ACTION_COMMIT,32),
        (EVENT_OFFSET_PARTICIPANTS,MAX_PARTICIPANT_SLOTS*PARTICIPANT_SLOT_SIZE),
    ];
    for (off,len) in ranges { if &input[off..off+len] != &output[off..off+len] { return Err(ERR); } }
    Ok(())
}

fn validate_result_transition(input: &[u8], output: &[u8]) -> Result<(), i8> {
    let in_status = input[EVENT_OFFSET_STATUS];
    let out_status = output[EVENT_OFFSET_STATUS];
    if out_status == STATUS_FINISHED {
        if in_status != STATUS_LIVE && in_status != STATUS_PAUSED { return Err(ERR); }
        if bytes::<32>(output, EVENT_OFFSET_RESULT_HASH)? == [0u8;32] { return Err(ERR); }
        let winners = read_u16(output, EVENT_OFFSET_WINNER_COUNT)?;
        let winners_n = read_u16(output, EVENT_OFFSET_WINNERS_N)?;
        if winners == 0 || winners > winners_n { return Err(ERR); }
        if read_u64(output, EVENT_OFFSET_FINAL_POT)? != 0 { return Err(ERR); }
    } else if out_status != STATUS_SETTLED {
        if bytes::<32>(output, EVENT_OFFSET_RESULT_HASH)? != bytes::<32>(input, EVENT_OFFSET_RESULT_HASH)? { return Err(ERR); }
        if read_u16(output, EVENT_OFFSET_WINNER_COUNT)? != read_u16(input, EVENT_OFFSET_WINNER_COUNT)? { return Err(ERR); }
    } else {
        if in_status != STATUS_FINISHED { return Err(ERR); }
        if bytes::<32>(output, EVENT_OFFSET_RESULT_HASH)? != bytes::<32>(input, EVENT_OFFSET_RESULT_HASH)? { return Err(ERR); }
        if read_u16(output, EVENT_OFFSET_WINNER_COUNT)? != read_u16(input, EVENT_OFFSET_WINNER_COUNT)? { return Err(ERR); }
        if bytes::<32>(output, EVENT_OFFSET_RESULT_HASH)? == [0u8;32] { return Err(ERR); }
        let winners = read_u16(output, EVENT_OFFSET_WINNER_COUNT)?;
        let winners_n = read_u16(output, EVENT_OFFSET_WINNERS_N)?;
        if winners == 0 || winners > winners_n { return Err(ERR); }
        if read_u64(output, EVENT_OFFSET_FINAL_POT)? == 0 && read_u64(input, EVENT_OFFSET_POT)? != 0 { return Err(ERR); }
    }
    Ok(())
}
