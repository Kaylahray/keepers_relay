//! Event-engine integration tests — real ckb-testtool verification against
//! event-type, participant-type, event-treasury-lock, and reward-claim-type.

use super::{verify_and_dump_failed_tx, Loader};
use blake2b_ref::{Blake2b, Blake2bBuilder};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{Capacity, TransactionBuilder, TransactionView},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script},
        prelude::*,
    },
    context::Context,
};

const MAX_CYCLES: u64 = 30_000_000;

const EVENT_DATA_LEN: usize = 2576;
const EVENT_VERSION: u8 = 3;
const PARTICIPANT_DATA_LEN: usize = 56;
const PARTICIPANT_VERSION: u8 = 1;
const CLAIM_DATA_LEN: usize = 96;
const CLAIM_VERSION: u8 = 1;

const STATUS_REG: u8 = 0;
const STATUS_READY: u8 = 1;
const STATUS_LIVE: u8 = 2;
const STATUS_FINISHED: u8 = 4;
const STATUS_SETTLED: u8 = 5;

const TURN_IDLE: u8 = 0;
const TURN_PENDING: u8 = 1;
const TURN_ANSWERED: u8 = 2;
const TURN_TIMED_OUT: u8 = 3;

const EVENT_OFFSET_VERSION: usize = 0;
const EVENT_OFFSET_STATUS: usize = 1;
const EVENT_OFFSET_FLAGS: usize = 2;
const EVENT_OFFSET_MODE: usize = 3;
const EVENT_OFFSET_MIN_PLAYERS: usize = 4;
const EVENT_OFFSET_MAX_PLAYERS: usize = 6;
const EVENT_OFFSET_PLAYER_COUNT: usize = 8;
const EVENT_OFFSET_WINNERS_N: usize = 10;
const EVENT_OFFSET_WINNER_COUNT: usize = 12;
const EVENT_OFFSET_BASE_TURN_SECS: usize = 14;
const EVENT_OFFSET_SHRINK_STEP_SECS: usize = 22;
const EVENT_OFFSET_MIN_TURN_SECS: usize = 30;
const EVENT_OFFSET_ENTRY_FEE: usize = 38;
const EVENT_OFFSET_POT: usize = 46;
const EVENT_OFFSET_FINAL_POT: usize = 54;
const EVENT_OFFSET_START_TIME: usize = 62;
const EVENT_OFFSET_END_TIME: usize = 70;
const EVENT_OFFSET_EVENT_ID: usize = 78;
const EVENT_OFFSET_COMMUNITY_ID: usize = 110;
const EVENT_OFFSET_CREATOR_LOCK: usize = 142;
const EVENT_OFFSET_CONTROLLER_LOCK: usize = 174;
const EVENT_OFFSET_TREASURY_LOCK: usize = 206;
const EVENT_OFFSET_PARTICIPANT_CODE_HASH: usize = 238;
const EVENT_OFFSET_RULES_HASH: usize = 270;
const EVENT_OFFSET_QUESTION_SET_HASH: usize = 302;
const EVENT_OFFSET_RESULT_HASH: usize = 334;
const EVENT_OFFSET_TURN_NUMBER: usize = 366;
const EVENT_OFFSET_TURN_STATE: usize = 374;
const EVENT_OFFSET_SELECTED_INDEX: usize = 375;
const EVENT_OFFSET_TURN_STARTED: usize = 376;
const EVENT_OFFSET_TURN_DEADLINE: usize = 384;
const EVENT_OFFSET_CURRENT_HOLDER: usize = 392;
const EVENT_OFFSET_PREVIOUS_HOLDER: usize = 424;
const EVENT_OFFSET_ACTION_COMMIT: usize = 456;
const EVENT_OFFSET_REWARD_CLAIM_CODE_HASH: usize = 488;
const EVENT_OFFSET_PARTICIPANTS: usize = 528;

const PARTICIPANT_OFFSET_VERSION: usize = 0;
const PARTICIPANT_OFFSET_STATUS: usize = 1;
const PARTICIPANT_OFFSET_ENTRY_FEE: usize = 2;
const PARTICIPANT_OFFSET_JOINED_AT: usize = 10;
const PARTICIPANT_OFFSET_NONCE: usize = 18;
const PARTICIPANT_OFFSET_SLOT: usize = 50;

const CLAIM_OFFSET_VERSION: usize = 0;
const CLAIM_OFFSET_RECIPIENT: usize = 1;
const CLAIM_OFFSET_AMOUNT: usize = 33;
const CLAIM_OFFSET_EVENT_ID: usize = 41;
const CLAIM_OFFSET_NONCE: usize = 73;

const SINCE_ABSOLUTE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;
const CKB_HASH_PERSONALIZATION: &[u8] = b"ckb-default-hash";

const EVENT_CAP: u64 = 200_000_000_000;
const FUND_CAP: u64 = 500_000_000_000;
const PARTICIPANT_CAP: u64 = 10_000_000_000;
const ENTRY_FEE: u64 = 100_000_000;
const DEADLINE_MS: u64 = 1_700_000_000_000;
const START_MS: u64 = 1_699_999_940_000; // deadline = start + 60_000 for base=60

