#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use blake2b_ref::Blake2bBuilder;
use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::core::ScriptHashType;
use ckb_std::ckb_types::packed::Script;
use ckb_std::ckb_types::prelude::Entity;
use ckb_std::high_level::{
    encode_hex, load_cell_capacity, load_cell_data, load_cell_lock, load_cell_lock_hash, load_cell_type,
    load_cell_type_hash, load_header, load_input_out_point, load_script, load_script_hash, load_witness_args,
    spawn_cell, QueryIter,
};
use ckb_std::syscalls::{pipe, read, wait};

pub const ERR_LEN: i8 = -1;
pub const ERR_MODE: i8 = -2;
pub const ERR_POT: i8 = -3;
pub const ERR_ROUND: i8 = -4;
pub const ERR_CLOCK: i8 = -5;
pub const ERR_KING: i8 = -6;
pub const ERR_RUN: i8 = -7;
pub const ERR_BID: i8 = -8;
pub const ERR_TREASURY: i8 = -9;
pub const ERR_SINCE: i8 = -10;
pub const ERR_IMMUTABLE: i8 = -11;
pub const ERR_SCORE: i8 = -12;
pub const ERR_GAME: i8 = -13;
pub const ERR_HEADER: i8 = -14;
pub const ERR_WORK: i8 = -15;
pub const ERR_SEAL: i8 = -16;
/// A duel moved in a way its state does not allow.
pub const ERR_DUEL: i8 = -17;
/// A duel step was sent without the player it belongs to.
pub const ERR_AUTH: i8 = -18;

pub const STATUS_LIVE: u8 = 0;
pub const STATUS_DEAD: u8 = 1;

/// Match cell data, version 5. Decay is not stored — the script computes it.
///
/// ```text
/// 0   1   version = 4
/// 1   1   status (0 live, 1 dead)
/// 2   4   round u32, starts at 1
/// 6   8   deadline_ms u64
/// 14  8   entry_fee shannons u64
/// 22  8   pot shannons u64
/// 30  32  king lock hash
/// 62  32  game: data hash of the game script that scores runs
/// 94  32  treasury lock hash
/// 126 32  bid type code hash
/// 158 8   king score u64
/// 166 8   land_by_ms u64: when the king's steal had to land to count, the earlier of the
///         deadline running when it was sent and the end of the king's last lap window
/// 174 32  certified king lock hash: the last king whose steal is proven to have landed in time
/// 206 8   certified king score u64
/// 214 1   pow_bits u8: leading zero bits an entry's proof of work needs, fixed at the open
/// ```
///
/// Every v2 field keeps its offset; v4 added the last four. v5 keeps v4's layout and changes only
/// how land_by is reckoned: from the entry's last lap, not from the entry itself.
pub const MATCH_DATA_LEN: usize = 215;
pub const MATCH_VERSION: u8 = 5;
pub const OFF_VERSION: usize = 0;
pub const OFF_STATUS: usize = 1;
pub const OFF_ROUND: usize = 2;
pub const OFF_DEADLINE: usize = 6;
pub const OFF_FEE: usize = 14;
pub const OFF_POT: usize = 22;
pub const OFF_KING: usize = 30;
pub const OFF_GAME: usize = 62;
pub const OFF_TREASURY: usize = 94;
pub const OFF_BID_CODE: usize = 126;
pub const OFF_KING_SCORE: usize = 158;
pub const OFF_LAND_BY: usize = 166;
pub const OFF_CERTIFIED: usize = 174;
pub const OFF_CERTIFIED_SCORE: usize = 206;
pub const OFF_POW_BITS: usize = 214;
/// A host can ask for at most this much work per entry.
pub const MAX_POW_BITS: u8 = 32;
/// A run is played in laps, and each lap has its own window: from the block its road came from to
/// the block its seal lands in. So time spent waiting for one lap's road never counts against it,
/// and a slow block costs a player only the wait for their own seal. A steal counts only if it
/// lands within one window of the entry's last seal.
pub const LAP_WINDOW_MS: u64 = 3 * 60 * 1000;
/// Laps in a full run. Lap 1 is seeded by the entry's block, each later lap by the block where the
/// lap before it was sealed.
pub const LAPS: u8 = 5;

