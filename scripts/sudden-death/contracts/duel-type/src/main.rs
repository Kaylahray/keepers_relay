#![no_std]
#![no_main]

//! A duel: two players, the same stake each, and the chain as referee. One script, two kinds of cell.
//!
//! The **duel cell** (args: 32-byte type id) holds both stakes. Its lock is the Input Type Proxy Lock
//! pointing back at this type, so every spend is decided here:
//!
//! - open: the challenger locks their stake.
//! - cancel: before anyone accepts, the challenger takes it back (their wallet signs).
//! - accept: the opponent adds the same stake (their wallet signs). The block this lands in seeds
//!   the duel, and nobody can know it in advance.
//! - move (artillery): the player to move adds one shot. Their key cell is spent, so a throwaway
//!   session key in their browser signs and no wallet pops up. The shot's wind comes from the block
//!   the last move landed in.
//! - skip (artillery): once the player to move has let their turn's time run out, anyone may pass
//!   their turn (no signature, nothing paid). Several overdue turns may pass at once.
//! - submit (race): a player hands in their run. Their racer cell is spent with it, which only their
//!   own session key can do, so nobody can hide or swap another player's run. The run is replayed and
//!   its score recorded.
//! - finish: anyone may send it. An artillery duel is replayed by its game script; a race compares
//!   the submitted scores. The winner is paid both stakes and a draw returns each stake. An artillery
//!   duel ends only when the game does: a tank destroyed, or every turn played (skips count). A race
//!   that is not over needs its time to have run out (shown by naming a block stamped after it), and a
//!   racer who never submitted scores 0.
//!
//! A **racer cell** (args: duel id ‖ side) carries one player's lane race, a lap at a time, exactly as
//! a Crowns entry does. It is that player's key cell, so its own lock is their session key.
//!
//! Duel cell data, version 1:
//!
//! ```text
//! 0   1   version = 1
//! 1   1   game kind: 1 artillery, 2 lane race
//! 2   1   status: 0 open, 1 live
//! 3   8   stake u64: what each side puts in
//! 11  8   timer: race, how long the race lasts in ms (u64); artillery, the first turn's ms (low
//!         u32) and how many ms each later turn loses (high u32): 0 is Classic, every turn the
//!         same; anything else is Pressure, where turns shrink but never below 30 seconds
//! 19  32  challenger lock hash (side 0)
//! 51  32  opponent lock hash (side 1); zero for an open challenge until someone accepts
//! 83  32  challenger key lock hash
//! 115 32  opponent key lock hash, set at accept
//! 147 32  game: data hash of the game script that judges the duel
//! artillery only:
//! 179 32  seed block: the block the accept landed in, recorded by the first move
//! 211 1   shots so far
//! 212 ..  3 bytes per shot: angle u8 ‖ power u8 ‖ wind i8
//! race only:
//! 179 8   challenger's submitted score u64
//! 187 8   opponent's submitted score u64
//! 195 1   submitted: bit 0 the challenger, bit 1 the opponent
//! ```
//!
//! Racer cell data, version 1: `version ‖ laps u8 ‖ lap start ms u64 ‖ lap chain`, as in an entry.

use alloc::vec::Vec;
use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::Entity;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_lock_hash, load_cell_occupied_capacity, load_cell_type,
    load_header, load_script, load_witness_args, QueryIter,
};
use ckb_std::type_id::check_type_id;
use sudden_death_common::*;

entry!(program_entry);
default_alloc!();

const DUEL_VERSION: u8 = 1;
const KIND_ARTILLERY: u8 = 1;
const KIND_RACE: u8 = 2;
const STATUS_OPEN: u8 = 0;
const STATUS_LIVE: u8 = 1;

