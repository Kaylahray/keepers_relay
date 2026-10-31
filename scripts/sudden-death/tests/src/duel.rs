//! duel-type: two stakes in escrow, an artillery duel or a lane race, the chain as referee.
//!
//! Locks here are always-success with distinct args, so each test controls exactly which players'
//! cells (and so which signatures) a transaction carries. What is checked is that duel-type demands
//! the right ones, not CKB's own signature check.

use super::replay::bot_laps;
use super::{verify_and_dump_failed_tx, Loader};
use blake2b_ref::Blake2bBuilder;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{HeaderBuilder, ScriptHashType, TransactionBuilder, TransactionView},
        packed::{Byte32, CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};
use crowns_artillery_core::{Shot, State, Winner};
use crowns_game_core::{replay_laps, Lap};

const MAX_CYCLES: u64 = 70_000_000;
const PROXY_BIN: &[u8] = include_bytes!("../bin/input-type-proxy-lock");
const CKB: u64 = 100_000_000;
const STAKE: u64 = 10 * CKB;
const MAX_TX_FEE: u64 = 10_000_000;
const TURN_MS: u64 = 60_000;
const RACE_MS: u64 = 20 * 60 * 1000;
const LAP_WINDOW_MS: u64 = 3 * 60 * 1000;
const LAPS: usize = 5;
/// The duel cell's capacity: room for its largest data and scripts, plus the challenger's stake.
const DUEL_CAP: u64 = 600 * CKB;
const ACCEPT_MS: u64 = 1_700_000_000_000;

const KIND_ARTILLERY: u8 = 1;
const KIND_RACE: u8 = 2;
const OPEN: u8 = 0;
const LIVE: u8 = 1;
const OFF_STATUS: usize = 2;
const OFF_STAKE: usize = 3;
const OFF_TIMER: usize = 11;
const OFF_OPPONENT: usize = 51;
const OFF_SEED_BLOCK: usize = 179;
const OFF_SHOT_COUNT: usize = 211;
const OFF_SCORES: usize = 179;
const OFF_SUBMITTED: usize = 195;

const SINCE_RELATIVE_TIMESTAMP: u64 = 0xC000_0000_0000_0000;

fn blake(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32).personal(b"ckb-default-hash").build();
    for part in parts {
        hasher.update(part);
    }
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn hash_of(script: &Script) -> [u8; 32] {
    script.calc_script_hash().as_slice().try_into().unwrap()
}

fn data_hash(bin: &Bytes) -> [u8; 32] {
    CellOutput::calc_data_hash(bin).as_slice().try_into().unwrap()
}

fn block_at(ms: u64) -> [u8; 32] {
    HeaderBuilder::default().timestamp(ms).build().hash().as_slice().try_into().unwrap()
}

fn land(context: &mut Context, out_point: &OutPoint, ms: u64) {
    let header = HeaderBuilder::default().timestamp(ms).build();
    let hash = header.hash();
    context.insert_header(header);
    context.link_cell_with_block(out_point.clone(), hash, 0);
}

fn cell(cap: u64, lock: Script, type_script: Option<Script>) -> CellOutput {
    CellOutput::new_builder().capacity(cap).lock(lock).type_(type_script.pack()).build()
}

fn input(out_point: OutPoint, since: u64) -> CellInput {
    CellInput::new_builder().previous_output(out_point).since(since).build()
}

fn witness(input_type: Option<Vec<u8>>) -> Bytes {
    WitnessArgs::new_builder().input_type(input_type.map(Bytes::from).pack()).build().as_bytes()
}

fn rejects_with(context: &Context, tx: &TransactionView, code: i8) {
    let err = context.verify_tx(tx, MAX_CYCLES).expect_err("transaction should be rejected");
    let text = format!("{err:?}");
    assert!(text.contains(&format!("error code {code} on")), "expected error {code}, got {text}");
}

fn wind_of(duel_id: &[u8; 32], block: &[u8; 32]) -> i32 {
    let digest = blake(&[&b"crowns/duel-wind/v1"[..], duel_id, block]);
    (u32::from_le_bytes(digest[..4].try_into().unwrap()) % 21) as i32 - 10
}

fn seed_of(duel_id: &[u8; 32], block: &[u8; 32]) -> u32 {
    u32::from_le_bytes(blake(&[&b"crowns/duel/v1"[..], duel_id, block])[..4].try_into().unwrap())
}

fn run_seed(duel_id: &[u8; 32], owner: &[u8; 32], block: &[u8; 32]) -> u64 {
    u64::from_le_bytes(blake(&[&b"crowns/run-seed/v2"[..], duel_id, owner, block])[..8].try_into().unwrap())
}

fn fold_lap(chain: &[u8; 32], block: &[u8; 32], moves: &[u8]) -> [u8; 32] {
    blake(&[&b"crowns/lap/v1"[..], chain, block, &blake(&[moves])])
}

/// Everyone in a duel test: the scripts, the two players, their key cells, and a stranger.
struct Arena {
    duel_out: OutPoint,
    deps: Vec<CellDep>,
    proxy_out: OutPoint,
    artillery: [u8; 32],
    lane: [u8; 32],
    challenger: Script,
    opponent: Script,
    stranger: Script,
    key0: Script,
    key1: Script,
    duel_id: [u8; 32],
}