/// Bid cell data, version 5. The entry also carries the player's run, one sealed lap at a time.
///
/// ```text
/// 0   1   version = 4
/// 1   8   refund_after_ms u64
/// 9   8   pow nonce u64
/// 17  1   laps sealed (0 to LAPS)
/// 18  32  key lock hash: the lock of the player's key cell, which seals laps without the wallet
/// 50  8   lap start ms u64: when the latest sealed lap's road appeared, that is when the cell its
///         seal spent landed. The next spend checks that the lap was sealed within its window.
/// 58  32  lap chain: every sealed lap's block hash and moves hash, folded in order
/// 90  ..  owner lock script (molecule)
/// ```
///
/// The key cell is a small cell the player's browser holds, locked by CKB's built-in secp256k1 lock
/// under a throwaway session key. A seal spends it, so CKB's own lock checks the session key's
/// signature over the whole transaction; this script only checks that the key cell is there.
pub const BID_VERSION: u8 = 5;
pub const BID_HEADER_LEN: usize = 90;
pub const OFF_BID_NONCE: usize = 9;
pub const OFF_BID_LAPS: usize = 17;
pub const OFF_BID_KEY: usize = 18;
pub const OFF_BID_LAP_START: usize = 50;
pub const OFF_BID_CHAIN: usize = 58;
/// Seal witness (`input_type` of the entry): `version ‖ moves hash`. The key cell's signature covers
/// the new lap chain in the entry's output data, so the moves hash can't be swapped.
pub const SEAL_VERSION: u8 = 1;
pub const SEAL_WITNESS_LEN: usize = 1 + 32;
/// A bid nobody used can be refunded this long after the match's deadline at the time it was
/// locked. Deadlines only ever shrink, so the match is over by then.
pub const REFUND_GRACE_MS: u64 = 60 * 60 * 1000;
/// 0.1 CKB. A steal or refund may spend up to this much of the bid on the miner fee.
pub const MAX_TX_FEE: u64 = 10_000_000;
/// 1 CKB. What a close may pay whoever sends it, on top of the fee.
pub const CLOSER_REWARD: u64 = 100_000_000;
/// A close needs no signature: the fee and the closer's reward come out of the host's share, and
/// the host may receive this much less than they are owed. The pot and every entry are paid in full.
pub const HOST_ALLOWANCE: u64 = CLOSER_REWARD + MAX_TX_FEE;
/// Input Type Proxy Lock. data1 is byte 2; byte 1 is hash type "type".
pub const PROXY_HASH_TYPE_DATA1: u8 = 2;
pub const PROXY_CODE_HASH: [u8; 32] = [
    0x51, 0x23, 0x90, 0x89, 0x65, 0xc7, 0x11, 0xb0, 0xff, 0xd8, 0xae, 0xc6, 0x42, 0xf1, 0xed, 0xe3,
    0x29, 0x64, 0x9b, 0xda, 0x1e, 0xbd, 0xca, 0x6b, 0xd2, 0x41, 0x24, 0xd3, 0x79, 0x6f, 0x76, 0x8a,
];

pub const HASH_PERSONAL: &[u8] = b"ckb-default-hash";
/// Steal witness (`input_type` of the match cell): `version ‖ lap count ‖ per lap: block hash ‖
/// tape length u16 LE ‖ tape`. Each block hash is the one the lap was seeded by.
pub const RUN_VERSION: u8 = 2;
pub const LAP_DOMAIN: &[u8] = b"crowns/lap/v1";
pub const SEED_DOMAIN: &[u8] = b"crowns/run-seed/v2";
pub const POW_DOMAIN: &[u8] = b"crowns/entry-pow/v1";

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

/// Relative timestamp `since`: the input may only be spent once its cell has waited at least
/// `wait_ms` since it landed. CKB enforces the wait itself; this only checks the transaction asks for it.
pub fn since_waited(since: u64, wait_ms: u64) -> bool {
    const RELATIVE: u64 = 0x8000_0000_0000_0000;
    const METRIC: u64 = 0x6000_0000_0000_0000;
    const RESERVED: u64 = 0x1F00_0000_0000_0000;
    const VALUE: u64 = 0x00FF_FFFF_FFFF_FFFF;
    const TIMESTAMP: u64 = 0x4000_0000_0000_0000;
    if (since & RELATIVE) == 0 || (since & RESERVED) != 0 || (since & METRIC) != TIMESTAMP {
        return false;
    }
    (since & VALUE).saturating_mul(1000) >= wait_ms
}