const OFF_KIND: usize = 1;
const OFF_STATUS: usize = 2;
const OFF_STAKE: usize = 3;
const OFF_TIMER: usize = 11;
const OFF_CHALLENGER: usize = 19;
const OFF_OPPONENT: usize = 51;
const OFF_KEY0: usize = 83;
const OFF_KEY1: usize = 115;
const OFF_GAME: usize = 147;
const DUEL_HEADER_LEN: usize = 179;
const OFF_SEED_BLOCK: usize = 179;
const OFF_SHOT_COUNT: usize = 211;
const OFF_SHOTS: usize = 212;
const SHOT_LEN: usize = 3;
/// Fifteen shots each; then the healthier tank wins.
const MAX_SHOTS: usize = 30;
const ARTILLERY_MAX_LEN: usize = OFF_SHOTS + MAX_SHOTS * SHOT_LEN;
const MAX_ANGLE: u8 = 180;
const MAX_POWER: u8 = 100;
const MAX_WIND: i32 = 10;
/// A skipped turn as a shot record: angle 255 (real shots stop at 180), no power, no wind.
const PASS_RECORD: [u8; SHOT_LEN] = [255, 0, 0];
/// A turn may be given anywhere from ten seconds to a day.
const MIN_TIMER_MS: u64 = 10_000;
const MAX_TIMER_MS: u64 = 24 * 60 * 60 * 1000;
/// A Pressure turn never gets shorter than this: a shot still needs a block to land in.
const PRESSURE_FLOOR_MS: u64 = 30_000;

/// What the artillery game script says about a duel: hp ‖ hp ‖ shots played ‖ verdict.
const VERDICT_DRAW: u8 = 2;
const VERDICT_ON: u8 = 3;

const OFF_SCORES: usize = 179;
const OFF_SUBMITTED: usize = 195;
const RACE_LEN: usize = 196;

const RACER_VERSION: u8 = 1;
const RACER_LEN: usize = 42;
const OFF_RACER_LAPS: usize = 1;
const OFF_RACER_LAP_START: usize = 2;
const OFF_RACER_CHAIN: usize = 10;
/// The submit witness: `version ‖ run`, the run as a steal carries it.
const RACE_RUN_VERSION: u8 = 1;

const DUEL_DOMAIN: &[u8] = b"crowns/duel/v1";
const WIND_DOMAIN: &[u8] = b"crowns/duel-wind/v1";

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn validate() -> Result<(), i8> {
    let args = script_args()?;
    match args.len() {
        32 => duel(&bytes::<32>(&args, 0)?),
        33 => racer(&bytes::<32>(&args, 0)?, args[32]),
        _ => Err(ERR_LEN),
    }
}

fn group_count(source: Source) -> usize {
    QueryIter::new(load_cell_data, source).count()
}

fn duel(duel_id: &[u8; 32]) -> Result<(), i8> {
    let gi = group_count(Source::GroupInput);
    let go = group_count(Source::GroupOutput);
    match (gi, go) {
        (0, 1) => create(),
        (1, 1) => {
            let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
            match (input.get(OFF_STATUS).copied(), input.get(OFF_KIND).copied()) {
                (Some(STATUS_OPEN), _) => accept(&input),
                (Some(STATUS_LIVE), Some(KIND_ARTILLERY)) => shoot(duel_id, &input),
                (Some(STATUS_LIVE), Some(KIND_RACE)) => submit(duel_id, &input),
                _ => Err(ERR_MODE),
            }
        }
        (1, 0) => {
            let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
            match input.get(OFF_STATUS).copied() {
                Some(STATUS_OPEN) => cancel(&input),
                Some(STATUS_LIVE) => finish(duel_id, &input),
                _ => Err(ERR_MODE),
            }
        }
        _ => Err(ERR_MODE),
    }
}

/// The data length a duel of this kind has before its first move, and the most it can grow to.
fn lengths(kind: u8) -> Result<(usize, usize), i8> {
    match kind {
        KIND_ARTILLERY => Ok((OFF_SHOTS, ARTILLERY_MAX_LEN)),
        KIND_RACE => Ok((RACE_LEN, RACE_LEN)),
        _ => Err(ERR_DUEL),
    }
}

fn parse(data: &[u8]) -> Result<u8, i8> {
    if data.len() < DUEL_HEADER_LEN || data[0] != DUEL_VERSION {
        return Err(ERR_LEN);
    }
    let kind = data[OFF_KIND];
    let (min, max) = lengths(kind)?;
    if data.len() < min || data.len() > max {
        return Err(ERR_LEN);
    }
    if kind == KIND_ARTILLERY && data.len() != OFF_SHOTS + data[OFF_SHOT_COUNT] as usize * SHOT_LEN {
        return Err(ERR_LEN);
    }
    Ok(kind)
}