// ——— Helpers ——————————————————————————————————————————————————————————————

fn new_blake2b() -> Blake2b {
    Blake2bBuilder::new(32)
        .personal(CKB_HASH_PERSONALIZATION)
        .build()
}

fn type_id_of(first_input: &CellInput, output_index: u64) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn lock_hash_of(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.calc_script_hash().as_slice());
    out
}

fn type_hash_of(script: &Script) -> [u8; 32] {
    lock_hash_of(script)
}

fn code_hash_field(script: &Script) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(script.code_hash().as_slice());
    out
}

fn always_success(context: &mut Context, args: &[u8]) -> (Script, CellDep) {
    let out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let script = context
        .build_script(&out_point, Bytes::from(args.to_vec()))
        .expect("always-success");
    let dep = CellDep::new_builder().out_point(out_point).build();
    (script, dep)
}

fn write_u16(buf: &mut [u8], offset: usize, v: u16) {
    buf[offset..offset + 2].copy_from_slice(&v.to_le_bytes());
}

fn write_u64(buf: &mut [u8], offset: usize, v: u64) {
    buf[offset..offset + 8].copy_from_slice(&v.to_le_bytes());
}

fn copy32(buf: &mut [u8], offset: usize, v: &[u8; 32]) {
    buf[offset..offset + 32].copy_from_slice(v);
}

fn occupied_for(output: &CellOutput, data_len: usize) -> u64 {
    output
        .occupied_capacity(Capacity::bytes(data_len).expect("data capacity"))
        .expect("occupied capacity")
        .as_u64()
}


fn since_at(secs: u64) -> u64 {
    SINCE_ABSOLUTE_TIMESTAMP | secs
}

fn treasury_args(event_type_hash: &[u8; 32], event_id: &[u8; 32]) -> Bytes {
    let mut args = [0u8; 64];
    args[0..32].copy_from_slice(event_type_hash);
    args[32..64].copy_from_slice(event_id);
    Bytes::from(args.to_vec())
}

fn participant_args(
    event_type_hash: &[u8; 32],
    event_id: &[u8; 32],
    player: &[u8; 32],
) -> Bytes {
    let mut args = [0u8; 96];
    args[0..32].copy_from_slice(event_type_hash);
    args[32..64].copy_from_slice(event_id);
    args[64..96].copy_from_slice(player);
    Bytes::from(args.to_vec())
}

fn claim_args(event_type_hash: &[u8; 32], event_id: &[u8; 32]) -> Bytes {
    treasury_args(event_type_hash, event_id)
}

fn treasury_output(lock: Script, spendable: u64) -> CellOutput {
    let occ = occupied_for(
        &CellOutput::new_builder()
            .capacity(0u64)
            .lock(lock.clone())
            .build(),
        0,
    );
    CellOutput::new_builder()
        .capacity(occ + spendable)
        .lock(lock)
        .build()
}

// ——— Event / participant / claim data ————————————————————————————————————

#[derive(Clone)]
struct EventData {
    status: u8,
    flags: u8,
    mode: u8,
    min_players: u16,
    max_players: u16,
    player_count: u16,
    winners_n: u16,
    winner_count: u16,
    base_turn_secs: u64,
    shrink_step_secs: u64,
    min_turn_secs: u64,
    entry_fee: u64,
    pot: u64,
    final_pot: u64,
    start_time: u64,
    end_time: u64,
    event_id: [u8; 32],
    community_id: [u8; 32],
    creator_lock: [u8; 32],
    controller_lock: [u8; 32],
    treasury_lock: [u8; 32],
    participant_code_hash: [u8; 32],
    rules_hash: [u8; 32],
    question_set_hash: [u8; 32],
    result_hash: [u8; 32],
    turn_number: u64,
    turn_state: u8,
    selected_index: i8,
    turn_started: u64,
    turn_deadline: u64,
    current_holder: [u8; 32],
    previous_holder: [u8; 32],
    action_commit: [u8; 32],
    reward_claim_code_hash: [u8; 32],
    slots: [[u8; 32]; 64],
}

impl EventData {
    fn registration(
        event_id: [u8; 32],
        creator: [u8; 32],
        controller: [u8; 32],
        treasury_lock: [u8; 32],
        participant_code_hash: [u8; 32],
        reward_claim_code_hash: [u8; 32],
    ) -> Self {
        Self {
            status: STATUS_REG,
            flags: 0,
            mode: 0,
            min_players: 1,
            max_players: 4,
            player_count: 0,
            winners_n: 1,
            winner_count: 0,
            base_turn_secs: 60,
            shrink_step_secs: 0,
            min_turn_secs: 30,
            entry_fee: ENTRY_FEE,
            pot: 0,
            final_pot: 0,
            start_time: 0,
            end_time: 0,
            event_id,
            community_id: [0x11; 32],
            creator_lock: creator,
            controller_lock: controller,
            treasury_lock,
            participant_code_hash,
            rules_hash: [0x22; 32],
            question_set_hash: [0x33; 32],
            result_hash: [0u8; 32],
            turn_number: 0,
            turn_state: TURN_IDLE,
            selected_index: -1,
            turn_started: 0,
            turn_deadline: 0,
            current_holder: [0u8; 32],
            previous_holder: [0u8; 32],
            action_commit: [0u8; 32],
            reward_claim_code_hash,
            slots: [[0u8; 32]; 64],
        }
    }