impl Arena {
    fn new(context: &mut Context) -> Self {
        let duel_bin = Loader::default().load_binary("duel-type");
        let artillery_bin = Loader::default().load_binary("artillery");
        let lane_bin = Loader::default().load_binary("lane-runner");
        let artillery = data_hash(&artillery_bin);
        let lane = data_hash(&lane_bin);
        let duel_out = context.deploy_cell(duel_bin);
        let artillery_out = context.deploy_cell(artillery_bin);
        let lane_out = context.deploy_cell(lane_bin);
        let proxy_out = context.deploy_cell(Bytes::from(PROXY_BIN.to_vec()));
        let always_out = context.deploy_cell(ALWAYS_SUCCESS.clone());
        let lock = |context: &mut Context, arg: u8| context.build_script(&always_out, Bytes::from(vec![arg])).expect("lock");
        let deps = [&duel_out, &artillery_out, &lane_out, &proxy_out, &always_out]
            .iter()
            .map(|out| CellDep::new_builder().out_point((*out).clone()).build())
            .collect();
        Arena {
            challenger: lock(context, 0x01),
            opponent: lock(context, 0x02),
            stranger: lock(context, 0x09),
            key0: lock(context, 0x10),
            key1: lock(context, 0x11),
            duel_out,
            deps,
            proxy_out,
            artillery,
            lane,
            duel_id: [0x7d; 32],
        }
    }

    fn duel_type(&self, context: &mut Context, args: &[u8]) -> Script {
        context
            .build_script_with_hash_type(&self.duel_out, ScriptHashType::Data2, Bytes::from(args.to_vec()))
            .expect("duel type")
    }

    fn duel_script(&self, context: &mut Context) -> Script {
        self.duel_type(context, &self.duel_id.clone())
    }

    fn guard(&self, context: &mut Context, duel: &Script) -> Script {
        context
            .build_script_with_hash_type(&self.proxy_out, ScriptHashType::Data1, Bytes::from(hash_of(duel).to_vec()))
            .expect("proxy lock")
    }

    fn racer_type(&self, context: &mut Context, side: u8) -> Script {
        let mut args = self.duel_id.to_vec();
        args.push(side);
        self.duel_type(context, &args)
    }

    /// Duel data before any move: header, then the kind's zeroed tail.
    fn data(&self, kind: u8, status: u8, opponent: Option<&Script>, key1: Option<&Script>) -> Vec<u8> {
        let mut raw = vec![1u8, kind, status];
        raw.extend_from_slice(&STAKE.to_le_bytes());
        raw.extend_from_slice(&(if kind == KIND_RACE { RACE_MS } else { TURN_MS }).to_le_bytes());
        raw.extend_from_slice(&hash_of(&self.challenger));
        raw.extend_from_slice(&opponent.map(hash_of).unwrap_or([0u8; 32]));
        raw.extend_from_slice(&hash_of(&self.key0));
        raw.extend_from_slice(&key1.map(hash_of).unwrap_or([0u8; 32]));
        raw.extend_from_slice(if kind == KIND_RACE { &self.lane } else { &self.artillery });
        raw.extend(std::iter::repeat(0u8).take(if kind == KIND_RACE { 17 } else { 33 }));
        raw
    }

    fn live_data(&self, kind: u8) -> Vec<u8> {
        self.data(kind, LIVE, Some(&self.opponent.clone()), Some(&self.key1.clone()))
    }

    /// A duel cell holding `data`, landed at `ms`.
    fn place(&self, context: &mut Context, data: &[u8], cap: u64, ms: u64) -> OutPoint {
        let duel = self.duel_script(context);
        let guard = self.guard(context, &duel);
        let out = context.create_cell(cell(cap, guard, Some(duel)), Bytes::from(data.to_vec()));
        land(context, &out, ms);
        out
    }

    /// A cell from `lock`'s wallet: the signature a step needs.
    fn wallet(&self, context: &mut Context, lock: &Script, cap: u64) -> OutPoint {
        context.create_cell(cell(cap, lock.clone(), None), Bytes::new())
    }

    /// Adds the scripts and the block of every input and of `extra` cells to the transaction.
    fn finish(&self, context: &mut Context, tx: ckb_testtool::ckb_types::core::TransactionBuilder, extra: &[OutPoint]) -> TransactionView {
        let mut tx = tx;
        for dep in &self.deps {
            tx = tx.cell_dep(dep.clone());
        }
        let built = tx.build();
        let mut headers: Vec<Byte32> = Vec::new();
        let points: Vec<OutPoint> = built.inputs().into_iter().map(|i| i.previous_output()).chain(extra.iter().cloned()).collect();
        for point in points {
            if let Some(info) = context.transaction_infos.get(&point) {
                if !headers.contains(&info.block_hash) {
                    headers.push(info.block_hash.clone());
                }
            }
        }
        let mut tx = built.as_advanced_builder();
        for hash in headers {
            tx = tx.header_dep(hash);
        }
        context.complete_tx(tx.build())
    }
}

// ---------------------------------------------------------------- open, cancel, accept

fn open_tx(context: &mut Context, arena: &Arena, cap: u64, mutate: impl Fn(&mut Vec<u8>)) -> TransactionView {
    let fund = arena.wallet(context, &arena.challenger, cap + 100 * CKB);
    let first = input(fund, 0);
    let mut hasher = Blake2bBuilder::new(32).personal(b"ckb-default-hash").build();
    hasher.update(first.as_slice());
    hasher.update(&0u64.to_le_bytes());
    let mut duel_id = [0u8; 32];
    hasher.finalize(&mut duel_id);
    let duel = arena.duel_type(context, &duel_id);
    let guard = arena.guard(context, &duel);
    let mut data = arena.data(KIND_ARTILLERY, OPEN, Some(&arena.opponent.clone()), None);
    mutate(&mut data);
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(cap, guard, Some(duel)))
        .output_data(Bytes::from(data).pack());
    arena.finish(context, tx, &[])
}

