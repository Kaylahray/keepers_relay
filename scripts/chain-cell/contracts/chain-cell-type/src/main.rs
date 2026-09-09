//! Keepers Relay — Chain Cell type script (v2).
//!
//! A Chain Cell is one living object with one Keeper at a time. This script is
//! the whole rulebook: identity, lineage, the clock, and how a run ends.
//!
//! Cell.data layout (168 bytes, little-endian):
//!   0      u8      version (=2)
//!   1      u8      status: 0=alive, 1=dead, 2=returned
//!   2      u8      mode: 0=open, 1=return_home
//!   3      u8      flags: bit0 = stakes enabled
//!   4..8   u32     owner_count
//!   8..16  u64     expires_at_ms
//!   16..20 u32     window_seconds (base window, immutable)
//!   20..52 [u8;32] chain_id — must equal the type script args (type-id)
//!   52..84 [u8;32] lineage_root — append-only hash chain over Keeper locks
//!   84..116 [u8;32] artifact_root — append-only hash chain over marks
//!   116..148 [u8;32] creator_lock_hash — who it must come home to
//!   148..152 u32    entry_proof (stakes: base seat price)
//!   152..154 u16    escalation_bp (stakes: seat price rise, basis points)
//!   154..156 u16    decay_bp (stakes: window shrink per hop, basis points)
//!   156..160 u32    floor_seconds (stakes: window never goes below this)
//!   160..168 u64    pot_amount (declared pot; custody lands in the pot lock)
//!
//! Lock = the current Keeper (see `keeper-lock`). Type = this script.
//!
//! Transitions:
//!   (0,1) mint    — args must equal the type-id derived from the first input
//!   (1,1) seal    — same Keeper, artifact_root extends by the witness mark hash
//!   (1,1) handoff — next Keeper, owner_count+1, lineage_root extends, clock
//!                   re-anchored to the tx `since` and never past the deadline
//!   (1,1) reap    — anyone, once `since` proves the deadline passed; sets dead
//!   (1,0) burn    — only once the run has ended (dead or returned)
#![no_std]
#![no_main]

use blake2b_ref::{Blake2b, Blake2bBuilder};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{packed::CellInput, prelude::*},
    default_alloc, entry,
    high_level::{
        load_cell_data, load_cell_lock_hash, load_cell_type_hash, load_input, load_input_since,
        load_script, load_script_hash, load_witness_args, QueryIter,
    },
};

const DATA_LEN: usize = 168;
const VERSION: u8 = 2;

const STATUS_ALIVE: u8 = 0;
const STATUS_DEAD: u8 = 1;
const STATUS_RETURNED: u8 = 2;

const MODE_OPEN: u8 = 0;
const MODE_RETURN_HOME: u8 = 1;

const FLAG_STAKES: u8 = 0b0000_0001;

/// `since` must be an absolute timestamp lock so the value is a real lower
/// bound on median block time. Relative / block / epoch forms are rejected.
const SINCE_FLAG_MASK: u64 = 0xE000_0000_0000_0000;
const SINCE_ABSOLUTE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;
const SINCE_VALUE_MASK: u64 = 0x00FF_FFFF_FFFF_FFFF;

const MIN_WINDOW_SECONDS: u32 = 60;
const MAX_WINDOW_SECONDS: u32 = 365 * 24 * 3600;
/// Decay converges on `floor_seconds` quickly; this caps worst-case cycles.
const MAX_DECAY_STEPS: u32 = 1024;

const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";
const LINEAGE_SEED_TAG: &[u8] = b"keepers-relay:lineage:v2";

#[repr(i8)]
enum Error {
    EmptyGroup = 40,
    InvalidCardinality = 41,
    InvalidData = 42,
    DeadCell = 43,
    Expired = 44,
    BadSuccessor = 45,
    OwnerCount = 46,
    WindowMismatch = 47,
    ChainIdMismatch = 48,
    Unauthorized = 49,
    Syscall = 50,
    BadTypeId = 51,
    BadLineage = 52,
    BadArtifact = 53,
    BadSince = 54,
    NotExpired = 55,
    StillLive = 56,
    BadStakes = 57,
    PotShrank = 58,
    NotHome = 59,
}

impl From<Error> for i8 {
    fn from(err: Error) -> Self {
        err as i8
    }
}

default_alloc!();
entry!(program_entry);

fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(err) => err.into(),
    }
}

