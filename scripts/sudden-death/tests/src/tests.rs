//! Sudden Death integration tests against match-type, bid-type, and treasury-lock.

use super::replay::bot_tape;
use super::{verify_and_dump_failed_tx, Loader};
use crowns_game_core::replay;
use blake2b_ref::Blake2bBuilder;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{Capacity, ScriptHashType, TransactionBuilder},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};

const MAX_CYCLES: u64 = 30_000_000;
const MATCH_LEN: usize = 166;
const FEE: u64 = 1_000;
const DEADLINE_MS: u64 = 1_700_000_000_000;
const CELL_CAP: u64 = 200_000_000_000;
const MAX_TX_FEE: u64 = 10_000_000;
const SINCE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;
const PROXY_BIN: &[u8] = include_bytes!("../bin/input-type-proxy-lock");

const OFF_VERSION: usize = 0;
const OFF_STATUS: usize = 1;
const OFF_ROUND: usize = 2;
const OFF_DEADLINE: usize = 6;
const OFF_FEE: usize = 14;
const OFF_POT: usize = 22;
const OFF_KING: usize = 30;
const OFF_GAME: usize = 62;
const OFF_TREASURY: usize = 94;
const OFF_BID_CODE: usize = 126;
const OFF_KING_SCORE: usize = 158;
const REFUND_GRACE_MS: u64 = 60 * 60 * 1000;

fn blake(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32)
        .personal(b"ckb-default-hash")
        .build();
    for part in parts {
        hasher.update(part);
    }
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn script_hash(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.calc_script_hash().as_slice());
    out
}

fn code_hash(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.code_hash().as_slice());
    out
}

fn type_id_of(first_input: &CellInput, output_index: u64) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32)
        .personal(b"ckb-default-hash")
        .build();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn put32(buf: &mut [u8], offset: usize, value: &[u8; 32]) {
    buf[offset..offset + 32].copy_from_slice(value);
}