    fn encode(&self) -> Bytes {
        let mut data = vec![0u8; EVENT_DATA_LEN];
        data[EVENT_OFFSET_VERSION] = EVENT_VERSION;
        data[EVENT_OFFSET_STATUS] = self.status;
        data[EVENT_OFFSET_FLAGS] = self.flags;
        data[EVENT_OFFSET_MODE] = self.mode;
        write_u16(&mut data, EVENT_OFFSET_MIN_PLAYERS, self.min_players);
        write_u16(&mut data, EVENT_OFFSET_MAX_PLAYERS, self.max_players);
        write_u16(&mut data, EVENT_OFFSET_PLAYER_COUNT, self.player_count);
        write_u16(&mut data, EVENT_OFFSET_WINNERS_N, self.winners_n);
        write_u16(&mut data, EVENT_OFFSET_WINNER_COUNT, self.winner_count);
        write_u64(&mut data, EVENT_OFFSET_BASE_TURN_SECS, self.base_turn_secs);
        write_u64(&mut data, EVENT_OFFSET_SHRINK_STEP_SECS, self.shrink_step_secs);
        write_u64(&mut data, EVENT_OFFSET_MIN_TURN_SECS, self.min_turn_secs);
        write_u64(&mut data, EVENT_OFFSET_ENTRY_FEE, self.entry_fee);
        write_u64(&mut data, EVENT_OFFSET_POT, self.pot);
        write_u64(&mut data, EVENT_OFFSET_FINAL_POT, self.final_pot);
        write_u64(&mut data, EVENT_OFFSET_START_TIME, self.start_time);
        write_u64(&mut data, EVENT_OFFSET_END_TIME, self.end_time);
        copy32(&mut data, EVENT_OFFSET_EVENT_ID, &self.event_id);
        copy32(&mut data, EVENT_OFFSET_COMMUNITY_ID, &self.community_id);
        copy32(&mut data, EVENT_OFFSET_CREATOR_LOCK, &self.creator_lock);
        copy32(&mut data, EVENT_OFFSET_CONTROLLER_LOCK, &self.controller_lock);
        copy32(&mut data, EVENT_OFFSET_TREASURY_LOCK, &self.treasury_lock);
        copy32(
            &mut data,
            EVENT_OFFSET_PARTICIPANT_CODE_HASH,
            &self.participant_code_hash,
        );
        copy32(&mut data, EVENT_OFFSET_RULES_HASH, &self.rules_hash);
        copy32(
            &mut data,
            EVENT_OFFSET_QUESTION_SET_HASH,
            &self.question_set_hash,
        );
        copy32(&mut data, EVENT_OFFSET_RESULT_HASH, &self.result_hash);
        write_u64(&mut data, EVENT_OFFSET_TURN_NUMBER, self.turn_number);
        data[EVENT_OFFSET_TURN_STATE] = self.turn_state;
        data[EVENT_OFFSET_SELECTED_INDEX] = self.selected_index as u8;
        write_u64(&mut data, EVENT_OFFSET_TURN_STARTED, self.turn_started);
        write_u64(&mut data, EVENT_OFFSET_TURN_DEADLINE, self.turn_deadline);
        copy32(&mut data, EVENT_OFFSET_CURRENT_HOLDER, &self.current_holder);
        copy32(&mut data, EVENT_OFFSET_PREVIOUS_HOLDER, &self.previous_holder);
        copy32(&mut data, EVENT_OFFSET_ACTION_COMMIT, &self.action_commit);
        copy32(
            &mut data,
            EVENT_OFFSET_REWARD_CLAIM_CODE_HASH,
            &self.reward_claim_code_hash,
        );
        for (i, slot) in self.slots.iter().enumerate() {
            copy32(&mut data, EVENT_OFFSET_PARTICIPANTS + i * 32, slot);
        }
        Bytes::from(data)
    }
}

#[derive(Clone)]
struct ParticipantData {
    entry_fee: u64,
    joined_at: u64,
    nonce: [u8; 32],
    slot: u16,
}

impl ParticipantData {
    fn encode(&self) -> Bytes {
        let mut data = vec![0u8; PARTICIPANT_DATA_LEN];
        data[PARTICIPANT_OFFSET_VERSION] = PARTICIPANT_VERSION;
        data[PARTICIPANT_OFFSET_STATUS] = 0;
        write_u64(&mut data, PARTICIPANT_OFFSET_ENTRY_FEE, self.entry_fee);
        write_u64(&mut data, PARTICIPANT_OFFSET_JOINED_AT, self.joined_at);
        copy32(&mut data, PARTICIPANT_OFFSET_NONCE, &self.nonce);
        write_u16(&mut data, PARTICIPANT_OFFSET_SLOT, self.slot);
        Bytes::from(data)
    }
}

