//! Chain Cell v2 — one test per rule the script is supposed to hold, and one
//! test per way somebody could try to cheat it.

use super::{verify_and_dump_failed_tx, Loader};
use blake2b_ref::{Blake2b, Blake2bBuilder};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{TransactionBuilder, TransactionView},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};

const MAX_CYCLES: u64 = 20_000_000;
const DATA_LEN: usize = 168;
const VERSION: u8 = 2;

const STATUS_ALIVE: u8 = 0;
const STATUS_DEAD: u8 = 1;
const STATUS_RETURNED: u8 = 2;

const MODE_OPEN: u8 = 0;
const MODE_RETURN_HOME: u8 = 1;

const FLAG_STAKES: u8 = 0b0000_0001;

const SINCE_ABSOLUTE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;

const WINDOW: u32 = 86_400;
/// Deadline used across tests, in ms.
const EXPIRES: u64 = 1_700_000_000_000;
/// A moment comfortably before `EXPIRES`, in seconds.
const BEFORE_SECS: u64 = 1_699_990_000;
/// A moment after `EXPIRES`, in seconds.
const AFTER_SECS: u64 = 1_700_000_001;

const BIG_CAP: u64 = 30_000_000_000;
const SMALL_CAP: u64 = 29_900_000_000;
const FUND_CAP: u64 = 60_000_000_000;
const GAS_CAP: u64 = 10_000_000_000;
const GAS_CHANGE: u64 = 9_900_000_000;

const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";
const LINEAGE_SEED_TAG: &[u8] = b"keepers-relay:lineage:v2";

fn new_blake2b() -> Blake2b {
    Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build()
}

fn hash_pair(a: &[u8], b: &[u8]) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(a);
    hasher.update(b);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn genesis_lineage(chain_id: &[u8; 32], first_keeper: &[u8; 32]) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(LINEAGE_SEED_TAG);
    hasher.update(chain_id);
    hasher.update(first_keeper);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn type_id_of(first_input: &CellInput, output_index: u64) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn since_at(secs: u64) -> u64 {
    SINCE_ABSOLUTE_TIMESTAMP | secs
}

#[derive(Clone)]
struct Chain {
    status: u8,
    mode: u8,
    flags: u8,
    owner_count: u32,
    expires_at_ms: u64,
    window_seconds: u32,
    chain_id: [u8; 32],
    lineage_root: [u8; 32],
    artifact_root: [u8; 32],
    creator_lock_hash: [u8; 32],
    entry_proof: u32,
    escalation_bp: u16,
    decay_bp: u16,
    floor_seconds: u32,
    pot_amount: u64,
}

impl Chain {
    fn alive(chain_id: [u8; 32], creator: [u8; 32]) -> Self {
        Chain {
            status: STATUS_ALIVE,
            mode: MODE_OPEN,
            flags: 0,
            owner_count: 1,
            expires_at_ms: EXPIRES,
            window_seconds: WINDOW,
            chain_id,
            lineage_root: genesis_lineage(&chain_id, &creator),
            artifact_root: [0u8; 32],
            creator_lock_hash: creator,
            entry_proof: 0,
            escalation_bp: 0,
            decay_bp: 0,
            floor_seconds: 0,
            pot_amount: 0,
        }
    }

    fn encode(&self) -> Bytes {
        let mut data = [0u8; DATA_LEN];
        data[0] = VERSION;
        data[1] = self.status;
        data[2] = self.mode;
        data[3] = self.flags;
        data[4..8].copy_from_slice(&self.owner_count.to_le_bytes());
        data[8..16].copy_from_slice(&self.expires_at_ms.to_le_bytes());
        data[16..20].copy_from_slice(&self.window_seconds.to_le_bytes());
        data[20..52].copy_from_slice(&self.chain_id);
        data[52..84].copy_from_slice(&self.lineage_root);
        data[84..116].copy_from_slice(&self.artifact_root);
        data[116..148].copy_from_slice(&self.creator_lock_hash);
        data[148..152].copy_from_slice(&self.entry_proof.to_le_bytes());
        data[152..154].copy_from_slice(&self.escalation_bp.to_le_bytes());
        data[154..156].copy_from_slice(&self.decay_bp.to_le_bytes());
        data[156..160].copy_from_slice(&self.floor_seconds.to_le_bytes());
        data[160..168].copy_from_slice(&self.pot_amount.to_le_bytes());
        Bytes::from(data.to_vec())
    }