fn put_u32(buf: &mut [u8], offset: usize, value: u32) {
    buf[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(buf: &mut [u8], offset: usize, value: u64) {
    buf[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

fn game_bin() -> Bytes {
    Loader::default().load_binary("lane-runner")
}

/// The match cell names its game by the data hash of the game script.
fn game_hash() -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(CellOutput::calc_data_hash(&game_bin()).as_slice());
    out
}

fn seed_of(match_id: &[u8; 32], owner: &[u8; 32]) -> u64 {
    let digest = blake(&[&b"crowns/run-seed/v1"[..], match_id, owner]);
    u64::from_le_bytes(digest[..8].try_into().unwrap())
}

/// A long, legal run on `owner`'s course, and the score the game gives it.
fn run_for(match_id: &[u8; 32], owner: &Script) -> (Vec<u8>, u64) {
    let seed = seed_of(match_id, &script_hash(owner));
    let tape = bot_tape(seed, 45);
    let score = replay(seed, &tape).expect("legal tape").score;
    (tape, score)
}

fn run_witness(tape: &[u8]) -> Bytes {
    let mut raw = vec![1u8];
    raw.extend_from_slice(tape);
    Bytes::from(raw)
}

fn with_score(data: Bytes, score: u64) -> Bytes {
    let mut raw = data.to_vec();
    put_u64(&mut raw, OFF_KING_SCORE, score);
    Bytes::from(raw)
}

fn match_data(
    round: u32,
    deadline: u64,
    pot: u64,
    king: &[u8; 32],
    game: &[u8; 32],
    treasury: &[u8; 32],
    bid_code: &[u8; 32],
) -> Bytes {
    let mut data = vec![0u8; MATCH_LEN];
    data[OFF_VERSION] = 2;
    data[OFF_STATUS] = 0;
    put_u32(&mut data, OFF_ROUND, round);
    put_u64(&mut data, OFF_DEADLINE, deadline);
    put_u64(&mut data, OFF_FEE, FEE);
    put_u64(&mut data, OFF_POT, pot);
    put32(&mut data, OFF_KING, king);
    put32(&mut data, OFF_GAME, game);
    put32(&mut data, OFF_TREASURY, treasury);
    put32(&mut data, OFF_BID_CODE, bid_code);
    Bytes::from(data)
}

struct Deployed {
    out_point: OutPoint,
    dep: CellDep,
}

impl Deployed {
    fn load(context: &mut Context, name: &str) -> Self {
        let out_point = context.deploy_cell(Loader::default().load_binary(name));
        let dep = CellDep::new_builder().out_point(out_point.clone()).build();
        Self { out_point, dep }
    }

    /// data2 runs on CKB-VM v2, which match-type needs to spawn the game script. On chain the
    /// scripts are referenced by type id, which also runs on the latest VM.
    fn script(&self, context: &mut Context, args: &[u8]) -> Script {
        context
            .build_script_with_hash_type(&self.out_point, ScriptHashType::Data2, Bytes::from(args.to_vec()))
            .expect("script")
    }
}

fn proxy_pair(context: &mut Context) -> (OutPoint, CellDep) {
    let out_point = context.deploy_cell(Bytes::from(PROXY_BIN.to_vec()));
    let dep = CellDep::new_builder().out_point(out_point.clone()).build();
    (out_point, dep)
}

fn proxy_lock(context: &mut Context, proxy_out: &OutPoint, args: &[u8; 32]) -> Script {
    context
        .build_script_with_hash_type(proxy_out, ScriptHashType::Data1, Bytes::from(args.to_vec()))
        .expect("proxy lock")
}

fn bid_args(match_type_hash: &[u8; 32], owner: &[u8; 32]) -> [u8; 64] {
    let mut args = [0u8; 64];
    args[..32].copy_from_slice(match_type_hash);
    args[32..].copy_from_slice(owner);
    args
}

fn bid_data(owner: &Script) -> Bytes {
    bid_data_until(owner, DEADLINE_MS + REFUND_GRACE_MS)
}

fn bid_data_until(owner: &Script, refund_after_ms: u64) -> Bytes {
    let mut raw = vec![2u8];
    raw.extend_from_slice(&refund_after_ms.to_le_bytes());
    raw.extend_from_slice(owner.as_slice());
    Bytes::from(raw)
}

/// Bids lock themselves: the proxy lock's args are the bid's own type hash, so bid-type alone
/// decides every spend.
fn bid_lock(context: &mut Context, live: &Live, type_script: &Script) -> Script {
    proxy_lock(context, &live.proxy_out, &script_hash(type_script))
}

fn always(context: &mut Context, args: &[u8]) -> (Script, CellDep) {
    let out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let script = context
        .build_script(&out_point, Bytes::from(args.to_vec()))
        .expect("always");
    let dep = CellDep::new_builder().out_point(out_point).build();
    (script, dep)
}

fn cell(cap: u64, lock: Script, type_script: Option<Script>) -> CellOutput {
    CellOutput::new_builder()
        .capacity(cap)
        .lock(lock)
        .type_(type_script.pack())
        .build()
}

fn input_at(out_point: OutPoint, since: u64) -> CellInput {
    CellInput::new_builder()
        .previous_output(out_point)
        .since(since)
        .build()
}

fn witness(proof: Option<Bytes>) -> Bytes {
    WitnessArgs::new_builder()
        .input_type(proof.pack())
        .build()
        .as_bytes()
}

#[test]
fn create_match_opens_an_empty_pot() {
    let mut context = Context::default();
    let match_bin = Deployed::load(&mut context, "match-type");
    let bid_bin = Deployed::load(&mut context, "bid-type");
    let treasury_bin = Deployed::load(&mut context, "treasury-lock");
    let (payer, payer_dep) = always(&mut context, &[0x01]);

    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let fund = context.create_cell(cell(CELL_CAP * 3, payer.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    let match_id = type_id_of(&first, 0);
    let host = script_hash(&payer);
    let match_script = match_bin.script(&mut context, &type_args(&match_id, &host));
    let match_type_hash = script_hash(&match_script);
    let guard = proxy_lock(&mut context, &proxy_out, &match_type_hash);
    let treasury_script = treasury_bin.script(&mut context, &match_type_hash);
    let bid_code = code_hash(&bid_bin.script(&mut context, &match_type_hash));
    let data = match_data(
        1,
        DEADLINE_MS,
        0,
        &[0u8; 32],
        &game_hash(),
        &script_hash(&treasury_script),
        &bid_code,
    );

    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(CELL_CAP, guard, Some(match_script)))
        .output_data(data.pack())
        .output(cell(CELL_CAP, treasury_script, None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, payer, None))
        .output_data(Bytes::new().pack())
        .cell_dep(payer_dep)
        .cell_dep(proxy_dep)
        .cell_dep(match_bin.dep)
        .cell_dep(bid_bin.dep)
        .cell_dep(treasury_bin.dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("create");
}

fn type_args(match_id: &[u8; 32], host: &[u8; 32]) -> [u8; 64] {
    let mut args = [0u8; 64];
    args[..32].copy_from_slice(match_id);
    args[32..].copy_from_slice(host);
    args
}

struct Live {
    match_id: [u8; 32],
    match_script: Script,
    treasury_script: Script,
    bid_out: OutPoint,
    proxy_out: OutPoint,
    king_lock: Script,
    other_lock: Script,
    host_lock: Script,
    lock_dep: CellDep,
    deps: Vec<CellDep>,
    game: [u8; 32],
    bid_code: [u8; 32],
}

fn live(context: &mut Context) -> Live {
    live_as(context, 0x11)
}

fn live_as(context: &mut Context, host_arg: u8) -> Live {
    let match_bin = Deployed::load(context, "match-type");
    let bid_bin = Deployed::load(context, "bid-type");
    let treasury_bin = Deployed::load(context, "treasury-lock");
    let game_bin = Deployed::load(context, "lane-runner");
    let (proxy_out, proxy_dep) = proxy_pair(context);
    let out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_dep = CellDep::new_builder().out_point(out_point.clone()).build();
    let king_lock = context
        .build_script(&out_point, Bytes::from(vec![0x11]))
        .expect("king lock");
    let other_lock = context
        .build_script(&out_point, Bytes::from(vec![0x22]))
        .expect("other lock");
    let host_lock = context
        .build_script(&out_point, Bytes::from(vec![host_arg]))
        .expect("host lock");
    let match_id = [0xAB; 32];
    let host = script_hash(&host_lock);
    let match_script = match_bin.script(context, &type_args(&match_id, &host));
    let match_type_hash = script_hash(&match_script);
    let treasury_script = treasury_bin.script(context, &match_type_hash);
    let bid_script = bid_bin.script(context, &bid_args(&match_type_hash, &script_hash(&king_lock)));
    Live {
        game: game_hash(),
        bid_code: code_hash(&bid_script),
        match_id,
        match_script,
        treasury_script,
        bid_out: bid_bin.out_point,
        proxy_out,
        king_lock,
        other_lock,
        host_lock,
        lock_dep,
        deps: vec![match_bin.dep, bid_bin.dep, treasury_bin.dep, game_bin.dep, proxy_dep],
    }
}

fn guard(context: &mut Context, live: &Live) -> Script {
    proxy_lock(context, &live.proxy_out, &script_hash(&live.match_script))
}

fn bid_script_for(context: &mut Context, live: &Live, owner: &Script) -> Script {
    context
        .build_script_with_hash_type(
            &live.bid_out,
            ScriptHashType::Data2,
            Bytes::from(bid_args(&script_hash(&live.match_script), &script_hash(owner)).to_vec()),
        )
        .expect("bid script")
}

/// Mirror of `shrunk_deadline` in sudden-death-common.
fn shrunk(deadline: u64, round: u32) -> u64 {
    let cut = (600_000u64 >> (round / 2).min(13)).max(72_000);
    if deadline <= cut { 1_000 } else { deadline - cut }
}

/// The standing crown a steal tries to take.
struct Standing {
    round: u32,
    king: [u8; 32],
    score: u64,
}

const OPENING: Standing = Standing { round: 1, king: [0u8; 32], score: 0 };

/// `stealer` submits `tape` and records `recorded` as the new king score.
fn steal_with(
    context: &mut Context,
    live: &Live,
    standing: &Standing,
    stealer: &Script,
    tape: &[u8],
    recorded: u64,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let treasury_hash = script_hash(&live.treasury_script);
    let pot = (standing.round as u64 - 1) * FEE;
    let data = with_score(
        match_data(standing.round, DEADLINE_MS, pot, &standing.king, &live.game, &treasury_hash, &live.bid_code),
        standing.score,
    );
    let next = with_score(
        match_data(
            standing.round + 1,
            shrunk(DEADLINE_MS, standing.round),
            pot + FEE,
            &script_hash(stealer),
            &live.game,
            &treasury_hash,
            &live.bid_code,
        ),
        recorded,
    );
    let guard_lock = guard(context, live);
    let match_in = context.create_cell(
        cell(CELL_CAP, guard_lock.clone(), Some(live.match_script.clone())),
        data,
    );
    let treasury_in = context.create_cell(
        cell(CELL_CAP + pot, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let bid_in = bid_cell(context, live, stealer);
    with_deps(
        context,
        live,
        TransactionBuilder::default()
            .input(input_at(match_in, 0))
            .input(input_at(treasury_in, 0))
            .input(input_at(bid_in, 0))
            .output(cell(CELL_CAP, guard_lock, Some(live.match_script.clone())))
            .output_data(next.pack())
            .output(cell(CELL_CAP + pot + FEE, live.treasury_script.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP - FEE - MAX_TX_FEE, stealer.clone(), None))
            .output_data(Bytes::new().pack())
            .witness(witness(Some(run_witness(tape))).pack())
            .witness(witness(None).pack())
            .witness(witness(None).pack()),
    )
}

/// The king's own best run, or, with `copied`, the other player's run replayed on the king's course.
fn steal_tx(context: &mut Context, live: &Live, copied: bool) -> ckb_testtool::ckb_types::core::TransactionView {
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let tape = if copied { run_for(&live.match_id, &live.other_lock).0 } else { tape };
    steal_with(context, live, &OPENING, &live.king_lock.clone(), &tape, score)
}

#[test]
fn steal_consumes_one_bid_and_grows_the_pot() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = steal_tx(&mut context, &live, false);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("steal");
    println!("full two-minute steal, game spawned and replayed: {cycles} cycles");
}

#[test]
fn steal_with_a_run_copied_from_another_player_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = steal_tx(&mut context, &live, true);
    rejects_with(&context, &tx, -12);
}

#[test]
fn steal_recording_more_than_the_run_scored_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &OPENING, &king, &tape, score + 1);
    rejects_with(&context, &tx, -12);
}

#[test]
fn steal_with_a_malformed_tape_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &OPENING, &king, &[5, 0, 1, 5, 0, 2], 0);
    rejects_with(&context, &tx, -7);
}

#[test]
fn steal_that_beats_the_standing_king_takes_the_crown() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing { round: 3, king: script_hash(&live.other_lock), score: score - 1 };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("beat the king");
}

