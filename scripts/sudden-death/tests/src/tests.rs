//! Sudden Death integration tests against match-type, bid-type, and treasury-lock.

use super::replay::bot_laps;
use super::{verify_and_dump_failed_tx, Loader};
use crowns_game_core::{replay_laps, Lap};
use blake2b_ref::Blake2bBuilder;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{Capacity, HeaderBuilder, ScriptHashType, TransactionBuilder},
        packed::{Byte32, CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};

const MAX_CYCLES: u64 = 30_000_000;
const MATCH_LEN: usize = 215;
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
const OFF_LAND_BY: usize = 166;
const OFF_CERTIFIED: usize = 174;
const OFF_CERTIFIED_SCORE: usize = 206;
const OFF_POW_BITS: usize = 214;
/// Work each test entry needs: small, so tests stay fast, but real.
const POW_BITS: u8 = 8;
const LAP_WINDOW_MS: u64 = 3 * 60 * 1000;
const LAPS: usize = 5;
/// Each test lap's block lands this long after the one before it.
const LAP_GAP_MS: u64 = 30_000;
/// A key cell's capacity in these tests: storage plus room for fees.
const KEY_CELL_CAP: u64 = 62 * 100_000_000;
/// A stand-in key lock hash for entries whose laps a test never seals.
const SOME_KEY: [u8; 32] = [0x4b; 32];
/// When test entries land. Their road comes from this block, and their window runs out before the deadline.
const ENTRY_MS: u64 = DEADLINE_MS - 900_000;
/// When a test entry's last lap was sealed: one lap after the entry landed.
const SEALED_MS: u64 = ENTRY_MS + LAP_GAP_MS;
/// What an honest steal records: one lap window after the last seal, which here beats the deadline.
const ENTRY_LAND_BY: u64 = SEALED_MS + LAP_WINDOW_MS;
/// The clock that was running when a standing king stole: one 10-minute cut before DEADLINE_MS.
const KING_STOLE_BY: u64 = DEADLINE_MS + 600_000;
/// Default postmark: the match cell landed on time.
const ON_TIME: u64 = DEADLINE_MS;
const LATE: u64 = KING_STOLE_BY + 1;
const CLOSER_REWARD: u64 = 100_000_000;
const HOST_ALLOWANCE: u64 = CLOSER_REWARD + MAX_TX_FEE;
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

fn seed_of(match_id: &[u8; 32], owner: &[u8; 32], entry_block: &[u8; 32]) -> u64 {
    let digest = blake(&[&b"crowns/run-seed/v2"[..], match_id, owner, entry_block]);
    u64::from_le_bytes(digest[..8].try_into().unwrap())
}

/// The blocks a test run's laps are sealed against: lap 1 by the entry's block, each later lap by
/// the block the lap before it was sealed in.
fn lap_blocks(count: usize) -> Vec<[u8; 32]> {
    (0..count as u64).map(|k| block_hash_at(ENTRY_MS + k * LAP_GAP_MS)).collect()
}

/// A run's laps as the steal witness carries them: `count ‖ per lap: block ‖ length ‖ tape`.
fn lap_payload(blocks: &[[u8; 32]], tapes: &[Vec<u8>]) -> Vec<u8> {
    let mut raw = vec![blocks.len() as u8];
    for (block, tape) in blocks.iter().zip(tapes) {
        raw.extend_from_slice(block);
        raw.extend_from_slice(&(tape.len() as u16).to_le_bytes());
        raw.extend_from_slice(tape);
    }
    raw
}

fn fold_lap(chain: &[u8; 32], block: &[u8; 32], moves: &[u8]) -> [u8; 32] {
    blake(&[&b"crowns/lap/v1"[..], chain, block, &blake(&[moves])])
}

/// The lap count and chain an entry holds once every lap in `payload` has been sealed.
fn sealed_state(payload: &[u8]) -> (u8, [u8; 32]) {
    let count = payload[0];
    let mut chain = [0u8; 32];
    let mut at = 1;
    for _ in 0..count {
        let block: [u8; 32] = payload[at..at + 32].try_into().unwrap();
        let len = u16::from_le_bytes([payload[at + 32], payload[at + 33]]) as usize;
        chain = fold_lap(&chain, &block, &payload[at + 34..at + 34 + len]);
        at += 34 + len;
    }
    (count, chain)
}

/// A long, legal five-lap run on `owner`'s laps, and its score.
fn run_for(match_id: &[u8; 32], owner: &Script) -> (Vec<u8>, u64) {
    let blocks = lap_blocks(LAPS);
    let seeds: Vec<u64> = blocks.iter().map(|block| seed_of(match_id, &script_hash(owner), block)).collect();
    let tapes = bot_laps(&seeds, 45);
    let laps: Vec<Lap> = seeds.iter().zip(&tapes).map(|(seed, tape)| Lap { seed: *seed, tape }).collect();
    let score = replay_laps(&laps).expect("legal laps").score;
    (lap_payload(&blocks, &tapes), score)
}