    /// The successor produced by a valid pass to `next_lock`.
    fn passed_to(&self, next_lock: &[u8; 32], anchor_secs: u64) -> Self {
        let mut next = self.clone();
        next.owner_count = self.owner_count + 1;
        next.lineage_root = hash_pair(&self.lineage_root, next_lock);
        next.expires_at_ms = anchor_secs * 1000 + (expected_window(self) as u64) * 1000;
        next
    }
}

/// Mirrors `next_window_seconds` in the contract.
fn expected_window(input: &Chain) -> u32 {
    if input.flags & FLAG_STAKES == 0 {
        return input.window_seconds;
    }
    let keep = 10_000u64 - input.decay_bp as u64;
    let mut window = input.window_seconds as u64;
    let floor = input.floor_seconds as u64;
    for _ in 0..input.owner_count.min(1024) {
        if window <= floor {
            break;
        }
        window = window * keep / 10_000;
    }
    if window < floor {
        window = floor;
    }
    window as u32
}

fn always_success(context: &mut Context, args: &[u8]) -> (Script, CellDep) {
    let out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let script = context
        .build_script(&out_point, Bytes::from(args.to_vec()))
        .expect("always-success");
    let dep = CellDep::new_builder().out_point(out_point).build();
    (script, dep)
}

fn lock_hash_of(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.calc_script_hash().as_slice());
    out
}

fn type_hash_of(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.calc_script_hash().as_slice());
    out
}

struct ChainType {
    out_point: OutPoint,
    dep: CellDep,
}

fn load_chain_type(context: &mut Context) -> ChainType {
    let bin = Loader::default().load_binary("chain-cell-type");
    let out_point = context.deploy_cell(bin);
    let dep = CellDep::new_builder().out_point(out_point.clone()).build();
    ChainType { out_point, dep }
}

impl ChainType {
    fn script(&self, context: &mut Context, args: &[u8; 32]) -> Script {
        context
            .build_script(&self.out_point, Bytes::from(args.to_vec()))
            .expect("chain cell type")
    }
}

fn load_keeper_lock(context: &mut Context) -> (OutPoint, CellDep) {
    let bin = Loader::default().load_binary("keeper-lock");
    let out_point = context.deploy_cell(bin);
    let dep = CellDep::new_builder().out_point(out_point.clone()).build();
    (out_point, dep)
}

/// Build a 1-in-1-out update transaction on a live Chain Cell.
#[allow(clippy::too_many_arguments)]
fn update_tx(
    context: &mut Context,
    chain_type: &Script,
    type_dep: &CellDep,
    input_lock: Script,
    input_lock_dep: &CellDep,
    input_data: &Chain,
    output_lock: Script,
    output_data: &Chain,
    since: u64,
    witness: Option<WitnessArgs>,
) -> TransactionView {
    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(BIG_CAP)
            .lock(input_lock)
            .type_(Some(chain_type.clone()).pack())
            .build(),
        input_data.encode(),
    );

    let mut builder = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(live)
                .since(since)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(SMALL_CAP)
                .lock(output_lock)
                .type_(Some(chain_type.clone()).pack())
                .build(),
        )
        .output_data(output_data.encode().pack())
        .cell_dep(input_lock_dep.clone())
        .cell_dep(type_dep.clone());

    if let Some(w) = witness {
        builder = builder.witness(w.as_bytes().pack());
    }

    builder.build()
}

// ——— Mint ————————————————————————————————————————————————————————————————