#[test]
fn a_challenge_opens_with_the_stake_locked() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = open_tx(&mut context, &arena, DUEL_CAP, |_| {});
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("open");
    println!("open a duel: {cycles} cycles");
}

#[test]
fn a_challenge_without_room_for_every_shot_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // Enough for the stake and the empty cell, not for thirty shots of data.
    let tx = open_tx(&mut context, &arena, STAKE + 300 * CKB, |_| {});
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_challenge_that_opens_already_live_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = open_tx(&mut context, &arena, DUEL_CAP, |data| data[OFF_STATUS] = LIVE);
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_challenge_against_yourself_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let me = hash_of(&arena.challenger);
    let tx = open_tx(&mut context, &arena, DUEL_CAP, |data| data[OFF_OPPONENT..OFF_OPPONENT + 32].copy_from_slice(&me));
    rejects_with(&context, &tx, -17);
}

fn cancel_tx(context: &mut Context, arena: &Arena, signer: &Script) -> TransactionView {
    let data = arena.data(KIND_ARTILLERY, OPEN, Some(&arena.opponent.clone()), None);
    let duel = arena.place(context, &data, DUEL_CAP, ACCEPT_MS);
    let wallet = arena.wallet(context, signer, 100 * CKB);
    let tx = TransactionBuilder::default()
        .input(input(duel, 0))
        .input(input(wallet, 0))
        .output(cell(DUEL_CAP, signer.clone(), None))
        .output_data(Bytes::new().pack());
    arena.finish(context, tx, &[])
}

#[test]
fn the_challenger_can_cancel_before_anyone_accepts() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let challenger = arena.challenger.clone();
    let tx = cancel_tx(&mut context, &arena, &challenger);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("cancel");
}

#[test]
fn a_stranger_cannot_cancel_a_challenge() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let stranger = arena.stranger.clone();
    let tx = cancel_tx(&mut context, &arena, &stranger);
    rejects_with(&context, &tx, -18);
}

struct Accept {
    signer: u8,
    added: u64,
    named: bool,
    taker: u8,
    stake_field: u64,
}

impl Accept {
    fn honest() -> Self {
        Accept { signer: 0x02, added: STAKE, named: true, taker: 0x02, stake_field: STAKE }
    }
}

fn accept_tx(context: &mut Context, arena: &Arena, accept: Accept) -> TransactionView {
    let named = if accept.named { Some(arena.opponent.clone()) } else { None };
    let data = arena.data(KIND_ARTILLERY, OPEN, named.as_ref(), None);
    let duel_in = arena.place(context, &data, DUEL_CAP, ACCEPT_MS - 60_000);
    let signer = if accept.signer == 0x02 { arena.opponent.clone() } else { arena.stranger.clone() };
    let taker = if accept.taker == 0x02 { arena.opponent.clone() } else { arena.stranger.clone() };
    let wallet = arena.wallet(context, &signer, STAKE + 100 * CKB);
    let mut out = arena.data(KIND_ARTILLERY, LIVE, Some(&taker), Some(&arena.key1.clone()));
    out[OFF_STAKE..OFF_STAKE + 8].copy_from_slice(&accept.stake_field.to_le_bytes());
    let duel = arena.duel_script(context);
    let guard = arena.guard(context, &duel);
    let tx = TransactionBuilder::default()
        .input(input(duel_in, 0))
        .input(input(wallet, 0))
        .output(cell(DUEL_CAP + accept.added, guard, Some(duel)))
        .output_data(Bytes::from(out).pack());
    arena.finish(context, tx, &[])
}

#[test]
fn the_named_opponent_accepts_with_their_stake() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept::honest());
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("accept");
}

#[test]
fn an_open_challenge_can_be_accepted_by_anyone_who_signs() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept { named: false, signer: 0x09, taker: 0x09, ..Accept::honest() });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("open accept");
}

#[test]
fn an_accept_the_opponent_did_not_sign_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept { signer: 0x09, ..Accept::honest() });
    rejects_with(&context, &tx, -18);
}

#[test]
fn someone_else_cannot_take_a_named_challenge() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept { signer: 0x09, taker: 0x09, ..Accept::honest() });
    rejects_with(&context, &tx, -17);
}

#[test]
fn an_accept_short_of_the_stake_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept { added: STAKE - 1, ..Accept::honest() });
    rejects_with(&context, &tx, -3);
}

#[test]
fn an_accept_that_changes_the_stake_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = accept_tx(&mut context, &arena, Accept { stake_field: 1, added: 1, ..Accept::honest() });
    rejects_with(&context, &tx, -11);
}

// ---------------------------------------------------------------- artillery moves

/// A live artillery duel with `shots` already played, the cell last landed at `landed_ms`.
fn artillery_data(arena: &Arena, seed_block: &[u8; 32], shots: &[[u8; 3]]) -> Vec<u8> {
    let mut data = arena.live_data(KIND_ARTILLERY);
    if !shots.is_empty() {
        data[OFF_SEED_BLOCK..OFF_SEED_BLOCK + 32].copy_from_slice(seed_block);
    }
    data[OFF_SHOT_COUNT] = shots.len() as u8;
    for shot in shots {
        data.extend_from_slice(shot);
    }
    data
}

struct Move {
    shots_before: Vec<[u8; 3]>,
    landed_ms: u64,
    shot: [u8; 3],
    /// Which key cell signs: 0 the challenger's, 1 the opponent's.
    key: u8,
    linked: bool,
    tamper_earlier: bool,
}