fn run_witness(payload: &[u8]) -> Bytes {
    let mut raw = vec![2u8];
    raw.extend_from_slice(payload);
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
    data[OFF_VERSION] = 5;
    data[OFF_POW_BITS] = POW_BITS;
    data[OFF_STATUS] = 0;
    put_u32(&mut data, OFF_ROUND, round);
    put_u64(&mut data, OFF_DEADLINE, deadline);
    put_u64(&mut data, OFF_FEE, FEE);
    put_u64(&mut data, OFF_POT, pot);
    put32(&mut data, OFF_KING, king);
    put32(&mut data, OFF_GAME, game);
    put32(&mut data, OFF_TREASURY, treasury);
    put32(&mut data, OFF_BID_CODE, bid_code);
    if *king != [0u8; 32] {
        put_u64(&mut data, OFF_LAND_BY, KING_STOLE_BY);
    }
    Bytes::from(data)
}

fn with_certified(data: Bytes, king: &[u8; 32], score: u64) -> Bytes {
    let mut raw = data.to_vec();
    put32(&mut raw, OFF_CERTIFIED, king);
    put_u64(&mut raw, OFF_CERTIFIED_SCORE, score);
    Bytes::from(raw)
}

fn with_land_by(data: Bytes, ms: u64) -> Bytes {
    let mut raw = data.to_vec();
    put_u64(&mut raw, OFF_LAND_BY, ms);
    Bytes::from(raw)
}

/// Records that `out_point` was created in a block stamped `ms`: the postmark the scripts read.
fn land(context: &mut Context, out_point: &OutPoint, ms: u64) {
    let header = HeaderBuilder::default().timestamp(ms).build();
    let hash = header.hash();
    context.insert_header(header);
    context.link_cell_with_block(out_point.clone(), hash, 0);
}

/// Hash of the block stamped `ms`, as `land` builds it.
fn block_hash_at(ms: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(HeaderBuilder::default().timestamp(ms).build().hash().as_slice());
    out
}

/// A nonce whose proof of work for this entry has at least `bits` leading zero bits, or, with
/// `solve` false, one that falls short.
fn pow_nonce(match_type_hash: &[u8; 32], owner: &[u8; 32], first_input: &[u8], bits: u8, solve: bool) -> u64 {
    (0u64..)
        .find(|nonce| {
            let digest = blake(&[&b"crowns/entry-pow/v1"[..], match_type_hash, owner, first_input, &nonce.to_le_bytes()]);
            let zeros = digest.iter().take_while(|byte| **byte == 0).count() as u32 * 8
                + digest.iter().find(|byte| **byte != 0).map_or(0, |byte| byte.leading_zeros());
            (zeros >= bits as u32) == solve
        })
        .expect("nonce")
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
    bid_data_full(owner, refund_after_ms, 0, 0, &[0u8; 32], &SOME_KEY)
}

/// An entry's data, version 5: `version ‖ refund ‖ nonce ‖ laps ‖ key lock hash ‖ lap start ms ‖ chain ‖ owner`.
fn bid_data_full(owner: &Script, refund_after_ms: u64, laps: u8, lap_start_ms: u64, chain: &[u8; 32], key: &[u8; 32]) -> Bytes {
    let mut raw = vec![5u8];
    raw.extend_from_slice(&refund_after_ms.to_le_bytes());
    raw.extend_from_slice(&0u64.to_le_bytes());
    raw.push(laps);
    raw.extend_from_slice(key);
    raw.extend_from_slice(&lap_start_ms.to_le_bytes());
    raw.extend_from_slice(chain);
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
    /// When the match cell being spent landed. `None`: its block is left out of `header_deps`.
    landed: Option<u64>,
    /// The certified king the match cell carries in.
    certified: ([u8; 32], u64),
    /// The laps the stealer's entry has sealed. `None`: exactly the laps the steal submits.
    sealed: Option<Vec<u8>>,
    /// Records this land-by time instead of the honest one.
    record_land_by: Option<u64>,
    /// When the entry's last seal landed; its lap opened at ENTRY_MS.
    sealed_at: u64,
}

const OPENING: Standing = Standing { round: 1, king: [0u8; 32], score: 0,
    landed: Some(ON_TIME),
    certified: ([0u8; 32], 0),
    sealed: None,
    record_land_by: None,
    sealed_at: SEALED_MS,
};

impl Standing {
    fn new(round: u32, king: [u8; 32], score: u64) -> Self {
        Standing { round, king, score, ..OPENING }
    }