/// When an input cell landed on chain: the timestamp (ms) of the block that created it. Like the
/// Nervos DAO, the transaction must list that block in `header_deps`, and the chain vouches for it.
pub fn postmark_ms(index: usize, source: Source) -> Result<u64, i8> {
    Ok(postmark(index, source)?.1)
}

/// The block an input cell landed in: its hash and its timestamp (ms). Nobody can know a block's
/// hash before it is mined, which is what keeps an entry's road hidden until the entry lands.
pub fn postmark(index: usize, source: Source) -> Result<([u8; 32], u64), i8> {
    let header = load_header(index, source).map_err(|_| ERR_HEADER)?;
    let hash = blake2b_256(&[header.as_slice()]);
    Ok((hash, read_u64(header.raw().timestamp().as_slice(), 0)?))
}

/// When a steal must land to count, if the entry it spends had its last lap sealed at `sealed_ms`:
/// one lap window later, or the match deadline running now if that comes first.
pub fn land_by(deadline_ms: u64, sealed_ms: u64) -> u64 {
    deadline_ms.min(sealed_ms.saturating_add(LAP_WINDOW_MS))
}

/// Whether a lap whose road appeared at `lap_start_ms` was sealed in time, its seal having landed
/// at `sealed_ms`. A late lap leaves the entry stuck: no more laps, no steal, a refund at the close.
pub fn lap_on_time(lap_start_ms: u64, sealed_ms: u64) -> bool {
    sealed_ms <= lap_start_ms.saturating_add(LAP_WINDOW_MS)
}

/// Leading zero bits of an entry's proof of work. The work is bound to the match, the owner and
/// the first input of the transaction locking the entry, so a solution is good for that one entry
/// only, and it never touches the seed: one entry, one puzzle, one road.
pub fn pow_bits(match_type_hash: &[u8; 32], owner: &[u8; 32], first_input: &[u8], nonce: u64) -> u32 {
    let digest = blake2b_256(&[POW_DOMAIN, match_type_hash, owner, first_input, &nonce.to_le_bytes()]);
    let mut bits = 0;
    for byte in digest {
        if byte == 0 {
            bits += 8;
            continue;
        }
        bits += byte.leading_zeros();
        break;
    }
    bits
}

/// The first input of the running transaction, as it is hashed into proof of work.
pub fn first_input() -> Result<Vec<u8>, i8> {
    Ok(load_input_out_point(0, Source::Input).map_err(|_| ERR_WORK)?.as_slice().to_vec())
}

/// The king and score that are certified once `data`, a match cell that landed at `landed_ms`, is
/// spent. The king's steal counts if it landed by its land-by time: before the deadline that was
/// running when it was sent, and within a lap window of the king's last seal. Otherwise the earlier certified king
/// stands. A late or slow steal still lands, but it never counts.
pub fn certified_after(data: &[u8], landed_ms: u64) -> Result<([u8; 32], u64), i8> {
    let king = bytes::<32>(data, OFF_KING)?;
    if king != [0u8; 32] && landed_ms <= read_u64(data, OFF_LAND_BY)? {
        return Ok((king, read_u64(data, OFF_KING_SCORE)?));
    }
    Ok((bytes::<32>(data, OFF_CERTIFIED)?, read_u64(data, OFF_CERTIFIED_SCORE)?))
}