#[test]
fn steal_that_only_ties_the_standing_king_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing { round: 3, king: script_hash(&live.other_lock), score };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    rejects_with(&context, &tx, -12);
}

#[test]
fn king_cannot_steal_from_themselves() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing { round: 2, king: script_hash(&live.king_lock), score: 1 };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    rejects_with(&context, &tx, -6);
}

#[test]
fn steal_without_the_game_script_dep_is_rejected() {
    let mut context = Context::default();
    let mut live = live(&mut context);
    live.deps.retain(|dep| {
        let game = CellOutput::calc_data_hash(&game_bin());
        context.get_cell(&dep.out_point()).map(|(_, data)| CellOutput::calc_data_hash(&data)) != Some(game)
    });
    let tx = steal_tx(&mut context, &live, false);
    rejects_with(&context, &tx, -13);
}

fn expiry_tx(
    context: &mut Context,
    live: &Live,
    since_secs: u64,
    pay_to: &Script,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let bid_in = bid_cell(context, live, &live.other_lock);
    with_deps(
        context,
        live,
        TransactionBuilder::default()
            .input(input_at(bid_in, SINCE_TIMESTAMP | since_secs))
            .output(cell(CELL_CAP - MAX_TX_FEE, pay_to.clone(), None))
            .output_data(Bytes::new().pack()),
    )
}

