#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};
use ckb_std::ckb_constants::Source;
use ckb_std::high_level::{load_cell_data, load_cell_lock_hash};
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
    // event type hash (32) + event id (32) + player lock hash (32)
    if args.len() != 96 { return Err(ERR); }
    let mut event_type_hash=[0u8;32]; event_type_hash.copy_from_slice(&args[0..32]);
    let mut event_id=[0u8;32]; event_id.copy_from_slice(&args[32..64]);
    let mut player=[0u8;32]; player.copy_from_slice(&args[64..96]);

    let gi = group_len(Source::GroupInput);
    let go = group_len(Source::GroupOutput);
    if gi > 1 || go > 1 { return Err(ERR); }

    if go == 1 && gi == 0 {
        validate_create(&event_type_hash, &event_id, &player)
    } else if gi == 1 && go == 0 {
        validate_burn(&event_type_hash, &event_id, &player)
    } else {
        // No transfer or rewrite. The participant ticket is intentionally non-transferable.
        Err(ERR)
    }
}

fn validate_create(event_type_hash:&[u8;32], event_id:&[u8;32], player:&[u8;32]) -> Result<(), i8> {
    let data = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR)?;
    if data.len() != PARTICIPANT_DATA_LEN { return Err(ERR); }
    if data[PARTICIPANT_OFFSET_VERSION] != PARTICIPANT_VERSION { return Err(ERR); }
    if data[PARTICIPANT_OFFSET_STATUS] != 0 { return Err(ERR); }

    let lock = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| ERR)?;
    if lock != *player { return Err(ERR); }

    let fee = read_u64(&data, PARTICIPANT_OFFSET_ENTRY_FEE)?;
    let slot = read_u16(&data, PARTICIPANT_OFFSET_SLOT)? as usize;
    if slot >= MAX_PARTICIPANT_SLOTS { return Err(ERR); }
    if bytes::<32>(&data, PARTICIPANT_OFFSET_NONCE)? == [0u8;32] { return Err(ERR); }

    let (_, event_data, _) = find_event_input(event_type_hash, event_id)?;
    let event_output = find_event_output(event_type_hash, event_id)?;
    if event_data.len() != EVENT_DATA_LEN || event_output.len() != EVENT_DATA_LEN { return Err(ERR); }
    if event_data[EVENT_OFFSET_STATUS] != STATUS_REGISTRATION || event_output[EVENT_OFFSET_STATUS] != STATUS_REGISTRATION { return Err(ERR); }

    let max_players = read_u16(&event_output, EVENT_OFFSET_MAX_PLAYERS)? as usize;
    if slot >= max_players { return Err(ERR); }
    if has_participant(&event_data, max_players, player)? { return Err(ERR); }
    if participant_slot(&event_data, slot)? != [0u8;32] { return Err(ERR); }
    if !has_slot_added(&event_data, &event_output, slot, player, max_players)? { return Err(ERR); }

    let before = read_u16(&event_data, EVENT_OFFSET_PLAYER_COUNT)?;
    let after = read_u16(&event_output, EVENT_OFFSET_PLAYER_COUNT)?;
    if after != before.checked_add(1).ok_or(ERR)? { return Err(ERR); }

    let event_fee = read_u64(&event_output, EVENT_OFFSET_ENTRY_FEE)?;
    if fee != event_fee { return Err(ERR); }

    let treasury_lock = bytes::<32>(&event_output, EVENT_OFFSET_TREASURY_LOCK)?;
    let (_, in_pot) = spendable_pot(&treasury_lock, Source::Input)?;
    let (_, out_pot) = spendable_pot(&treasury_lock, Source::Output)?;
    if out_pot < in_pot.checked_add(fee).ok_or(ERR)? { return Err(ERR); }

    // Ensure the participant output commits to this exact event.
    let _ = (event_type_hash, event_id);
    Ok(())
}

fn has_slot_added(input:&[u8], output:&[u8], slot:usize, player:&[u8;32], max_players:usize)->Result<bool,i8>{
    if unique_slot_change(input, output, max_players)? != Some((slot,*player)) { return Err(ERR); }
    Ok(true)
}

fn find_event_input(event_type_hash:&[u8;32], event_id:&[u8;32])->Result<(usize,alloc::vec::Vec<u8>,[u8;32]),i8>{
    let found=find_event(event_type_hash,event_id,Source::Input)?.ok_or(ERR)?;
    Ok((found.0,found.1,*event_type_hash))
}

fn find_event_output(event_type_hash:&[u8;32], event_id:&[u8;32])->Result<alloc::vec::Vec<u8>,i8>{
    Ok(find_event(event_type_hash,event_id,Source::Output)?.ok_or(ERR)?.1)
}

fn validate_burn(event_type_hash:&[u8;32], event_id:&[u8;32], player:&[u8;32])->Result<(),i8>{
    let data=load_cell_data(0,Source::GroupInput).map_err(|_|ERR)?;
    if data.len()!=PARTICIPANT_DATA_LEN || data[PARTICIPANT_OFFSET_VERSION]!=PARTICIPANT_VERSION {return Err(ERR);}
    if load_cell_lock_hash(0,Source::GroupInput).map_err(|_|ERR)? != *player {return Err(ERR);}
    let found=find_event(event_type_hash,event_id,Source::CellDep)?.ok_or(ERR)?;
    if found.1.len()!=EVENT_DATA_LEN || found.1[EVENT_OFFSET_STATUS]!=STATUS_SETTLED{return Err(ERR);}
    Ok(())
}