fn has_input_locked_by(lock: &[u8; 32]) -> bool {
    QueryIter::new(load_cell_lock_hash, Source::Input).any(|hash| hash == *lock)
}

fn create() -> Result<(), i8> {
    check_type_id(0, 32).map_err(|_| ERR_LEN)?;
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let kind = parse(&out)?;
    let (start_len, full_len) = lengths(kind)?;
    if out.len() != start_len || out[OFF_STATUS] != STATUS_OPEN {
        return Err(ERR_DUEL);
    }
    if out[DUEL_HEADER_LEN..].iter().any(|byte| *byte != 0) {
        return Err(ERR_DUEL);
    }
    let stake = read_u64(&out, OFF_STAKE)?;
    let timer = read_u64(&out, OFF_TIMER)?;
    let (first, shrink) = (timer & 0xffff_ffff, timer >> 32);
    let min_timer = if kind == KIND_RACE { LAPS as u64 * LAP_WINDOW_MS } else { MIN_TIMER_MS };
    if stake == 0 || first < min_timer || first > MAX_TIMER_MS {
        return Err(ERR_DUEL);
    }
    // Pressure is for artillery turns only, and its first turn must start above the floor.
    if shrink != 0 && (kind != KIND_ARTILLERY || first < PRESSURE_FLOOR_MS || shrink > first) {
        return Err(ERR_DUEL);
    }
    let challenger = bytes::<32>(&out, OFF_CHALLENGER)?;
    if challenger == [0u8; 32]
        || bytes::<32>(&out, OFF_OPPONENT)? == challenger
        || bytes::<32>(&out, OFF_KEY0)? == [0u8; 32]
        || bytes::<32>(&out, OFF_KEY1)? != [0u8; 32]
        || bytes::<32>(&out, OFF_GAME)? == [0u8; 32]
    {
        return Err(ERR_DUEL);
    }
    proxy_guarded(0, Source::GroupOutput, &current_script_hash()?)?;
    // The stake, and room for the cell at its largest: every shot of a full duel must still fit.
    let occupied = load_cell_occupied_capacity(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let growth = ((full_len - start_len) as u64).checked_mul(100_000_000).ok_or(ERR_POT)?;
    let need = stake.checked_add(occupied).and_then(|n| n.checked_add(growth)).ok_or(ERR_POT)?;
    if load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)? < need {
        return Err(ERR_POT);
    }
    Ok(())
}

fn cancel(input: &[u8]) -> Result<(), i8> {
    parse(input)?;
    // Only the challenger's own wallet can take an unaccepted stake back; it signs where it goes.
    if !has_input_locked_by(&bytes::<32>(input, OFF_CHALLENGER)?) {
        return Err(ERR_AUTH);
    }
    Ok(())
}

fn accept(input: &[u8]) -> Result<(), i8> {
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    parse(input)?;
    parse(&output)?;
    // Everything but the status, the opponent and their key stays as it was.
    if input.len() != output.len()
        || input[..OFF_STATUS] != output[..OFF_STATUS]
        || input[OFF_STAKE..OFF_OPPONENT] != output[OFF_STAKE..OFF_OPPONENT]
        || input[OFF_KEY0..OFF_KEY1] != output[OFF_KEY0..OFF_KEY1]
        || input[OFF_GAME..] != output[OFF_GAME..]
    {
        return Err(ERR_IMMUTABLE);
    }
    if output[OFF_STATUS] != STATUS_LIVE {
        return Err(ERR_DUEL);
    }
    let named = bytes::<32>(input, OFF_OPPONENT)?;
    let opponent = bytes::<32>(&output, OFF_OPPONENT)?;
    if opponent == [0u8; 32]
        || opponent == bytes::<32>(input, OFF_CHALLENGER)?
        || (named != [0u8; 32] && opponent != named)
        || bytes::<32>(&output, OFF_KEY1)? == [0u8; 32]
    {
        return Err(ERR_DUEL);
    }
    // The opponent's wallet pays their stake, and in signing agrees to the duel.
    if !has_input_locked_by(&opponent) {
        return Err(ERR_AUTH);
    }
    same_guard()?;
    let stake = read_u64(input, OFF_STAKE)?;
    let in_cap = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    if load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)? != in_cap.checked_add(stake).ok_or(ERR_POT)? {
        return Err(ERR_POT);
    }
    Ok(())
}

