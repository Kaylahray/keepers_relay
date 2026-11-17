//! live-match: 2 to 5 players race at once, the rally game judges, the winner takes every entry.
//!
//! Locks here are always-success with distinct args, so each test controls exactly which players'
//! cells (and so which signatures) a transaction carries. A session key's lock is the relay's lock
//! code over the blake160 of a real secp256k1 key, as on chain, so its signed moves can be checked.

use super::{verify_and_dump_failed_tx, Loader};
use blake2b_ref::Blake2bBuilder;
use k256::ecdsa::SigningKey;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{ScriptHashType, TransactionBuilder, TransactionView},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};
use crowns_rally_core::{bot_input, Race, BRAKE, EVENT_LEN, FINISHED, MAX_CARS};

const MAX_CYCLES: u64 = 500_000_000;
const PROXY_BIN: &[u8] = include_bytes!("../bin/input-type-proxy-lock");
const CKB: u64 = 100_000_000;
const ENTRY: u64 = 50 * CKB;
/// Room for a cell's data and scripts, on top of its entry.
const STORAGE: u64 = 300 * CKB;
const MAX_TX_FEE: u64 = 10_000_000;
const KEY_CAP: u64 = 100 * CKB;
const MATCH_MS: u64 = 10 * 60 * 1000;
/// The lobby's wait in these tests: half an hour, in seconds.
const WAIT_S: u32 = 30 * 60;
/// How long a match and its seats hold before anyone may send them home: the wait, then a match.
const HOLD_MS: u64 = WAIT_S as u64 * 1000 + MATCH_MS;
const SINCE_RELATIVE_TIMESTAMP: u64 = 0xC000_0000_0000_0000;
const HARBOUR: u8 = 0;
const SIG_LEN: usize = 65;
const MOVES_DOMAIN: &[u8] = b"crowns-rally-moves-1";
/// The script's error codes for a bad record and a missing or wrong signature.
const ERR_RUN: i8 = -7;
const ERR_AUTH: i8 = -18;

fn hash_of(script: &Script) -> [u8; 32] {
    script.calc_script_hash().as_slice().try_into().unwrap()
}

fn blake2b_256(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32).personal(b"ckb-default-hash").build();
    for part in parts {
        hasher.update(part);
    }
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn cell(cap: u64, lock: Script, type_script: Option<Script>) -> CellOutput {
    CellOutput::new_builder().capacity(cap).lock(lock).type_(type_script.pack()).build()
}

fn input(out_point: OutPoint, since: u64) -> CellInput {
    CellInput::new_builder().previous_output(out_point).since(since).build()
}

fn waited(ms: u64) -> u64 {
    SINCE_RELATIVE_TIMESTAMP | (ms / 1000)
}

fn rejects_with(context: &Context, tx: &TransactionView, code: i8) {
    let err = context.verify_tx(tx, MAX_CYCLES).expect_err("transaction should be rejected");
    let text = format!("{err:?}");
    assert!(text.contains(&format!("error code {code} on")), "expected error {code}, got {text}");
}

/// Everyone in a match test: the scripts, the host and four more players, their keys, the relay.
struct Lobby {
    live_out: OutPoint,
    proxy_out: OutPoint,
    deps: Vec<CellDep>,
    game: [u8; 32],
    /// Player 0 is the host.
    players: Vec<Script>,
    keys: Vec<Script>,
    /// The session keys behind `keys`.
    secrets: Vec<SigningKey>,
    relay: Script,
    stranger: Script,
    match_id: [u8; 32],
}

