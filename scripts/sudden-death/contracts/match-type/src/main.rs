#![no_std]
#![no_main]

use ckb_std::ckb_constants::Source;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{load_cell_capacity, load_cell_data, load_cell_lock_hash, load_input_since};
use ckb_std::type_id::check_type_id;
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
    let match_id = bytes::<32>(&args, 0)?;
    let host = bytes::<32>(&args, 32)?;
    let match_type_hash = current_script_hash()?;

    let gi = group_count(Source::GroupInput)?;
    let go = group_count(Source::GroupOutput)?;
    if gi > 1 || go > 1 {
        return Err(ERR_MODE);
    }
    match (gi, go) {
        (0, 1) => create(&host),
        (1, 1) => steal(&match_id, &match_type_hash),
        (1, 0) => settle(),
        _ => Err(ERR_MODE),
    }
}

fn group_count(source: Source) -> Result<usize, i8> {
    let mut n = 0usize;
    loop {
        match load_cell_data(n, source) {
            Ok(_) => n += 1,
            Err(_) => return Ok(n),
        }
    }
}

fn create(host: &[u8; 32]) -> Result<(), i8> {
    if *host == [0u8; 32] {
        return Err(ERR_KING);
    }
    // Type id is the first 32 arg bytes. The host hash sits in the suffix.
    check_type_id(0, 32).map_err(|_| ERR_LEN)?;
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    if out.len() != MATCH_DATA_LEN || out[OFF_VERSION] != MATCH_VERSION {
        return Err(ERR_LEN);
    }
    if out[OFF_STATUS] != STATUS_LIVE {
        return Err(ERR_MODE);
    }
    if read_u32(&out, OFF_ROUND)? != 1 {
        return Err(ERR_ROUND);
    }
    if read_u64(&out, OFF_POT)? != 0 {
        return Err(ERR_POT);
    }
    if read_u64(&out, OFF_FEE)? == 0 || read_u64(&out, OFF_DEADLINE)? == 0 {
        return Err(ERR_CLOCK);
    }
    if bytes::<32>(&out, OFF_KING)? != [0u8; 32] {
        return Err(ERR_KING);
    }
    if bytes::<32>(&out, OFF_GAME)? == [0u8; 32] {
        return Err(ERR_GAME);
    }
    if read_u64(&out, OFF_KING_SCORE)? != 0 {
        return Err(ERR_SCORE);
    }
    let treasury = bytes::<32>(&out, OFF_TREASURY)?;
    if treasury_capacity(&treasury, Source::Output)? == 0 {
        return Err(ERR_TREASURY);
    }
    if bytes::<32>(&out, OFF_BID_CODE)? == [0u8; 32] {
        return Err(ERR_BID);
    }
    proxy_guarded(0, Source::GroupOutput, &current_script_hash()?)?;
    Ok(())
}

fn steal(match_id: &[u8; 32], match_type_hash: &[u8; 32]) -> Result<(), i8> {
    let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    if input.len() != MATCH_DATA_LEN || output.len() != MATCH_DATA_LEN {
        return Err(ERR_LEN);
    }
    if input[OFF_STATUS] != STATUS_LIVE || output[OFF_STATUS] != STATUS_LIVE {
        return Err(ERR_MODE);
    }
    if input[OFF_VERSION] != MATCH_VERSION || output[OFF_VERSION] != MATCH_VERSION {
        return Err(ERR_LEN);
    }
    if bytes::<32>(&input, OFF_GAME)? != bytes::<32>(&output, OFF_GAME)?
        || bytes::<8>(&input, OFF_FEE)? != bytes::<8>(&output, OFF_FEE)?
        || bytes::<32>(&input, OFF_TREASURY)? != bytes::<32>(&output, OFF_TREASURY)?
        || bytes::<32>(&input, OFF_BID_CODE)? != bytes::<32>(&output, OFF_BID_CODE)?
    {
        return Err(ERR_IMMUTABLE);
    }

    let round = read_u32(&input, OFF_ROUND)?;
    if read_u32(&output, OFF_ROUND)? != round.checked_add(1).ok_or(ERR_ROUND)? {
        return Err(ERR_ROUND);
    }
    let fee = read_u64(&input, OFF_FEE)?;
    let in_pot = read_u64(&input, OFF_POT)?;
    if read_u64(&output, OFF_POT)? != in_pot.checked_add(fee).ok_or(ERR_POT)? {
        return Err(ERR_POT);
    }
    let in_deadline = read_u64(&input, OFF_DEADLINE)?;
    if read_u64(&output, OFF_DEADLINE)? != shrunk_deadline(in_deadline, round) {
        return Err(ERR_CLOCK);
    }

    proxy_guarded(0, Source::GroupInput, match_type_hash)?;
    proxy_guarded(0, Source::GroupOutput, match_type_hash)?;
    let in_cap = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    let out_cap = load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)?;
    if in_cap != out_cap {
        return Err(ERR_POT);
    }

    let bid_code = bytes::<32>(&input, OFF_BID_CODE)?;
    if count_bids(match_type_hash, &bid_code, Source::Input)? != 1 {
        return Err(ERR_BID);
    }
    if count_bids(match_type_hash, &bid_code, Source::Output)? != 0 {
        return Err(ERR_BID);
    }
    let king = winning_bid_owner(match_type_hash, &bid_code)?;
    if bytes::<32>(&output, OFF_KING)? != king {
        return Err(ERR_KING);
    }
    // A king beating their own score would only drain the clock while they hold the crown.
    if bytes::<32>(&input, OFF_KING)? == king {
        return Err(ERR_KING);
    }

    // The run is scored for the bid's owner, on a course only they get, by the game the match
    // was opened with. It must beat the standing score, and the new score is what is recorded.
    let tape = load_run_tape()?;
    let score = score_run(&bytes::<32>(&input, OFF_GAME)?, run_seed(match_id, &king), &tape)?;
    if score <= read_u64(&input, OFF_KING_SCORE)? {
        return Err(ERR_SCORE);
    }
    if read_u64(&output, OFF_KING_SCORE)? != score {
        return Err(ERR_SCORE);
    }

    let treasury = bytes::<32>(&input, OFF_TREASURY)?;
    let in_cap = treasury_capacity(&treasury, Source::Input)?;
    let out_cap = treasury_capacity(&treasury, Source::Output)?;
    if out_cap != in_cap.checked_add(fee).ok_or(ERR_POT)? {
        return Err(ERR_TREASURY);
    }
    Ok(())
}

fn settle() -> Result<(), i8> {
    let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
    if input.len() != MATCH_DATA_LEN || input[OFF_STATUS] != STATUS_LIVE {
        return Err(ERR_MODE);
    }
    let since = load_input_since(0, Source::GroupInput).map_err(|_| ERR_SINCE)?;
    if !since_reaches_deadline(since, read_u64(&input, OFF_DEADLINE)?) {
        return Err(ERR_SINCE);
    }
    let treasury = bytes::<32>(&input, OFF_TREASURY)?;
    if cells_with_lock(&treasury, Source::Input)? != 1 {
        return Err(ERR_TREASURY);
    }
    if cells_with_lock(&treasury, Source::Output)? != 0 {
        return Err(ERR_TREASURY);
    }
    Ok(())
}

fn cells_with_lock(want: &[u8; 32], source: Source) -> Result<usize, i8> {
    let mut index = 0usize;
    let mut count = 0usize;
    loop {
        match load_cell_lock_hash(index, source) {
            Ok(hash) => {
                if hash == *want {
                    count += 1;
                }
                index += 1;
            }
            Err(_) => return Ok(count),
        }
    }
}
