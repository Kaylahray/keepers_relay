#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};
use ckb_std::ckb_constants::Source;
use ckb_std::high_level::{load_cell_data, load_cell_type, load_cell_type_hash};
use keepers_relay_protocol_common::*;

entry!(program_entry);
default_alloc!();

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

/// Count cells whose lock hash equals `want`.
///
/// Prefer this over `group_len(GroupOutput)` for lock scripts: with both a
/// group input and a matching output, some ckb-std / VM setups report
/// GroupOutput length 0 even though the output is present (verified in tests).
fn count_lock(want: &[u8; 32], source: Source) -> Result<usize, i8> {
    let n = tx_len(source);
    let mut count = 0usize;
    for i in 0..n {
        if lock_hash(i, source)? == *want {
            count += 1;
        }
    }
    Ok(count)
}

fn validate() -> Result<(), i8> {
    let args = script_args()?;
    if args.len() != TREASURY_ARGS_LEN {
        return Err(ERR);
    }
    let event_type_hash = bytes::<32>(&args, TREASURY_ARG_EVENT_TYPE_HASH)?;
    let event_id = bytes::<32>(&args, TREASURY_ARG_EVENT_ID)?;
    let my_lock_hash = current_script_hash()?;

    let gi = count_lock(&my_lock_hash, Source::Input)?;
    let go = count_lock(&my_lock_hash, Source::Output)?;
    if gi > 1 || go > 1 {
        return Err(ERR);
    }

    if gi == 0 && go == 1 {
        let event_out = find_event_data(&event_type_hash, &event_id, Source::Output)?;
        if event_out.len() != EVENT_DATA_LEN
            || event_out[EVENT_OFFSET_STATUS] != STATUS_REGISTRATION
        {
            return Err(ERR);
        }
        if bytes::<32>(&event_out, EVENT_OFFSET_TREASURY_LOCK)? != my_lock_hash {
            return Err(ERR);
        }
        let (count, spendable) = spendable_pot(&my_lock_hash, Source::Output)?;
        if count != 1 || spendable != 0 {
            return Err(ERR);
        }
        return Ok(());
    }

    if gi == 1 && go == 1 {
        let event_in = find_event_data(&event_type_hash, &event_id, Source::Input)?;
        let event_out = find_event_data(&event_type_hash, &event_id, Source::Output)?;
        if event_in.len() != EVENT_DATA_LEN || event_out.len() != EVENT_DATA_LEN {
            return Err(ERR);
        }
        let a = event_in[EVENT_OFFSET_STATUS];
        let b = event_out[EVENT_OFFSET_STATUS];
        if a >= STATUS_SETTLED || b == STATUS_SETTLED {
            return Err(ERR);
        }
        if bytes::<32>(&event_out, EVENT_OFFSET_TREASURY_LOCK)? != my_lock_hash {
            return Err(ERR);
        }
        let (ic, in_pot) = spendable_pot(&my_lock_hash, Source::Input)?;
        let (oc, out_pot) = spendable_pot(&my_lock_hash, Source::Output)?;
        if ic != 1 || oc != 1 || out_pot < in_pot {
            return Err(ERR);
        }
        if a >= STATUS_FINISHED && out_pot != in_pot {
            return Err(ERR);
        }
        if read_u64(&event_out, EVENT_OFFSET_POT)? != out_pot {
            return Err(ERR);
        }
        return Ok(());
    }

    if gi == 1 && go == 0 {
        let event_in = find_event_data(&event_type_hash, &event_id, Source::Input)?;
        let event_out = find_event_data(&event_type_hash, &event_id, Source::Output)?;
        if event_in.len() != EVENT_DATA_LEN || event_out.len() != EVENT_DATA_LEN {
            return Err(ERR);
        }
        if event_in[EVENT_OFFSET_STATUS] != STATUS_FINISHED
            || event_out[EVENT_OFFSET_STATUS] != STATUS_SETTLED
        {
            return Err(ERR);
        }
        if bytes::<32>(&event_out, EVENT_OFFSET_TREASURY_LOCK)? != my_lock_hash {
            return Err(ERR);
        }
        let (ic, in_pot) = spendable_pot(&my_lock_hash, Source::Input)?;
        let (oc, _) = spendable_pot(&my_lock_hash, Source::Output)?;
        if ic != 1 || oc != 0 {
            return Err(ERR);
        }
        if read_u64(&event_in, EVENT_OFFSET_POT)? != in_pot {
            return Err(ERR);
        }
        if read_u64(&event_out, EVENT_OFFSET_FINAL_POT)? != in_pot
            || read_u64(&event_out, EVENT_OFFSET_POT)? != 0
        {
            return Err(ERR);
        }
        validate_claim_outputs(&event_in, &event_type_hash, in_pot)?;
        return Ok(());
    }

    Err(ERR)
}

fn find_event_data(
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
    source: Source,
) -> Result<alloc::vec::Vec<u8>, i8> {
    Ok(find_event(event_type_hash, event_id, source)?.ok_or(ERR)?.1)
}

fn validate_claim_outputs(
    event: &[u8],
    event_type_hash: &[u8; 32],
    final_pot: u64,
) -> Result<(), i8> {
    let claim_code_hash = bytes::<32>(event, EVENT_OFFSET_REWARD_CLAIM_CODE_HASH)?;
    let event_id = bytes::<32>(event, EVENT_OFFSET_EVENT_ID)?;
    let winners_n = read_u16(event, EVENT_OFFSET_WINNERS_N)?;
    let mut found = 0u16;
    let mut sum = 0u64;
    let mut recipients: alloc::vec::Vec<[u8; 32]> = alloc::vec::Vec::new();
    let n = tx_len(Source::Output);
    for i in 0..n {
        let Some(_) = load_cell_type_hash(i, Source::Output).map_err(|_| ERR)? else {
            continue;
        };
        if script_code_hash(i, Source::Output)? != claim_code_hash {
            continue;
        }
        let Some(t) = load_cell_type(i, Source::Output).map_err(|_| ERR)? else {
            return Err(ERR);
        };
        let args = t.args().raw_data();
        if args.len() != 64 || &args[0..32] != event_type_hash {
            continue;
        }
        if &args[32..64] != &event_id {
            return Err(ERR);
        }
        let data = load_cell_data(i, Source::Output).map_err(|_| ERR)?;
        if data.len() != CLAIM_DATA_LEN || data[CLAIM_OFFSET_VERSION] != CLAIM_VERSION {
            return Err(ERR);
        }
        let amount = read_u64(&data, CLAIM_OFFSET_AMOUNT)?;
        if amount == 0 {
            return Err(ERR);
        }
        if bytes::<32>(&data, CLAIM_OFFSET_EVENT_ID)? != event_id {
            return Err(ERR);
        }
        let recipient = bytes::<32>(&data, CLAIM_OFFSET_RECIPIENT)?;
        if recipient == [0u8; 32] {
            return Err(ERR);
        }
        if recipients.iter().any(|x| x == &recipient) {
            return Err(ERR);
        }
        recipients.push(recipient);
        sum = sum.checked_add(amount).ok_or(ERR)?;
        found = found.checked_add(1).ok_or(ERR)?;
        if found > winners_n {
            return Err(ERR);
        }
    }
    if final_pot == 0 {
        return Ok(());
    }
    if found == 0 || sum != final_pot {
        return Err(ERR);
    }
    Ok(())
}