/// The duel cell keeps its lock and its capacity across a move.
fn same_guard() -> Result<(), i8> {
    let own = current_script_hash()?;
    proxy_guarded(0, Source::GroupInput, &own)?;
    proxy_guarded(0, Source::GroupOutput, &own)
}

fn wind_of(duel_id: &[u8; 32], block: &[u8; 32]) -> i32 {
    let digest = blake2b_256(&[WIND_DOMAIN, duel_id, block]);
    let value = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]);
    (value % (2 * MAX_WIND as u32 + 1)) as i32 - MAX_WIND
}

fn seed_of(duel_id: &[u8; 32], block: &[u8; 32]) -> u32 {
    let digest = blake2b_256(&[DUEL_DOMAIN, duel_id, block]);
    u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]])
}

fn key_of(data: &[u8], side: usize) -> Result<[u8; 32], i8> {
    bytes::<32>(data, if side == 0 { OFF_KEY0 } else { OFF_KEY1 })
}

fn lock_of(data: &[u8], side: usize) -> Result<[u8; 32], i8> {
    bytes::<32>(data, if side == 0 { OFF_CHALLENGER } else { OFF_OPPONENT })
}

/// One artillery shot, or skipped turns. A shot: the player to move signs with their key cell, and
/// the wind is the one the block the duel last landed in gives, so nobody can choose it. Skips: once
/// a turn's time has run out anyone may pass it (no signature), and several overdue turns may pass at
/// once, so a duel nobody plays any more can still be played out to its end.
fn shoot(duel_id: &[u8; 32], input: &[u8]) -> Result<(), i8> {
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    parse(input)?;
    parse(&output)?;
    let count = input[OFF_SHOT_COUNT] as usize;
    let added = (output[OFF_SHOT_COUNT] as usize).checked_sub(count).ok_or(ERR_DUEL)?;
    if added == 0 || count + added > MAX_SHOTS {
        return Err(ERR_DUEL);
    }
    let kept = OFF_SHOTS + count * SHOT_LEN;
    if input[..OFF_SEED_BLOCK] != output[..OFF_SEED_BLOCK] || input[OFF_SHOTS..kept] != output[OFF_SHOTS..kept] {
        return Err(ERR_IMMUTABLE);
    }
    // The duel landed where the last move (or the accept) did. That block gives this shot its wind,
    // and the accept's block, recorded by the first shot, seeds the hills.
    let (block, _) = postmark(0, Source::GroupInput)?;
    let seed_block = if count == 0 { block } else { bytes::<32>(input, OFF_SEED_BLOCK)? };
    if bytes::<32>(&output, OFF_SEED_BLOCK)? != seed_block {
        return Err(ERR_DUEL);
    }
    let moves = &output[kept..];
    if moves.chunks(SHOT_LEN).all(|record| record == PASS_RECORD) {
        // Skips: the duel must have sat untouched for every skipped turn's time, one after another.
        let timer = read_u64(input, OFF_TIMER)?;
        let wait = (count..count + added).map(|turn| turn_ms(timer, turn)).sum();
        if !waited_since_landing(wait)? {
            return Err(ERR_SINCE);
        }
    } else {
        let shot = moves;
        if added != 1 || shot[0] > MAX_ANGLE || shot[1] > MAX_POWER || shot[2] as i8 as i32 != wind_of(duel_id, &block) {
            return Err(ERR_DUEL);
        }
        if !has_input_locked_by(&key_of(input, count % 2)?) {
            return Err(ERR_AUTH);
        }
    }
    same_guard()?;
    if load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?
        != load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)?
    {
        return Err(ERR_POT);
    }
    Ok(())
}