#[test]
fn a_bid_left_out_of_the_close_expires_back_to_its_owner() {
    let mut context = Context::default();
    let live = live(&mut context);
    let other = live.other_lock.clone();
    let tx = expiry_tx(&mut context, &live, (DEADLINE_MS + REFUND_GRACE_MS) / 1000, &other);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("expired bid refund");
}

#[test]
fn a_bid_cannot_expire_before_its_refund_time() {
    let mut context = Context::default();
    let live = live(&mut context);
    let other = live.other_lock.clone();
    let tx = expiry_tx(&mut context, &live, (DEADLINE_MS + REFUND_GRACE_MS) / 1000 - 1, &other);
    rejects_with(&context, &tx, -10);
}

#[test]
fn an_expired_bid_cannot_be_paid_to_someone_else() {
    let mut context = Context::default();
    let live = live(&mut context);
    let host = live.host_lock.clone();
    let tx = expiry_tx(&mut context, &live, (DEADLINE_MS + REFUND_GRACE_MS) / 1000, &host);
    rejects_with(&context, &tx, -3);
}

#[test]
fn bid_creation_with_the_wrong_refund_time_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, _) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        bid_data_until(&live.other_lock, DEADLINE_MS),
        Some(match_out),
    );
    rejects_with(&context, &tx, -5);
}

#[test]
fn bid_creation_with_the_v1_match_guard_lock_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, _, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let old_lock = guard(&mut context, &live);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        old_lock,
        type_script,
        data,
        Some(match_out),
    );
    rejects_with(&context, &tx, -6);
}

fn settle_tx(context: &mut Context, live: &Live, since_secs: u64) -> ckb_testtool::ckb_types::core::TransactionView {
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let guard_lock = guard(context, live);
    let match_in = context.create_cell(
        cell(CELL_CAP, guard_lock, Some(live.match_script.clone())),
        data,
    );
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let other_bid = bid_cell(context, live, &live.other_lock);
    let since = SINCE_TIMESTAMP | since_secs;
    let mut tx = TransactionBuilder::default()
        .input(input_at(match_in, since))
        .input(input_at(treasury_in, since))
        .input(input_at(other_bid, 0))
        .output(cell(CELL_CAP, live.king_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, live.other_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, live.king_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .cell_dep(live.lock_dep.clone());
    for dep in &live.deps {
        tx = tx.cell_dep(dep.clone());
    }
    context.complete_tx(tx.build())
}

#[test]
fn settle_before_the_deadline_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = settle_tx(&mut context, &live, DEADLINE_MS / 1000 - 1);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("early settle");
}

#[test]
fn settle_after_the_deadline_pays_the_king() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = settle_tx(&mut context, &live, DEADLINE_MS / 1000);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("settle");
}

fn with_deps(
    context: &mut Context,
    live: &Live,
    tx: ckb_testtool::ckb_types::core::TransactionBuilder,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let mut tx = tx.cell_dep(live.lock_dep.clone());
    for dep in &live.deps {
        tx = tx.cell_dep(dep.clone());
    }
    context.complete_tx(tx.build())
}

fn bid_cell(context: &mut Context, live: &Live, owner: &Script) -> OutPoint {
    let type_script = bid_script_for(context, live, owner);
    let lock = bid_lock(context, live, &type_script);
    context.create_cell(cell(CELL_CAP, lock, Some(type_script)), bid_data(owner))
}