impl Lobby {
    fn new(context: &mut Context) -> Self {
        let live_bin = Loader::default().load_binary("live-match");
        let game_bin = Loader::default().load_binary("rally");
        let game = CellOutput::calc_data_hash(&game_bin).as_slice().try_into().unwrap();
        let live_out = context.deploy_cell(live_bin);
        let game_out = context.deploy_cell(game_bin);
        let proxy_out = context.deploy_cell(Bytes::from(PROXY_BIN.to_vec()));
        let always_out = context.deploy_cell(ALWAYS_SUCCESS.clone());
        let lock = |context: &mut Context, arg: u8| context.build_script(&always_out, Bytes::from(vec![arg])).expect("lock");
        let deps = [&live_out, &game_out, &proxy_out, &always_out]
            .iter()
            .map(|out| CellDep::new_builder().out_point((*out).clone()).build())
            .collect();
        let secrets: Vec<SigningKey> = (0..5u8).map(|i| SigningKey::from_bytes(&[0x20 + i; 32].into()).expect("key")).collect();
        let keys = secrets
            .iter()
            .map(|secret| {
                let blake160 = &blake2b_256(&[secret.verifying_key().to_encoded_point(true).as_bytes()])[..20];
                context.build_script(&always_out, Bytes::from(blake160.to_vec())).expect("key lock")
            })
            .collect();
        Lobby {
            players: (0..5).map(|i| lock(context, 0x01 + i)).collect(),
            keys,
            secrets,
            relay: lock(context, 0x09),
            stranger: lock(context, 0x0a),
            live_out,
            proxy_out,
            deps,
            game,
            match_id: [0x6d; 32],
        }
    }

    fn live_type(&self, context: &mut Context, args: &[u8]) -> Script {
        context
            .build_script_with_hash_type(&self.live_out, ScriptHashType::Data2, Bytes::from(args.to_vec()))
            .expect("live-match type")
    }

    fn match_type(&self, context: &mut Context) -> Script {
        self.live_type(context, &self.match_id.clone())
    }

    fn seat_type(&self, context: &mut Context) -> Script {
        let mut args = self.match_id.to_vec();
        args.push(1);
        self.live_type(context, &args)
    }

    fn guard(&self, context: &mut Context, type_script: &Script) -> Script {
        context
            .build_script_with_hash_type(&self.proxy_out, ScriptHashType::Data1, Bytes::from(hash_of(type_script).to_vec()))
            .expect("proxy lock")
    }

    /// A match as opened today: version 2, with the lobby's wait.
    fn match_data(&self, seats: u8, map: u8) -> Vec<u8> {
        let mut raw = self.match_data_v1(seats, map);
        raw[0] = 2;
        raw.extend_from_slice(&WAIT_S.to_le_bytes());
        raw
    }

    /// A match opened before the wait: version 1.
    fn match_data_v1(&self, seats: u8, map: u8) -> Vec<u8> {
        let mut raw = vec![1u8, seats, map];
        raw.extend_from_slice(&ENTRY.to_le_bytes());
        raw.extend_from_slice(&hash_of(&self.players[0]));
        raw.extend_from_slice(&hash_of(&self.keys[0]));
        raw.extend_from_slice(&self.game);
        raw.extend_from_slice(&hash_of(&self.relay));
        raw
    }

    /// A seat as made today: version 2, with its match's wait.
    fn seat_data(&self, player: usize) -> Vec<u8> {
        let mut raw = self.seat_data_v1(player);
        raw[0] = 2;
        raw.extend_from_slice(&WAIT_S.to_le_bytes());
        raw
    }

    fn seat_data_v1(&self, player: usize) -> Vec<u8> {
        let mut raw = vec![1u8];
        raw.extend_from_slice(&hash_of(&self.players[player]));
        raw.extend_from_slice(&hash_of(&self.keys[player]));
        raw
    }

    fn place_match(&self, context: &mut Context, data: &[u8]) -> OutPoint {
        let type_script = self.match_type(context);
        let guard = self.guard(context, &type_script);
        context.create_cell(cell(STORAGE + ENTRY, guard, Some(type_script)), Bytes::from(data.to_vec()))
    }

    fn place_seat(&self, context: &mut Context, player: usize) -> OutPoint {
        let data = self.seat_data(player);
        self.place_seat_with(context, data)
    }