fn move_tx(context: &mut Context, arena: &Arena, mv: Move) -> TransactionView {
    let seed_block = block_at(ACCEPT_MS);
    let before = artillery_data(arena, &seed_block, &mv.shots_before);
    let duel = arena.duel_script(context);
    let guard = arena.guard(context, &duel);
    let duel_in = context.create_cell(cell(DUEL_CAP + STAKE, guard.clone(), Some(duel.clone())), Bytes::from(before));
    if mv.linked {
        land(context, &duel_in, mv.landed_ms);
    }
    let mut shots = mv.shots_before.clone();
    shots.push(mv.shot);
    if mv.tamper_earlier {
        shots[0][1] = shots[0][1].wrapping_add(1);
    }
    let after = artillery_data(arena, &seed_block, &shots);
    let key = if mv.key == 0 { arena.key0.clone() } else { arena.key1.clone() };
    let key_in = arena.wallet(context, &key, 62 * CKB);
    let tx = TransactionBuilder::default()
        .input(input(duel_in, 0))
        .input(input(key_in, 0))
        .output(cell(DUEL_CAP + STAKE, guard, Some(duel)))
        .output_data(Bytes::from(after).pack())
        .output(cell(62 * CKB - 1_000, key, None))
        .output_data(Bytes::new().pack());
    arena.finish(context, tx, &[])
}

/// The first shot of a duel: the challenger fires in the wind the accept's block gives.
fn first_move(arena: &Arena) -> Move {
    let wind = wind_of(&arena.duel_id, &block_at(ACCEPT_MS));
    Move { shots_before: vec![], landed_ms: ACCEPT_MS, shot: [45, 70, wind as i8 as u8], key: 0, linked: true, tamper_earlier: false }
}

#[test]
fn the_challenger_fires_first_without_a_wallet_popup() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let mv = first_move(&arena);
    let tx = move_tx(&mut context, &arena, mv);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("first shot");
    println!("one artillery shot: {cycles} cycles");
}

#[test]
fn the_second_shot_is_the_opponents_in_the_next_blocks_wind() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let landed = ACCEPT_MS + 20_000;
    let wind = wind_of(&arena.duel_id, &block_at(landed));
    let tx = move_tx(
        &mut context,
        &arena,
        Move { shots_before: vec![[45, 70, 0]], landed_ms: landed, shot: [135, 60, wind as i8 as u8], key: 1, ..first_move(&arena) },
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("second shot");
}

#[test]
fn a_shot_claiming_another_wind_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let mut mv = first_move(&arena);
    mv.shot[2] = (wind_of(&arena.duel_id, &block_at(ACCEPT_MS)) + 1).clamp(-10, 10) as i8 as u8;
    if mv.shot[2] as i8 as i32 == wind_of(&arena.duel_id, &block_at(ACCEPT_MS)) {
        mv.shot[2] = (mv.shot[2] as i8 - 2) as u8;
    }
    let tx = move_tx(&mut context, &arena, mv);
    rejects_with(&context, &tx, -17);
}

#[test]
fn firing_out_of_turn_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = move_tx(&mut context, &arena, Move { key: 1, ..first_move(&arena) });
    rejects_with(&context, &tx, -18);
}

#[test]
fn rewriting_an_earlier_shot_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let landed = ACCEPT_MS + 20_000;
    let wind = wind_of(&arena.duel_id, &block_at(landed));
    let tx = move_tx(
        &mut context,
        &arena,
        // Two shots in: the first one is rewritten.
        Move {
            shots_before: vec![[45, 70, 0], [135, 60, 0]],
            landed_ms: landed,
            shot: [45, 60, wind as i8 as u8],
            key: 0,
            tamper_earlier: true,
            ..first_move(&arena)
        },
    );
    rejects_with(&context, &tx, -11);
}

#[test]
fn a_shot_past_the_angle_limit_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let mut mv = first_move(&arena);
    mv.shot[0] = 181;
    let tx = move_tx(&mut context, &arena, mv);
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_shot_without_the_last_block_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = move_tx(&mut context, &arena, Move { linked: false, ..first_move(&arena) });
    rejects_with(&context, &tx, -14);
}

// ---------------------------------------------------------------- artillery finish

/// A whole duel as the chain would see it: each shot fired in the wind of a fresh block. The
/// challenger aims for the best hit it can find; the opponent's shots are given by `opponent_aim`.
fn played_duel(arena: &Arena, opponent_aim: impl Fn(u32) -> (i32, i32), challenger_tries: bool) -> (Vec<[u8; 3]>, Option<Winner>) {
    let seed_block = block_at(ACCEPT_MS);
    let mut state = State::new(seed_of(&arena.duel_id, &seed_block));
    let mut shots = Vec::new();
    while state.winner.is_none() {
        let turn = state.turn;
        let block = block_at(ACCEPT_MS + turn as u64 * 20_000);
        let wind = wind_of(&arena.duel_id, &block);
        let (angle, power) = if turn % 2 == 0 && challenger_tries {
            let mut best = (45, 50, -1);
            for angle in (5..90).step_by(2) {
                for power in (20..=100).step_by(2) {
                    let mut probe = state.clone();
                    let outcome = probe.fire(Shot { angle, power, wind }).unwrap();
                    if outcome.damage[1] - outcome.damage[0] > best.2 {
                        best = (angle, power, outcome.damage[1] - outcome.damage[0]);
                    }
                }
            }
            (best.0, best.1)
        } else if turn % 2 == 0 {
            // Steeply out over the left edge of the field.
            (120, 100)
        } else {
            opponent_aim(turn)
        };
        state.fire(Shot { angle, power, wind }).unwrap();
        shots.push([angle as u8, power as u8, wind as i8 as u8]);
    }
    (shots, state.winner)
}

