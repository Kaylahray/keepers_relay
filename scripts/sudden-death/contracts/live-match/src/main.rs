#![no_std]
#![no_main]

//! A live match: 2 to 5 players race at once and the winner takes every entry. The match names the
//! game that judges it, so any live game that keeps the game ABI below plays on this one script.
//! One script, two kinds of cell.
//!
//! The **match cell** (args: 32-byte type id) holds the host's entry. Its lock is the Input Type
//! Proxy Lock pointing back at this type, so every spend is decided here:
//!
//! - open: the host locks their entry and names the seats, the map, the game and the relay.
//! - finish: the race record is in the match cell's witness. The game replays it and the money goes
//!   where the result says (see below). It spends every seat that raced.
//! - close: no record and no seats. The host's cell goes back to them, at once if the relay signs (a
//!   lobby nobody joined), or by anyone once it has waited the host's wait and `MATCH_MS` more
//!   (something broke).
//!
//! A **seat cell** (args: match id ‖ 1) holds one player's entry. It names the live match in its cell
//! deps when it is made, so players join without touching the match cell or each other. Its lock is
//! the proxy lock on its own type. It is spent by its match's finish, or goes back to its owner once
//! it has waited its match's wait and `MATCH_MS` more: a seat that never raced is never stuck. A seat
//! copies its match's wait, so it knows how long once the match is gone.
//!
//! **The wait.** The host picks how long the lobby may wait before the race, 1 to 60 minutes. The
//! relay may start sooner (a full lobby, the host's word, a clock cut by each join); the chain only
//! needs the longest it could be, so nothing goes home while it might still race.
//!
//! **Finish.** The witness holds `version 2 ‖ cars u8 ‖ per car: count u16 LE ‖ events ‖ signature`.
//! Car 0 is the host if they race, then each seat in the order it is spent. The game is asked to judge the record
//! with the match's map in front (without the signatures), and says for each car its place with 0x80 set if it
//! finished every lap. A car that finished first wins; cars that crossed on the same tick split the
//! pot. If nobody finished, every entry goes back. Each player always gets their storage back; the
//! host's pays the fee, up to `MAX_TX_FEE`.
//!
//! **Signed moves.** Each player's browser signs its own moves with its session key while it drives:
//! 65 bytes `r ‖ s ‖ recovery id` over `blake2b(MOVES_DOMAIN ‖ match id ‖ count ‖ events)`. So the
//! finish needs nobody online: the relay sends it (it spends a cell of the relay's lock), and the
//! script checks that each winner's moves were signed by that winner's key. So nobody, the relay
//! included, can make up the moves that win the pot. Other cars' signatures aren't checked (each
//! check costs about 9M cycles, and five would pass the network's limit): made-up moves for a car
//! that loses give the relay nothing it can't already do by leaving that car's moves out. With no
//! winner the relay needs no signatures, since all it can do is refund. Every player's key together
//! may also finish, as before.
//!
//! Game ABI: the game serves `LiveGame` over ckb-script-ipc (see `crowns-game-api`). It is spawned
//! as a server from the cell dep with the match's game data hash and called once, `judge(record)` with
//! `map u8 ‖ cars u8 ‖ per car: count u16 LE ‖ events`. It answers one byte per car, or an error for
//! an illegal record or a map it doesn't have.
//!
//! Match cell data, version 2 (version 1 has no wait, and waits `MATCH_MS` alone):
//!
//! ```text
//! 0   1   version = 2
//! 1   1   seats u8: the most cars, host included, 2 to 5
//! 2   1   map u8, as the game numbers them
//! 3   8   entry u64: what each player puts in the pot
//! 11  32  host lock hash
//! 43  32  host key lock hash
//! 75  32  game: data hash of the game script that judges the match
//! 107 32  relay lock hash
//! 139 4   wait u32: the longest the lobby waits, in seconds
//! ```
//!
//! Version 3 adds a sponsor's prize and who may race:
//!
//! ```text
//! 143 8   prize u64: what the host adds to the pot on top of the entries (0 for none)
//! 151 1   flags u8: bit 0 set if the host races; unset, the host only sponsors and every car is a seat
//! 152 32  pass: type hash of a cell each player must hold to take a seat, such as a username (zero for anyone)
//! ```
//!
//! The pot is every car's entry and the prize. The entry may be 0 only with a prize: a sponsored race,
//! free to join. With a prize, no two seats (or a seat and a racing host) may share an owner. With no
//! winner, the prize goes back to the host with everything else.
//!
//! Seat cell data, version 2: `version ‖ owner lock hash ‖ key lock hash ‖ wait u32`, the wait copied
//! from its match. Version 1 has no wait. A seat has its match's version; version 3 is laid out as 2.

