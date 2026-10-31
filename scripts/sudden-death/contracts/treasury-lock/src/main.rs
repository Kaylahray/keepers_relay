#![no_std]
#![no_main]

use ckb_std::ckb_constants::Source;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{load_cell_capacity, load_cell_type, load_input_since};
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
    if args.len() != 32 {
        return Err(ERR_LEN);
    }
    let mut match_type_hash = [0u8; 32];
    match_type_hash.copy_from_slice(&args);
    let me = current_script_hash()?;

    let gi = count_lock(&me, Source::Input)?;
    let go = count_lock(&me, Source::Output)?;
    if gi > 1 || go > 1 {
        return Err(ERR_MODE);
    }

    let mut in_buf = [0u8; MATCH_DATA_LEN];
    let mut out_buf = [0u8; MATCH_DATA_LEN];
    let input = find_match(&match_type_hash, Source::Input, &mut in_buf)?;
    let output = find_match(&match_type_hash, Source::Output, &mut out_buf)?;

    match (gi, go) {
        (0, 1) => {
            let (_, data) = output.ok_or(ERR_TREASURY)?;
            if bytes::<32>(data, OFF_TREASURY)? != me || read_u64(data, OFF_POT)? != 0 {
                return Err(ERR_TREASURY);
            }
            Ok(())
        }
        (1, 1) => {
            let (_, inn) = input.ok_or(ERR_TREASURY)?;
            let (_, out) = output.ok_or(ERR_TREASURY)?;
            if bytes::<32>(inn, OFF_TREASURY)? != me || bytes::<32>(out, OFF_TREASURY)? != me {
                return Err(ERR_TREASURY);
            }
            let fee = read_u64(inn, OFF_FEE)?;
            let grown = read_u64(out, OFF_POT)?.checked_sub(read_u64(inn, OFF_POT)?).ok_or(ERR_POT)?;
            if grown != fee {
                return Err(ERR_POT);
            }
            let in_cap = treasury_capacity(&me, Source::Input)?;
            let out_cap = treasury_capacity(&me, Source::Output)?;
            if out_cap != in_cap.checked_add(fee).ok_or(ERR_POT)? {
                return Err(ERR_TREASURY);
            }
            Ok(())
        }
        (1, 0) => {
            let (match_index, data) = input.ok_or(ERR_TREASURY)?;
            if output.is_some() || bytes::<32>(data, OFF_TREASURY)? != me {
                return Err(ERR_TREASURY);
            }
            let since = load_input_since(0, Source::GroupInput).map_err(|_| ERR_SINCE)?;
            if !since_reaches_deadline(since, read_u64(data, OFF_DEADLINE)?) {
                return Err(ERR_SINCE);
            }
            claim(&match_type_hash, &me, match_index, data)
        }
        _ => Err(ERR_MODE),
    }
}

fn claim(match_type_hash: &[u8; 32], me: &[u8; 32], match_index: usize, data: &[u8]) -> Result<(), i8> {
    let type_hash = type_hash_at(match_index, Source::Input)?.ok_or(ERR_TREASURY)?;
    if type_hash != *match_type_hash {
        return Err(ERR_TREASURY);
    }
    let host = host_lock(match_index)?;
    if host == [0u8; 32] {
        return Err(ERR_KING);
    }
    let treasury_cap = treasury_capacity(me, Source::Input)?;
    let pot = read_u64(data, OFF_POT)?;
    let remainder = treasury_cap.checked_sub(pot).ok_or(ERR_POT)?;
    let match_cap = load_cell_capacity(match_index, Source::Input).map_err(|_| ERR_TREASURY)?;
    let full = match_cap.checked_add(treasury_cap).ok_or(ERR_POT)?;
    if bytes::<32>(data, OFF_KING)? == [0u8; 32] && pot != 0 {
        return Err(ERR_POT);
    }
    // The winner is paid the whole pot. The host gets the rest back, less at most the fee and the
    // closer's reward, so anyone can send the close without signing anything.
    let host_due = match winner(data, match_index)? {
        Some(king) if king != host => {
            if outputs_to_lock(&king)? < pot {
                return Err(ERR_POT);
            }
            match_cap.checked_add(remainder).ok_or(ERR_POT)?
        }
        // Nobody won on time, or the host won: the host gets everything.
        _ => full,
    };
    if outputs_to_lock(&host)? < host_due.saturating_sub(HOST_ALLOWANCE) {
        return Err(ERR_POT);
    }
    Ok(())
}

fn host_lock(index: usize) -> Result<[u8; 32], i8> {
    let script = load_cell_type(index, Source::Input).map_err(|_| ERR_LEN)?.ok_or(ERR_LEN)?;
    let args = script.args().raw_data();
    if args.len() != 64 {
        return Err(ERR_LEN);
    }
    bytes::<32>(&args, 32)
}

fn count_lock(want: &[u8; 32], source: Source) -> Result<usize, i8> {
    let n = tx_len(source);
    let mut count = 0usize;
    for i in 0..n {
        if ckb_std::high_level::load_cell_lock_hash(i, source).map_err(|_| ERR_TREASURY)? == *want {
            count += 1;
        }
    }
    Ok(count)
}
