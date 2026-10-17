#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use blake2b_ref::Blake2bBuilder;
use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::packed::Script;
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_lock, load_cell_lock_hash, load_cell_type,
    load_cell_type_hash, load_script, load_script_hash, load_witness_args, QueryIter,
};

pub const ERR_LEN: i8 = -1;
pub const ERR_MODE: i8 = -2;
pub const ERR_POT: i8 = -3;
pub const ERR_ROUND: i8 = -4;
pub const ERR_CLOCK: i8 = -5;
pub const ERR_KING: i8 = -6;
pub const ERR_PROOF: i8 = -7;
pub const ERR_BID: i8 = -8;
pub const ERR_TREASURY: i8 = -9;
pub const ERR_SINCE: i8 = -10;
pub const ERR_IMMUTABLE: i8 = -11;

pub const STATUS_LIVE: u8 = 0;
pub const STATUS_DEAD: u8 = 1;

/// Match cell data. Decay is not stored — the script computes it.
///
/// ```text
/// 0   1   version = 1
/// 1   1   status (0 live, 1 dead)
/// 2   4   round u32, starts at 1
/// 6   8   deadline_ms u64
/// 14  8   entry_fee shannons u64
/// 22  8   pot shannons u64
/// 30  32  king lock hash
/// 62  32  question-set Merkle root
/// 94  32  treasury lock hash
/// 126 32  bid type code hash
/// ```
pub const MATCH_DATA_LEN: usize = 158;
pub const MATCH_VERSION: u8 = 1;
pub const OFF_VERSION: usize = 0;
pub const OFF_STATUS: usize = 1;
pub const OFF_ROUND: usize = 2;
pub const OFF_DEADLINE: usize = 6;
pub const OFF_FEE: usize = 14;
pub const OFF_POT: usize = 22;
pub const OFF_KING: usize = 30;
pub const OFF_ROOT: usize = 62;
pub const OFF_TREASURY: usize = 94;
pub const OFF_BID_CODE: usize = 126;

pub const BID_VERSION: u8 = 1;
/// 0.1 CKB. A steal may spend up to this much of the bid on the miner fee.
pub const MAX_TX_FEE: u64 = 10_000_000;
/// Input Type Proxy Lock. data1 is byte 2; byte 1 is hash type "type".
pub const PROXY_HASH_TYPE_DATA1: u8 = 2;
pub const PROXY_CODE_HASH: [u8; 32] = [
    0x51, 0x23, 0x90, 0x89, 0x65, 0xc7, 0x11, 0xb0, 0xff, 0xd8, 0xae, 0xc6, 0x42, 0xf1, 0xed, 0xe3,
    0x29, 0x64, 0x9b, 0xda, 0x1e, 0xbd, 0xca, 0x6b, 0xd2, 0x41, 0x24, 0xd3, 0x79, 0x6f, 0x76, 0x8a,
];

pub const HASH_PERSONAL: &[u8] = b"ckb-default-hash";
pub const TAG_LEAF: u8 = 0x00;
pub const TAG_NODE: u8 = 0x01;
pub const PROOF_VERSION: u8 = 1;
pub const PROOF_HEADER_LEN: usize = 70;
pub const MAX_MERKLE_PATH: usize = 6;

pub fn read_u32(data: &[u8], offset: usize) -> Result<u32, i8> {
    Ok(u32::from_le_bytes(bytes::<4>(data, offset)?))
}

pub fn read_u64(data: &[u8], offset: usize) -> Result<u64, i8> {
    Ok(u64::from_le_bytes(bytes::<8>(data, offset)?))
}

pub fn bytes<const N: usize>(data: &[u8], offset: usize) -> Result<[u8; N], i8> {
    let slice = data.get(offset..offset + N).ok_or(ERR_LEN)?;
    let mut out = [0u8; N];
    out.copy_from_slice(slice);
    Ok(out)
}

/// Time a steal removes from the deadline. Round 1 cuts 10 minutes, then halves every two rounds, floor 72s.
pub fn shrink_ms(round: u32) -> u64 {
    let shift = (round / 2).min(13);
    let cut = 600_000u64 >> shift;
    if cut < 72_000 { 72_000 } else { cut }
}

/// Deadline after a steal. Never zero, so a close still has a timestamp to reach.
pub fn shrunk_deadline(current_ms: u64, round: u32) -> u64 {
    let cut = shrink_ms(round);
    if current_ms <= cut { 1_000 } else { current_ms - cut }
}

pub fn script_args() -> Result<Vec<u8>, i8> {
    let script = load_script().map_err(|_| ERR_LEN)?;
    Ok(script.as_reader().args().raw_data().to_vec())
}