use alloc::vec::Vec;
use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::packed::Script;
use ckb_std::ckb_types::prelude::Entity;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::ckb_types::prelude::{Builder, Pack};
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_lock, load_cell_lock_hash, load_cell_occupied_capacity,
    load_cell_type, load_cell_type_hash, load_input_since, load_script, load_witness_args, QueryIter,
};
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use ckb_std::type_id::check_type_id;
use sudden_death_common::*;

entry!(program_entry);
default_alloc!();

/// A match moved in a way its state does not allow.
const ERR_MATCH: i8 = ERR_DUEL;

const LIVE_V1: u8 = 1;
const LIVE_V2: u8 = 2;
const LIVE_V3: u8 = 3;
const OFF_SEATS: usize = 1;
const OFF_MAP: usize = 2;
const OFF_ENTRY: usize = 3;
const OFF_HOST: usize = 11;
const OFF_HOST_KEY: usize = 43;
const OFF_LIVE_GAME: usize = 75;
const OFF_RELAY: usize = 107;
const LIVE_LEN_V1: usize = 139;
const OFF_WAIT: usize = 139;
const LIVE_LEN_V2: usize = 143;
const OFF_PRIZE: usize = 143;
const OFF_FLAGS: usize = 151;
const OFF_PASS: usize = 152;
const LIVE_LEN_V3: usize = 184;
const HOST_RACES: u8 = 1;
/// The shortest and longest a host may make the lobby wait, in seconds.
const MIN_WAIT_S: u32 = 60;
const MAX_WAIT_S: u32 = 60 * 60;
const MIN_SEATS: u8 = 2;
const MAX_SEATS: u8 = 5;

const SEAT_TAG: u8 = 1;
const OFF_OWNER: usize = 1;
const OFF_KEY: usize = 33;
const SEAT_LEN_V1: usize = 65;
const OFF_SEAT_WAIT: usize = 65;
const SEAT_LEN_V2: usize = 69;

const RECORD_VERSION: u8 = 2;
const SIG_LEN: usize = 65;
/// Signed moves are for this game and nothing else.
const MOVES_DOMAIN: &[u8] = b"crowns-rally-moves-1";
/// Set on a car's result by the game once it finished.
const FINISHED: u8 = 0x80;
/// After the lobby's wait, a match is over by now: the race and time to sign the finish. After both,
/// every cell may go home.
const MATCH_MS: u64 = 10 * 60 * 1000;

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn validate() -> Result<(), i8> {
    let args = script_args()?;
    let own = load_script().map_err(|_| ERR_LEN)?;
    match args.len() {
        32 => match_cell(&own, &bytes::<32>(&args, 0)?),
        33 if args[32] == SEAT_TAG => seat(&own, &bytes::<32>(&args, 0)?),
        _ => Err(ERR_LEN),
    }
}

fn group_count(source: Source) -> usize {
    QueryIter::new(load_cell_data, source).count()
}

fn has_input_locked_by(lock: &[u8; 32]) -> bool {
    QueryIter::new(load_cell_lock_hash, Source::Input).any(|hash| hash == *lock)
}

/// Whether the cell at `index` has this script for its type, with `args`.
fn is_ours(own: &Script, index: usize, source: Source, args: &[u8]) -> Result<bool, i8> {
    let Some(script) = load_cell_type(index, source).map_err(|_| ERR_LEN)? else {
        return Ok(false);
    };
    Ok(script.code_hash().as_slice() == own.code_hash().as_slice()
        && script.hash_type().as_slice() == own.hash_type().as_slice()
        && script.args().raw_data().as_ref() == args)
}

/// The index of the first cell with this script and `args` among `source`, if there is one.
fn find_cell(own: &Script, args: &[u8], source: Source) -> Result<Option<usize>, i8> {
    let n = QueryIter::new(load_cell_lock_hash, source).count();
    for index in 0..n {
        if is_ours(own, index, source, args)? {
            return Ok(Some(index));
        }
    }
    Ok(None)
}