fn encode_claim(recipient: &[u8; 32], amount: u64, event_id: &[u8; 32], nonce: &[u8; 32]) -> Bytes {
    let mut data = vec![0u8; CLAIM_DATA_LEN];
    data[CLAIM_OFFSET_VERSION] = CLAIM_VERSION;
    copy32(&mut data, CLAIM_OFFSET_RECIPIENT, recipient);
    write_u64(&mut data, CLAIM_OFFSET_AMOUNT, amount);
    copy32(&mut data, CLAIM_OFFSET_EVENT_ID, event_id);
    // Claim layout: nonce is 23 bytes at offset 73 (through byte 95).
    data[CLAIM_OFFSET_NONCE..CLAIM_DATA_LEN].copy_from_slice(&nonce[..23]);
    Bytes::from(data)
}

// ——— Fixture —————————————————————————————————————————————————————————————

struct Deployed {
    out_point: OutPoint,
    dep: CellDep,
}

impl Deployed {
    fn load(context: &mut Context, name: &str) -> Self {
        let bin = Loader::default().load_binary(name);
        let out_point = context.deploy_cell(bin);
        let dep = CellDep::new_builder().out_point(out_point.clone()).build();
        Self { out_point, dep }
    }

    fn script(&self, context: &mut Context, args: Bytes) -> Script {
        context
            .build_script(&self.out_point, args)
            .expect("build script")
    }

    fn code_hash(&self, context: &mut Context) -> [u8; 32] {
        code_hash_field(&self.script(context, Bytes::new()))
    }
}

struct Fixture {
    event_ty: Deployed,
    participant_ty: Deployed,
    treasury_lock: Deployed,
    reward_claim_ty: Deployed,
    participant_code_hash: [u8; 32],
    reward_claim_code_hash: [u8; 32],
}

impl Fixture {
    fn deploy(context: &mut Context) -> Self {
        let event_ty = Deployed::load(context, "event-type");
        let participant_ty = Deployed::load(context, "participant-type");
        let treasury_lock = Deployed::load(context, "event-treasury-lock");
        let reward_claim_ty = Deployed::load(context, "reward-claim-type");
        let participant_code_hash = participant_ty.code_hash(context);
        let reward_claim_code_hash = reward_claim_ty.code_hash(context);
        Self {
            event_ty,
            participant_ty,
            treasury_lock,
            reward_claim_ty,
            participant_code_hash,
            reward_claim_code_hash,
        }
    }

    fn event_script(&self, context: &mut Context, event_id: &[u8; 32]) -> Script {
        self.event_ty
            .script(context, Bytes::from(event_id.to_vec()))
    }

    fn treasury_script(
        &self,
        context: &mut Context,
        event_type_hash: &[u8; 32],
        event_id: &[u8; 32],
    ) -> Script {
        self.treasury_lock
            .script(context, treasury_args(event_type_hash, event_id))
    }

    fn participant_script(
        &self,
        context: &mut Context,
        event_type_hash: &[u8; 32],
        event_id: &[u8; 32],
        player: &[u8; 32],
    ) -> Script {
        self.participant_ty
            .script(context, participant_args(event_type_hash, event_id, player))
    }

    fn claim_script(
        &self,
        context: &mut Context,
        event_type_hash: &[u8; 32],
        event_id: &[u8; 32],
    ) -> Script {
        self.reward_claim_ty
            .script(context, claim_args(event_type_hash, event_id))
    }
}

/// Build a valid create tx. Event is always output index 0 (type-id).
/// `mutate` can tweak event data after hashes are filled; return a forged
/// event_id for the type script args when testing type-id mismatches.
fn create_event_tx(
    context: &mut Context,
    fx: &Fixture,
    controller: Script,
    controller_dep: &CellDep,
    event_lock: Script,
    mutate: impl FnOnce(&mut EventData),
    forged_type_args: Option<[u8; 32]>,
    treasury_extra_capacity: u64,
) -> TransactionView {
    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(FUND_CAP)
            .lock(controller.clone())
            .build(),
        Bytes::new(),
    );
    let first_input = CellInput::new_builder().previous_output(fund).build();
    let event_id = type_id_of(&first_input, 0);
    let type_args = forged_type_args.unwrap_or(event_id);
    let event_script = fx.event_script(context, &type_args);
    let event_type_hash = type_hash_of(&event_script);

    // Treasury args bind to the *data* event_id and the type hash of the event script.
    let data_event_id = if forged_type_args.is_some() {
        type_args
    } else {
        event_id
    };
    let treasury_script = fx.treasury_script(context, &event_type_hash, &data_event_id);
    let treasury_lock_hash = lock_hash_of(&treasury_script);

    let mut data = EventData::registration(
        data_event_id,
        lock_hash_of(&controller),
        lock_hash_of(&controller),
        treasury_lock_hash,
        fx.participant_code_hash,
        fx.reward_claim_code_hash,
    );
    // Creator/controller hashes: controller lock is the authorization lock.
    data.creator_lock = lock_hash_of(&controller);
    data.controller_lock = lock_hash_of(&controller);
    mutate(&mut data);

    let treasury_out = treasury_output(treasury_script, treasury_extra_capacity);

    TransactionBuilder::default()
        .input(first_input)
        .output(
            CellOutput::new_builder()
                .capacity(EVENT_CAP)
                .lock(event_lock)
                .type_(Some(event_script).pack())
                .build(),
        )
        .output_data(data.encode().pack())
        .output(treasury_out)
        .output_data(Bytes::new().pack())
        .cell_dep(controller_dep.clone())
        .cell_dep(fx.event_ty.dep.clone())
        .cell_dep(fx.treasury_lock.dep.clone())
        .build()
}

