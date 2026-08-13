use super::{verify_and_dump_failed_tx, Loader};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::{CellDep, CellInput, CellOutput},
        prelude::*,
    },
    context::Context,
};

const MAX_CYCLES: u64 = 10_000_000;
const DATA_LEN: usize = 116;

fn encode_chain_data(
    status: u8,
    mode: u8,
    owner_count: u32,
    expires_at_ms: u64,
    window_seconds: u32,
    chain_id: [u8; 32],
) -> Bytes {
    let mut data = [0u8; DATA_LEN];
    data[0] = 1;
    data[1] = status;
    data[2] = mode;
    data[4..8].copy_from_slice(&owner_count.to_le_bytes());
    data[8..16].copy_from_slice(&expires_at_ms.to_le_bytes());
    data[16..20].copy_from_slice(&window_seconds.to_le_bytes());
    data[20..52].copy_from_slice(&chain_id);
    Bytes::from(data.to_vec())
}

fn always_success(context: &mut Context, args: Bytes) -> (ckb_testtool::ckb_types::packed::Script, CellDep) {
    let out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let script = context
        .build_script(&out_point, args)
        .expect("always-success");
    let dep = CellDep::new_builder().out_point(out_point).build();
    (script, dep)
}

fn load_chain_type(
    context: &mut Context,
) -> (
    ckb_testtool::ckb_types::packed::OutPoint,
    ckb_testtool::ckb_types::packed::Script,
    CellDep,
) {
    let bin = Loader::default().load_binary("chain-cell-type");
    let op = context.deploy_cell(bin);
    let script = context
        .build_script(&op, Bytes::new())
        .expect("chain cell type");
    let dep = CellDep::new_builder().out_point(op.clone()).build();
    (op, script, dep)
}

#[test]
fn test_genesis_mint_valid() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::new());

    let fund_op = context.create_cell(
        CellOutput::new_builder()
            .capacity(21_000_000_000u64)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );

    let data = encode_chain_data(0, 1, 1, 1_700_000_000_000, 86_400, [0x11; 32]);

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(fund_op).build())
        .output(
            CellOutput::new_builder()
                .capacity(20_200_000_000u64)
                .lock(lock)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(data.pack())
        .cell_dep(lock_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("mint should pass");
    println!("[chain-cell] genesis mint — cycles: {cycles}");
}

#[test]
fn test_genesis_mint_bad_length_rejected() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::new());

    let fund_op = context.create_cell(
        CellOutput::new_builder()
            .capacity(21_000_000_000u64)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(fund_op).build())
        .output(
            CellOutput::new_builder()
                .capacity(20_200_000_000u64)
                .lock(lock)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(Bytes::from(vec![0xde, 0xad]).pack())
        .cell_dep(lock_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("bad length should fail");
}

#[test]
fn test_duplicate_outputs_rejected() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::new());

    let fund_op = context.create_cell(
        CellOutput::new_builder()
            .capacity(42_000_000_000u64)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );

    let data = encode_chain_data(0, 0, 1, 1_700_000_000_000, 86_400, [0x22; 32]);

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(fund_op).build())
        .output(
            CellOutput::new_builder()
                .capacity(20_000_000_000u64)
                .lock(lock.clone())
                .type_(Some(chain_type.clone()).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(20_000_000_000u64)
                .lock(lock)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(data.clone().pack())
        .output_data(data.pack())
        .cell_dep(lock_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("duplicates should fail");
}

#[test]
fn test_burn_succeeds() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::from(vec![0x01]));

    let data = encode_chain_data(0, 0, 3, 1_700_000_000_000, 86_400, [0x33; 32]);
    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(20_000_000_000u64)
            .lock(lock.clone())
            .type_(Some(chain_type).pack())
            .build(),
        data,
    );

    // Capacity sink so the tx balances without recreating the chain cell.
    let (sink_lock, sink_dep) = always_success(&mut context, Bytes::from(vec![0x99]));

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(19_900_000_000u64)
                .lock(sink_lock)
                .build(),
        )
        .output_data(Bytes::new().pack())
        .cell_dep(lock_dep)
        .cell_dep(sink_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("burn should pass");
    println!("[chain-cell] burn — cycles: {cycles}");
}