fn finish_tx(context: &mut Context, arena: &Arena, shots: &[[u8; 3]], since: u64, paid: &[(Script, u64)]) -> TransactionView {
    let data = artillery_data(arena, &block_at(ACCEPT_MS), shots);
    let duel_in = arena.place(context, &data, DUEL_CAP + STAKE, ACCEPT_MS + shots.len() as u64 * 20_000);
    let mut tx = TransactionBuilder::default().input(input(duel_in, since));
    for (lock, cap) in paid {
        tx = tx.output(cell(*cap, lock.clone(), None)).output_data(Bytes::new().pack());
    }
    arena.finish(context, tx, &[])
}

#[test]
fn a_won_duel_pays_the_winner_both_stakes() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // The opponent fires away from the fight; the challenger hunts them down.
    let (shots, winner) = played_duel(&arena, |_| (10, 100), true);
    assert_eq!(winner, Some(Winner::Side(0)), "the challenger should win this duel");
    let total = DUEL_CAP + STAKE;
    let tx = finish_tx(&mut context, &arena, &shots, 0, &[(arena.challenger.clone(), total - MAX_TX_FEE)]);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("finish");
    println!("finish a {}-shot duel (replayed on chain): {cycles} cycles", shots.len());
}

#[test]
fn a_finish_paying_the_loser_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let (shots, _) = played_duel(&arena, |_| (10, 100), true);
    let total = DUEL_CAP + STAKE;
    let tx = finish_tx(&mut context, &arena, &shots, 0, &[(arena.opponent.clone(), total - MAX_TX_FEE)]);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_duel_where_nobody_lands_a_hit_is_a_draw() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // Both sides fire steeply out over their own edge of the field.
    let (shots, winner) = played_duel(&arena, |_| (60, 100), false);
    assert_eq!(winner, Some(Winner::Draw));
    assert_eq!(shots.len(), 30);
    let total = DUEL_CAP + STAKE;
    let tx = finish_tx(
        &mut context,
        &arena,
        &shots,
        0,
        &[(arena.challenger.clone(), total - STAKE - MAX_TX_FEE), (arena.opponent.clone(), STAKE)],
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("draw");
}

#[test]
fn an_unfinished_duel_cannot_be_ended_even_when_a_turn_has_run_out() {
    // A turn left to run out is skipped, not lost: only the game itself ends a duel.
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let since = SINCE_RELATIVE_TIMESTAMP | (TURN_MS / 1000);
    let tx = finish_tx(&mut context, &arena, &[[45, 70, 0]], since, &[(arena.challenger.clone(), DUEL_CAP + STAKE - MAX_TX_FEE)]);
    rejects_with(&context, &tx, -10);
}

#[test]
fn a_duel_played_out_by_skips_ends_level_as_a_draw() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let total = DUEL_CAP + STAKE;
    let tx = finish_tx(
        &mut context,
        &arena,
        &[PASS; 30],
        0,
        &[(arena.challenger.clone(), total - STAKE - MAX_TX_FEE), (arena.opponent.clone(), STAKE)],
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("thirty skipped turns");
}

// ---------------------------------------------------------------- skipped turns

/// A skipped turn as the duel records it.
const PASS: [u8; 3] = [255, 0, 0];

/// Someone (a stranger here, paying the fee from their own cell) adds `added` to a duel with `shots`
/// played under `timer`, the duel cell having waited `since` since it landed.
/// A block stamped `since` (a relative-timestamp value, in seconds) after `landed_ms`, named in a
/// transaction to show that much time has passed. None for 0: no clock block at all.
fn clock_after(context: &mut Context, landed_ms: u64, since: u64) -> Option<Byte32> {
    if since == 0 {
        return None;
    }
    let header = HeaderBuilder::default().timestamp(landed_ms + (since & 0x00ff_ffff_ffff_ffff) * 1000).build();
    let hash = header.hash();
    context.insert_header(header);
    Some(hash)
}

fn skip_tx(context: &mut Context, arena: &Arena, shots: &[[u8; 3]], timer: u64, added: &[[u8; 3]], since: u64) -> TransactionView {
    let seed_block = block_at(ACCEPT_MS);
    let mut before = artillery_data(arena, &seed_block, shots);
    before[OFF_TIMER..OFF_TIMER + 8].copy_from_slice(&timer.to_le_bytes());
    let mut all = shots.to_vec();
    all.extend_from_slice(added);
    let mut after = artillery_data(arena, &seed_block, &all);
    after[OFF_TIMER..OFF_TIMER + 8].copy_from_slice(&timer.to_le_bytes());
    let duel = arena.duel_script(context);
    let guard = arena.guard(context, &duel);
    let duel_in = arena.place(context, &before, DUEL_CAP + STAKE, ACCEPT_MS);
    let fund = arena.wallet(context, &arena.stranger, 100 * CKB);
    let mut tx = TransactionBuilder::default()
        .input(input(duel_in, 0))
        .input(input(fund, 0))
        .output(cell(DUEL_CAP + STAKE, guard, Some(duel)))
        .output_data(Bytes::from(after).pack())
        .output(cell(100 * CKB - 1_000, arena.stranger.clone(), None))
        .output_data(Bytes::new().pack());
    // The time is shown by naming a block stamped that long after the duel landed.
    if let Some(clock) = clock_after(context, ACCEPT_MS, since) {
        tx = tx.header_dep(clock);
    }
    arena.finish(context, tx, &[])
}

#[test]
fn a_turn_left_to_run_out_is_skipped_by_anyone_without_a_key() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // One shot fired; the opponent let their whole turn pass. A stranger passes it for them.
    let tx = skip_tx(&mut context, &arena, &[[45, 70, 0]], TURN_MS, &[PASS], SINCE_RELATIVE_TIMESTAMP | (TURN_MS / 1000));
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("skip");
    println!("skip a turn: {cycles} cycles");
}