/// Materialize a live registration event + zero-spendable treasury via create_cell.
struct LiveRegistration {
    event_id: [u8; 32],
    event_type_hash: [u8; 32],
    event_script: Script,
    treasury_script: Script,
    event_data: EventData,
    event_cell: OutPoint,
    treasury_cell: OutPoint,
}

fn spawn_registration(
    context: &mut Context,
    fx: &Fixture,
    controller: &Script,
    event_id: [u8; 32],
    mutate: impl FnOnce(&mut EventData),
    treasury_spendable: u64,
) -> LiveRegistration {
    let event_script = fx.event_script(context, &event_id);
    let event_type_hash = type_hash_of(&event_script);
    let treasury_script = fx.treasury_script(context, &event_type_hash, &event_id);
    let treasury_lock_hash = lock_hash_of(&treasury_script);

    let mut event_data = EventData::registration(
        event_id,
        lock_hash_of(controller),
        lock_hash_of(controller),
        treasury_lock_hash,
        fx.participant_code_hash,
        fx.reward_claim_code_hash,
    );
    event_data.pot = treasury_spendable;
    mutate(&mut event_data);

    let event_cell = context.create_cell(
        CellOutput::new_builder()
            .capacity(EVENT_CAP)
            .lock(controller.clone())
            .type_(Some(event_script.clone()).pack())
            .build(),
        event_data.encode(),
    );
    let treasury_cell = context.create_cell(
        treasury_output(treasury_script.clone(), treasury_spendable),
        Bytes::new(),
    );

    LiveRegistration {
        event_id,
        event_type_hash,
        event_script,
        treasury_script,
        event_data,
        event_cell,
        treasury_cell,
    }
}

fn build_join_tx(
    context: &mut Context,
    fx: &Fixture,
    live: &LiveRegistration,
    controller: &Script,
    controller_dep: &CellDep,
    player: &Script,
    player_dep: &CellDep,
    slot: u16,
    fee_paid: u64,
    mutate_out: impl FnOnce(&mut EventData),
) -> TransactionView {
    let player_hash = lock_hash_of(player);
    let mut out_data = live.event_data.clone();
    out_data.slots[slot as usize] = player_hash;
    out_data.player_count = live.event_data.player_count + 1;
    out_data.pot = live.event_data.pot + fee_paid;
    mutate_out(&mut out_data);

    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(FUND_CAP)
            .lock(player.clone())
            .build(),
        Bytes::new(),
    );

    let participant_script =
        fx.participant_script(context, &live.event_type_hash, &live.event_id, &player_hash);
    let participant_data = ParticipantData {
        entry_fee: out_data.entry_fee,
        joined_at: 1_700_000_000_000,
        nonce: [0xAB; 32],
        slot,
    };

    TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(live.event_cell.clone())
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(live.treasury_cell.clone())
                .build(),
        )
        .input(CellInput::new_builder().previous_output(fund).build())
        .output(
            CellOutput::new_builder()
                .capacity(EVENT_CAP)
                .lock(controller.clone())
                .type_(Some(live.event_script.clone()).pack())
                .build(),
        )
        .output_data(out_data.encode().pack())
        .output(treasury_output(
            live.treasury_script.clone(),
            out_data.pot,
        ))
        .output_data(Bytes::new().pack())
        .output(
            CellOutput::new_builder()
                .capacity(PARTICIPANT_CAP)
                .lock(player.clone())
                .type_(Some(participant_script).pack())
                .build(),
        )
        .output_data(participant_data.encode().pack())
        .cell_dep(controller_dep.clone())
        .cell_dep(player_dep.clone())
        .cell_dep(fx.event_ty.dep.clone())
        .cell_dep(fx.treasury_lock.dep.clone())
        .cell_dep(fx.participant_ty.dep.clone())
        .build()
}

fn update_event_treasury_tx(
    _context: &mut Context,
    fx: &Fixture,
    controller: &Script,
    controller_dep: &CellDep,
    event_script: &Script,
    treasury_script: &Script,
    event_in: OutPoint,
    treasury_in: OutPoint,
    in_data: &EventData,
    out_data: &EventData,
    since: u64,
) -> TransactionView {
    let _ = in_data;
    TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(event_in)
                .since(since)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(treasury_in)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(EVENT_CAP)
                .lock(controller.clone())
                .type_(Some(event_script.clone()).pack())
                .build(),
        )
        .output_data(out_data.encode().pack())
        .output(treasury_output(treasury_script.clone(), out_data.pot))
        .output_data(Bytes::new().pack())
        .cell_dep(controller_dep.clone())
        .cell_dep(fx.event_ty.dep.clone())
        .cell_dep(fx.treasury_lock.dep.clone())
        .build()
}