#[test]
fn test_handoff_valid() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock_a, lock_a_dep) = always_success(&mut context, Bytes::from(vec![0xaa]));
    let (lock_b, lock_b_dep) = always_success(&mut context, Bytes::from(vec![0xbb]));

    let window = 86_400u32;
    let expires = 1_700_000_000_000u64;
    let chain_id = [0x44; 32];
    let input_data = encode_chain_data(0, 0, 2, expires, window, chain_id);
    let output_data = encode_chain_data(
        0,
        0,
        3,
        expires + (window as u64) * 1000,
        window,
        chain_id,
    );

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(20_000_000_000u64)
            .lock(lock_a)
            .type_(Some(chain_type.clone()).pack())
            .build(),
        input_data,
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(19_900_000_000u64)
                .lock(lock_b)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(output_data.pack())
        .cell_dep(lock_a_dep)
        .cell_dep(lock_b_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("handoff should pass");
    println!("[chain-cell] handoff — cycles: {cycles}");
}

#[test]
fn test_handoff_same_lock_rejected() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::from(vec![0xcc]));

    let window = 86_400u32;
    let expires = 1_700_000_000_000u64;
    let chain_id = [0x55; 32];
    let input_data = encode_chain_data(0, 0, 1, expires, window, chain_id);
    let output_data = encode_chain_data(
        0,
        0,
        2,
        expires + (window as u64) * 1000,
        window,
        chain_id,
    );

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(20_000_000_000u64)
            .lock(lock.clone())
            .type_(Some(chain_type.clone()).pack())
            .build(),
        input_data,
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(19_900_000_000u64)
                .lock(lock)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(output_data.pack())
        .cell_dep(lock_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect_err("same lock should fail");
}

#[test]
fn test_seal_mark_same_lock_valid() {
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (lock, lock_dep) = always_success(&mut context, Bytes::from(vec![0xdd]));

    let window = 86_400u32;
    let expires = 1_700_000_000_000u64;
    let chain_id = [0x77; 32];
    let mut input = [0u8; DATA_LEN];
    input[0] = 1;
    input[1] = 0;
    input[2] = 0;
    input[4..8].copy_from_slice(&2u32.to_le_bytes());
    input[8..16].copy_from_slice(&expires.to_le_bytes());
    input[16..20].copy_from_slice(&window.to_le_bytes());
    input[20..52].copy_from_slice(&chain_id);
    input[84..116].copy_from_slice(&[0x11; 32]);

    let mut output = input;
    output[84..116].copy_from_slice(&[0x22; 32]);

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(20_000_000_000u64)
            .lock(lock.clone())
            .type_(Some(chain_type.clone()).pack())
            .build(),
        Bytes::from(input.to_vec()),
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(19_900_000_000u64)
                .lock(lock)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(Bytes::from(output.to_vec()).pack())
        .cell_dep(lock_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    let cycles = verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("seal should pass");
    println!("[chain-cell] seal mark — cycles: {cycles}");
}

#[test]
fn test_return_home_final_handoff() {
    // return_home mode: last hop marks status=returned (finished journey).
    // Lock still changes to the creator; unique-holder rules live in the app layer for now.
    let mut context = Context::default();
    let (_, chain_type, type_dep) = load_chain_type(&mut context);
    let (holder, holder_dep) = always_success(&mut context, Bytes::from(vec![0x01]));
    let (creator, creator_dep) = always_success(&mut context, Bytes::from(vec![0x02]));

    let window = 86_400u32;
    let expires = 1_700_000_000_000u64;
    let chain_id = [0x66; 32];
    let mode_return_home = 1u8;
    let input_data = encode_chain_data(0, mode_return_home, 4, expires, window, chain_id);
    let output_data = encode_chain_data(
        2, // status = returned
        mode_return_home,
        5,
        expires + (window as u64) * 1000,
        window,
        chain_id,
    );

    let live = context.create_cell(
        CellOutput::new_builder()
            .capacity(20_000_000_000u64)
            .lock(holder)
            .type_(Some(chain_type.clone()).pack())
            .build(),
        input_data,
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(live).build())
        .output(
            CellOutput::new_builder()
                .capacity(19_900_000_000u64)
                .lock(creator)
                .type_(Some(chain_type).pack())
                .build(),
        )
        .output_data(output_data.pack())
        .cell_dep(holder_dep)
        .cell_dep(creator_dep)
        .cell_dep(type_dep)
        .build();

    let tx = context.complete_tx(tx);
    let cycles =
        verify_and_dump_failed_tx(&context, &tx, MAX_CYCLES).expect("return-home final should pass");
    println!("[chain-cell] return-home final — cycles: {cycles}");
}