fn place_match(context: &mut Context, live: &Live, data: Bytes) -> OutPoint {
    let lock = guard(context, live);
    let type_script = live.match_script.clone();
    context.create_cell(cell(CELL_CAP, lock, Some(type_script)), data)
}

#[test]
fn create_rejects_a_zero_host_hash() {
    let mut context = Context::default();
    let match_bin = Deployed::load(&mut context, "match-type");
    let bid_bin = Deployed::load(&mut context, "bid-type");
    let treasury_bin = Deployed::load(&mut context, "treasury-lock");
    let (payer, payer_dep) = always(&mut context, &[0x01]);
    let fund = context.create_cell(cell(CELL_CAP * 3, payer.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    let match_id = type_id_of(&first, 0);
    let match_script = match_bin.script(&mut context, &type_args(&match_id, &[0u8; 32]));
    let match_type_hash = script_hash(&match_script);
    let treasury_script = treasury_bin.script(&mut context, &match_type_hash);
    let bid_code = code_hash(&bid_bin.script(&mut context, &match_type_hash));
    let data = match_data(
        1,
        DEADLINE_MS,
        0,
        &[0u8; 32],
        &game_hash(),
        &script_hash(&treasury_script),
        &bid_code,
    );
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(CELL_CAP, payer.clone(), Some(match_script)))
        .output_data(data.pack())
        .output(cell(CELL_CAP, treasury_script, None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, payer, None))
        .output_data(Bytes::new().pack())
        .cell_dep(payer_dep)
        .cell_dep(match_bin.dep)
        .cell_dep(bid_bin.dep)
        .cell_dep(treasury_bin.dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("zero host");
}

#[test]
fn empty_seat_cleanup_pays_the_host_and_refunds_the_bid() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let tx = empty_seat(&mut context, &live, DEADLINE_MS / 1000);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("empty seat");
}

#[test]
fn empty_seat_cleanup_before_the_deadline_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let tx = empty_seat(&mut context, &live, DEADLINE_MS / 1000 - 1);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("early empty");
}

fn empty_seat(
    context: &mut Context,
    live: &Live,
    since_secs: u64,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let treasury_hash = script_hash(&live.treasury_script);
    let data = match_data(
        1,
        DEADLINE_MS,
        0,
        &[0u8; 32],
        &live.game,
        &treasury_hash,
        &live.bid_code,
    );
    let match_in = place_match(context, live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let bid_in = bid_cell(context, live, &live.other_lock);
    let since = SINCE_TIMESTAMP | since_secs;
    with_deps(
        context,
        live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(bid_in, 0))
            .output(cell(CELL_CAP, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    )
}

#[test]
fn two_bids_in_one_cleanup_are_rejected_by_the_deployed_bid_script() {
    let mut context = Context::default();
    let live = live(&mut context);
    let third = context
        .build_script(
            &live.lock_dep.out_point(),
            Bytes::from(vec![0x44]),
        )
        .expect("third");
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(
        2,
        DEADLINE_MS,
        CELL_CAP,
        &king,
        &live.game,
        &treasury_hash,
        &live.bid_code,
    );
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let bid_a = bid_cell(&mut context, &live, &live.other_lock);
    let bid_b = bid_cell(&mut context, &live, &third);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(bid_a, 0))
            .input(input_at(bid_b, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, third, None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("two bids refund");
}

#[test]
fn cleanup_refunds_a_bid_with_no_signature() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = settle_tx(&mut context, &live, DEADLINE_MS / 1000);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("unsigned refund");
}

#[test]
fn a_non_king_bid_refunds_beside_the_real_king() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = settle_tx(&mut context, &live, DEADLINE_MS / 1000);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("refund beside king");
}

#[test]
fn the_kings_second_bid_is_refunded() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let kings_bid = bid_cell(&mut context, &live, &live.king_lock);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(kings_bid, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("king bid refund");
}

#[test]
fn cleanup_that_shorts_the_host_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let tx = split_payout(&mut context, &live, false);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("short host");
}

#[test]
fn cleanup_pays_the_king_and_the_remainder_to_the_host() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let tx = split_payout(&mut context, &live, true);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("split payout");
}