fn seat_args(match_id: &[u8; 32]) -> [u8; 33] {
    let mut args = [SEAT_TAG; 33];
    args[..32].copy_from_slice(match_id);
    args
}

/// What a match cell's data says beyond its seats and entry. Matches from before version 3 have no
/// prize and no pass, and their host always races.
struct Terms {
    version: u8,
    /// The lobby's wait in seconds, 0 for version 1.
    wait: u32,
    prize: u64,
    host_races: bool,
    pass: [u8; 32],
}

fn parse_match(data: &[u8]) -> Result<Terms, i8> {
    let mut terms = Terms { version: data.first().copied().unwrap_or(0), wait: 0, prize: 0, host_races: true, pass: [0; 32] };
    match (terms.version, data.len()) {
        (LIVE_V1, LIVE_LEN_V1) => {}
        (LIVE_V2, LIVE_LEN_V2) => terms.wait = read_u32(data, OFF_WAIT)?,
        (LIVE_V3, LIVE_LEN_V3) => {
            terms.wait = read_u32(data, OFF_WAIT)?;
            terms.prize = read_u64(data, OFF_PRIZE)?;
            terms.host_races = data[OFF_FLAGS] & HOST_RACES != 0;
            terms.pass = bytes::<32>(data, OFF_PASS)?;
        }
        _ => return Err(ERR_LEN),
    }
    if !(MIN_SEATS..=MAX_SEATS).contains(&data[OFF_SEATS]) {
        return Err(ERR_MATCH);
    }
    Ok(terms)
}

/// A seat cell's data: its version and its match's wait in seconds (0 for version 1).
fn parse_seat(data: &[u8]) -> Result<(u8, u32), i8> {
    match (data.first(), data.len()) {
        (Some(&LIVE_V1), SEAT_LEN_V1) => Ok((LIVE_V1, 0)),
        (Some(&version @ (LIVE_V2 | LIVE_V3)), SEAT_LEN_V2) => Ok((version, read_u32(data, OFF_SEAT_WAIT)?)),
        _ => Err(ERR_LEN),
    }
}

/// What the host's cell puts in the pot: their entry if they race, and the prize.
fn host_stake(entry: u64, terms: &Terms) -> Result<u64, i8> {
    let entry = if terms.host_races { entry } else { 0 };
    entry.checked_add(terms.prize).ok_or(ERR_POT)
}

/// How long a cell with this wait holds before anyone may send it home.
fn hold_ms(wait: u32) -> u64 {
    wait as u64 * 1000 + MATCH_MS
}

/// The cell holds the entry and room for itself.
fn holds_entry(index: usize, source: Source, entry: u64) -> Result<(), i8> {
    let occupied = load_cell_occupied_capacity(index, source).map_err(|_| ERR_LEN)?;
    let need = entry.checked_add(occupied).ok_or(ERR_POT)?;
    if load_cell_capacity(index, source).map_err(|_| ERR_POT)? < need {
        return Err(ERR_POT);
    }
    Ok(())
}

/// Adds `amount` to what `lock` is owed.
fn owe(owed: &mut Vec<([u8; 32], u64)>, lock: [u8; 32], amount: u64) -> Result<(), i8> {
    match owed.iter_mut().find(|(who, _)| *who == lock) {
        Some((_, due)) => *due = due.checked_add(amount).ok_or(ERR_POT)?,
        None => owed.push((lock, amount)),
    }
    Ok(())
}

