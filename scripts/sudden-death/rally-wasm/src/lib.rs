//! Thin C ABI over `crowns-rally-core` for the browser and the relay. No wasm-bindgen. Two race
//! slots: 0 holds the race as everyone agrees on it so far, 1 is free for guessing ahead (the
//! phone's own car before the relay confirms it). Plus a buffer for whole-race replays. A race starts
//! on a named map, by number; practice may also start from any seed, which crosses as two u32 halves.

use crowns_rally_core::{bot_input, replay_map, Race, EVENT_LEN, MAPS, MAX_CARS, MAX_EVENTS, MAX_PADS};
use std::cell::RefCell;

thread_local! {
    static SLOTS: RefCell<[Race; 2]> = RefCell::new([Race::seeded(0, 1), Race::seeded(0, 1)]);
    // Room for a whole race record: map, car count, and every car's events.
    static BUFFER: RefCell<Vec<u8>> = RefCell::new(vec![0; 2 + MAX_CARS * (2 + MAX_EVENTS * EVENT_LEN)]);
}

fn with<T>(slot: u32, f: impl FnOnce(&mut Race) -> T) -> T {
    SLOTS.with(|slots| f(&mut slots.borrow_mut()[(slot as usize).min(1)]))
}

fn car<T>(slot: u32, i: u32, f: impl FnOnce(&crowns_rally_core::Car) -> T) -> T {
    with(slot, |race| f(&race.cars[(i as usize).min(MAX_CARS - 1)]))
}

#[no_mangle]
pub extern "C" fn rl_new(slot: u32, hi: u32, lo: u32, cars: u32) {
    with(slot, |race| *race = Race::seeded(((hi as u64) << 32) | lo as u64, cars as usize));
}

/// A race on a named map. Returns 0 for a map that doesn't exist, and leaves the slot alone.
#[no_mangle]
pub extern "C" fn rl_new_map(slot: u32, map: u32, cars: u32) -> u32 {
    let Some(fresh) = u8::try_from(map).ok().and_then(|map| Race::on_map(map, cars as usize)) else {
        return 0;
    };
    with(slot, |race| *race = fresh);
    1
}

/// How many named maps there are.
#[no_mangle]
pub extern "C" fn rl_maps() -> u32 {
    MAPS.len() as u32
}

/// Copies one slot over the other.
#[no_mangle]
pub extern "C" fn rl_copy(from: u32, to: u32) {
    SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        slots[(to as usize).min(1)] = slots[(from as usize).min(1)];
    });
}

/// One tick: cars 0 to 3's inputs packed 8 bits each, car 0 lowest, and car 4's on its own.
#[no_mangle]
pub extern "C" fn rl_step(slot: u32, packed: u32, fifth: u32) {
    let [a, b, c, d] = packed.to_le_bytes();
    with(slot, |race| race.step(&[a, b, c, d, fifth as u8]));
}

#[no_mangle]
pub extern "C" fn rl_tick(slot: u32) -> u32 {
    with(slot, |race| race.tick)
}

#[no_mangle]
pub extern "C" fn rl_over(slot: u32) -> u32 {
    with(slot, |race| race.over() as u32)
}

#[no_mangle]
pub extern "C" fn rl_count(slot: u32) -> u32 {
    with(slot, |race| race.count as u32)
}

#[no_mangle]
pub extern "C" fn rl_x(slot: u32, i: u32) -> i32 {
    car(slot, i, |car| car.x as i32)
}

#[no_mangle]
pub extern "C" fn rl_y(slot: u32, i: u32) -> i32 {
    car(slot, i, |car| car.y as i32)
}

#[no_mangle]
pub extern "C" fn rl_heading(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.heading as u32)
}

#[no_mangle]
pub extern "C" fn rl_speed(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.speed as u32)
}

#[no_mangle]
pub extern "C" fn rl_lap(slot: u32, i: u32) -> i32 {
    car(slot, i, |car| car.lap)
}

#[no_mangle]
pub extern "C" fn rl_boosts(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.boosts as u32)
}

#[no_mangle]
pub extern "C" fn rl_boosting(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| (car.boost_ticks > 0) as u32)
}

#[no_mangle]
pub extern "C" fn rl_hp(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.hp as u32)
}

/// Ticks left sitting still after a wreck, or 0.
#[no_mangle]
pub extern "C" fn rl_wreck(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.wreck_ticks)
}

/// Ticks left passing through other cars after a wreck, or 0.
#[no_mangle]
pub extern "C" fn rl_ghost(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.ghost_ticks)
}

/// The item a car holds, or 0.
#[no_mangle]
pub extern "C" fn rl_item(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.item as u32)
}

#[no_mangle]
pub extern "C" fn rl_shards(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| car.shards as u32)
}