    fn place_seat_with(&self, context: &mut Context, data: Vec<u8>) -> OutPoint {
        let type_script = self.seat_type(context);
        let guard = self.guard(context, &type_script);
        context.create_cell(cell(STORAGE + ENTRY, guard, Some(type_script)), Bytes::from(data))
    }

    fn wallet(&self, context: &mut Context, lock: &Script, cap: u64) -> OutPoint {
        context.create_cell(cell(cap, lock.clone(), None), Bytes::new())
    }

    fn finish(&self, context: &mut Context, tx: ckb_testtool::ckb_types::core::TransactionBuilder) -> TransactionView {
        let mut tx = tx;
        for dep in &self.deps {
            tx = tx.cell_dep(dep.clone());
        }
        context.complete_tx(tx.build())
    }
}

// ---------------------------------------------------------------- open

fn open_tx(context: &mut Context, lobby: &Lobby, cap: u64, data: Vec<u8>) -> TransactionView {
    let fund = lobby.wallet(context, &lobby.players[0], cap + 100 * CKB);
    let first = input(fund, 0);
    let mut hasher = Blake2bBuilder::new(32).personal(b"ckb-default-hash").build();
    hasher.update(first.as_slice());
    hasher.update(&0u64.to_le_bytes());
    let mut match_id = [0u8; 32];
    hasher.finalize(&mut match_id);
    let type_script = lobby.live_type(context, &match_id);
    let guard = lobby.guard(context, &type_script);
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(cap, guard, Some(type_script)))
        .output_data(Bytes::from(data).pack());
    lobby.finish(context, tx)
}

#[test]
fn a_host_opens_a_match_with_their_entry() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    for seats in 2..=5 {
        let tx = open_tx(&mut context, &lobby, STORAGE + ENTRY, lobby.match_data(seats, HARBOUR));
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("open");
    }
}

#[test]
fn a_match_for_one_or_six_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    for seats in [1, 6] {
        let tx = open_tx(&mut context, &lobby, STORAGE + ENTRY, lobby.match_data(seats, HARBOUR));
        rejects_with(&context, &tx, -17);
    }
}

#[test]
fn a_match_without_a_relay_or_game_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    for offset in [75, 107] {
        let mut data = lobby.match_data(4, HARBOUR);
        data[offset..offset + 32].copy_from_slice(&[0u8; 32]);
        let tx = open_tx(&mut context, &lobby, STORAGE + ENTRY, data);
        rejects_with(&context, &tx, -17);
    }
}

#[test]
fn a_wait_outside_one_minute_to_an_hour_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    for (wait, ok) in [(0u32, false), (59, false), (60, true), (3600, true), (3601, false)] {
        let mut data = lobby.match_data(4, HARBOUR);
        data[139..143].copy_from_slice(&wait.to_le_bytes());
        let tx = open_tx(&mut context, &lobby, STORAGE + ENTRY, data);
        if ok {
            verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("a wait in range");
        } else {
            rejects_with(&context, &tx, -17);
        }
    }
}

#[test]
fn a_match_short_of_its_entry_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = open_tx(&mut context, &lobby, 280 * CKB, lobby.match_data(4, HARBOUR));
    rejects_with(&context, &tx, -3);
}

// ---------------------------------------------------------------- join

fn join_tx(context: &mut Context, lobby: &Lobby, player: usize, cap: u64, with_match: bool, guarded: bool) -> TransactionView {
    let (data, seat) = (lobby.match_data(5, HARBOUR), lobby.seat_data(player));
    join_with(context, lobby, player, cap, with_match, guarded, data, seat)
}

#[allow(clippy::too_many_arguments)]
fn join_with(context: &mut Context, lobby: &Lobby, player: usize, cap: u64, with_match: bool, guarded: bool, data: Vec<u8>, seat: Vec<u8>) -> TransactionView {
    let live = lobby.place_match(context, &data);
    let fund = lobby.wallet(context, &lobby.players[player], cap + 100 * CKB);
    let type_script = lobby.seat_type(context);
    let lock = if guarded { lobby.guard(context, &type_script) } else { lobby.players[player].clone() };
    let mut tx = TransactionBuilder::default()
        .input(input(fund, 0))
        .output(cell(cap, lock, Some(type_script)))
        .output_data(Bytes::from(seat).pack());
    if with_match {
        tx = tx.cell_dep(CellDep::new_builder().out_point(live).build());
    }
    lobby.finish(context, tx)
}