    /// Who the steal must certify: the standing king, if their steal landed on time.
    fn certifies(&self) -> ([u8; 32], u64) {
        match self.landed {
            Some(ms) if self.king != [0u8; 32] && ms <= KING_STOLE_BY => (self.king, self.score),
            _ => self.certified,
        }
    }
}

/// `stealer` submits `tape` and records `recorded` as the new king score.
fn steal_with(
    context: &mut Context,
    live: &Live,
    standing: &Standing,
    stealer: &Script,
    tape: &[u8],
    recorded: u64,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let certified = standing.certifies();
    steal_claiming(context, live, standing, stealer, tape, recorded, certified)
}

/// As `steal_with`, but the new match cell names `certified` as the certified king.
fn steal_claiming(
    context: &mut Context,
    live: &Live,
    standing: &Standing,
    stealer: &Script,
    tape: &[u8],
    recorded: u64,
    certified: ([u8; 32], u64),
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
    let data = with_certified(data, &standing.certified.0, standing.certified.1);
    let land_by = standing.record_land_by.unwrap_or(standing.sealed_at + LAP_WINDOW_MS);
    let next = with_certified(with_land_by(next, land_by), &certified.0, certified.1);
    let guard_lock = guard(context, live);
    let match_in = context.create_cell(
        cell(CELL_CAP, guard_lock.clone(), Some(live.match_script.clone())),
        data,
    );
    if let Some(ms) = standing.landed {
        land(context, &match_in, ms);
    }
    let treasury_in = context.create_cell(
        cell(CELL_CAP + pot, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let (laps, chain) = sealed_state(standing.sealed.as_deref().unwrap_or(tape));
    let bid_in = sealed_bid(context, live, stealer, laps, &chain, standing.sealed_at);
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
    let broken = lap_payload(&lap_blocks(1), &[vec![5, 0, 1, 5, 0, 2]]);
    let tx = steal_with(&mut context, &live, &OPENING, &king, &broken, 0);
    rejects_with(&context, &tx, -7);
}

#[test]
fn steal_that_beats_the_standing_king_takes_the_crown() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing::new(3, script_hash(&live.other_lock), score - 1);
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("beat the king");
}

#[test]
fn steal_that_only_ties_the_standing_king_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing::new(3, script_hash(&live.other_lock), score);
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    rejects_with(&context, &tx, -12);
}