/// Build a valid genesis mint, letting each test corrupt exactly one thing.
fn mint_tx(
    context: &mut Context,
    chain_ty: &ChainType,
    lock: Script,
    lock_dep: &CellDep,
    mutate: impl FnOnce(&mut Chain),
) -> TransactionView {
    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(FUND_CAP)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );
    let first_input = CellInput::new_builder().previous_output(fund).build();
    let chain_id = type_id_of(&first_input, 0);
    let type_script = chain_ty.script(context, &chain_id);

    let mut data = Chain::alive(chain_id, lock_hash_of(&lock));
    mutate(&mut data);

    TransactionBuilder::default()
        .input(first_input)
        .output(
            CellOutput::new_builder()
                .capacity(BIG_CAP)
                .lock(lock)
                .type_(Some(type_script).pack())
                .build(),
        )
        .output_data(data.encode().pack())
        .cell_dep(lock_dep.clone())
        .cell_dep(chain_ty.dep.clone())
        .build()
}

#[test]
fn mint_with_correct_type_id_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x01]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |_| {});
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("mint should pass");
    println!("[chain-cell v2] mint — cycles: {cycles}");
}

#[test]
fn mint_with_forged_chain_id_rejected() {
    // The whole point of type-id: you cannot mint a Cell that claims an
    // identity it did not derive from its own first input.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x02]);

    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(FUND_CAP)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );
    let first_input = CellInput::new_builder().previous_output(fund).build();
    let forged = [0xAB; 32];
    let type_script = chain_ty.script(&mut context, &forged);
    let data = Chain::alive(forged, lock_hash_of(&lock));

    let tx = TransactionBuilder::default()
        .input(first_input)
        .output(
            CellOutput::new_builder()
                .capacity(BIG_CAP)
                .lock(lock)
                .type_(Some(type_script).pack())
                .build(),
        )
        .output_data(data.encode().pack())
        .cell_dep(lock_dep)
        .cell_dep(chain_ty.dep.clone())
        .build();

    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("forged chain_id must fail");
}

#[test]
fn mint_with_wrong_genesis_lineage_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x03]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |data| {
        data.lineage_root = [0x99; 32];
    });
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("bad lineage seed must fail");
}

#[test]
fn mint_with_prefilled_artifact_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x04]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |data| {
        data.artifact_root = [0x77; 32];
    });
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("a fresh Cell cannot already have marks");
}

#[test]
fn mint_with_stakes_flag_off_but_fields_set_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x05]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |data| {
        data.entry_proof = 10;
    });
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("stakes fields must be zero when stakes are off");
}

#[test]
fn mint_stakes_cell_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x06]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |data| {
        data.flags = FLAG_STAKES;
        data.entry_proof = 5;
        data.escalation_bp = 3_500;
        data.decay_bp = 1_500;
        data.floor_seconds = 3_600;
    });
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("stakes mint should pass");
    println!("[chain-cell v2] stakes mint — cycles: {cycles}");
}

#[test]
fn mint_stakes_without_decay_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x07]);

    let tx = mint_tx(&mut context, &chain_ty, lock, &lock_dep, |data| {
        data.flags = FLAG_STAKES;
        data.entry_proof = 5;
        data.escalation_bp = 3_500;
        data.decay_bp = 0;
        data.floor_seconds = 3_600;
    });
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("a stakes Cell must actually decay");
}

// ——— Handoff —————————————————————————————————————————————————————————————

#[test]
fn handoff_before_deadline_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xaa]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xbb]);
    let chain_id = [0x44; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("handoff should pass");
    println!("[chain-cell v2] handoff — cycles: {cycles}");
}