#[test]
fn a_turn_cannot_be_skipped_before_its_time() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = skip_tx(&mut context, &arena, &[[45, 70, 0]], TURN_MS, &[PASS], SINCE_RELATIVE_TIMESTAMP | (TURN_MS / 1000 - 1));
    rejects_with(&context, &tx, -10);
}

#[test]
fn a_challenger_who_never_starts_is_skipped() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // The first skip also records the accept's block, which seeds the hills.
    let tx = skip_tx(&mut context, &arena, &[], TURN_MS, &[PASS], SINCE_RELATIVE_TIMESTAMP | (TURN_MS / 1000));
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("first turn skipped");
}

#[test]
fn several_overdue_turns_pass_at_once() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let three = SINCE_RELATIVE_TIMESTAMP | (3 * TURN_MS / 1000);
    let tx = skip_tx(&mut context, &arena, &[[45, 70, 0]], TURN_MS, &[PASS; 3], three);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("three skips");
    let early = skip_tx(&mut context, &arena, &[[45, 70, 0]], TURN_MS, &[PASS; 3], three - 1);
    rejects_with(&context, &early, -10);
}

#[test]
fn a_skip_cannot_slip_in_a_shot() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = skip_tx(&mut context, &arena, &[[45, 70, 0]], TURN_MS, &[PASS, [45, 70, 0]], SINCE_RELATIVE_TIMESTAMP | 600);
    rejects_with(&context, &tx, -17);
}

// ---------------------------------------------------------------- pressure turns

/// A Pressure timer: the first turn's ms, and how much each later turn loses.
fn pressure(first_ms: u64, shrink_ms: u64) -> u64 {
    first_ms | (shrink_ms << 32)
}

/// Shots that fly off the field, so the duel is still on after them.
fn misses(count: usize) -> Vec<[u8; 3]> {
    vec![[60, 100, 0]; count]
}

#[test]
fn a_pressure_challenge_opens() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = open_tx(&mut context, &arena, DUEL_CAP, |data| {
        data[OFF_TIMER..OFF_TIMER + 8].copy_from_slice(&pressure(60_000, 10_000).to_le_bytes())
    });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("pressure open");
}

#[test]
fn a_pressure_challenge_starting_under_the_floor_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = open_tx(&mut context, &arena, DUEL_CAP, |data| {
        data[OFF_TIMER..OFF_TIMER + 8].copy_from_slice(&pressure(20_000, 5_000).to_le_bytes())
    });
    rejects_with(&context, &tx, -17);
}

#[test]
fn under_pressure_a_later_turn_runs_out_sooner() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // Three shots played: the fourth turn (the opponent's) has 60 - 3 × 10 = 30 seconds.
    let timer = pressure(60_000, 10_000);
    let tx = skip_tx(&mut context, &arena, &misses(3), timer, &[PASS], SINCE_RELATIVE_TIMESTAMP | 30);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("shrunk turn ran out");
    let early = skip_tx(&mut context, &arena, &misses(3), timer, &[PASS], SINCE_RELATIVE_TIMESTAMP | 29);
    rejects_with(&context, &early, -10);
}

#[test]
fn under_pressure_a_turn_never_drops_below_thirty_seconds() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // Ten shots in, 60 - 100 would be below zero: the turn still gets the 30-second floor.
    let timer = pressure(60_000, 10_000);
    let early = skip_tx(&mut context, &arena, &misses(10), timer, &[PASS], SINCE_RELATIVE_TIMESTAMP | 29);
    rejects_with(&context, &early, -10);
    let late = skip_tx(&mut context, &arena, &misses(10), timer, &[PASS], SINCE_RELATIVE_TIMESTAMP | 30);
    verify_and_dump_failed_tx(&context, &late, MAX_CYCLES).expect("floor turn ran out");
}

// ---------------------------------------------------------------- lane race

fn race_data(arena: &Arena, scores: [u64; 2], submitted: u8) -> Vec<u8> {
    let mut data = arena.live_data(KIND_RACE);
    data[OFF_SCORES..OFF_SCORES + 8].copy_from_slice(&scores[0].to_le_bytes());
    data[OFF_SCORES + 8..OFF_SCORES + 16].copy_from_slice(&scores[1].to_le_bytes());
    data[OFF_SUBMITTED] = submitted;
    data
}

fn racer_data(laps: u8, lap_start: u64, chain: &[u8; 32]) -> Vec<u8> {
    let mut raw = vec![1u8, laps];
    raw.extend_from_slice(&lap_start.to_le_bytes());
    raw.extend_from_slice(chain);
    raw
}

#[test]
fn a_race_challenge_opens_and_its_racer_cell_starts_empty() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let fund = arena.wallet(&mut context, &arena.challenger, DUEL_CAP + 400 * CKB);
    let first = input(fund, 0);
    let mut hasher = Blake2bBuilder::new(32).personal(b"ckb-default-hash").build();
    hasher.update(first.as_slice());
    hasher.update(&0u64.to_le_bytes());
    let mut duel_id = [0u8; 32];
    hasher.finalize(&mut duel_id);
    let duel = arena.duel_type(&mut context, &duel_id);
    let guard = arena.guard(&mut context, &duel);
    let mut racer_args = duel_id.to_vec();
    racer_args.push(0);
    let racer = arena.duel_type(&mut context, &racer_args);
    let data = arena.data(KIND_RACE, OPEN, Some(&arena.opponent.clone()), None);
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(DUEL_CAP, guard, Some(duel)))
        .output_data(Bytes::from(data).pack())
        .output(cell(300 * CKB, arena.key0.clone(), Some(racer)))
        .output_data(Bytes::from(racer_data(0, 0, &[0u8; 32])).pack());
    let tx = arena.finish(&mut context, tx, &[]);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("race open");
}