fn split_payout(
    context: &mut Context,
    live: &Live,
    pay_host_in_full: bool,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(context, live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let bid_in = bid_cell(context, live, &live.other_lock);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let mut tx = TransactionBuilder::default()
        .input(input_at(match_in, since))
        .input(input_at(treasury_in, since))
        .input(input_at(bid_in, 0))
        .output(cell(CELL_CAP, live.king_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, live.other_lock.clone(), None))
        .output_data(Bytes::new().pack());
    if pay_host_in_full {
        let funding = context.create_cell(cell(CELL_CAP, live.host_lock.clone(), None), Bytes::new());
        tx = tx
            .input(input_at(funding, 0))
            .output(cell(CELL_CAP, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack());
    } else {
        tx = tx
            .output(cell(CELL_CAP, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack());
    }
    with_deps(context, live, tx)
}

#[test]
fn king_who_is_the_host_must_receive_the_whole_pot() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let bid_in = bid_cell(&mut context, &live, &live.other_lock);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(bid_in, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("host is king, short");
}

#[test]
fn pot_larger_than_the_treasury_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(
        2,
        DEADLINE_MS,
        CELL_CAP + 1,
        &king,
        &live.game,
        &treasury_hash,
        &live.bid_code,
    );
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("pot overflow");
}

#[test]
fn cleanup_without_the_treasury_cell_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let bid_in = bid_cell(&mut context, &live, &live.other_lock);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(bid_in, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("treasury left behind");
}

fn funded_match(context: &mut Context, live: &Live) -> OutPoint {
    let treasury_hash = script_hash(&live.treasury_script);
    let data = match_data(
        1,
        DEADLINE_MS,
        0,
        &[0u8; 32],
        &live.game,
        &treasury_hash,
        &live.bid_code,
    );
    place_match(context, live, data)
}

fn bid_shell(context: &mut Context, live: &Live, owner: &Script) -> (u64, Script, Script, Bytes) {
    let type_script = bid_script_for(context, live, owner);
    let lock = bid_lock(context, live, &type_script);
    let data = bid_data(owner);
    let bare = cell(0, lock.clone(), Some(type_script.clone()));
    let occupied = bare
        .occupied_capacity(Capacity::bytes(data.len()).expect("data"))
        .expect("occupied")
        .as_u64();
    (occupied, lock, type_script, data)
}

fn bid_create(
    context: &mut Context,
    live: &Live,
    _owner: &Script,
    cap: u64,
    lock: Script,
    type_script: Script,
    data: Bytes,
    match_dep: Option<OutPoint>,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let fund = context.create_cell(cell(CELL_CAP * 4, live.host_lock.clone(), None), Bytes::new());
    let mut tx = TransactionBuilder::default()
        .input(input_at(fund, 0))
        .output(cell(cap, lock, Some(type_script)))
        .output_data(data.pack())
        .output(cell(CELL_CAP * 4 - cap, live.host_lock.clone(), None))
        .output_data(Bytes::new().pack());
    if let Some(dep) = match_dep {
        tx = tx.cell_dep(CellDep::new_builder().out_point(dep).build());
    }
    with_deps(context, live, tx)
}

#[test]
fn steal_pays_the_new_king_without_touching_the_pot() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = steal_tx(&mut context, &live, false);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("steal keeps the pot");
}

#[test]
fn steal_with_two_owners_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let data = match_data(1, DEADLINE_MS, 0, &[0u8; 32], &live.game, &treasury_hash, &live.bid_code);
    let next = match_data(
        2,
        DEADLINE_MS - 600_000,
        FEE,
        &script_hash(&live.king_lock),
        &live.game,
        &treasury_hash,
        &live.bid_code,
    );
    let guard_lock = guard(&mut context, &live);
    let match_in = context.create_cell(
        cell(CELL_CAP, guard_lock.clone(), Some(live.match_script.clone())),
        data,
    );
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let first = bid_cell(&mut context, &live, &live.king_lock);
    let second = bid_cell(&mut context, &live, &live.other_lock);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, 0))
            .input(input_at(treasury_in, 0))
            .input(input_at(first, 0))
            .input(input_at(second, 0))
            .output(cell(CELL_CAP, guard_lock, Some(live.match_script.clone())))
            .output_data(next.pack())
            .output(cell(CELL_CAP + FEE, live.treasury_script.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP - FEE - MAX_TX_FEE, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .witness(witness(Some(run_witness(&run_for(&live.match_id, &live.king_lock).0))).pack())
            .witness(witness(None).pack())
            .witness(witness(None).pack())
            .witness(witness(None).pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("two owners");
}

#[test]
fn bid_creation_accepts_a_live_match_dep() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        data,
        Some(match_out),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("bid create");
}

#[test]
fn bid_creation_without_the_match_dep_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let _match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        data,
        None,
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("no match dep");
}

/// A spent or unknown match outpoint fails while the transaction is resolved,
/// before the bid script runs. That is still a rejected bid.
#[test]
#[should_panic]
fn bid_creation_with_a_stale_match_outpoint_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let stale = OutPoint::new_builder().tx_hash([0x44u8; 32].pack()).build();
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        data,
        Some(stale),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("stale match");
}

#[test]
fn bid_creation_against_a_different_match_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let other = live_as(&mut context, 0x33);
    let foreign = funded_match(&mut context, &other);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        data,
        Some(foreign),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("foreign match");
}

#[test]
fn bid_creation_below_fee_storage_and_max_fee_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE,
        lock,
        type_script,
        data,
        Some(match_out),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("short bid");
}

#[test]
fn bid_creation_with_a_zero_owner_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, _, data) = bid_shell(&mut context, &live, &live.other_lock);
    let type_script = context
        .build_script(
            &live.bid_out,
            Bytes::from(bid_args(&script_hash(&live.match_script), &[0u8; 32]).to_vec()),
        )
        .expect("zero owner script");
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        data,
        Some(match_out),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("zero owner");
}