#[test]
fn handoff_after_deadline_rejected() {
    // The clock is now real: an anchor past the deadline cannot pass.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa1]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb1]);
    let chain_id = [0x45; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let output = input.passed_to(&lock_hash_of(&lock_b), AFTER_SECS);

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(AFTER_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("passing after the deadline must fail");
}

#[test]
fn handoff_without_absolute_since_rejected() {
    // A bare `since: 0` gives no time evidence at all, so it must be refused.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa2]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb2]);
    let chain_id = [0x46; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        0,
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("since: 0 must fail");
}

#[test]
fn handoff_with_stretched_clock_rejected() {
    // Awarding the successor more time than one window is the obvious cheat.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa3]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb3]);
    let chain_id = [0x47; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.expires_at_ms += 7 * 24 * 3600 * 1000;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("stretched clock must fail");
}

#[test]
fn handoff_with_rewritten_lineage_rejected() {
    // Lineage is append-only; you cannot erase who carried it before you.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa4]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb4]);
    let chain_id = [0x48; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.lineage_root = [0x00; 32];

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("rewritten lineage must fail");
}

#[test]
fn handoff_to_self_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xcc]);
    let chain_id = [0x55; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let output = input.passed_to(&lock_hash_of(&lock), BEFORE_SECS);

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock.clone(),
        &dep,
        &input,
        lock,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("self-pass must fail");
}

#[test]
fn stakes_handoff_shrinks_the_window() {
    // The v1 script forced a full-window bump, which made stakes mode
    // impossible on chain. v2 computes the decayed window itself.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa5]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb5]);
    let chain_id = [0x49; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    input.flags = FLAG_STAKES;
    input.entry_proof = 5;
    input.escalation_bp = 3_500;
    input.decay_bp = 1_500;
    input.floor_seconds = 3_600;
    input.owner_count = 3;

    let window = expected_window(&input);
    assert!(window < WINDOW, "window should have decayed");

    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.pot_amount = input.pot_amount + 9;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect("decayed stakes handoff should pass");
    println!("[chain-cell v2] stakes handoff (window {window}s) — cycles: {cycles}");
}

#[test]
fn stakes_handoff_with_full_window_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa6]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb6]);
    let chain_id = [0x4a; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    input.flags = FLAG_STAKES;
    input.entry_proof = 5;
    input.escalation_bp = 3_500;
    input.decay_bp = 1_500;
    input.floor_seconds = 3_600;
    input.owner_count = 3;

    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.expires_at_ms = BEFORE_SECS * 1000 + (WINDOW as u64) * 1000;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("a stakes Cell cannot keep the full window");
}

#[test]
fn handoff_draining_the_pot_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0xa7]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0xb7]);
    let chain_id = [0x4b; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    input.pot_amount = 500;

    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.pot_amount = 0;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("pot must never shrink");
}

// ——— Seal ————————————————————————————————————————————————————————————————

#[test]
fn seal_extends_artifact_chain() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xdd]);
    let chain_id = [0x77; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let mark = [0x5a; 32];
    let mut output = input.clone();
    output.artifact_root = hash_pair(&input.artifact_root, &mark);

    let witness = WitnessArgs::new_builder()
        .output_type(Some(Bytes::from(mark.to_vec())).pack())
        .build();

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock.clone(),
        &dep,
        &input,
        lock,
        &output,
        since_at(BEFORE_SECS),
        Some(witness),
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("seal should pass");
    println!("[chain-cell v2] seal — cycles: {cycles}");
}

#[test]
fn seal_with_arbitrary_artifact_root_rejected() {
    // v1 let a Keeper write any 32 bytes here. v2 requires the preimage.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xde]);
    let chain_id = [0x78; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let mark = [0x5a; 32];
    let mut output = input.clone();
    output.artifact_root = [0xff; 32];

    let witness = WitnessArgs::new_builder()
        .output_type(Some(Bytes::from(mark.to_vec())).pack())
        .build();

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock.clone(),
        &dep,
        &input,
        lock,
        &output,
        since_at(BEFORE_SECS),
        Some(witness),
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("artifact root must be the hash of the previous root plus the mark");
}

// ——— Return home —————————————————————————————————————————————————————————

#[test]
fn return_home_to_creator_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (holder, holder_dep) = always_success(&mut context, &[0x01]);
    let (creator, _creator_dep) = always_success(&mut context, &[0x02]);
    let chain_id = [0x66; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&creator));
    input.mode = MODE_RETURN_HOME;
    input.owner_count = 4;

    let mut output = input.passed_to(&lock_hash_of(&creator), BEFORE_SECS);
    output.status = STATUS_RETURNED;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        holder,
        &holder_dep,
        &input,
        creator,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("return home should pass");
    println!("[chain-cell v2] return home — cycles: {cycles}");
}