#[test]
fn a_player_joins_by_naming_the_match_without_spending_it() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = join_tx(&mut context, &lobby, 1, STORAGE + ENTRY, true, true);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("join");
}

#[test]
fn a_seat_must_copy_its_matchs_wait() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    // Another wait: it could go home before its match was over.
    let mut short = lobby.seat_data(1);
    short[65..69].copy_from_slice(&60u32.to_le_bytes());
    let tx = join_with(&mut context, &lobby, 1, STORAGE + ENTRY, true, true, lobby.match_data(5, HARBOUR), short);
    rejects_with(&context, &tx, -17);
    // No wait at all, in a match that has one.
    let tx = join_with(&mut context, &lobby, 1, STORAGE + ENTRY, true, true, lobby.match_data(5, HARBOUR), lobby.seat_data_v1(1));
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_match_opened_before_the_wait_still_takes_seats() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = join_with(&mut context, &lobby, 1, STORAGE + ENTRY, true, true, lobby.match_data_v1(5, HARBOUR), lobby.seat_data_v1(1));
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("old join");
}

#[test]
fn a_seat_without_its_match_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = join_tx(&mut context, &lobby, 1, STORAGE + ENTRY, false, true);
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_seat_short_of_the_entry_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = join_tx(&mut context, &lobby, 1, 220 * CKB, true, true);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_seat_its_owner_could_take_back_alone_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let tx = join_tx(&mut context, &lobby, 1, STORAGE + ENTRY, true, false);
    rejects_with(&context, &tx, -6);
}

// ---------------------------------------------------------------- finish

/// Bots race `parked.len()` cars on `map`; a parked car holds the brake on the grid. Returns each
/// car's moves (`count u16 LE ‖ events`, as its browser signs them) and each car's result.
fn race(map: u8, parked: &[bool]) -> (Vec<Vec<u8>>, [u8; MAX_CARS]) {
    let cars = parked.len();
    let mut race = Race::on_map(map, cars).unwrap();
    let mut tapes = vec![Vec::new(); cars];
    let mut last = [0u8; MAX_CARS];
    while !race.over() {
        let mut inputs = [0u8; MAX_CARS];
        for car in 0..cars {
            inputs[car] = if parked[car] { BRAKE } else { bot_input(&race, car) };
            if inputs[car] != last[car] {
                tapes[car].extend_from_slice(&(race.tick as u16).to_le_bytes());
                tapes[car].push(inputs[car]);
                last[car] = inputs[car];
            }
        }
        race.step(&inputs);
    }
    let moves = tapes
        .iter()
        .map(|tape| {
            let mut moves = ((tape.len() / EVENT_LEN) as u16).to_le_bytes().to_vec();
            moves.extend_from_slice(tape);
            moves
        })
        .collect();
    (moves, race.results())
}

/// `key` signs `moves` for the lobby's match: `r ‖ s ‖ recovery id`.
fn sign(lobby: &Lobby, key: usize, moves: &[u8]) -> [u8; SIG_LEN] {
    let message = blake2b_256(&[MOVES_DOMAIN, &lobby.match_id, moves]);
    let (signature, id) = lobby.secrets[key].sign_prehash_recoverable(&message).expect("sign");
    let mut out = [0u8; SIG_LEN];
    out[..64].copy_from_slice(&signature.to_bytes());
    out[64] = id.to_byte();
    out
}

/// The finish witness: `version 2 ‖ cars ‖ per car: moves ‖ signature`.
fn record(moves: &[Vec<u8>], signatures: &[[u8; SIG_LEN]]) -> Vec<u8> {
    let mut record = vec![2u8, moves.len() as u8];
    for (moves, signature) in moves.iter().zip(signatures) {
        record.extend_from_slice(moves);
        record.extend_from_slice(signature);
    }
    record
}