#[test]
fn king_cannot_steal_from_themselves() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing::new(2, script_hash(&live.king_lock), 1);
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
    let match_in = place_match(context, live, data);
    let treasury_in = context.create_cell(
        cell(CELL_CAP, live.treasury_script.clone(), None),
        Bytes::new(),
    );
    let other_bid = bid_cell(context, live, &live.other_lock);
    let since = SINCE_TIMESTAMP | since_secs;
    let tx = TransactionBuilder::default()
        .input(input_at(match_in, since))
        .input(input_at(treasury_in, since))
        .input(input_at(other_bid, 0))
        .output(cell(CELL_CAP, live.king_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, live.other_lock.clone(), None))
        .output_data(Bytes::new().pack())
        .output(cell(CELL_CAP, live.king_lock.clone(), None))
        .output_data(Bytes::new().pack());
    with_deps(context, live, tx)
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
    // Every input with a postmark brings its block, as the app does.
    let built = tx.build();
    let mut headers: Vec<Byte32> = Vec::new();
    for input in built.inputs().into_iter() {
        if let Some(info) = context.transaction_infos.get(&input.previous_output()) {
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

/// An entry that landed at ENTRY_MS.
fn bid_cell(context: &mut Context, live: &Live, owner: &Script) -> OutPoint {
    let out_point = unlanded_bid(context, live, owner);
    land(context, &out_point, ENTRY_MS);
    out_point
}

fn unlanded_bid(context: &mut Context, live: &Live, owner: &Script) -> OutPoint {
    let type_script = bid_script_for(context, live, owner);
    let lock = bid_lock(context, live, &type_script);
    context.create_cell(cell(CELL_CAP, lock, Some(type_script)), bid_data(owner))
}

/// An entry that has sealed `laps` laps into `chain`: its last lap opened at ENTRY_MS and its seal
/// landed at `sealed_at`.
fn sealed_bid(context: &mut Context, live: &Live, owner: &Script, laps: u8, chain: &[u8; 32], sealed_at: u64) -> OutPoint {
    let type_script = bid_script_for(context, live, owner);
    let lock = bid_lock(context, live, &type_script);
    let data = bid_data_full(owner, DEADLINE_MS + REFUND_GRACE_MS, laps, ENTRY_MS, chain, &SOME_KEY);
    let out_point = context.create_cell(cell(CELL_CAP, lock, Some(type_script)), data);
    land(context, &out_point, sealed_at);
    out_point
}

/// A match cell that landed on time.
fn place_match(context: &mut Context, live: &Live, data: Bytes) -> OutPoint {
    let out_point = place_unlanded(context, live, data);
    land(context, &out_point, ON_TIME);
    out_point
}

/// A match cell whose block the transaction will not list.
fn place_unlanded(context: &mut Context, live: &Live, data: Bytes) -> OutPoint {
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

/// Locks an entry, with the proof of work solved for it.
fn bid_create(
    context: &mut Context,
    live: &Live,
    owner: &Script,
    cap: u64,
    lock: Script,
    type_script: Script,
    data: Bytes,
    match_dep: Option<OutPoint>,
) -> ckb_testtool::ckb_types::core::TransactionView {
    bid_create_with(context, live, owner, cap, lock, type_script, data, match_dep, true)
}

#[allow(clippy::too_many_arguments)]
fn bid_create_with(
    context: &mut Context,
    live: &Live,
    _owner: &Script,
    cap: u64,
    lock: Script,
    type_script: Script,
    data: Bytes,
    match_dep: Option<OutPoint>,
    solve: bool,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let fund = context.create_cell(cell(CELL_CAP * 4, live.host_lock.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    // The work is for the match and owner the entry's type script names, and this transaction's first input.
    let args = type_script.args().raw_data();
    let mut raw = data.to_vec();
    if args.len() == 64 && raw.len() > 17 {
        let match_type_hash: [u8; 32] = args[..32].try_into().unwrap();
        let owner: [u8; 32] = args[32..].try_into().unwrap();
        let nonce = pow_nonce(&match_type_hash, &owner, first.previous_output().as_slice(), POW_BITS, solve);
        raw[9..17].copy_from_slice(&nonce.to_le_bytes());
    }
    let mut tx = TransactionBuilder::default()
        .input(first)
        .output(cell(cap, lock, Some(type_script)))
        .output_data(Bytes::from(raw).pack())
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
    land(&mut context, &match_in, ON_TIME);
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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
        occupied + FEE + MAX_TX_FEE * 6,
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

// v3: the postmark. Each match cell is stamped with the block it landed in. A steal counts only if
// it landed by the deadline that was running when it was sent, and the close pays the last king
// whose steal counted. The close needs no signature: its fee and the closer's tip come out of the
// host's share.

const POT: u64 = 2 * FEE;

fn closer_lock(context: &mut Context, live: &Live) -> Script {
    context
        .build_script(&live.lock_dep.out_point(), Bytes::from(vec![0x44]))
        .expect("closer lock")
}

/// What the host is owed when someone else wins: everything but the pot.
fn host_due_beside_a_winner() -> u64 {
    2 * CELL_CAP - POT
}

/// A close of a round-3 match whose king is `king` and whose certified king is `certified`. The
/// match cell landed at `landed`; `None` leaves its block out of `header_deps`. No input needs a
/// signature: the match, the pot and the entries are all unlocked by their scripts.
fn close_tx(
    context: &mut Context,
    live: &Live,
    king: &Script,
    certified: Option<&Script>,
    landed: Option<u64>,
    entry: Option<&Script>,
    pay: &[(Script, u64)],
) -> ckb_testtool::ckb_types::core::TransactionView {
    let treasury_hash = script_hash(&live.treasury_script);
    let data = match_data(3, DEADLINE_MS, POT, &script_hash(king), &live.game, &treasury_hash, &live.bid_code);
    let data = match certified {
        Some(lock) => with_certified(data, &script_hash(lock), 7),
        None => data,
    };
    let match_in = place_unlanded(context, live, data);
    if let Some(ms) = landed {
        land(context, &match_in, ms);
    }
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let mut tx = TransactionBuilder::default()
        .input(input_at(match_in, since))
        .input(input_at(treasury_in, since));
    if let Some(owner) = entry {
        let bid_in = bid_cell(context, live, owner);
        tx = tx.input(input_at(bid_in, 0));
    }
    for (lock, cap) in pay {
        tx = tx.output(cell(*cap, lock.clone(), None)).output_data(Bytes::new().pack());
    }
    with_deps(context, live, tx)
}

/// The usual payout beside a winner: the pot to them, the host's share less the allowance, and the tip.
fn payout(context: &mut Context, live: &Live, winner: &Script, pot: u64, host: u64) -> Vec<(Script, u64)> {
    let closer = closer_lock(context, live);
    vec![(winner.clone(), pot), (live.host_lock.clone(), host), (closer, CLOSER_REWARD)]
}

#[test]
fn close_with_no_signature_pays_an_on_time_king_and_tips_the_closer() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let king = live.king_lock.clone();
    let pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &king, None, Some(ON_TIME), None, &pay);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("unsigned close");
}

#[test]
fn a_steal_landing_exactly_at_its_deadline_counts() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let king = live.king_lock.clone();
    let pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &king, None, Some(KING_STOLE_BY), None, &pay);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("landed at the deadline");
}

#[test]
fn a_late_steal_lands_but_the_close_pays_the_certified_king() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let (late, certified) = (live.king_lock.clone(), live.other_lock.clone());
    let pay = payout(&mut context, &live, &certified, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &late, Some(&certified), Some(LATE), None, &pay);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("certified king paid");
}

#[test]
fn a_close_that_pays_the_late_king_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let (late, certified) = (live.king_lock.clone(), live.other_lock.clone());
    let pay = payout(&mut context, &live, &late, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &late, Some(&certified), Some(LATE), None, &pay);
    rejects_with(&context, &tx, -3);
}