/// Who the pot goes to when the match cell at `index` in the inputs is closed: the last king whose
/// steal landed on time. `None` means nobody won, and the host gets everything back. The match,
/// pot and entry scripts all call this, so they always agree.
pub fn winner(data: &[u8], index: usize) -> Result<Option<[u8; 32]>, i8> {
    let (king, _) = certified_after(data, postmark_ms(index, Source::Input)?)?;
    Ok(if king == [0u8; 32] { None } else { Some(king) })
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

/// The course a player runs. Folding in their lock hash means a tape copied out of someone else's
/// pending steal plays a different course for the copier and scores something else. Folding in the
/// hash of the block their entry landed in means nobody sees their road before paying, and a new
/// road needs a new entry.
pub fn run_seed(match_id: &[u8; 32], owner: &[u8; 32], entry_block: &[u8; 32]) -> u64 {
    let digest = blake2b_256(&[SEED_DOMAIN, match_id, owner, entry_block]);
    u64::from_le_bytes(bytes::<8>(&digest, 0).unwrap_or([0u8; 8]))
}

/// The lap chain after one more lap: the block it was seeded by and the hash of its moves, folded
/// onto every lap before it. Order matters, so laps can't be swapped, dropped or replaced.
pub fn fold_lap(chain: &[u8; 32], block: &[u8; 32], moves_hash: &[u8; 32]) -> [u8; 32] {
    blake2b_256(&[LAP_DOMAIN, chain, block, moves_hash])
}

/// The run from the match cell's `input_type` witness, without its version byte.
pub fn load_run_witness() -> Result<Vec<u8>, i8> {
    let args = load_witness_args(0, Source::GroupInput).map_err(|_| ERR_RUN)?;
    let field = args.input_type().to_opt().ok_or(ERR_RUN)?;
    let raw = field.raw_data();
    if raw.first() != Some(&RUN_VERSION) {
        return Err(ERR_RUN);
    }
    Ok(raw[1..].to_vec())
}

/// Checks a run's laps against the entry's sealed lap chain and returns the game ABI v2 input:
/// `lap count` then per lap `seed ‖ tape length ‖ tape`, each seed built from the block the lap
/// was sealed against. A lap that wasn't sealed exactly so, in exactly this order, fails.
pub fn sealed_run(run: &[u8], laps: u8, chain: &[u8; 32], match_id: &[u8; 32], owner: &[u8; 32]) -> Result<Vec<u8>, i8> {
    let count = *run.first().ok_or(ERR_RUN)?;
    if count == 0 || count != laps || count > LAPS {
        return Err(ERR_RUN);
    }
    let mut game = Vec::with_capacity(run.len());
    game.push(count);
    let mut folded = [0u8; 32];
    let mut at = 1;
    for _ in 0..count {
        let block = bytes::<32>(run, at)?;
        let len = u16::from_le_bytes(bytes::<2>(run, at + 32)?) as usize;
        let tape = run.get(at + 34..at + 34 + len).ok_or(ERR_RUN)?;
        at += 34 + len;
        folded = fold_lap(&folded, &block, &blake2b_256(&[tape]));
        game.extend_from_slice(&run_seed(match_id, owner, &block).to_le_bytes());
        game.extend_from_slice(&(len as u16).to_le_bytes());
        game.extend_from_slice(tape);
    }
    if at != run.len() || folded != *chain {
        return Err(ERR_RUN);
    }
    Ok(game)
}

/// Game ABI v2. The game script is spawned from a cell dep found by its data hash, with one
/// argument, the hex of `lap count u8` then per lap `seed u64 LE ‖ tape length u16 LE ‖ tape`, and
/// one inherited fd. It writes the score as u64 LE to that fd and exits 0, or exits non-zero for
/// an illegal run. Any game that keeps this contract can be refereed by the same match script.
pub fn score_run(game: &[u8; 32], arg: &[u8]) -> Result<u64, i8> {
    let mut score = [0u8; 8];
    spawn_game(game, arg, &mut score)?;
    Ok(u64::from_le_bytes(score))
}

/// Spawns a game script found by its data hash with one hex argument and one inherited fd, and
/// reads exactly `out.len()` bytes of answer. A game that exits non-zero has judged the input illegal.
pub fn spawn_game(game: &[u8; 32], arg: &[u8], out: &mut [u8]) -> Result<(), i8> {
    let hex = encode_hex(arg);
    let (reader, writer) = pipe().map_err(|_| ERR_GAME)?;
    let pid = spawn_cell(game, ScriptHashType::Data2, &[hex.as_c_str()], &[writer]).map_err(|_| ERR_GAME)?;
    let mut got = 0;
    while got < out.len() {
        let n = read(reader, &mut out[got..]).map_err(|_| ERR_RUN)?;
        if n == 0 {
            return Err(ERR_RUN);
        }
        got += n;
    }
    if wait(pid).map_err(|_| ERR_GAME)? != 0 {
        return Err(ERR_RUN);
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

/// The one bid a steal spends: its input index and its owner's lock hash, from bid args 32..64.
/// The bid lock itself is the proxy and names nobody.
pub fn winning_bid(match_type_hash: &[u8; 32], bid_code: &[u8; 32]) -> Result<(usize, [u8; 32]), i8> {
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
        found = Some((i, bytes::<32>(&args, 32)?));
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