#[test]
fn return_home_to_stranger_rejected() {
    // "Returned" is a real ending, not a status anyone can claim.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (holder, holder_dep) = always_success(&mut context, &[0x03]);
    let (creator, _cdep) = always_success(&mut context, &[0x04]);
    let (stranger, _sdep) = always_success(&mut context, &[0x05]);
    let chain_id = [0x67; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&creator));
    input.mode = MODE_RETURN_HOME;
    input.owner_count = 4;

    let mut output = input.passed_to(&lock_hash_of(&stranger), BEFORE_SECS);
    output.status = STATUS_RETURNED;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        holder,
        &holder_dep,
        &input,
        stranger,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("only the creator can receive it home");
}

// ——— Reap ————————————————————————————————————————————————————————————————

#[test]
fn reap_after_deadline_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xee]);
    let chain_id = [0x88; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let mut output = input.clone();
    output.status = STATUS_DEAD;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock.clone(),
        &dep,
        &input,
        lock,
        &output,
        since_at(AFTER_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("reap should pass");
    println!("[chain-cell v2] reap — cycles: {cycles}");
}

#[test]
fn reap_before_deadline_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xef]);
    let chain_id = [0x89; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let mut output = input.clone();
    output.status = STATUS_DEAD;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock.clone(),
        &dep,
        &input,
        lock,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("cannot kill a Cell that still has time");
}

#[test]
fn reap_moving_the_cell_rejected() {
    // A reaper settles the run; they do not get to take the Cell.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, dep) = always_success(&mut context, &[0xf0]);
    let (thief, _tdep) = always_success(&mut context, &[0xf1]);
    let chain_id = [0x8a; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock));
    let mut output = input.clone();
    output.status = STATUS_DEAD;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock,
        &dep,
        &input,
        thief,
        &output,
        since_at(AFTER_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("a reaper cannot move the Cell");
}

// ——— Burn ————————————————————————————————————————————————————————————————

fn burn_tx(
    context: &mut Context,
    chain_ty: &ChainType,
    status: u8,
    lock_args: &[u8],
) -> TransactionView {
    let (lock, lock_dep) = always_success(context, lock_args);
    let chain_id = [0x33; 32];
    let type_script = chain_ty.script(context, &chain_id);

    let mut data = Chain::alive(chain_id, lock_hash_of(&lock));
    data.status = status;

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(BIG_CAP)
            .lock(lock)
            .type_(Some(type_script).pack())
            .build(),
        data.encode(),
    );
    let (sink, sink_dep) = always_success(context, &[0x99]);

    TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(SMALL_CAP)
                .lock(sink)
                .build(),
        )
        .output_data(Bytes::new().pack())
        .cell_dep(lock_dep)
        .cell_dep(sink_dep)
        .cell_dep(chain_ty.dep.clone())
        .build()
}

#[test]
fn burning_a_live_cell_rejected() {
    // v1 allowed this unconditionally — the Keeper could delete the Cell and
    // every mark on it at any moment.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let tx = burn_tx(&mut context, &chain_ty, STATUS_ALIVE, &[0x11]);
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("a live Cell must not be destroyable");
}

#[test]
fn burning_a_settled_cell_passes() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let tx = burn_tx(&mut context, &chain_ty, STATUS_RETURNED, &[0x12]);
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("settled burn should pass");
    println!("[chain-cell v2] burn settled — cycles: {cycles}");
}

// ——— Frozen once ended ———————————————————————————————————————————————————

#[test]
fn updating_a_dead_cell_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0x21]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0x22]);
    let chain_id = [0x99; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let mut input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    input.status = STATUS_DEAD;
    let output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("a dead Cell is frozen");
}

#[test]
fn changing_the_window_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock_a, dep_a) = always_success(&mut context, &[0x23]);
    let (lock_b, _dep_b) = always_success(&mut context, &[0x24]);
    let chain_id = [0x9a; 32];
    let type_script = chain_ty.script(&mut context, &chain_id);

    let input = Chain::alive(chain_id, lock_hash_of(&lock_a));
    let mut output = input.passed_to(&lock_hash_of(&lock_b), BEFORE_SECS);
    output.window_seconds = 60;

    let tx = update_tx(
        &mut context,
        &type_script,
        &chain_ty.dep,
        lock_a,
        &dep_a,
        &input,
        lock_b,
        &output,
        since_at(BEFORE_SECS),
        None,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("the rules cannot change");
}