// ——— Smoke ———————————————————————————————————————————————————————————————

#[test]
fn binaries_present() {
    let loader = Loader::default();
    for name in [
        "event-type",
        "participant-type",
        "event-treasury-lock",
        "reward-claim-type",
    ] {
        let bin = loader.load_binary(name);
        assert!(!bin.is_empty(), "{name} empty");
    }
}

// ——— Create ——————————————————————————————————————————————————————————————

#[test]
fn create_event_and_treasury_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x01]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |_| {},
        None,
        0,
    );
    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect("create event+treasury should pass");
    println!("[event-engine] create — cycles: {cycles}");
}

#[test]
fn create_with_forged_type_id_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x02]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |_| {},
        Some([0xAB; 32]),
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("forged type_id must fail");
}

#[test]
fn create_with_zero_max_players_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x03]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |d| d.max_players = 0,
        None,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("zero max_players must fail");
}

#[test]
fn create_with_winners_n_zero_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x04]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |d| d.winners_n = 0,
        None,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("winners_n=0 must fail");
}

#[test]
fn create_with_min_gt_max_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x05]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |d| {
            d.min_players = 5;
            d.max_players = 2;
        },
        None,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("min > max must fail");
}

#[test]
fn create_without_zero_spendable_treasury_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x06]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller.clone(),
        &controller_dep,
        controller,
        |_| {},
        None,
        ENTRY_FEE, // extra capacity → spendable != 0
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("create treasury must have zero spendable");
}

#[test]
fn create_with_non_controller_event_lock_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x07]);
    let (other_lock, _) = always_success(&mut context, &[0x08]);

    let tx = create_event_tx(
        &mut context,
        &fx,
        controller,
        &controller_dep,
        other_lock,
        |_| {},
        None,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("event lock must equal controller_lock_hash");
}

// ——— Join ————————————————————————————————————————————————————————————————

#[test]
fn join_paid_seat_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x10]);
    let (player, player_dep) = always_success(&mut context, &[0x11]);

    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x01; 32],
        |_| {},
        0,
    );
    let tx = build_join_tx(
        &mut context,
        &fx,
        &live,
        &controller,
        &controller_dep,
        &player,
        &player_dep,
        0,
        ENTRY_FEE,
        |_| {},
    );
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("join should pass");
    println!("[event-engine] join — cycles: {cycles}");
}

#[test]
fn join_with_wrong_entry_fee_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x12]);
    let (player, player_dep) = always_success(&mut context, &[0x13]);

    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x02; 32],
        |_| {},
        0,
    );
    // Pay less than entry_fee into treasury / pot.
    let tx = build_join_tx(
        &mut context,
        &fx,
        &live,
        &controller,
        &controller_dep,
        &player,
        &player_dep,
        0,
        ENTRY_FEE / 2,
        |_| {},
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("underpaid entry fee must fail");
}

#[test]
fn join_duplicate_player_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x14]);
    let (player, player_dep) = always_success(&mut context, &[0x15]);
    let player_hash = lock_hash_of(&player);

    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x03; 32],
        |d| {
            d.slots[0] = player_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
        },
        ENTRY_FEE,
    );
    let tx = build_join_tx(
        &mut context,
        &fx,
        &live,
        &controller,
        &controller_dep,
        &player,
        &player_dep,
        1,
        ENTRY_FEE,
        |_| {},
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("duplicate player must fail");
}

#[test]
fn join_wrong_slot_overwrite_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x16]);
    let (player_a, _) = always_success(&mut context, &[0x17]);
    let (player_b, player_b_dep) = always_success(&mut context, &[0x18]);
    let a_hash = lock_hash_of(&player_a);

    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x04; 32],
        |d| {
            d.slots[0] = a_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
        },
        ENTRY_FEE,
    );
    // Try to overwrite occupied slot 0 with player_b.
    let tx = build_join_tx(
        &mut context,
        &fx,
        &live,
        &controller,
        &controller_dep,
        &player_b,
        &player_b_dep,
        0,
        ENTRY_FEE,
        |_| {},
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("overwriting occupied slot must fail");
}

// ——— Registration → READY → LIVE ————————————————————————————————————————

#[test]
fn ready_without_min_players_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x20]);

    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x05; 32],
        |d| {
            d.min_players = 2;
            d.max_players = 4;
        },
        0,
    );
    let mut out = live.event_data.clone();
    out.status = STATUS_READY;

    let tx = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell,
        live.treasury_cell,
        &live.event_data,
        &out,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("READY without min players must fail");
}