/// Whether `wait_ms` has passed since the duel cell landed, by real block time. The transaction names
/// the duel's own block and a later one in `header_deps`. A block can't be stamped in the future, so
/// a block stamped that long after the duel's proves the time is up, within a block of it, instead of
/// waiting for the chain's median clock (`since`), which runs minutes behind.
fn waited_since_landing(wait_ms: u64) -> Result<bool, i8> {
    let (_, landed) = postmark(0, Source::GroupInput)?;
    let latest = QueryIter::new(load_header, Source::HeaderDep)
        .map(|header| read_u64(header.raw().timestamp().as_slice(), 0).unwrap_or(0))
        .max()
        .unwrap_or(0);
    Ok(latest >= landed.saturating_add(wait_ms))
}

/// How long the turn of shot `count` may take. Classic: the first turn's time, every turn. Pressure:
/// each turn loses `shrink` ms, down to the floor.
fn turn_ms(timer: u64, count: usize) -> u64 {
    let (first, shrink) = (timer & 0xffff_ffff, timer >> 32);
    first.saturating_sub(shrink.saturating_mul(count as u64)).max(first.min(PRESSURE_FLOOR_MS))
}

enum Result3 {
    Side(usize),
    Draw,
}

/// Ends a live duel. Anyone may send it; the money only goes where the result says.
fn finish(duel_id: &[u8; 32], input: &[u8]) -> Result<(), i8> {
    let kind = parse(input)?;
    let timer = read_u64(input, OFF_TIMER)?;
    let result = match kind {
        KIND_ARTILLERY => {
            // Only the game ends it: a tank destroyed, or the turns run out. A turn left to run out
            // is skipped, not lost (see `shoot`).
            let count = input[OFF_SHOT_COUNT] as usize;
            let verdict = if count == 0 { VERDICT_ON } else { judge_artillery(duel_id, input, count)? };
            match verdict {
                0 => Result3::Side(0),
                1 => Result3::Side(1),
                VERDICT_DRAW => Result3::Draw,
                _ => return Err(ERR_SINCE),
            }
        }
        // A race both players handed in needs no clock; otherwise its time must be up.
        KIND_RACE => judge_race(input, input[OFF_SUBMITTED] != 0b11 && waited_since_landing(timer)?)?,
        _ => return Err(ERR_DUEL),
    };
    let total = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    let stake = read_u64(input, OFF_STAKE)?;
    match result {
        // The cell holds both stakes and the challenger's storage deposit. The winner gets the
        // stakes; the deposit always goes back to the challenger, who pays the fee out of it.
        Result3::Side(0) => {
            let due = total.checked_sub(MAX_TX_FEE).ok_or(ERR_POT)?;
            if outputs_to_lock(&lock_of(input, 0)?)? < due {
                return Err(ERR_POT);
            }
        }
        Result3::Side(_) => {
            let both = stake.checked_mul(2).ok_or(ERR_POT)?;
            let deposit = total.checked_sub(both).and_then(|n| n.checked_sub(MAX_TX_FEE)).ok_or(ERR_POT)?;
            if outputs_to_lock(&lock_of(input, 1)?)? < both || outputs_to_lock(&lock_of(input, 0)?)? < deposit {
                return Err(ERR_POT);
            }
        }
        Result3::Draw => {
            // Each stake goes back; the challenger also gets the cell's storage, less the fee.
            let challenger_due = total.checked_sub(stake).and_then(|n| n.checked_sub(MAX_TX_FEE)).ok_or(ERR_POT)?;
            if outputs_to_lock(&lock_of(input, 0)?)? < challenger_due || outputs_to_lock(&lock_of(input, 1)?)? < stake {
                return Err(ERR_POT);
            }
        }
    }
    Ok(())
}

fn judge_artillery(duel_id: &[u8; 32], input: &[u8], count: usize) -> Result<u8, i8> {
    let mut arg = Vec::with_capacity(5 + count * SHOT_LEN);
    arg.extend_from_slice(&seed_of(duel_id, &bytes::<32>(input, OFF_SEED_BLOCK)?).to_le_bytes());
    arg.push(count as u8);
    arg.extend_from_slice(&input[OFF_SHOTS..OFF_SHOTS + count * SHOT_LEN]);
    let mut answer = [0u8; 4];
    spawn_game(&bytes::<32>(input, OFF_GAME)?, &arg, &mut answer)?;
    Ok(answer[3])
}