#[test]
fn with_no_steal_on_time_the_host_gets_everything() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let late = live.king_lock.clone();
    let closer = closer_lock(&mut context, &live);
    let pay = vec![(live.host_lock.clone(), 2 * CELL_CAP - HOST_ALLOWANCE), (closer, CLOSER_REWARD)];
    let tx = close_tx(&mut context, &live, &late, None, Some(LATE), None, &pay);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("host refunded");
}

#[test]
fn with_no_steal_on_time_the_late_king_gets_nothing() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let late = live.king_lock.clone();
    let pay = payout(&mut context, &live, &late, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &late, None, Some(LATE), None, &pay);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_close_without_the_match_block_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let king = live.king_lock.clone();
    let pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &king, None, None, None, &pay);
    rejects_with(&context, &tx, -14);
}

#[test]
fn a_close_taking_more_than_the_tip_and_fee_from_the_host_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let king = live.king_lock.clone();
    let pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE - 1);
    let tx = close_tx(&mut context, &live, &king, None, Some(ON_TIME), None, &pay);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_close_that_shorts_the_king_by_one_shannon_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let king = live.king_lock.clone();
    let pay = payout(&mut context, &live, &king, POT - 1, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let tx = close_tx(&mut context, &live, &king, None, Some(ON_TIME), None, &pay);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_close_refunds_entries_in_full_beside_the_tip() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let (king, other) = (live.king_lock.clone(), live.other_lock.clone());
    let mut pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    pay.push((other.clone(), CELL_CAP));
    let tx = close_tx(&mut context, &live, &king, None, Some(ON_TIME), Some(&other), &pay);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("entry refunded");
}

#[test]
fn a_close_that_shorts_an_entry_by_one_shannon_is_rejected() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let (king, other) = (live.king_lock.clone(), live.other_lock.clone());
    let mut pay = payout(&mut context, &live, &king, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    pay.push((other.clone(), CELL_CAP - 1));
    let tx = close_tx(&mut context, &live, &king, None, Some(ON_TIME), Some(&other), &pay);
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_steal_certifies_the_previous_king_when_they_landed_on_time() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing::new(3, script_hash(&live.other_lock), score - 1);
    let stealer = live.king_lock.clone();
    let tx = steal_claiming(&mut context, &live, &standing, &stealer, &tape, score, ([0u8; 32], 0));
    rejects_with(&context, &tx, -6);
}

#[test]
fn a_late_king_is_never_certified() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let mut standing = Standing::new(3, script_hash(&live.other_lock), score - 1);
    standing.landed = Some(LATE);
    let stealer = live.king_lock.clone();
    let honest = steal_with(&mut context, &live, &standing, &stealer, &tape, score);
    verify_and_dump_failed_tx(&context, &honest, MAX_CYCLES).expect("late king left uncertified");
    let claimed = (standing.king, standing.score);
    let tx = steal_claiming(&mut context, &live, &standing, &stealer, &tape, score, claimed);
    rejects_with(&context, &tx, -6);
}

#[test]
fn two_late_steals_in_a_row_keep_the_last_on_time_king() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let mut standing = Standing::new(4, script_hash(&live.other_lock), score - 1);
    standing.landed = Some(LATE);
    standing.certified = (script_hash(&live.host_lock), 7);
    let stealer = live.king_lock.clone();
    let honest = steal_with(&mut context, &live, &standing, &stealer, &tape, score);
    verify_and_dump_failed_tx(&context, &honest, MAX_CYCLES).expect("certified king kept");
    let dropped = steal_claiming(&mut context, &live, &standing, &stealer, &tape, score, ([0u8; 32], 0));
    rejects_with(&context, &dropped, -6);
}

#[test]
fn a_steal_without_the_match_block_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let mut standing = Standing::new(3, script_hash(&live.other_lock), score - 1);
    standing.landed = None;
    let stealer = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &stealer, &tape, score);
    rejects_with(&context, &tx, -14);
}

// v4: the road is hidden until the entry lands and locking an entry costs proof of work.
// v5: each lap has its own window, and a steal must land within one window of the last seal.