#[test]
fn a_racer_cell_cannot_start_with_laps_already_sealed() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let racer = arena.racer_type(&mut context, 0);
    let fund = arena.wallet(&mut context, &arena.challenger, 400 * CKB);
    let tx = TransactionBuilder::default()
        .input(input(fund, 0))
        .output(cell(300 * CKB, arena.key0.clone(), Some(racer)))
        .output_data(Bytes::from(racer_data(3, 0, &[1u8; 32])).pack());
    let tx = arena.finish(&mut context, tx, &[]);
    rejects_with(&context, &tx, -16);
}

struct LapSeal {
    laps_before: u8,
    /// When the racer cell being spent landed (its last seal), for laps after the first.
    landed_ms: u64,
    block: Option<[u8; 32]>,
    side: u8,
    lock: u8,
}

fn lap_seal_tx(context: &mut Context, arena: &Arena, seal: LapSeal) -> TransactionView {
    let duel_dep = arena.place(context, &race_data(arena, [0, 0], 0), DUEL_CAP + STAKE, ACCEPT_MS);
    let racer = arena.racer_type(context, seal.side);
    let lock = match seal.lock {
        0x10 => arena.key0.clone(),
        0x11 => arena.key1.clone(),
        _ => arena.stranger.clone(),
    };
    let (start_before, chain_before) = if seal.laps_before == 0 { (0, [0u8; 32]) } else { (ACCEPT_MS, [5u8; 32]) };
    let racer_in = context.create_cell(
        cell(300 * CKB, lock.clone(), Some(racer.clone())),
        Bytes::from(racer_data(seal.laps_before, start_before, &chain_before)),
    );
    let (opened, honest_block) = if seal.laps_before == 0 {
        (ACCEPT_MS, block_at(ACCEPT_MS))
    } else {
        land(context, &racer_in, seal.landed_ms);
        (seal.landed_ms, block_at(seal.landed_ms))
    };
    let moves = [0x4d; 32];
    let chain = blake(&[&b"crowns/lap/v1"[..], &chain_before, &seal.block.unwrap_or(honest_block), &moves]);
    let mut raw = vec![1u8];
    raw.extend_from_slice(&moves);
    let tx = TransactionBuilder::default()
        .cell_dep(CellDep::new_builder().out_point(duel_dep.clone()).build())
        .input(input(racer_in, 0))
        .output(cell(300 * CKB - 1_000, lock, Some(racer)))
        .output_data(Bytes::from(racer_data(seal.laps_before + 1, opened, &chain)).pack())
        .witness(witness(Some(raw)).pack());
    arena.finish(context, tx, &[duel_dep])
}

fn honest_lap() -> LapSeal {
    LapSeal { laps_before: 0, landed_ms: 0, block: None, side: 0, lock: 0x10 }
}

#[test]
fn lap_one_of_a_race_comes_from_the_accept_block() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = lap_seal_tx(&mut context, &arena, honest_lap());
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("race lap 1");
}

#[test]
fn a_race_lap_sealed_against_another_block_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = lap_seal_tx(&mut context, &arena, LapSeal { block: Some(block_at(ACCEPT_MS + 1)), ..honest_lap() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_racer_cell_under_another_key_cannot_seal() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = lap_seal_tx(&mut context, &arena, LapSeal { lock: 0x11, ..honest_lap() });
    rejects_with(&context, &tx, -18);
}

#[test]
fn a_later_race_lap_inside_its_window_passes() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = lap_seal_tx(&mut context, &arena, LapSeal { laps_before: 2, landed_ms: ACCEPT_MS + LAP_WINDOW_MS, ..honest_lap() });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("race lap 3");
}

#[test]
fn a_race_lap_after_a_late_one_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = lap_seal_tx(&mut context, &arena, LapSeal { laps_before: 2, landed_ms: ACCEPT_MS + LAP_WINDOW_MS + 1, ..honest_lap() });
    rejects_with(&context, &tx, -5);
}

/// A full five-lap race for `side`, sealed against blocks a lap apart from the accept: the run
/// payload, the lap chain, and the score the lane runner gives it.
fn raced(arena: &Arena, side: usize) -> (Vec<u8>, [u8; 32], u64) {
    let owner = if side == 0 { hash_of(&arena.challenger) } else { hash_of(&arena.opponent) };
    let blocks: Vec<[u8; 32]> = (0..LAPS as u64).map(|k| block_at(ACCEPT_MS + k * 60_000)).collect();
    let seeds: Vec<u64> = blocks.iter().map(|block| run_seed(&arena.duel_id, &owner, block)).collect();
    // The two players drive differently, so their scores differ.
    let tapes = bot_laps(&seeds, if side == 0 { 45 } else { 6 });
    let laps: Vec<Lap> = seeds.iter().zip(&tapes).map(|(seed, tape)| Lap { seed: *seed, tape }).collect();
    let score = replay_laps(&laps).expect("legal laps").score;
    let mut payload = vec![LAPS as u8];
    let mut chain = [0u8; 32];
    for (block, tape) in blocks.iter().zip(&tapes) {
        payload.extend_from_slice(block);
        payload.extend_from_slice(&(tape.len() as u16).to_le_bytes());
        payload.extend_from_slice(tape);
        chain = fold_lap(&chain, block, tape);
    }
    (payload, chain, score)
}

struct Submit {
    side: usize,
    recorded: Option<u64>,
    already: u8,
    lock: u8,
}