struct ChainData {
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

impl ChainData {
    fn stakes_on(&self) -> bool {
        self.flags & FLAG_STAKES != 0
    }
}

fn new_blake2b() -> Blake2b {
    Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build()
}

fn validate() -> Result<(), Error> {
    let input_count = count_group_cells(Source::GroupInput)?;
    let output_count = count_group_cells(Source::GroupOutput)?;

    if input_count == 0 && output_count == 0 {
        return Err(Error::EmptyGroup);
    }
    if input_count > 1 || output_count > 1 {
        return Err(Error::InvalidCardinality);
    }

    match (input_count, output_count) {
        (0, 1) => validate_mint(),
        (1, 0) => validate_burn(),
        (1, 1) => {
            let input = parse_data(0, Source::GroupInput)?;
            let output = parse_data(0, Source::GroupOutput)?;
            validate_update(&input, &output)
        }
        _ => Err(Error::InvalidCardinality),
    }
}

// ——— Mint ————————————————————————————————————————————————————————————————

/// Genesis. The type args must equal the type-id derived from this
/// transaction's first input, which is what makes each Cell unforgeable: no
/// second Cell can ever claim the same identity.
fn validate_mint() -> Result<(), Error> {
    let out = parse_data(0, Source::GroupOutput)?;

    if out.status != STATUS_ALIVE {
        return Err(Error::InvalidData);
    }
    if out.owner_count != 1 {
        return Err(Error::OwnerCount);
    }
    if out.window_seconds < MIN_WINDOW_SECONDS || out.window_seconds > MAX_WINDOW_SECONDS {
        return Err(Error::WindowMismatch);
    }
    if out.mode != MODE_OPEN && out.mode != MODE_RETURN_HOME {
        return Err(Error::InvalidData);
    }
    if out.pot_amount != 0 && !out.stakes_on() {
        // A seeded pot is fine, but only stakes Cells account for it on chain.
        return Err(Error::BadStakes);
    }
    validate_stakes_config(&out)?;

    let args = load_script_args_32()?;
    let expected = compute_type_id()?;
    if args != expected {
        return Err(Error::BadTypeId);
    }
    if out.chain_id != args {
        return Err(Error::ChainIdMismatch);
    }

    // The first Keeper is the creator, and the lineage starts from them.
    let lock_hash = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
    if out.creator_lock_hash != lock_hash {
        return Err(Error::Unauthorized);
    }
    if out.artifact_root != [0u8; 32] {
        return Err(Error::BadArtifact);
    }
    if out.lineage_root != genesis_lineage(&out.chain_id, &lock_hash) {
        return Err(Error::BadLineage);
    }

    Ok(())
}

fn validate_stakes_config(data: &ChainData) -> Result<(), Error> {
    if !data.stakes_on() {
        // Unused stakes fields must be zeroed so they can never be read as live.
        if data.entry_proof != 0
            || data.escalation_bp != 0
            || data.decay_bp != 0
            || data.floor_seconds != 0
        {
            return Err(Error::BadStakes);
        }
        return Ok(());
    }
    if data.entry_proof == 0 {
        return Err(Error::BadStakes);
    }
    if data.escalation_bp > 10_000 {
        return Err(Error::BadStakes);
    }
    // A decaying window has to actually decay, and has to stop somewhere.
    if data.decay_bp == 0 || data.decay_bp > 5_000 {
        return Err(Error::BadStakes);
    }
    if data.floor_seconds < MIN_WINDOW_SECONDS || data.floor_seconds > data.window_seconds {
        return Err(Error::BadStakes);
    }
    Ok(())
}

// ——— Burn ————————————————————————————————————————————————————————————————

/// A live Cell can never be destroyed — not even by the Keeper holding it. Only
/// a run that has ended (reaped or come home) can be cleaned up.
fn validate_burn() -> Result<(), Error> {
    let input = parse_data(0, Source::GroupInput)?;
    if input.status == STATUS_ALIVE {
        return Err(Error::StillLive);
    }
    Ok(())
}

// ——— Updates —————————————————————————————————————————————————————————————

fn validate_update(input: &ChainData, output: &ChainData) -> Result<(), Error> {
    // Once a run has ended it is frozen.
    if input.status != STATUS_ALIVE {
        return Err(Error::DeadCell);
    }

    // Identity and rules never move, on any transition.
    if output.mode != input.mode || output.flags != input.flags {
        return Err(Error::InvalidData);
    }
    if output.window_seconds != input.window_seconds {
        return Err(Error::WindowMismatch);
    }
    if output.chain_id != input.chain_id {
        return Err(Error::ChainIdMismatch);
    }
    if output.creator_lock_hash != input.creator_lock_hash {
        return Err(Error::Unauthorized);
    }
    if output.entry_proof != input.entry_proof
        || output.escalation_bp != input.escalation_bp
        || output.decay_bp != input.decay_bp
        || output.floor_seconds != input.floor_seconds
    {
        return Err(Error::BadStakes);
    }
    // The type-id is fixed at mint; the successor keeps carrying it.
    let args = load_script_args_32()?;
    if input.chain_id != args {
        return Err(Error::ChainIdMismatch);
    }

    if output.status == STATUS_DEAD {
        return validate_reap(input, output);
    }
    if output.owner_count == input.owner_count {
        return validate_seal(input, output);
    }
    validate_handoff(input, output)
}

/// Seal: the Keeper leaves their mark. Ownership and the clock do not move; the
/// artifact root extends by the mark hash carried in the witness, so the
/// archive is an append-only chain rather than a field anyone can overwrite.
fn validate_seal(input: &ChainData, output: &ChainData) -> Result<(), Error> {
    if output.status != STATUS_ALIVE {
        return Err(Error::InvalidData);
    }
    if output.expires_at_ms != input.expires_at_ms {
        return Err(Error::BadSuccessor);
    }
    if output.lineage_root != input.lineage_root {
        return Err(Error::BadLineage);
    }
    if output.pot_amount != input.pot_amount {
        return Err(Error::PotShrank);
    }

    let in_lock = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    let out_lock = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
    if in_lock != out_lock {
        return Err(Error::Unauthorized);
    }

    let mark = load_mark_hash()?;
    let mut hasher = new_blake2b();
    hasher.update(&input.artifact_root);
    hasher.update(&mark);
    let mut expected = [0u8; 32];
    hasher.finalize(&mut expected);
    if output.artifact_root != expected {
        return Err(Error::BadArtifact);
    }

    Ok(())
}

/// Handoff: the Cell moves to the next Keeper.
///
/// The clock is re-anchored to the transaction's `since`, which the consensus
/// rules force to be a real lower bound on block time. The anchor must be at or
/// before the current deadline, so a late Keeper can never buy themselves a
/// fresh full window by sitting on it.
fn validate_handoff(input: &ChainData, output: &ChainData) -> Result<(), Error> {
    if output.status != STATUS_ALIVE && output.status != STATUS_RETURNED {
        return Err(Error::InvalidData);
    }
    if output.owner_count != input.owner_count.saturating_add(1) {
        return Err(Error::OwnerCount);
    }
    if output.artifact_root != input.artifact_root {
        return Err(Error::BadArtifact);
    }
    if output.pot_amount < input.pot_amount {
        return Err(Error::PotShrank);
    }

    let in_lock = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    let out_lock = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
    if in_lock == out_lock {
        return Err(Error::Unauthorized);
    }

    // Lineage is an append-only chain over the Keepers who actually held it.
    let mut hasher = new_blake2b();
    hasher.update(&input.lineage_root);
    hasher.update(&out_lock);
    let mut expected_lineage = [0u8; 32];
    hasher.finalize(&mut expected_lineage);
    if output.lineage_root != expected_lineage {
        return Err(Error::BadLineage);
    }

    // Coming home is the only way a run ends well, and only to the creator.
    if output.status == STATUS_RETURNED {
        if input.mode != MODE_RETURN_HOME {
            return Err(Error::InvalidData);
        }
        if out_lock != input.creator_lock_hash {
            return Err(Error::NotHome);
        }
    }

    let anchor_secs = absolute_timestamp_since()?;
    let anchor_ms = anchor_secs.saturating_mul(1000);
    if anchor_ms > input.expires_at_ms {
        return Err(Error::Expired);
    }

    let next_window = next_window_seconds(input);
    let expected_expiry = anchor_ms.saturating_add((next_window as u64).saturating_mul(1000));
    if output.expires_at_ms != expected_expiry {
        return Err(Error::BadSuccessor);
    }

    Ok(())
}

/// Reap: once `since` proves the deadline has passed, anyone can close the run.
/// Everything except the status is frozen, so a reaper gains nothing but the
/// settlement itself — they cannot move the Cell or its capacity.
fn validate_reap(input: &ChainData, output: &ChainData) -> Result<(), Error> {
    if output.owner_count != input.owner_count
        || output.expires_at_ms != input.expires_at_ms
        || output.lineage_root != input.lineage_root
        || output.artifact_root != input.artifact_root
        || output.pot_amount != input.pot_amount
    {
        return Err(Error::BadSuccessor);
    }

    let in_lock = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    let out_lock = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
    if in_lock != out_lock {
        return Err(Error::Unauthorized);
    }

    let anchor_secs = absolute_timestamp_since()?;
    if anchor_secs.saturating_mul(1000) < input.expires_at_ms {
        return Err(Error::NotExpired);
    }

    Ok(())
}

// ——— Stakes schedule —————————————————————————————————————————————————————

/// Window after `owner_count` hops: `window * (1 - decay)^hops`, floored.
/// Non-stakes Cells keep a constant window.
fn next_window_seconds(input: &ChainData) -> u32 {
    if !input.stakes_on() {
        return input.window_seconds;
    }
    let keep = 10_000u64.saturating_sub(input.decay_bp as u64);
    let mut window = input.window_seconds as u64;
    let floor = input.floor_seconds as u64;
    let steps = core::cmp::min(input.owner_count, MAX_DECAY_STEPS);
    for _ in 0..steps {
        if window <= floor {
            break;
        }
        window = window.saturating_mul(keep) / 10_000;
    }
    if window < floor {
        window = floor;
    }
    window as u32
}

// ——— Helpers —————————————————————————————————————————————————————————————

fn genesis_lineage(chain_id: &[u8; 32], first_keeper: &[u8; 32]) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(LINEAGE_SEED_TAG);
    hasher.update(chain_id);
    hasher.update(first_keeper);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

/// Standard CKB type-id: blake2b(first input || this cell's output index).
fn compute_type_id() -> Result<[u8; 32], Error> {
    let first_input: CellInput = load_input(0, Source::Input).map_err(|_| Error::Syscall)?;
    let script_hash = load_script_hash().map_err(|_| Error::Syscall)?;

    let mut output_index: Option<u64> = None;
    for (index, type_hash) in QueryIter::new(load_cell_type_hash, Source::Output).enumerate() {
        if type_hash == Some(script_hash) {
            output_index = Some(index as u64);
            break;
        }
    }
    let output_index = output_index.ok_or(Error::Syscall)?;

    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    Ok(out)
}

fn load_script_args_32() -> Result<[u8; 32], Error> {
    let script = load_script().map_err(|_| Error::Syscall)?;
    let args = script.args().raw_data();
    if args.len() != 32 {
        return Err(Error::BadTypeId);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&args);
    Ok(out)
}

/// The mark commitment for a seal, carried in `witness.output_type`.
fn load_mark_hash() -> Result<[u8; 32], Error> {
    let witness = load_witness_args(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    let raw = witness
        .output_type()
        .to_opt()
        .ok_or(Error::BadArtifact)?
        .raw_data();
    if raw.len() != 32 {
        return Err(Error::BadArtifact);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Ok(out)
}

/// Reject every `since` form except an absolute timestamp — those are the only
/// ones consensus checks against median block time.
fn absolute_timestamp_since() -> Result<u64, Error> {
    let since = load_input_since(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
    if since & SINCE_FLAG_MASK != SINCE_ABSOLUTE_TIMESTAMP {
        return Err(Error::BadSince);
    }
    Ok(since & SINCE_VALUE_MASK)
}

fn parse_data(index: usize, source: Source) -> Result<ChainData, Error> {
    let data = load_cell_data(index, source).map_err(|_| Error::Syscall)?;
    if data.len() != DATA_LEN || data[0] != VERSION {
        return Err(Error::InvalidData);
    }

    let mut chain_id = [0u8; 32];
    chain_id.copy_from_slice(&data[20..52]);
    let mut lineage_root = [0u8; 32];
    lineage_root.copy_from_slice(&data[52..84]);
    let mut artifact_root = [0u8; 32];
    artifact_root.copy_from_slice(&data[84..116]);
    let mut creator_lock_hash = [0u8; 32];
    creator_lock_hash.copy_from_slice(&data[116..148]);

    Ok(ChainData {
        status: data[1],
        mode: data[2],
        flags: data[3],
        owner_count: u32::from_le_bytes(data[4..8].try_into().unwrap()),
        expires_at_ms: u64::from_le_bytes(data[8..16].try_into().unwrap()),
        window_seconds: u32::from_le_bytes(data[16..20].try_into().unwrap()),
        chain_id,
        lineage_root,
        artifact_root,
        creator_lock_hash,
        entry_proof: u32::from_le_bytes(data[148..152].try_into().unwrap()),
        escalation_bp: u16::from_le_bytes(data[152..154].try_into().unwrap()),
        decay_bp: u16::from_le_bytes(data[154..156].try_into().unwrap()),
        floor_seconds: u32::from_le_bytes(data[156..160].try_into().unwrap()),
        pot_amount: u64::from_le_bytes(data[160..168].try_into().unwrap()),
    })
}

fn count_group_cells(source: Source) -> Result<usize, Error> {
    let mut index = 0;
    loop {
        match load_cell_lock_hash(index, source) {
            Ok(_) => index += 1,
            Err(ckb_std::error::SysError::IndexOutOfBound) => return Ok(index),
            Err(_) => return Err(Error::Syscall),
        }
    }
}