#[test]
fn bid_creation_without_enough_work_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, data) = bid_shell(&mut context, &live, &live.other_lock);
    let other = live.other_lock.clone();
    let tx = bid_create_with(
        &mut context,
        &live,
        &other,
        occupied + FEE + MAX_TX_FEE * 6,
        lock,
        type_script,
        data,
        Some(match_out),
        false,
    );
    rejects_with(&context, &tx, -15);
}

#[test]
fn a_run_on_blocks_its_laps_were_not_sealed_against_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (honest, _) = run_for(&live.match_id, &live.king_lock);
    // The same moves claimed against later blocks: roads the player could have picked after the fact.
    let other_blocks: Vec<[u8; 32]> = (0..LAPS as u64).map(|k| block_hash_at(ENTRY_MS + 1 + k * LAP_GAP_MS)).collect();
    let (_, tapes) = split_payload(&honest);
    let forged = lap_payload(&other_blocks, &tapes);
    let standing = Standing { sealed: Some(honest), ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &forged, 1);
    rejects_with(&context, &tx, -7);
}

#[test]
fn a_steal_that_leaves_out_a_sealed_lap_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (honest, _) = run_for(&live.match_id, &live.king_lock);
    let (blocks, tapes) = split_payload(&honest);
    let shorter = lap_payload(&blocks[..LAPS - 1], &tapes[..LAPS - 1]);
    let standing = Standing { sealed: Some(honest), ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &shorter, 1);
    rejects_with(&context, &tx, -7);
}

#[test]
fn a_steal_with_laps_in_another_order_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (honest, _) = run_for(&live.match_id, &live.king_lock);
    let (mut blocks, mut tapes) = split_payload(&honest);
    blocks.swap(1, 2);
    tapes.swap(1, 2);
    let standing = Standing { sealed: Some(honest), ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &lap_payload(&blocks, &tapes), 1);
    rejects_with(&context, &tx, -7);
}

#[test]
fn a_steal_with_only_the_first_two_laps_sealed_scores_them() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (full, _) = run_for(&live.match_id, &live.king_lock);
    let (blocks, tapes) = split_payload(&full);
    let seeds: Vec<u64> = blocks[..2].iter().map(|block| seed_of(&live.match_id, &script_hash(&live.king_lock), block)).collect();
    let laps: Vec<Lap> = seeds.iter().zip(&tapes[..2]).map(|(seed, tape)| Lap { seed: *seed, tape }).collect();
    let score = replay_laps(&laps).expect("legal laps").score;
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &OPENING, &king, &lap_payload(&blocks[..2], &tapes[..2]), score);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("two-lap run");
}

fn split_payload(payload: &[u8]) -> (Vec<[u8; 32]>, Vec<Vec<u8>>) {
    let (mut blocks, mut tapes) = (Vec::new(), Vec::new());
    let mut at = 1;
    for _ in 0..payload[0] {
        blocks.push(payload[at..at + 32].try_into().unwrap());
        let len = u16::from_le_bytes([payload[at + 32], payload[at + 33]]) as usize;
        tapes.push(payload[at + 34..at + 34 + len].to_vec());
        at += 34 + len;
    }
    (blocks, tapes)
}

#[test]
fn a_steal_that_records_a_later_land_by_than_its_window_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    // Claiming the full deadline instead of one lap window after the last seal would let a slow steal count.
    let standing = Standing { record_land_by: Some(DEADLINE_MS), ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    rejects_with(&context, &tx, -5);
}