/// Compares the submitted scores. Before the race's time is up both players must have submitted;
/// after it, a player who never did scores 0.
fn judge_race(input: &[u8], waited: bool) -> Result<Result3, i8> {
    let submitted = input[OFF_SUBMITTED];
    if submitted != 0b11 && !waited {
        return Err(ERR_SINCE);
    }
    let score = |side: usize| -> Result<u64, i8> {
        Ok(if submitted & (1 << side) != 0 { read_u64(input, OFF_SCORES + side * 8)? } else { 0 })
    };
    Ok(match score(0)?.cmp(&score(1)?) {
        core::cmp::Ordering::Greater => Result3::Side(0),
        core::cmp::Ordering::Less => Result3::Side(1),
        core::cmp::Ordering::Equal => Result3::Draw,
    })
}

/// A player hands in their race. Their racer cell is spent here, so their own session key signed;
/// its laps are replayed against the lap chain they sealed, and the score is recorded once.
fn submit(duel_id: &[u8; 32], input: &[u8]) -> Result<(), i8> {
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    parse(input)?;
    parse(&output)?;
    let (side, index, racer) = submitted_racer(duel_id, input)?;
    let bit = 1u8 << side;
    if input[OFF_SUBMITTED] & bit != 0 || output[OFF_SUBMITTED] != input[OFF_SUBMITTED] | bit {
        return Err(ERR_DUEL);
    }
    let laps = racer[OFF_RACER_LAPS];
    let witness = load_witness_args(0, Source::GroupInput).map_err(|_| ERR_RUN)?;
    let field = witness.input_type().to_opt().ok_or(ERR_RUN)?;
    let raw = field.raw_data();
    if raw.first() != Some(&RACE_RUN_VERSION) {
        return Err(ERR_RUN);
    }
    let run = &raw[1..];
    // No laps, or a last lap sealed late, scores 0: too late is too late.
    let score = if laps == 0 || !lap_on_time(read_u64(&racer, OFF_RACER_LAP_START)?, postmark(index, Source::Input)?.1) {
        if run != [0u8] {
            return Err(ERR_RUN);
        }
        0
    } else {
        let chain = bytes::<32>(&racer, OFF_RACER_CHAIN)?;
        let arg = sealed_run(run, laps, &chain, duel_id, &lock_of(input, side)?)?;
        score_run(&bytes::<32>(input, OFF_GAME)?, &arg)?
    };
    let mut expected = input.to_vec();
    expected[OFF_SCORES + side * 8..OFF_SCORES + side * 8 + 8].copy_from_slice(&score.to_le_bytes());
    expected[OFF_SUBMITTED] |= bit;
    if output != expected {
        return Err(ERR_DUEL);
    }
    same_guard()?;
    if load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?
        != load_cell_capacity(0, Source::GroupOutput).map_err(|_| ERR_POT)?
    {
        return Err(ERR_POT);
    }
    Ok(())
}

/// The one racer cell being handed in: this duel's, locked by its side's key. Returns its side,
/// its input index and its data.
fn submitted_racer(duel_id: &[u8; 32], input: &[u8]) -> Result<(usize, usize, Vec<u8>), i8> {
    let mut found = None;
    let n = QueryIter::new(load_cell_lock_hash, Source::Input).count();
    for index in 0..n {
        for side in 0..2usize {
            let mut args = [0u8; 33];
            args[..32].copy_from_slice(duel_id);
            args[32] = side as u8;
            if !is_ours(index, Source::Input, &args)? {
                continue;
            }
            if load_cell_lock_hash(index, Source::Input).map_err(|_| ERR_LEN)? != key_of(input, side)? {
                return Err(ERR_AUTH);
            }
            if found.is_some() {
                return Err(ERR_DUEL);
            }
            let data = load_cell_data(index, Source::Input).map_err(|_| ERR_LEN)?;
            if data.len() != RACER_LEN || data[0] != RACER_VERSION {
                return Err(ERR_LEN);
            }
            found = Some((side, index, data));
        }
    }
    found.ok_or(ERR_AUTH)
}