/// Which item effects a car has on: 1 ramming, 2 rushing, 4 warded, 8 drafting, 16 slipping.
#[no_mangle]
pub extern "C" fn rl_effects(slot: u32, i: u32) -> u32 {
    car(slot, i, |car| {
        [car.ram_ticks, car.rush_ticks, car.ward_ticks, car.draft_ticks, car.slip_ticks]
            .iter()
            .enumerate()
            .fold(0, |bits, (n, ticks)| bits | ((*ticks > 0) as u32) << n)
    })
}

#[no_mangle]
pub extern "C" fn rl_pads() -> u32 {
    MAX_PADS as u32
}

#[no_mangle]
pub extern "C" fn rl_pad_x(slot: u32, pad: u32) -> i32 {
    with(slot, |race| race.pads[(pad as usize).min(MAX_PADS - 1)].x as i32)
}

#[no_mangle]
pub extern "C" fn rl_pad_y(slot: u32, pad: u32) -> i32 {
    with(slot, |race| race.pads[(pad as usize).min(MAX_PADS - 1)].y as i32)
}

/// A pad's item, with 0x80 set while it sits empty.
#[no_mangle]
pub extern "C" fn rl_pad_item(slot: u32, pad: u32) -> u32 {
    with(slot, |race| {
        let pad = race.pads[(pad as usize).min(MAX_PADS - 1)];
        pad.item as u32 | if pad.empty_ticks > 0 { 0x80 } else { 0 }
    })
}

/// How many hazard places there are: a Slick and a Barricade per car.
#[no_mangle]
pub extern "C" fn rl_hazards() -> u32 {
    (2 * MAX_CARS) as u32
}

/// A hazard's kind (the item that dropped it), or 0 when it's gone.
#[no_mangle]
pub extern "C" fn rl_hazard_kind(slot: u32, h: u32) -> u32 {
    with(slot, |race| {
        let hazard = race.hazards[(h as usize).min(2 * MAX_CARS - 1)];
        if hazard.ticks > 0 { hazard.kind as u32 } else { 0 }
    })
}

#[no_mangle]
pub extern "C" fn rl_hazard_x(slot: u32, h: u32) -> i32 {
    with(slot, |race| race.hazards[(h as usize).min(2 * MAX_CARS - 1)].x as i32)
}

#[no_mangle]
pub extern "C" fn rl_hazard_y(slot: u32, h: u32) -> i32 {
    with(slot, |race| race.hazards[(h as usize).min(2 * MAX_CARS - 1)].y as i32)
}

/// The tick a car finished on, or -1.
#[no_mangle]
pub extern "C" fn rl_finished(slot: u32, i: u32) -> i32 {
    car(slot, i, |car| car.finished.map_or(-1, |tick| tick as i32))
}

#[no_mangle]
pub extern "C" fn rl_place(slot: u32, i: u32) -> u32 {
    with(slot, |race| race.places()[(i as usize).min(MAX_CARS - 1)] as u32)
}

/// How far a car has come, in 1/1024 of a segment.
#[no_mangle]
pub extern "C" fn rl_progress(slot: u32, i: u32) -> f64 {
    with(slot, |race| race.progress(&race.cars[(i as usize).min(MAX_CARS - 1)]) as f64)
}

#[no_mangle]
pub extern "C" fn rl_bot(slot: u32, i: u32) -> u32 {
    with(slot, |race| bot_input(race, (i as usize).min(race.count - 1)) as u32)
}

#[no_mangle]
pub extern "C" fn rl_track_x(slot: u32, point: u32) -> i32 {
    with(slot, |race| race.track.x[(point as usize) % race.track.len] as i32)
}

#[no_mangle]
pub extern "C" fn rl_track_y(slot: u32, point: u32) -> i32 {
    with(slot, |race| race.track.y[(point as usize) % race.track.len] as i32)
}

/// How many points the road in a slot has.
#[no_mangle]
pub extern "C" fn rl_track_len(slot: u32) -> u32 {
    with(slot, |race| race.track.len as u32)
}

#[no_mangle]
pub extern "C" fn buffer_ptr() -> *mut u8 {
    BUFFER.with(|buffer| buffer.borrow_mut().as_mut_ptr())
}

/// Replays the race record in the buffer (`map ‖ cars ‖ tapes`) into slot 1. Returns the car count, or -1 if the record is illegal.
#[no_mangle]
pub extern "C" fn replay_race(len: u32) -> i32 {
    let race = BUFFER.with(|buffer| {
        let buffer = buffer.borrow();
        replay_map(&buffer[..(len as usize).min(buffer.len())])
    });
    match race {
        Ok(race) => {
            let count = race.count as i32;
            SLOTS.with(|slots| slots.borrow_mut()[1] = race);
            count
        }
        Err(_) => -1,
    }
}