#[test]
fn ready_then_first_live_turn_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x21]);
    let (player, _) = always_success(&mut context, &[0x22]);
    let player_hash = lock_hash_of(&player);

    // Already at min_players=1 with one seat filled, status REG → READY → LIVE.
    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x06; 32],
        |d| {
            d.min_players = 1;
            d.slots[0] = player_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
        },
        ENTRY_FEE,
    );

    let mut ready = live.event_data.clone();
    ready.status = STATUS_READY;
    let tx_ready = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell.clone(),
        live.treasury_cell.clone(),
        &live.event_data,
        &ready,
        0,
    );
    let tx_ready = context.complete_tx(tx_ready);
    verify_and_dump_failed_tx(&context, &tx_ready, MAX_CYCLES).expect("ready should pass");

    // Re-materialize READY cells (complete_tx doesn't leave live outs in context for reuse easily).
    let ready_live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x06; 32],
        |d| {
            d.min_players = 1;
            d.slots[0] = player_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
            d.status = STATUS_READY;
        },
        ENTRY_FEE,
    );

    let mut live_out = ready_live.event_data.clone();
    live_out.status = STATUS_LIVE;
    live_out.turn_state = TURN_PENDING;
    live_out.turn_number = 0;
    live_out.current_holder = player_hash;
    live_out.start_time = START_MS;
    live_out.turn_started = START_MS;
    live_out.turn_deadline = START_MS + 60_000; // base_turn_secs=60
    live_out.action_commit = [0xCA; 32];
    live_out.selected_index = -1;

    let tx_live = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &ready_live.event_script,
        &ready_live.treasury_script,
        ready_live.event_cell,
        ready_live.treasury_cell,
        &ready_live.event_data,
        &live_out,
        0,
    );
    let tx_live = context.complete_tx(tx_live);
    let cycles = verify_and_dump_failed_tx(&context, &tx_live, MAX_CYCLES)
        .expect("first LIVE turn should pass");
    println!("[event-engine] ready→live — cycles: {cycles}");
}

// ——— Turns ———————————————————————————————————————————————————————————————

fn spawn_live_pending(
    context: &mut Context,
    fx: &Fixture,
    controller: &Script,
    event_id: [u8; 32],
    player_hash: [u8; 32],
) -> LiveRegistration {
    spawn_registration(
        context,
        fx,
        controller,
        event_id,
        |d| {
            d.min_players = 1;
            d.slots[0] = player_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
            d.status = STATUS_LIVE;
            d.turn_state = TURN_PENDING;
            d.turn_number = 0;
            d.current_holder = player_hash;
            d.start_time = START_MS;
            d.turn_started = START_MS;
            d.turn_deadline = DEADLINE_MS;
            d.action_commit = [0xCA; 32];
            d.selected_index = -1;
            // Ensure deadline matches shrink formula: started + base*1000
            d.base_turn_secs = (DEADLINE_MS - START_MS) / 1000;
            d.min_turn_secs = 1;
        },
        ENTRY_FEE,
    )
}

#[test]
fn answer_turn_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x30]);
    let (player, _) = always_success(&mut context, &[0x31]);
    let player_hash = lock_hash_of(&player);

    let live = spawn_live_pending(&mut context, &fx, &controller, [0x07; 32], player_hash);
    let mut out = live.event_data.clone();
    out.turn_state = TURN_ANSWERED;
    out.selected_index = 2;

    let tx = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell,
        live.treasury_cell,
        &live.event_data,
        &out,
        0,
    );
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("answer should pass");
    println!("[event-engine] answer — cycles: {cycles}");
}

#[test]
fn answer_with_negative_selected_index_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x32]);
    let (player, _) = always_success(&mut context, &[0x33]);
    let player_hash = lock_hash_of(&player);

    let live = spawn_live_pending(&mut context, &fx, &controller, [0x08; 32], player_hash);
    let mut out = live.event_data.clone();
    out.turn_state = TURN_ANSWERED;
    out.selected_index = -1;

    let tx = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell,
        live.treasury_cell,
        &live.event_data,
        &out,
        0,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("ANSWERED requires selected_index >= 0");
}

#[test]
fn timeout_before_deadline_rejected() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x34]);
    let (player, _) = always_success(&mut context, &[0x35]);
    let player_hash = lock_hash_of(&player);

    let live = spawn_live_pending(&mut context, &fx, &controller, [0x09; 32], player_hash);
    let mut out = live.event_data.clone();
    out.turn_state = TURN_TIMED_OUT;

    let early = since_at(DEADLINE_MS / 1000 - 10);
    let tx = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell,
        live.treasury_cell,
        &live.event_data,
        &out,
        early,
    );
    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES)
        .expect_err("timeout before deadline must fail");
}

#[test]
fn timeout_after_deadline_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x36]);
    let (player, _) = always_success(&mut context, &[0x37]);
    let player_hash = lock_hash_of(&player);

    let live = spawn_live_pending(&mut context, &fx, &controller, [0x0A; 32], player_hash);
    let mut out = live.event_data.clone();
    out.turn_state = TURN_TIMED_OUT;

    let after = since_at(DEADLINE_MS / 1000);
    let tx = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell,
        live.treasury_cell,
        &live.event_data,
        &out,
        after,
    );
    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("timeout after deadline");
    println!("[event-engine] timeout — cycles: {cycles}");
}