#[test]
fn bid_creation_with_a_mismatched_owner_script_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, _) = bid_shell(&mut context, &live, &live.king_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.king_lock,
        occupied + FEE + MAX_TX_FEE,
        lock,
        type_script,
        bid_data(&live.other_lock),
        Some(match_out),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("owner script");
}

#[test]
fn bid_creation_with_a_non_proxy_lock_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, _, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let tx = bid_create(
        &mut context,
        &live,
        &live.other_lock,
        occupied + FEE + MAX_TX_FEE,
        live.host_lock.clone(),
        type_script,
        data,
        Some(match_out),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("bid lock");
}

#[test]
fn match_created_with_the_proxy_code_hash_but_type_hash_type_is_rejected() {
    let mut context = Context::default();
    let match_bin = Deployed::load(&mut context, "match-type");
    let bid_bin = Deployed::load(&mut context, "bid-type");
    let treasury_bin = Deployed::load(&mut context, "treasury-lock");
    let (payer, payer_dep) = always(&mut context, &[0x01]);
    let fund = context.create_cell(cell(CELL_CAP * 3, payer.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    let match_id = type_id_of(&first, 0);
    let host = script_hash(&payer);
    let match_script = match_bin.script(&mut context, &type_args(&match_id, &host));
    let match_type_hash = script_hash(&match_script);
    let treasury_script = treasury_bin.script(&mut context, &match_type_hash);
    let bid_code = code_hash(&bid_bin.script(&mut context, &match_type_hash));
    let data_hash = CellOutput::calc_data_hash(&Bytes::from(PROXY_BIN.to_vec()));
    let bad_lock = Script::new_builder()
        .code_hash(data_hash)
        .hash_type(ScriptHashType::Type)
        .args(Bytes::from(match_type_hash.to_vec()).pack())
        .build();
    let data = match_data(1, DEADLINE_MS, 0, &[0u8; 32], &game_hash(), &script_hash(&treasury_script), &bid_code);
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(CELL_CAP, bad_lock, Some(match_script)))
        .output_data(data.pack())
        .output(cell(CELL_CAP, treasury_script, None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, payer, None))
        .output_data(Bytes::new().pack())
        .cell_dep(payer_dep)
        .cell_dep(match_bin.dep)
        .cell_dep(bid_bin.dep)
        .cell_dep(treasury_bin.dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("hash type type");
}

#[test]
fn match_created_with_proxy_args_longer_than_32_bytes_is_rejected() {
    let mut context = Context::default();
    let match_bin = Deployed::load(&mut context, "match-type");
    let bid_bin = Deployed::load(&mut context, "bid-type");
    let treasury_bin = Deployed::load(&mut context, "treasury-lock");
    let (payer, payer_dep) = always(&mut context, &[0x01]);
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let fund = context.create_cell(cell(CELL_CAP * 3, payer.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    let match_id = type_id_of(&first, 0);
    let host = script_hash(&payer);
    let match_script = match_bin.script(&mut context, &type_args(&match_id, &host));
    let match_type_hash = script_hash(&match_script);
    let mut args = match_type_hash.to_vec();
    args.push(0xff);
    let bad_lock = context
        .build_script_with_hash_type(&proxy_out, ScriptHashType::Data1, Bytes::from(args))
        .expect("long args");
    let treasury_script = treasury_bin.script(&mut context, &match_type_hash);
    let bid_code = code_hash(&bid_bin.script(&mut context, &match_type_hash));
    let data = match_data(1, DEADLINE_MS, 0, &[0u8; 32], &game_hash(), &script_hash(&treasury_script), &bid_code);
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(CELL_CAP, bad_lock, Some(match_script)))
        .output_data(data.pack())
        .output(cell(CELL_CAP, treasury_script, None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, payer, None))
        .output_data(Bytes::new().pack())
        .cell_dep(payer_dep)
        .cell_dep(proxy_dep)
        .cell_dep(match_bin.dep)
        .cell_dep(bid_bin.dep)
        .cell_dep(treasury_bin.dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("long proxy args");
}

#[test]
fn cleanup_missing_a_live_bid_still_passes() {
    let mut context = Context::default();
    let live = live(&mut context);
    let _left_behind = bid_cell(&mut context, &live, &live.other_lock);
    let tx = settle_tx(&mut context, &live, DEADLINE_MS / 1000);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("omitted bid stays put");
}

#[test]
fn two_bids_from_one_owner_are_checked_as_one_total() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let first = bid_cell(&mut context, &live, &live.other_lock);
    let second = bid_cell(&mut context, &live, &live.other_lock);
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(first, 0))
            .input(input_at(second, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP * 2, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("one owner total");
}

#[test]
fn cleanup_where_the_host_also_holds_a_bid_uses_the_combined_total() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let host_bid = bid_cell(&mut context, &live, &live.host_lock);
    let extra = context.create_cell(cell(CELL_CAP, live.host_lock.clone(), None), Bytes::new());
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .input(input_at(host_bid, 0))
            .input(input_at(extra, 0))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP * 3, live.host_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("host bid combined");
}

#[test]
fn king_who_is_the_host_with_no_bids_must_receive_match_and_treasury() {
    let mut context = Context::default();
    let live = live(&mut context);
    let treasury_hash = script_hash(&live.treasury_script);
    let king = script_hash(&live.king_lock);
    let data = match_data(2, DEADLINE_MS, FEE, &king, &live.game, &treasury_hash, &live.bid_code);
    let match_in = place_match(&mut context, &live, data);
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let tx = with_deps(
        &mut context,
        &live,
        TransactionBuilder::default()
            .input(input_at(match_in, since))
            .input(input_at(treasury_in, since))
            .output(cell(CELL_CAP, live.king_lock.clone(), None))
            .output_data(Bytes::new().pack())
            .output(cell(CELL_CAP, live.other_lock.clone(), None))
            .output_data(Bytes::new().pack()),
    );
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("no bids, short host");
}

#[test]
fn proxy_lock_unlocks_when_an_input_carries_the_type_hash() {
    let mut context = Context::default();
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let (type_script, type_dep) = always(&mut context, &[0x99]);
    let lock = proxy_lock(&mut context, &proxy_out, &script_hash(&type_script));
    let input = context.create_cell(cell(CELL_CAP, lock, Some(type_script.clone())), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(input_at(input, 0))
        .output(cell(CELL_CAP, type_script, None))
        .output_data(Bytes::new().pack())
        .cell_dep(proxy_dep)
        .cell_dep(type_dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("proxy input");
}

#[test]
fn proxy_lock_bytes_reject_a_type_that_is_only_an_output() {
    let mut context = Context::default();
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let (type_script, type_dep) = always(&mut context, &[0x99]);
    let lock = proxy_lock(&mut context, &proxy_out, &script_hash(&type_script));
    let input = context.create_cell(cell(CELL_CAP, lock, None), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(input_at(input, 0))
        .output(cell(CELL_CAP, type_script.clone(), Some(type_script)))
        .output_data(Bytes::new().pack())
        .cell_dep(proxy_dep)
        .cell_dep(type_dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("output only");
}

#[test]
fn proxy_lock_bytes_reject_a_transaction_with_no_matching_type() {
    let mut context = Context::default();
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let (spare, spare_dep) = always(&mut context, &[0x99]);
    let lock = proxy_lock(&mut context, &proxy_out, &script_hash(&spare));
    let input = context.create_cell(cell(CELL_CAP, lock.clone(), None), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(input_at(input, 0))
        .output(cell(CELL_CAP, lock, None))
        .output_data(Bytes::new().pack())
        .cell_dep(proxy_dep)
        .cell_dep(spare_dep)
        .build();
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("no type");
}

#[test]
fn proxy_lock_bytes_reject_args_shorter_than_32_and_accept_a_suffix() {
    let mut context = Context::default();
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let (type_script, type_dep) = always(&mut context, &[0x99]);
    let short = context
        .build_script_with_hash_type(&proxy_out, ScriptHashType::Data1, Bytes::from(vec![0x11; 16]))
        .expect("short");
    let short_in = context.create_cell(cell(CELL_CAP, short, Some(type_script.clone())), Bytes::new());
    let short_tx = context.complete_tx(
        TransactionBuilder::default()
            .input(input_at(short_in, 0))
            .output(cell(CELL_CAP, type_script.clone(), None))
            .output_data(Bytes::new().pack())
            .cell_dep(proxy_dep.clone())
            .cell_dep(type_dep.clone())
            .build(),
    );
    verify_and_dump_failed_tx(&context, &short_tx, MAX_CYCLES).expect_err("short args");

    let mut long_args = script_hash(&type_script).to_vec();
    long_args.push(0xff);
    let long = context
        .build_script_with_hash_type(&proxy_out, ScriptHashType::Data1, Bytes::from(long_args))
        .expect("long");
    let long_in = context.create_cell(cell(CELL_CAP, long, Some(type_script.clone())), Bytes::new());
    let long_tx = context.complete_tx(
        TransactionBuilder::default()
            .input(input_at(long_in, 0))
            .output(cell(CELL_CAP, type_script, None))
            .output_data(Bytes::new().pack())
            .cell_dep(proxy_dep)
            .cell_dep(type_dep)
            .build(),
    );
    // The on-chain binary reads args[0..32] whenever args.len() >= 32, so a suffix still unlocks.
    verify_and_dump_failed_tx(&context, &long_tx, MAX_CYCLES).expect("suffix ignored");
}

/// Rejected, and for the reason the test is about rather than some earlier check.
fn rejects_with(context: &Context, tx: &ckb_testtool::ckb_types::core::TransactionView, code: i8) {
    let err = context.verify_tx(tx, MAX_CYCLES).expect_err("transaction should be rejected");
    let text = format!("{err:?}");
    assert!(text.contains(&format!("error code {code} on")), "expected error {code}, got {text}");
}