/// Every car's moves signed by its own key.
fn signed(lobby: &Lobby, moves: &[Vec<u8>]) -> Vec<u8> {
    let signatures: Vec<_> = moves.iter().enumerate().map(|(car, moves)| sign(lobby, car, moves)).collect();
    record(moves, &signatures)
}

/// Bots race, and every car signs its moves.
fn raced(lobby: &Lobby, map: u8, parked: &[bool]) -> (Vec<u8>, [u8; MAX_CARS]) {
    let (moves, results) = race(map, parked);
    (signed(lobby, &moves), results)
}

/// What the results pay: each player their storage, the winners the pot, or everyone their entry
/// back if nobody finished. The host pays the fee.
fn pays(lobby: &Lobby, results: &[u8]) -> Vec<(Script, u64)> {
    let winners: Vec<usize> = (0..results.len()).filter(|car| results[*car] == FINISHED).collect();
    let pot = ENTRY * results.len() as u64;
    (0..results.len())
        .map(|car| {
            let mut due = if winners.is_empty() { STORAGE + ENTRY } else { STORAGE };
            if let Some(n) = winners.iter().position(|w| *w == car) {
                due += pot / winners.len() as u64 + if n == 0 { pot % winners.len() as u64 } else { 0 };
            }
            if car == 0 {
                due -= MAX_TX_FEE;
            }
            (lobby.players[car].clone(), due)
        })
        .collect()
}

struct Finish {
    seats: u8,
    map: u8,
    /// How many cars sit in the match: the host and `cars - 1` seats.
    cars: usize,
    record: Option<Vec<u8>>,
    signers: Vec<Script>,
    paid: Vec<(Script, u64)>,
}

fn finish_tx(context: &mut Context, lobby: &Lobby, finish: Finish) -> TransactionView {
    let data = lobby.match_data(finish.seats, finish.map);
    let live = lobby.place_match(context, &data);
    let witness = WitnessArgs::new_builder().input_type(finish.record.map(Bytes::from).pack()).build().as_bytes();
    let mut tx = TransactionBuilder::default().input(input(live, 0)).witness(witness.pack());
    for player in 1..finish.cars {
        let seat = lobby.place_seat(context, player);
        tx = tx.input(input(seat, 0));
    }
    for lock in &finish.signers {
        let key = lobby.wallet(context, lock, KEY_CAP);
        tx = tx.input(input(key, 0)).output(cell(KEY_CAP, lock.clone(), None)).output_data(Bytes::new().pack());
    }
    for (lock, cap) in finish.paid {
        tx = tx.output(cell(cap, lock, None)).output_data(Bytes::new().pack());
    }
    lobby.finish(context, tx)
}

/// The relay sends the finish alone: nobody else is online.
fn relay_finish(context: &mut Context, lobby: &Lobby, cars: usize, record: Vec<u8>, results: &[u8]) -> TransactionView {
    let paid = pays(lobby, &results[..cars]);
    let finish = Finish { seats: cars as u8, map: HARBOUR, cars, record: Some(record), signers: vec![lobby.relay.clone()], paid };
    finish_tx(context, lobby, finish)
}

fn winner_of(results: &[u8]) -> usize {
    results.iter().position(|result| *result == FINISHED).expect("someone finished")
}

#[test]
fn the_relay_alone_pays_the_winner_from_signed_moves() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false]);
    let tx = relay_finish(&mut context, &lobby, 2, record, &results);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("2-car finish");
    println!("finish a 2-car match: {cycles} cycles");
}