pub fn current_script_hash() -> Result<[u8; 32], i8> {
    load_script_hash().map_err(|_| ERR_LEN)
}

pub fn tx_len(source: Source) -> usize {
    QueryIter::new(load_cell_type_hash, source).count()
}

pub fn type_hash_at(index: usize, source: Source) -> Result<Option<[u8; 32]>, i8> {
    match load_cell_type_hash(index, source) {
        Ok(v) => Ok(v),
        Err(_) => Err(ERR_LEN),
    }
}

pub fn type_code_hash(index: usize, source: Source) -> Result<[u8; 32], i8> {
    let script = load_cell_type(index, source).map_err(|_| ERR_LEN)?.ok_or(ERR_LEN)?;
    bytes::<32>(&script.code_hash().raw_data(), 0)
}

pub fn type_args(index: usize, source: Source) -> Result<Vec<u8>, i8> {
    let script = load_cell_type(index, source).map_err(|_| ERR_LEN)?.ok_or(ERR_LEN)?;
    Ok(script.args().raw_data().to_vec())
}

/// Code hash, hash type data1, and args of exactly 32 bytes.
pub fn is_proxy_lock(lock: &Script, args: &[u8; 32]) -> bool {
    let code = lock.code_hash().raw_data();
    if code.len() != 32 || code.as_ref() != PROXY_CODE_HASH.as_slice() {
        return false;
    }
    if lock.hash_type().as_slice() != [PROXY_HASH_TYPE_DATA1] {
        return false;
    }
    let got = lock.args().raw_data();
    got.len() == 32 && got.as_ref() == args.as_slice()
}

pub fn proxy_guarded(index: usize, source: Source, args: &[u8; 32]) -> Result<(), i8> {
    let lock = load_cell_lock(index, source).map_err(|_| ERR_LEN)?;
    if is_proxy_lock(&lock, args) {
        Ok(())
    } else {
        Err(ERR_KING)
    }
}

/// Absolute timestamp `since`, value in seconds. Deadlines in this game are ms.
pub fn since_reaches_deadline(since: u64, deadline_ms: u64) -> bool {
    const RELATIVE: u64 = 0x8000_0000_0000_0000;
    const METRIC: u64 = 0x6000_0000_0000_0000;
    const RESERVED: u64 = 0x1F00_0000_0000_0000;
    const VALUE: u64 = 0x00FF_FFFF_FFFF_FFFF;
    const TIMESTAMP: u64 = 0x4000_0000_0000_0000;
    if since == 0 || (since & RELATIVE) != 0 || (since & RESERVED) != 0 {
        return false;
    }
    if (since & METRIC) != TIMESTAMP {
        return false;
    }
    (since & VALUE) >= deadline_ms / 1000
}

pub fn blake2b_256(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32).personal(HASH_PERSONAL).build();
    for part in parts {
        hasher.update(part);
    }
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

pub struct StealProof {
    pub question_index: u16,
    pub correct_index: u8,
    pub option_count: u8,
    pub path_len: u8,
    pub prompt_hash: [u8; 32],
    pub salt: [u8; 32],
    pub siblings: [[u8; 32]; MAX_MERKLE_PATH],
}

pub fn parse_steal_proof(raw: &[u8]) -> Result<StealProof, i8> {
    if raw.len() < PROOF_HEADER_LEN || raw[0] != PROOF_VERSION {
        return Err(ERR_PROOF);
    }
    let question_index = u16::from_le_bytes(bytes::<2>(raw, 1)?);
    let path_len = raw[5];
    if path_len as usize > MAX_MERKLE_PATH {
        return Err(ERR_PROOF);
    }
    if raw.len() != PROOF_HEADER_LEN + path_len as usize * 32 {
        return Err(ERR_PROOF);
    }
    if (question_index as usize) >= (1usize << path_len) {
        return Err(ERR_PROOF);
    }
    let mut siblings = [[0u8; 32]; MAX_MERKLE_PATH];
    for level in 0..path_len as usize {
        siblings[level] = bytes::<32>(raw, PROOF_HEADER_LEN + level * 32)?;
    }
    Ok(StealProof {
        question_index,
        correct_index: raw[3],
        option_count: raw[4],
        path_len,
        prompt_hash: bytes::<32>(raw, 6)?,
        salt: bytes::<32>(raw, 38)?,
        siblings,
    })
}

pub fn load_match_proof() -> Result<StealProof, i8> {
    let args = load_witness_args(0, Source::GroupInput).map_err(|_| ERR_PROOF)?;
    let field = args.input_type().to_opt().ok_or(ERR_PROOF)?;
    parse_steal_proof(&field.raw_data())
}