#[test]
fn two_cells_in_one_group_rejected() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, &[0x31]);

    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(90_000_000_000u64)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );
    let first_input = CellInput::new_builder().previous_output(fund).build();
    let chain_id = type_id_of(&first_input, 0);
    let type_script = chain_ty.script(&mut context, &chain_id);
    let data = Chain::alive(chain_id, lock_hash_of(&lock));

    let tx = TransactionBuilder::default()
        .input(first_input)
        .output(
            CellOutput::new_builder()
                .capacity(BIG_CAP)
                .lock(lock.clone())
                .type_(Some(type_script.clone()).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(BIG_CAP)
                .lock(lock)
                .type_(Some(type_script).pack())
                .build(),
        )
        .output_data(data.encode().pack())
        .output_data(data.encode().pack())
        .cell_dep(lock_dep)
        .cell_dep(chain_ty.dep.clone())
        .build();

    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("a Cell cannot be duplicated");
}

// ——— Keeper lock —————————————————————————————————————————————————————————

/// Shared setup for the two keeper-lock tests: a live Chain Cell wearing the
/// keeper lock, and a stranger who funds the fee but owns nothing else.
#[allow(clippy::type_complexity)]
fn keeper_lock_reap_tx(
    context: &mut Context,
    chain_ty: &ChainType,
    owner_args: &[u8],
    stranger_args: &[u8],
    chain_id: [u8; 32],
    since: u64,
) -> TransactionView {
    let (keeper_out_point, keeper_dep) = load_keeper_lock(context);
    let (owner, _owner_dep) = always_success(context, owner_args);
    let (stranger, stranger_dep) = always_success(context, stranger_args);

    let type_script = chain_ty.script(context, &chain_id);
    let type_hash = type_hash_of(&type_script);

    let mut args = Vec::with_capacity(64);
    args.extend_from_slice(&lock_hash_of(&owner));
    args.extend_from_slice(&type_hash);
    let keeper_lock = context
        .build_script(&keeper_out_point, Bytes::from(args))
        .expect("keeper lock");

    let input = Chain::alive(chain_id, lock_hash_of(&owner));
    let mut output = input.clone();
    output.status = STATUS_DEAD;

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(BIG_CAP)
            .lock(keeper_lock.clone())
            .type_(Some(type_script.clone()).pack())
            .build(),
        input.encode(),
    );
    let gas = context.create_cell(
        CellOutput::new_builder()
            .capacity(GAS_CAP)
            .lock(stranger.clone())
            .build(),
        Bytes::new(),
    );

    TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(live)
                .since(since)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(gas).build())
        .output(
            CellOutput::new_builder()
                .capacity(BIG_CAP)
                .lock(keeper_lock)
                .type_(Some(type_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(GAS_CHANGE)
                .lock(stranger)
                .build(),
        )
        .output_data(output.encode().pack())
        .output_data(Bytes::new().pack())
        .cell_dep(keeper_dep)
        .cell_dep(stranger_dep)
        .cell_dep(chain_ty.dep.clone())
        .build()
}

#[test]
fn keeper_lock_opens_for_a_stranger_after_expiry() {
    // This is what makes death recordable: the Keeper can vanish and the run
    // can still be settled by anybody.
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let tx = keeper_lock_reap_tx(
        &mut context,
        &chain_ty,
        &[0x41],
        &[0x42],
        [0xa0; 32],
        since_at(AFTER_SECS),
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect("stranger reap should pass after expiry");
    println!("[keeper-lock] stranger reap — cycles: {cycles}");
}

#[test]
fn keeper_lock_stays_shut_for_a_stranger_before_expiry() {
    let mut context = Context::default();
    let chain_ty = load_chain_type(&mut context);
    let tx = keeper_lock_reap_tx(
        &mut context,
        &chain_ty,
        &[0x43],
        &[0x44],
        [0xa1; 32],
        since_at(BEFORE_SECS),
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("a stranger must not open the lock early");
}