#[test]
fn five_cars_race_and_the_relay_settles_it() {
    for map in 0..3u8 {
        let mut context = Context::default();
        let lobby = Lobby::new(&mut context);
        // One car never leaves the grid, so the race runs the whole two minutes: the most it costs.
        let (record, results) = raced(&lobby, map, &[false, false, false, true, false]);
        let paid = pays(&lobby, &results[..5]);
        let bytes = record.len();
        let finish = Finish { seats: 5, map, cars: 5, record: Some(record), signers: vec![lobby.relay.clone()], paid };
        let tx = finish_tx(&mut context, &lobby, finish);
        let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("5-car finish");
        println!("map {map}: finish a 5-car match, {bytes} record bytes, results {:x?}: {cycles} cycles", &results[..5]);
    }
}

#[test]
fn only_the_winners_moves_need_signing() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (moves, results) = race(HARBOUR, &[false, false, true]);
    let winner = winner_of(&results[..3]);
    let mut signatures = [[0; SIG_LEN]; 3];
    signatures[winner] = sign(&lobby, winner, &moves[winner]);
    let tx = relay_finish(&mut context, &lobby, 3, record(&moves, &signatures), &results);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("losers unsigned");
}

#[test]
fn the_relay_cannot_make_up_moves() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (moves, results) = race(HARBOUR, &[false, false, false]);
    let winner = winner_of(&results[..3]);
    let other = (winner + 1) % 3;
    let honest: Vec<_> = (0..3).map(|car| sign(&lobby, car, &moves[car])).collect();
    // The winner's moves unsigned, signed by someone else's key, or signed for another match.
    let mut unsigned = honest.clone();
    unsigned[winner] = [0; SIG_LEN];
    let mut wrong_key = honest.clone();
    wrong_key[winner] = sign(&lobby, other, &moves[winner]);
    let mut other_match = honest.clone();
    let elsewhere = Lobby { match_id: [0x6e; 32], ..Lobby::new(&mut context) };
    other_match[winner] = sign(&elsewhere, winner, &moves[winner]);
    for signatures in [unsigned, wrong_key, other_match] {
        let tx = relay_finish(&mut context, &lobby, 3, record(&moves, &signatures), &results);
        rejects_with(&context, &tx, ERR_AUTH);
    }
}

#[test]
fn a_finish_needs_the_relay_or_every_player() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false, true]);
    let winner = winner_of(&results[..3]);
    let paid = pays(&lobby, &results[..3]);
    for signers in [vec![], vec![lobby.keys[winner].clone()], vec![lobby.stranger.clone()]] {
        let tx = finish_tx(&mut context, &lobby, Finish { seats: 3, map: HARBOUR, cars: 3, record: Some(record.clone()), signers, paid: paid.clone() });
        rejects_with(&context, &tx, ERR_AUTH);
    }
}

#[test]
fn every_player_signing_needs_no_relay_or_signed_moves() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (moves, results) = race(HARBOUR, &[false, true, false]);
    let paid = pays(&lobby, &results[..3]);
    let signers = lobby.keys[..3].to_vec();
    let record = record(&moves, &[[0; SIG_LEN]; 3]);
    let tx = finish_tx(&mut context, &lobby, Finish { seats: 4, map: HARBOUR, cars: 3, record: Some(record), signers, paid });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("all sign");
}

#[test]
fn a_finish_paying_someone_who_did_not_win_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    // The host sat on the grid, but this finish pays them as if they had won.
    let (record, results) = raced(&lobby, HARBOUR, &[true, false, false]);
    let winner = winner_of(&results[..3]);
    let mut wrong = results;
    wrong[0] = FINISHED;
    wrong[winner] = 1 | FINISHED;
    let tx = relay_finish(&mut context, &lobby, 3, record, &wrong);
    rejects_with(&context, &tx, -3);
}

#[test]
fn if_nobody_finishes_every_entry_goes_back_on_the_relays_word() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (moves, results) = race(HARBOUR, &[true, true, true]);
    assert!(results[..3].iter().all(|result| result & FINISHED == 0));
    // Nobody can win, so the relay needs nobody's signature.
    let tx = relay_finish(&mut context, &lobby, 3, record(&moves, &[[0; SIG_LEN]; 3]), &results);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("refund all");
}