fn paid(owed: &[([u8; 32], u64)]) -> Result<(), i8> {
    for (lock, due) in owed {
        if outputs_to_lock(lock)? < *due {
            return Err(ERR_POT);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------- the match cell

fn match_cell(own: &Script, match_id: &[u8; 32]) -> Result<(), i8> {
    match (group_count(Source::GroupInput), group_count(Source::GroupOutput)) {
        (0, 1) => open(),
        (1, 0) => {
            let data = load_cell_data(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
            let terms = parse_match(&data)?;
            let record = load_witness_args(0, Source::GroupInput)
                .ok()
                .and_then(|witness| witness.input_type().to_opt())
                .map(|field| field.raw_data().to_vec());
            match record {
                Some(record) => finish(own, match_id, &data, &terms, &record),
                None => close(own, match_id, &data, terms.wait),
            }
        }
        _ => Err(ERR_MODE),
    }
}

fn open() -> Result<(), i8> {
    check_type_id(0, 32).map_err(|_| ERR_LEN)?;
    let out = load_cell_data(0, Source::GroupOutput).map_err(|_| ERR_LEN)?;
    let terms = parse_match(&out)?;
    if terms.version >= LIVE_V2 && !(MIN_WAIT_S..=MAX_WAIT_S).contains(&terms.wait) {
        return Err(ERR_MATCH);
    }
    let entry = read_u64(&out, OFF_ENTRY)?;
    for offset in [OFF_HOST, OFF_LIVE_GAME, OFF_RELAY] {
        if bytes::<32>(&out, offset)? == [0u8; 32] {
            return Err(ERR_MATCH);
        }
    }
    // A host who races drives with a key; one who only sponsors needs none.
    if terms.host_races && bytes::<32>(&out, OFF_HOST_KEY)? == [0u8; 32] {
        return Err(ERR_MATCH);
    }
    // Something must be raced for: an entry, a prize, or both.
    if entry == 0 && terms.prize == 0 {
        return Err(ERR_MATCH);
    }
    proxy_guarded(0, Source::GroupOutput, &current_script_hash()?)?;
    holds_entry(0, Source::GroupOutput, host_stake(entry, &terms)?)
}

/// The host's cell goes home. Seats are never spent with it: each goes home on its own.
fn close(own: &Script, match_id: &[u8; 32], data: &[u8], wait: u32) -> Result<(), i8> {
    if find_cell(own, &seat_args(match_id), Source::Input)?.is_some() {
        return Err(ERR_MATCH);
    }
    let since = load_input_since(0, Source::GroupInput).map_err(|_| ERR_LEN)?;
    if !since_waited(since, hold_ms(wait)) && !has_input_locked_by(&bytes::<32>(data, OFF_RELAY)?) {
        return Err(ERR_SINCE);
    }
    let total = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    let due = total.checked_sub(MAX_TX_FEE).ok_or(ERR_POT)?;
    if outputs_to_lock(&bytes::<32>(data, OFF_HOST)?)? < due {
        return Err(ERR_POT);
    }
    Ok(())
}

struct Player {
    owner: [u8; 32],
    key: [u8; 32],
    capacity: u64,
}

/// Every player, car by car: the host if they race, then each seat of this match in the order it is spent.
fn players(own: &Script, match_id: &[u8; 32], data: &[u8], terms: &Terms) -> Result<Vec<Player>, i8> {
    let mut players = Vec::new();
    if terms.host_races {
        players.push(Player {
            owner: bytes::<32>(data, OFF_HOST)?,
            key: bytes::<32>(data, OFF_HOST_KEY)?,
            capacity: load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?,
        });
    }
    let args = seat_args(match_id);
    let n = QueryIter::new(load_cell_lock_hash, Source::Input).count();
    for index in 0..n {
        if !is_ours(own, index, Source::Input, &args)? {
            continue;
        }
        let seat = load_cell_data(index, Source::Input).map_err(|_| ERR_LEN)?;
        parse_seat(&seat)?;
        players.push(Player {
            owner: bytes::<32>(&seat, OFF_OWNER)?,
            key: bytes::<32>(&seat, OFF_KEY)?,
            capacity: load_cell_capacity(index, Source::Input).map_err(|_| ERR_POT)?,
        });
    }
    Ok(players)
}

/// One car's part of the record: its moves as the game reads them (`count ‖ events`) and its signature.
struct Tape<'a> {
    moves: &'a [u8],
    signature: &'a [u8],
}

/// Splits `cars u8 ‖ per car: count u16 LE ‖ events ‖ signature` into each car's tape.
fn tapes(cars: usize, raw: &[u8]) -> Result<Vec<Tape<'_>>, i8> {
    if raw.first() != Some(&(cars as u8)) {
        return Err(ERR_RUN);
    }
    let mut out = Vec::with_capacity(cars);
    let mut at = 1;
    for _ in 0..cars {
        let head = raw.get(at..at + 2).ok_or(ERR_RUN)?;
        let len = 2 + u16::from_le_bytes([head[0], head[1]]) as usize * 3;
        let moves = raw.get(at..at + len).ok_or(ERR_RUN)?;
        let signature = raw.get(at + len..at + len + SIG_LEN).ok_or(ERR_RUN)?;
        out.push(Tape { moves, signature });
        at += len + SIG_LEN;
    }
    if at != raw.len() {
        return Err(ERR_RUN);
    }
    Ok(out)
}

/// The lock hash of the session key that signed `message`: CKB's secp256k1 lock (the same code the
/// relay's lock runs, so this works on any network) over the key's blake160.
fn signer_lock_hash(template: &Script, message: &[u8; 32], signature: &[u8]) -> Result<[u8; 32], i8> {
    let sig = Signature::from_slice(&signature[..64]).map_err(|_| ERR_AUTH)?;
    let id = RecoveryId::from_byte(signature[64]).ok_or(ERR_AUTH)?;
    let key = VerifyingKey::recover_from_prehash(message, &sig, id).map_err(|_| ERR_AUTH)?;
    let blake160 = &blake2b_256(&[key.to_encoded_point(true).as_bytes()])[..20];
    let lock = template.clone().as_builder().args(blake160.pack()).build();
    Ok(blake2b_256(&[lock.as_slice()]))
}

/// Each winner's moves are signed by that winner's own key.
fn winners_signed(match_id: &[u8; 32], players: &[Player], tapes: &[Tape], winners: &[usize], relay_lock: &[u8; 32]) -> Result<(), i8> {
    let relay_at = QueryIter::new(load_cell_lock_hash, Source::Input).position(|hash| hash == *relay_lock).ok_or(ERR_AUTH)?;
    let template = load_cell_lock(relay_at, Source::Input).map_err(|_| ERR_AUTH)?;
    for car in winners {
        let tape = &tapes[*car];
        let message = blake2b_256(&[MOVES_DOMAIN, match_id, tape.moves]);
        if signer_lock_hash(&template, &message, tape.signature)? != players[*car].key {
            return Err(ERR_AUTH);
        }
    }
    Ok(())
}

fn finish(own: &Script, match_id: &[u8; 32], data: &[u8], terms: &Terms, record: &[u8]) -> Result<(), i8> {
    let players = players(own, match_id, data, terms)?;
    let cars = players.len();
    if cars < MIN_SEATS as usize || cars > data[OFF_SEATS] as usize {
        return Err(ERR_MATCH);
    }
    // A prize is worth racing for with many wallets: each car has its own owner.
    if terms.prize > 0 && (1..cars).any(|car| players[..car].iter().any(|other| other.owner == players[car].owner)) {
        return Err(ERR_MATCH);
    }
    if record.first() != Some(&RECORD_VERSION) {
        return Err(ERR_RUN);
    }
    let tapes = tapes(cars, &record[1..])?;
    let mut arg = Vec::with_capacity(record.len());
    arg.extend_from_slice(&[data[OFF_MAP], cars as u8]);
    for tape in &tapes {
        arg.extend_from_slice(tape.moves);
    }
    let mut results = [0u8; MAX_SEATS as usize];
    judge_race(&bytes::<32>(data, OFF_LIVE_GAME)?, &arg, &mut results[..cars])?;
    // First place and finished: a car that never finished can't win, however far ahead it was.
    let winners: Vec<usize> = (0..cars).filter(|car| results[*car] == FINISHED).collect();

    let relay_lock = bytes::<32>(data, OFF_RELAY)?;
    let everyone = players.iter().all(|player| has_input_locked_by(&player.key));
    if !everyone {
        if !has_input_locked_by(&relay_lock) {
            return Err(ERR_AUTH);
        }
        winners_signed(match_id, &players, &tapes, &winners, &relay_lock)?;
    }

    let entry = read_u64(data, OFF_ENTRY)?;
    let host = bytes::<32>(data, OFF_HOST)?;
    let host_capacity = load_cell_capacity(0, Source::GroupInput).map_err(|_| ERR_POT)?;
    let host_stake = host_stake(entry, terms)?;
    let mut owed = Vec::new();
    // The host's cell, raced or not: with a winner, all but what it put in; with none, all of it.
    let host_back = host_capacity.checked_sub(host_stake).ok_or(ERR_POT)?;
    owe(&mut owed, host, if winners.is_empty() { host_capacity } else { host_back })?;
    let seats = if terms.host_races { &players[1..] } else { &players[..] };
    for player in seats {
        let deposit = player.capacity.checked_sub(entry).ok_or(ERR_POT)?;
        owe(&mut owed, player.owner, if winners.is_empty() { player.capacity } else { deposit })?;
    }
    if !winners.is_empty() {
        let pot = entry.checked_mul(cars as u64).and_then(|pot| pot.checked_add(terms.prize)).ok_or(ERR_POT)?;
        let share = pot / winners.len() as u64;
        for (n, car) in winners.iter().enumerate() {
            // What doesn't divide goes to the first of them.
            let extra = if n == 0 { pot % winners.len() as u64 } else { 0 };
            owe(&mut owed, players[*car].owner, share + extra)?;
        }
    }
    // The host's storage pays the fee.
    if let Some((_, due)) = owed.iter_mut().find(|(who, _)| *who == host) {
        *due = due.checked_sub(MAX_TX_FEE).ok_or(ERR_POT)?;
    }
    paid(&owed)
}

// ---------------------------------------------------------------- seat cells

fn seat(own: &Script, match_id: &[u8; 32]) -> Result<(), i8> {
    match (group_count(Source::GroupInput), group_count(Source::GroupOutput)) {
        (0, n) if n > 0 => join(own, match_id, n),
        // Spent with its match: the match's finish checks every seat.
        (n, 0) if n > 0 && find_cell(own, match_id, Source::Input)?.is_some() => Ok(()),
        (n, 0) if n > 0 => leave(n),
        _ => Err(ERR_MODE),
    }
}

fn join(own: &Script, match_id: &[u8; 32], n: usize) -> Result<(), i8> {
    if find_cell(own, match_id, Source::Input)?.is_some() {
        return Err(ERR_MATCH);
    }
    let index = find_cell(own, match_id, Source::CellDep)?.ok_or(ERR_MATCH)?;
    let data = load_cell_data(index, Source::CellDep).map_err(|_| ERR_LEN)?;
    let terms = parse_match(&data)?;
    let entry = read_u64(&data, OFF_ENTRY)?;
    let own_hash = current_script_hash()?;
    for i in 0..n {
        let seat = load_cell_data(i, Source::GroupOutput).map_err(|_| ERR_LEN)?;
        // The same version and wait as its match, so it waits as long once the match is gone.
        if parse_seat(&seat)? != (terms.version, terms.wait) {
            return Err(ERR_MATCH);
        }
        let owner = bytes::<32>(&seat, OFF_OWNER)?;
        if owner == [0u8; 32] || bytes::<32>(&seat, OFF_KEY)? == [0u8; 32] {
            return Err(ERR_MATCH);
        }
        if terms.pass != [0u8; 32] && !holds_pass(&terms.pass, &owner) {
            return Err(ERR_AUTH);
        }
        proxy_guarded(i, Source::GroupOutput, &own_hash)?;
        holds_entry(i, Source::GroupOutput, entry)?;
    }
    Ok(())
}

/// Whether the transaction names, in its cell deps, a cell of the pass's type that `owner` holds.
fn holds_pass(pass: &[u8; 32], owner: &[u8; 32]) -> bool {
    let n = QueryIter::new(load_cell_lock_hash, Source::CellDep).count();
    (0..n).any(|index| {
        load_cell_type_hash(index, Source::CellDep).ok().flatten().as_ref() == Some(pass)
            && load_cell_lock_hash(index, Source::CellDep).ok().as_ref() == Some(owner)
    })
}

/// Seats that never raced go home once they have waited out a whole match.
fn leave(n: usize) -> Result<(), i8> {
    let mut owed = Vec::new();
    for i in 0..n {
        let seat = load_cell_data(i, Source::GroupInput).map_err(|_| ERR_LEN)?;
        let (_, wait) = parse_seat(&seat)?;
        let since = load_input_since(i, Source::GroupInput).map_err(|_| ERR_LEN)?;
        if !since_waited(since, hold_ms(wait)) {
            return Err(ERR_SINCE);
        }
        let capacity = load_cell_capacity(i, Source::GroupInput).map_err(|_| ERR_POT)?;
        owe(&mut owed, bytes::<32>(&seat, OFF_OWNER)?, capacity.checked_sub(MAX_TX_FEE).ok_or(ERR_POT)?)?;
    }
    paid(&owed)
}