#[test]
fn a_steal_landing_after_its_run_window_never_counts() {
    let mut context = Context::default();
    let live = live_as(&mut context, 0x33);
    let (slow, certified) = (live.king_lock.clone(), live.other_lock.clone());
    // The king's window closed at ENTRY_LAND_BY. Their steal landed a second after that, well before the deadline.
    let treasury_hash = script_hash(&live.treasury_script);
    let data = match_data(3, DEADLINE_MS, POT, &script_hash(&slow), &live.game, &treasury_hash, &live.bid_code);
    let data = with_certified(with_land_by(data, ENTRY_LAND_BY), &script_hash(&certified), 7);
    let match_in = place_unlanded(&mut context, &live, data);
    land(&mut context, &match_in, ENTRY_LAND_BY + 1_000);
    let treasury_in = context.create_cell(cell(CELL_CAP, live.treasury_script.clone(), None), Bytes::new());
    let since = SINCE_TIMESTAMP | (DEADLINE_MS / 1000);
    let pay = payout(&mut context, &live, &certified, POT, host_due_beside_a_winner() - HOST_ALLOWANCE);
    let mut tx = TransactionBuilder::default()
        .input(input_at(match_in, since))
        .input(input_at(treasury_in, since));
    for (lock, cap) in &pay {
        tx = tx.output(cell(*cap, lock.clone(), None)).output_data(Bytes::new().pack());
    }
    let tx = with_deps(&mut context, &live, tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("slow king passed over");
}

#[test]
fn a_match_asking_for_more_work_than_the_limit_is_rejected() {
    let mut context = Context::default();
    let match_bin = Deployed::load(&mut context, "match-type");
    let bid_bin = Deployed::load(&mut context, "bid-type");
    let treasury_bin = Deployed::load(&mut context, "treasury-lock");
    let (payer, payer_dep) = always(&mut context, &[0x01]);
    let (proxy_out, proxy_dep) = proxy_pair(&mut context);
    let fund = context.create_cell(cell(CELL_CAP * 3, payer.clone(), None), Bytes::new());
    let first = input_at(fund, 0);
    let match_id = type_id_of(&first, 0);
    let match_script = match_bin.script(&mut context, &type_args(&match_id, &script_hash(&payer)));
    let match_type_hash = script_hash(&match_script);
    let guard = proxy_lock(&mut context, &proxy_out, &match_type_hash);
    let treasury_script = treasury_bin.script(&mut context, &match_type_hash);
    let bid_code = code_hash(&bid_bin.script(&mut context, &match_type_hash));
    let mut data = match_data(1, DEADLINE_MS, 0, &[0u8; 32], &game_hash(), &script_hash(&treasury_script), &bid_code).to_vec();
    data[OFF_POW_BITS] = 33;
    let tx = TransactionBuilder::default()
        .input(first)
        .output(cell(CELL_CAP, guard, Some(match_script)))
        .output_data(Bytes::from(data).pack())
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
    rejects_with(&context, &tx, -15);
}

// Lap seals: the entry records each lap against the block the entry last landed in. A seal spends
// the player's key cell, whose lock (CKB's built-in secp256k1 lock, on chain) checks the session
// key's signature. Here the key cell's lock is always-success: what these tests check is that the
// entry script demands the key cell, not CKB's own signature check.

/// How a test seal is built. `Seal::honest` is a valid first-lap seal; tests change one thing.
struct Seal {
    laps_before: u8,
    landed_ms: u64,
    /// The lock of the key cell the seal spends. `None`: no key cell at all.
    key_arg: Option<u8>,
    laps_after: Option<u8>,
    fold_block: Option<[u8; 32]>,
    /// Capacity taken from the entry itself.
    taken: u64,
    linked: bool,
}

/// The player's key cell lock in these tests.
const KEY_ARG: u8 = 0x6b;

impl Seal {
    fn honest() -> Self {
        Seal { laps_before: 0, landed_ms: ENTRY_MS, key_arg: Some(KEY_ARG), laps_after: None, fold_block: None, taken: 0, linked: true }
    }
}

fn seal_tx(context: &mut Context, live: &Live, seal: Seal) -> ckb_testtool::ckb_types::core::TransactionView {
    let owner = live.other_lock.clone();
    let type_script = bid_script_for(context, live, &owner);
    let lock = bid_lock(context, live, &type_script);
    let key_lock = context.build_script(&live.lock_dep.out_point(), Bytes::from(vec![KEY_ARG])).expect("key lock");
    let session = script_hash(&key_lock);
    let refund = DEADLINE_MS + REFUND_GRACE_MS;
    // Before lap 1 there is no lap start; afterwards the last lap opened at ENTRY_MS.
    let (chain_before, start_before) = if seal.laps_before == 0 { ([0u8; 32], 0) } else { ([7u8; 32], ENTRY_MS) };
    let input_data = bid_data_full(&owner, refund, seal.laps_before, start_before, &chain_before, &session);
    let bid_in = context.create_cell(cell(CELL_CAP, lock.clone(), Some(type_script.clone())), input_data);
    if seal.linked {
        land(context, &bid_in, seal.landed_ms);
    }
    let moves = [0x4du8; 32];
    let block = seal.fold_block.unwrap_or(block_hash_at(seal.landed_ms));
    let chain = blake(&[&b"crowns/lap/v1"[..], &chain_before, &block, &moves]);
    let laps_after = seal.laps_after.unwrap_or(seal.laps_before + 1);
    // The new lap opens where the entry being spent landed.
    let output_data = bid_data_full(&owner, refund, laps_after, seal.landed_ms, &chain, &session);
    let mut raw = vec![1u8];
    raw.extend_from_slice(&moves);
    let mut tx = TransactionBuilder::default()
        .input(input_at(bid_in, 0))
        .output(cell(CELL_CAP - seal.taken, lock, Some(type_script)))
        .output_data(output_data.pack())
        .witness(witness(Some(Bytes::from(raw))).pack());
    // The key cell pays the miner fee and comes back.
    if let Some(arg) = seal.key_arg {
        let key = context.build_script(&live.lock_dep.out_point(), Bytes::from(vec![arg])).expect("key lock");
        let key_in = context.create_cell(cell(KEY_CELL_CAP, key.clone(), None), Bytes::new());
        tx = tx
            .input(input_at(key_in, 0))
            .output(cell(KEY_CELL_CAP - 1_000, key, None))
            .output_data(Bytes::new().pack());
    }
    with_deps(context, live, tx)
}

#[test]
fn a_first_lap_seal_with_the_key_cell_passes() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal::honest());
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("seal");
    println!("one lap seal, entry script only (CKB's lock checks the key): {cycles} cycles");
}