/// Whether a cell's type is this script with `args`.
fn is_ours(index: usize, source: Source, args: &[u8]) -> Result<bool, i8> {
    let own = load_script().map_err(|_| ERR_LEN)?;
    let Some(script) = load_cell_type(index, source).map_err(|_| ERR_LEN)? else {
        return Ok(false);
    };
    Ok(script.code_hash().as_slice() == own.code_hash().as_slice()
        && script.hash_type().as_slice() == own.hash_type().as_slice()
        && script.args().raw_data().as_ref() == args)
}

/// The live race this racer belongs to, among the cell deps.
fn find_duel(duel_id: &[u8; 32]) -> Result<(usize, Vec<u8>), i8> {
    let n = QueryIter::new(load_cell_lock_hash, Source::CellDep).count();
    for index in 0..n {
        if !is_ours(index, Source::CellDep, duel_id)? {
            continue;
        }
        let data = load_cell_data(index, Source::CellDep).map_err(|_| ERR_LEN)?;
        if parse(&data)? != KIND_RACE || data[OFF_STATUS] != STATUS_LIVE {
            return Err(ERR_DUEL);
        }
        return Ok((index, data));
    }
    Err(ERR_DUEL)
}

/// A racer cell: one player's lane race. Made empty, sealed a lap at a time, taken back any time.
fn racer(duel_id: &[u8; 32], side: u8) -> Result<(), i8> {
    if side > 1 {
        return Err(ERR_LEN);
    }
    let gi = group_count(Source::GroupInput);
    let go = group_count(Source::GroupOutput);
    match (gi, go) {
        (0, 1) => {
            let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
            if out.len() != RACER_LEN || out[0] != RACER_VERSION || out[1..] != [0u8; RACER_LEN - 1] {
                return Err(ERR_SEAL);
            }
            Ok(())
        }
        // The player's own key signs; once the race is judged, or never run, the cell is theirs.
        (1, 0) => Ok(()),
        (1, 1) => seal_lap(duel_id, side as usize),
        _ => Err(ERR_MODE),
    }
}

/// Seals one lap of a race. Lap 1's road comes from the block the duel was accepted in, the same
/// moment for both players; each later lap's from the block this racer's last seal landed in.
fn seal_lap(duel_id: &[u8; 32], side: usize) -> Result<(), i8> {
    let input = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
    let output = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    if input.len() != RACER_LEN || output.len() != RACER_LEN || input[0] != RACER_VERSION || output[0] != RACER_VERSION {
        return Err(ERR_LEN);
    }
    let laps = input[OFF_RACER_LAPS];
    if laps >= LAPS || output[OFF_RACER_LAPS] != laps + 1 {
        return Err(ERR_SEAL);
    }
    let lock = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| ERR_SEAL)?;
    if lock != load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| ERR_SEAL)? {
        return Err(ERR_SEAL);
    }
    let (duel_index, duel) = find_duel(duel_id)?;
    if lock != key_of(&duel, side)? {
        return Err(ERR_AUTH);
    }
    let (block, opened_ms) = if laps == 0 {
        postmark(duel_index, Source::CellDep)?
    } else {
        let (block, landed_ms) = postmark(0, Source::GroupInput)?;
        if !lap_on_time(read_u64(&input, OFF_RACER_LAP_START)?, landed_ms) {
            return Err(ERR_CLOCK);
        }
        (block, landed_ms)
    };
    if read_u64(&output, OFF_RACER_LAP_START)? != opened_ms {
        return Err(ERR_SEAL);
    }
    let witness = load_witness_args(0, Source::GroupInput).map_err(|_| ERR_SEAL)?;
    let field = witness.input_type().to_opt().ok_or(ERR_SEAL)?;
    let raw = field.raw_data();
    if raw.len() != SEAL_WITNESS_LEN || raw[0] != SEAL_VERSION {
        return Err(ERR_SEAL);
    }
    let chain = fold_lap(&bytes::<32>(&input, OFF_RACER_CHAIN)?, &block, &bytes::<32>(&raw, 1)?);
    if bytes::<32>(&output, OFF_RACER_CHAIN)? != chain {
        return Err(ERR_SEAL);
    }
    Ok(())
}