// ——— Finish / settle —————————————————————————————————————————————————————

#[test]
fn finish_then_settle_with_claim_passes() {
    let mut context = Context::default();
    let fx = Fixture::deploy(&mut context);
    let (controller, controller_dep) = always_success(&mut context, &[0x40]);
    let (winner, winner_dep) = always_success(&mut context, &[0x41]);
    let winner_hash = lock_hash_of(&winner);

    // LIVE + ANSWERED → FINISHED
    let live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x0B; 32],
        |d| {
            d.min_players = 1;
            d.winners_n = 1;
            d.slots[0] = winner_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
            d.status = STATUS_LIVE;
            d.turn_state = TURN_ANSWERED;
            d.turn_number = 0;
            d.current_holder = winner_hash;
            d.start_time = START_MS;
            d.turn_started = START_MS;
            d.turn_deadline = DEADLINE_MS;
            d.action_commit = [0xCA; 32];
            d.selected_index = 1;
            d.base_turn_secs = (DEADLINE_MS - START_MS) / 1000;
            d.min_turn_secs = 1;
        },
        ENTRY_FEE,
    );

    let mut finished = live.event_data.clone();
    finished.status = STATUS_FINISHED;
    finished.result_hash = [0xEE; 32];
    finished.winner_count = 1;
    finished.end_time = DEADLINE_MS + 1_000;

    let tx_finish = update_event_treasury_tx(
        &mut context,
        &fx,
        &controller,
        &controller_dep,
        &live.event_script,
        &live.treasury_script,
        live.event_cell.clone(),
        live.treasury_cell.clone(),
        &live.event_data,
        &finished,
        0,
    );
    let tx_finish = context.complete_tx(tx_finish);
    verify_and_dump_failed_tx(&context, &tx_finish, MAX_CYCLES).expect("finish should pass");

    // Materialize FINISHED + treasury for settle.
    let finished_live = spawn_registration(
        &mut context,
        &fx,
        &controller,
        [0x0B; 32],
        |d| {
            d.min_players = 1;
            d.winners_n = 1;
            d.slots[0] = winner_hash;
            d.player_count = 1;
            d.pot = ENTRY_FEE;
            d.status = STATUS_FINISHED;
            d.turn_state = TURN_ANSWERED;
            d.turn_number = 0;
            d.current_holder = winner_hash;
            d.start_time = START_MS;
            d.turn_started = START_MS;
            d.turn_deadline = DEADLINE_MS;
            d.action_commit = [0xCA; 32];
            d.selected_index = 1;
            d.result_hash = [0xEE; 32];
            d.winner_count = 1;
            d.end_time = DEADLINE_MS + 1_000;
            d.base_turn_secs = (DEADLINE_MS - START_MS) / 1000;
            d.min_turn_secs = 1;
        },
        ENTRY_FEE,
    );

    let mut settled = finished_live.event_data.clone();
    settled.status = STATUS_SETTLED;
    settled.pot = 0;
    settled.final_pot = ENTRY_FEE;

    let claim_script = fx.claim_script(
        &mut context,
        &finished_live.event_type_hash,
        &finished_live.event_id,
    );
    let claim_data = encode_claim(&winner_hash, ENTRY_FEE, &finished_live.event_id, &[0x99; 32]);

    // Claim capacity must cover amount + occupied.
    let claim_draft = CellOutput::new_builder()
        .capacity(0u64)
        .lock(winner.clone())
        .type_(Some(claim_script.clone()).pack())
        .build();
    let claim_occ = occupied_for(&claim_draft, CLAIM_DATA_LEN);
    let claim_cap = claim_occ.max(ENTRY_FEE);

    // Extra fund so outputs balance.
    let fund = context.create_cell(
        CellOutput::new_builder()
            .capacity(FUND_CAP)
            .lock(controller.clone())
            .build(),
        Bytes::new(),
    );

    let tx_settle = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(finished_live.event_cell)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(finished_live.treasury_cell)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(fund).build())
        .output(
            CellOutput::new_builder()
                .capacity(EVENT_CAP)
                .lock(controller.clone())
                .type_(Some(finished_live.event_script.clone()).pack())
                .build(),
        )
        .output_data(settled.encode().pack())
        // No treasury output — burned into claim.
        .output(
            CellOutput::new_builder()
                .capacity(claim_cap)
                .lock(winner)
                .type_(Some(claim_script).pack())
                .build(),
        )
        .output_data(claim_data.pack())
        .cell_dep(controller_dep)
        .cell_dep(winner_dep)
        .cell_dep(fx.event_ty.dep.clone())
        .cell_dep(fx.treasury_lock.dep.clone())
        .cell_dep(fx.reward_claim_ty.dep.clone())
        .build();

    let tx_settle = context.complete_tx(tx_settle);
    let cycles = verify_and_dump_failed_tx(&context, &tx_settle, MAX_CYCLES)
        .expect("settle with single claim should pass");
    println!("[event-engine] settle — cycles: {cycles}");
}