#[test]
fn the_car_in_front_wins_nothing_if_it_never_finished() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[true, true, true]);
    // Some car is in first place, ahead of the rest, but it never crossed the line.
    let front = results.iter().position(|result| *result == 0).unwrap();
    let mut wrong = [0u8; 3];
    wrong[front] = FINISHED;
    wrong[(front + 1) % 3] = 1 | FINISHED;
    wrong[(front + 2) % 3] = 1 | FINISHED;
    let tx = relay_finish(&mut context, &lobby, 3, record, &wrong);
    rejects_with(&context, &tx, -3);
}

#[test]
fn an_old_or_broken_record_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false]);
    let mut old = record.clone();
    old[0] = 1;
    let mut short = record.clone();
    short.pop();
    let mut long = record.clone();
    long.push(0);
    for broken in [old, short, long] {
        let tx = relay_finish(&mut context, &lobby, 2, broken, &results);
        rejects_with(&context, &tx, ERR_RUN);
    }
}

#[test]
fn a_record_for_other_cars_than_the_seats_spent_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false]);
    let paid = pays(&lobby, &results[..2]);
    let tx = finish_tx(&mut context, &lobby, Finish { seats: 3, map: HARBOUR, cars: 3, record: Some(record), signers: vec![lobby.relay.clone()], paid });
    rejects_with(&context, &tx, ERR_RUN);
}

#[test]
fn more_cars_than_the_host_allowed_are_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false, false]);
    let paid = pays(&lobby, &results[..3]);
    let tx = finish_tx(&mut context, &lobby, Finish { seats: 2, map: HARBOUR, cars: 3, record: Some(record), signers: vec![lobby.relay.clone()], paid });
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_map_the_game_does_not_have_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, results) = raced(&lobby, HARBOUR, &[false, false]);
    let paid = pays(&lobby, &results[..2]);
    let tx = finish_tx(&mut context, &lobby, Finish { seats: 2, map: 9, cars: 2, record: Some(record), signers: vec![lobby.relay.clone()], paid });
    rejects_with(&context, &tx, ERR_RUN);
}

#[test]
fn a_host_alone_cannot_race_themself() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let (record, _) = raced(&lobby, HARBOUR, &[false]);
    let paid = vec![(lobby.players[0].clone(), STORAGE + ENTRY - MAX_TX_FEE)];
    let tx = finish_tx(&mut context, &lobby, Finish { seats: 2, map: HARBOUR, cars: 1, record: Some(record), signers: vec![lobby.relay.clone()], paid });
    rejects_with(&context, &tx, -17);
}

// ---------------------------------------------------------------- close and leave

fn close_tx(context: &mut Context, lobby: &Lobby, since: u64, signer: Option<Script>, with_seat: bool, to: &Script) -> TransactionView {
    close_with(context, lobby, lobby.match_data(4, HARBOUR), since, signer, with_seat, to)
}

fn close_with(context: &mut Context, lobby: &Lobby, data: Vec<u8>, since: u64, signer: Option<Script>, with_seat: bool, to: &Script) -> TransactionView {
    let live = lobby.place_match(context, &data);
    let mut tx = TransactionBuilder::default().input(input(live, since));
    if with_seat {
        let seat = lobby.place_seat(context, 1);
        tx = tx.input(input(seat, waited(HOLD_MS))).output(cell(STORAGE + ENTRY - MAX_TX_FEE, lobby.players[1].clone(), None)).output_data(Bytes::new().pack());
    }
    if let Some(lock) = signer {
        let key = lobby.wallet(context, &lock, KEY_CAP);
        tx = tx.input(input(key, 0)).output(cell(KEY_CAP, lock, None)).output_data(Bytes::new().pack());
    }
    tx = tx.output(cell(STORAGE + ENTRY - MAX_TX_FEE, to.clone(), None)).output_data(Bytes::new().pack());
    lobby.finish(context, tx)
}

#[test]
fn the_relay_closes_a_lobby_nobody_joined_and_the_host_is_refunded() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    let tx = close_tx(&mut context, &lobby, 0, Some(lobby.relay.clone()), false, &host);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("relay closes");
}

