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
    // event type hash + event id. Multiple winner claims for an event share this type group.
    if args.len() != 64 { return Err(ERR); }
    let event_type_hash = bytes::<32>(&args, 0)?;
    let event_id = bytes::<32>(&args, 32)?;

    let gi = group_len(Source::GroupInput);
    let go = group_len(Source::GroupOutput);

    if gi == 0 && go >= 1 {
        validate_create(&event_type_hash, &event_id)
    } else if gi >= 1 && go == 0 {
        validate_burn(&event_type_hash, &event_id)
    } else {
        Err(ERR)
    }
}

fn validate_create(event_type_hash:&[u8;32], event_id:&[u8;32])->Result<(),i8>{
    let event = find_event_data(event_type_hash,event_id,Source::Output)?;
    if event.len()!=EVENT_DATA_LEN || event[EVENT_OFFSET_STATUS]!=STATUS_SETTLED{return Err(ERR);}
    let result_hash=bytes::<32>(&event,EVENT_OFFSET_RESULT_HASH)?;
    if result_hash==[0u8;32]{return Err(ERR);}

    let mut total=0u64;
    let n=group_len(Source::GroupOutput);
    let mut recipients: alloc::vec::Vec<[u8;32]>=alloc::vec::Vec::new();
    for i in 0..n {
        let data=load_cell_data(i,Source::GroupOutput).map_err(|_|ERR)?;
        if data.len()!=CLAIM_DATA_LEN || data[CLAIM_OFFSET_VERSION]!=CLAIM_VERSION{return Err(ERR);}
        let recipient=bytes::<32>(&data,CLAIM_OFFSET_RECIPIENT)?;
        let amount=read_u64(&data,CLAIM_OFFSET_AMOUNT)?;
        if recipient==[0u8;32] || amount==0{return Err(ERR);}
        if bytes::<32>(&data,CLAIM_OFFSET_EVENT_ID)? != *event_id{return Err(ERR);}
        if recipients.iter().any(|x|x==&recipient){return Err(ERR);}
        recipients.push(recipient);
        if load_cell_lock_hash(i,Source::GroupOutput).map_err(|_|ERR)? != recipient{return Err(ERR);}
        total=total.checked_add(amount).ok_or(ERR)?;
        // Claim cell capacity must be enough for the declared payout and its own occupied capacity.
        let cap=ckb_std::high_level::load_cell_capacity(i,Source::GroupOutput).map_err(|_|ERR)?;
        let occ=ckb_std::high_level::load_cell_occupied_capacity(i,Source::GroupOutput).map_err(|_|ERR)?;
        if cap < amount || cap < occ {return Err(ERR);}
    }
    if recipients.len() as u16 != read_u16(&event,EVENT_OFFSET_WINNER_COUNT)? {return Err(ERR);}
    if total != read_u64(&event,EVENT_OFFSET_FINAL_POT)? {return Err(ERR);}
    Ok(())
}

fn validate_burn(event_type_hash:&[u8;32], event_id:&[u8;32])->Result<(),i8>{
    let event=find_event_data(event_type_hash,event_id,Source::CellDep)?;
    if event.len()!=EVENT_DATA_LEN || event[EVENT_OFFSET_STATUS]!=STATUS_SETTLED{return Err(ERR);}
    let n=group_len(Source::GroupInput);
    for i in 0..n {
        let data=load_cell_data(i,Source::GroupInput).map_err(|_|ERR)?;
        if data.len()!=CLAIM_DATA_LEN || data[CLAIM_OFFSET_VERSION]!=CLAIM_VERSION{return Err(ERR);}
        if bytes::<32>(&data,CLAIM_OFFSET_EVENT_ID)? != *event_id{return Err(ERR);}
        let recipient=bytes::<32>(&data,CLAIM_OFFSET_RECIPIENT)?;
        if recipient==[0u8;32]{return Err(ERR);}
        if load_cell_lock_hash(i,Source::GroupInput).map_err(|_|ERR)? != recipient{return Err(ERR);}
    }
    Ok(())
}

fn find_event_data(event_type_hash:&[u8;32],event_id:&[u8;32],source:Source)->Result<alloc::vec::Vec<u8>,i8>{
    Ok(find_event(event_type_hash,event_id,source)?.ok_or(ERR)?.1)
}