fn submit_tx(context: &mut Context, arena: &Arena, submit: Submit) -> (TransactionView, u64) {
    let (payload, chain, score) = raced(arena, submit.side);
    let duel_in = arena.place(context, &race_data(arena, [0, 0], submit.already), DUEL_CAP + STAKE, ACCEPT_MS);
    let racer = arena.racer_type(context, submit.side as u8);
    let lock = match submit.lock {
        0x10 => arena.key0.clone(),
        0x11 => arena.key1.clone(),
        _ => arena.stranger.clone(),
    };
    let last_start = ACCEPT_MS + 3 * 60_000;
    let racer_in = context.create_cell(cell(300 * CKB, lock.clone(), Some(racer)), Bytes::from(racer_data(LAPS as u8, last_start, &chain)));
    land(context, &racer_in, ACCEPT_MS + 4 * 60_000);
    let mut scores = [0u64; 2];
    scores[submit.side] = submit.recorded.unwrap_or(score);
    let after = race_data(arena, scores, submit.already | (1 << submit.side));
    let duel = arena.duel_script(context);
    let guard = arena.guard(context, &duel);
    let mut run = vec![1u8];
    run.extend_from_slice(&payload);
    let tx = TransactionBuilder::default()
        .input(input(duel_in, 0))
        .input(input(racer_in, 0))
        .output(cell(DUEL_CAP + STAKE, guard, Some(duel)))
        .output_data(Bytes::from(after).pack())
        .output(cell(300 * CKB - 1_000, lock, None))
        .output_data(Bytes::new().pack())
        .witness(witness(Some(run)).pack());
    (arena.finish(context, tx, &[]), score)
}

#[test]
fn a_racer_submits_their_run_and_its_score_is_recorded() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let (tx, score) = submit_tx(&mut context, &arena, Submit { side: 0, recorded: None, already: 0, lock: 0x10 });
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("submit");
    println!("submit a five-lap race scoring {score} (replayed on chain): {cycles} cycles");
}

#[test]
fn a_submission_recording_a_higher_score_is_rejected() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let (_, _, score) = raced(&arena, 0);
    let (tx, _) = submit_tx(&mut context, &arena, Submit { side: 0, recorded: Some(score + 1), already: 0, lock: 0x10 });
    rejects_with(&context, &tx, -17);
}

#[test]
fn a_run_cannot_be_submitted_twice() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let (tx, _) = submit_tx(&mut context, &arena, Submit { side: 0, recorded: None, already: 0b01, lock: 0x10 });
    rejects_with(&context, &tx, -17);
}

#[test]
fn nobody_can_submit_a_run_from_a_racer_cell_that_is_not_the_players() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let (tx, _) = submit_tx(&mut context, &arena, Submit { side: 0, recorded: None, already: 0, lock: 0x09 });
    rejects_with(&context, &tx, -18);
}

fn race_finish_tx(context: &mut Context, arena: &Arena, scores: [u64; 2], submitted: u8, since: u64, paid: &[(Script, u64)]) -> TransactionView {
    let duel_in = arena.place(context, &race_data(arena, scores, submitted), DUEL_CAP + STAKE, ACCEPT_MS);
    let mut tx = TransactionBuilder::default().input(input(duel_in, 0));
    if let Some(clock) = clock_after(context, ACCEPT_MS, since) {
        tx = tx.header_dep(clock);
    }
    for (lock, cap) in paid {
        tx = tx.output(cell(*cap, lock.clone(), None)).output_data(Bytes::new().pack());
    }
    arena.finish(context, tx, &[])
}

#[test]
fn a_finished_race_pays_the_faster_driver() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = race_finish_tx(&mut context, &arena, [900, 1200], 0b11, 0, &opponent_wins(&arena));
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("race finish");
}

#[test]
fn a_race_cannot_end_early_while_a_player_has_not_submitted() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let tx = race_finish_tx(&mut context, &arena, [900, 0], 0b01, 0, &[(arena.challenger.clone(), DUEL_CAP + STAKE - MAX_TX_FEE)]);
    rejects_with(&context, &tx, -10);
}

#[test]
fn after_the_race_time_a_player_who_never_submitted_scores_zero() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let since = SINCE_RELATIVE_TIMESTAMP | (RACE_MS / 1000);
    let tx = race_finish_tx(&mut context, &arena, [900, 0], 0b01, since, &[(arena.challenger.clone(), DUEL_CAP + STAKE - MAX_TX_FEE)]);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("no-show loses");
}

#[test]
fn a_tied_race_returns_each_stake() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    let total = DUEL_CAP + STAKE;
    let tx = race_finish_tx(
        &mut context,
        &arena,
        [1000, 1000],
        0b11,
        0,
        &[(arena.challenger.clone(), total - STAKE - MAX_TX_FEE), (arena.opponent.clone(), STAKE)],
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("tie");
}

/// What a win for the opponent pays: both stakes to them, and the challenger's storage deposit
/// back to the challenger, less the fee.
fn opponent_wins(arena: &Arena) -> Vec<(Script, u64)> {
    vec![
        (arena.opponent.clone(), 2 * STAKE),
        (arena.challenger.clone(), DUEL_CAP + STAKE - 2 * STAKE - MAX_TX_FEE),
    ]
}

#[test]
fn a_winning_opponent_cannot_take_the_challengers_deposit() {
    let mut context = Context::default();
    let arena = Arena::new(&mut context);
    // The opponent won the race, but this finish hands them the challenger's storage deposit too.
    let tx = race_finish_tx(&mut context, &arena, [900, 1200], 0b11, 0, &[(arena.opponent.clone(), DUEL_CAP + STAKE - MAX_TX_FEE)]);
    rejects_with(&context, &tx, -3);
}