#[test]
fn after_a_whole_match_anyone_can_send_the_host_home() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    let tx = close_tx(&mut context, &lobby, waited(HOLD_MS), None, false, &host);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("timeout close");
}

#[test]
fn nobody_sends_the_host_home_while_the_lobby_may_still_wait() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    // Ten minutes was a whole match before the wait; with a half-hour lobby it is far too soon.
    let tx = close_tx(&mut context, &lobby, waited(MATCH_MS), None, false, &host);
    rejects_with(&context, &tx, -10);
    let tx = close_tx(&mut context, &lobby, waited(HOLD_MS - 60_000), None, false, &host);
    rejects_with(&context, &tx, -10);
}

#[test]
fn a_match_opened_before_the_wait_goes_home_after_ten_minutes() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    let tx = close_with(&mut context, &lobby, lobby.match_data_v1(4, HARBOUR), waited(MATCH_MS), None, false, &host);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("old timeout close");
}

#[test]
fn the_host_cannot_close_early_alone() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    let tx = close_tx(&mut context, &lobby, waited(HOLD_MS - 60_000), Some(lobby.players[0].clone()), false, &host);
    rejects_with(&context, &tx, -10);
}

#[test]
fn a_close_paying_someone_else_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let stranger = lobby.stranger.clone();
    let tx = close_tx(&mut context, &lobby, waited(HOLD_MS), None, false, &stranger);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_close_cannot_take_a_seat_with_it() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let host = lobby.players[0].clone();
    let tx = close_tx(&mut context, &lobby, waited(HOLD_MS), Some(lobby.relay.clone()), true, &host);
    rejects_with(&context, &tx, -17);
}

fn leave_tx(context: &mut Context, lobby: &Lobby, since: u64, to: &Script) -> TransactionView {
    let seats = [lobby.place_seat(context, 1), lobby.place_seat(context, 2)];
    leave_seats(context, lobby, seats, since, to)
}

fn leave_seats(context: &mut Context, lobby: &Lobby, seats: [OutPoint; 2], since: u64, to: &Script) -> TransactionView {
    let tx = TransactionBuilder::default()
        .input(input(seats[0].clone(), since))
        .input(input(seats[1].clone(), since))
        .output(cell(STORAGE + ENTRY - MAX_TX_FEE, to.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(STORAGE + ENTRY - MAX_TX_FEE, lobby.players[2].clone(), None))
        .output_data(Bytes::new().pack());
    lobby.finish(context, tx)
}

#[test]
fn seats_that_never_raced_go_home_after_a_whole_match() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let owner = lobby.players[1].clone();
    let tx = leave_tx(&mut context, &lobby, waited(HOLD_MS), &owner);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("seats leave");
}

#[test]
fn seats_from_before_the_wait_go_home_after_ten_minutes() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let owner = lobby.players[1].clone();
    let seats = [lobby.place_seat_with(&mut context, lobby.seat_data_v1(1)), lobby.place_seat_with(&mut context, lobby.seat_data_v1(2))];
    let tx = leave_seats(&mut context, &lobby, seats, waited(MATCH_MS), &owner);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("old seats leave");
}

#[test]
fn a_seat_cannot_leave_while_its_match_may_still_be_racing() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let owner = lobby.players[1].clone();
    let tx = leave_tx(&mut context, &lobby, waited(HOLD_MS - 60_000), &owner);
    rejects_with(&context, &tx, -10);
    // A match's worth of time alone isn't enough: the lobby may still be waiting.
    let tx = leave_tx(&mut context, &lobby, waited(MATCH_MS), &owner);
    rejects_with(&context, &tx, -10);
}

#[test]
fn a_seat_leaving_to_someone_else_is_rejected() {
    let mut context = Context::default();
    let lobby = Lobby::new(&mut context);
    let stranger = lobby.stranger.clone();
    let tx = leave_tx(&mut context, &lobby, waited(HOLD_MS), &stranger);
    rejects_with(&context, &tx, -3);
}