pub fn leaf_hash(match_id: &[u8; 32], proof: &StealProof) -> [u8; 32] {
    blake2b_256(&[
        &[TAG_LEAF],
        match_id,
        &proof.question_index.to_le_bytes(),
        &proof.prompt_hash,
        &[proof.correct_index, proof.option_count],
        &proof.salt,
    ])
}

pub fn merkle_root(leaf: &[u8; 32], proof: &StealProof) -> [u8; 32] {
    let mut node = *leaf;
    for level in 0..proof.path_len as usize {
        let sibling = &proof.siblings[level];
        node = if (proof.question_index >> level) & 1 == 0 {
            blake2b_256(&[&[TAG_NODE], &node, sibling])
        } else {
            blake2b_256(&[&[TAG_NODE], sibling, &node])
        };
    }
    node
}

pub fn verify_steal(match_id: &[u8; 32], root: &[u8; 32], round: u32) -> Result<(), i8> {
    let proof = load_match_proof()?;
    if proof.correct_index >= proof.option_count || proof.option_count < 2 {
        return Err(ERR_PROOF);
    }
    let expected = round.checked_sub(1).ok_or(ERR_ROUND)?;
    if proof.question_index as u32 != expected {
        return Err(ERR_PROOF);
    }
    let leaf = leaf_hash(match_id, &proof);
    if merkle_root(&leaf, &proof) != *root {
        return Err(ERR_PROOF);
    }
    Ok(())
}

pub fn find_match<'a>(
    match_type_hash: &[u8; 32],
    source: Source,
    buf: &'a mut [u8],
) -> Result<Option<(usize, &'a [u8])>, i8> {
    let n = tx_len(source);
    for i in 0..n {
        if type_hash_at(i, source)? != Some(*match_type_hash) {
            continue;
        }
        let data = load_cell_data(i, source).map_err(|_| ERR_LEN)?;
        if data.len() != MATCH_DATA_LEN || data.len() > buf.len() {
            return Err(ERR_LEN);
        }
        buf[..data.len()].copy_from_slice(&data);
        return Ok(Some((i, &buf[..data.len()])));
    }
    Ok(None)
}

fn is_match_bid(index: usize, source: Source, match_type_hash: &[u8; 32], bid_code: &[u8; 32]) -> Result<bool, i8> {
    let Some(script) = load_cell_type(index, source).map_err(|_| ERR_BID)? else {
        return Ok(false);
    };
    if bytes::<32>(&script.code_hash().raw_data(), 0)? != *bid_code {
        return Ok(false);
    }
    let args = script.args().raw_data();
    Ok(args.len() == 64 && args.as_ref()[..32] == *match_type_hash)
}

pub fn count_bids(match_type_hash: &[u8; 32], bid_code: &[u8; 32], source: Source) -> Result<usize, i8> {
    let n = tx_len(source);
    let mut count = 0usize;
    for i in 0..n {
        if is_match_bid(i, source, match_type_hash, bid_code)? {
            count += 1;
        }
    }
    Ok(count)
}

/// Owner lock hash from bid args 32..64. The bid lock itself is the proxy and names nobody.
pub fn winning_bid_owner(match_type_hash: &[u8; 32], bid_code: &[u8; 32]) -> Result<[u8; 32], i8> {
    let n = tx_len(Source::Input);
    let mut found = None;
    for i in 0..n {
        if !is_match_bid(i, Source::Input, match_type_hash, bid_code)? {
            continue;
        }
        let args = type_args(i, Source::Input)?;
        if found.is_some() {
            return Err(ERR_BID);
        }
        found = Some(bytes::<32>(&args, 32)?);
    }
    found.ok_or(ERR_BID)
}

pub fn treasury_capacity(treasury_lock: &[u8; 32], source: Source) -> Result<u64, i8> {
    let n = tx_len(source);
    let mut found = None;
    for i in 0..n {
        if load_cell_lock_hash(i, source).map_err(|_| ERR_TREASURY)? != *treasury_lock {
            continue;
        }
        if found.is_some() {
            return Err(ERR_TREASURY);
        }
        found = Some(load_cell_capacity(i, source).map_err(|_| ERR_TREASURY)?);
    }
    found.ok_or(ERR_TREASURY)
}

pub fn outputs_to_lock(lock: &[u8; 32]) -> Result<u64, i8> {
    let n = tx_len(Source::Output);
    let mut sum = 0u64;
    for i in 0..n {
        if load_cell_lock_hash(i, Source::Output).map_err(|_| ERR_TREASURY)? == *lock {
            let cap = load_cell_capacity(i, Source::Output).map_err(|_| ERR_TREASURY)?;
            sum = sum.checked_add(cap).ok_or(ERR_POT)?;
        }
    }
    Ok(sum)
}