#[test]
fn a_later_lap_seal_passes() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { laps_before: 3, landed_ms: ENTRY_MS + 90_000, ..Seal::honest() });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("lap 4 seal");
}

#[test]
fn a_seal_with_another_players_key_cell_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { key_arg: Some(0x77), ..Seal::honest() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_seal_without_any_key_cell_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { key_arg: None, ..Seal::honest() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_seal_folded_against_another_block_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { fold_block: Some(block_hash_at(ENTRY_MS + 1)), ..Seal::honest() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_seal_that_skips_a_lap_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { laps_after: Some(2), ..Seal::honest() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_sixth_lap_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { laps_before: LAPS as u8, landed_ms: ENTRY_MS + 150_000, ..Seal::honest() });
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_seal_taking_capacity_from_the_entry_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { taken: 1, ..Seal::honest() });
    rejects_with(&context, &tx, -3);
}

#[test]
fn a_seal_without_the_entry_block_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { linked: false, ..Seal::honest() });
    rejects_with(&context, &tx, -14);
}

#[test]
fn bid_creation_without_a_key_cell_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let match_out = funded_match(&mut context, &live);
    let (occupied, lock, type_script, _) = bid_shell(&mut context, &live, &live.other_lock);
    let data = bid_data_full(&live.other_lock, DEADLINE_MS + REFUND_GRACE_MS, 0, 0, &[0u8; 32], &[0u8; 32]);
    let other = live.other_lock.clone();
    let tx = bid_create(&mut context, &live, &other, occupied + FEE + MAX_TX_FEE * 6, lock, type_script, data, Some(match_out));
    rejects_with(&context, &tx, -16);
}

// v5 per-lap clock: each lap's window opens with the block its road came from, so waiting for that
// block never counts against the lap.

#[test]
fn a_lap_sealed_just_inside_its_window_passes() {
    let mut context = Context::default();
    let live = live(&mut context);
    let tx = seal_tx(&mut context, &live, Seal { laps_before: 2, landed_ms: ENTRY_MS + LAP_WINDOW_MS, ..Seal::honest() });
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("lap sealed on the last millisecond");
}

#[test]
fn a_seal_after_a_late_lap_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    // Lap 2 opened at ENTRY_MS; its seal landed a millisecond after its window closed.
    let tx = seal_tx(&mut context, &live, Seal { laps_before: 2, landed_ms: ENTRY_MS + LAP_WINDOW_MS + 1, ..Seal::honest() });
    rejects_with(&context, &tx, -5);
}

#[test]
fn a_seal_that_restarts_the_lap_clock_elsewhere_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let mut tx_seal = Seal { laps_before: 1, landed_ms: ENTRY_MS + 60_000, ..Seal::honest() };
    tx_seal.fold_block = Some(block_hash_at(ENTRY_MS + 60_000));
    let tx = seal_tx(&mut context, &live, tx_seal);
    // Honest so far; now claim the new lap opened later than the block it came from.
    let tx = with_output_lap_start(&tx, ENTRY_MS + 120_000);
    rejects_with(&context, &tx, -16);
}

#[test]
fn a_steal_after_a_late_last_lap_is_rejected() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    let standing = Standing { sealed_at: ENTRY_MS + LAP_WINDOW_MS + 1, ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    rejects_with(&context, &tx, -5);
}

#[test]
fn a_steal_counts_from_its_last_seal_not_from_the_entry() {
    let mut context = Context::default();
    let live = live(&mut context);
    let (tape, score) = run_for(&live.match_id, &live.king_lock);
    // A run whose last lap was sealed late in its window: the steal may land a full window after that.
    let standing = Standing { sealed_at: ENTRY_MS + LAP_WINDOW_MS, ..OPENING };
    let king = live.king_lock.clone();
    let tx = steal_with(&mut context, &live, &standing, &king, &tape, score);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("land-by from the last seal");
}

/// The same transaction with the entry output's lap start set to `ms`.
fn with_output_lap_start(
    tx: &ckb_testtool::ckb_types::core::TransactionView,
    ms: u64,
) -> ckb_testtool::ckb_types::core::TransactionView {
    let mut outputs: Vec<_> = tx.outputs_data().into_iter().collect();
    let mut raw = outputs[0].raw_data().to_vec();
    raw[50..58].copy_from_slice(&ms.to_le_bytes());
    outputs[0] = Bytes::from(raw).pack();
    tx.as_advanced_builder().set_outputs_data(outputs).build()
}
