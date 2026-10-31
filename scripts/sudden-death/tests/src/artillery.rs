//! Conformance: the browser's artillery rules (lib/duel/artillery.ts) and the chain's
//! (crowns-artillery-core) must play every duel identically, shot by shot. The fixtures are made by
//! `tests/fixtures/make-artillery.ts`; regenerate them whenever the TypeScript rules change.

use crowns_artillery_core::{replay, Shot, State, Winner, MAX_WIND};
use serde_json::Value;

const FIXTURES: &str = include_str!("../fixtures/artillery.json");

fn checksum(heights: &[i32]) -> String {
    let (mut a, mut b) = (1u32, 0u32);
    for h in heights {
        a = (a + *h as u32) % 65521;
        b = (b + a) % 65521;
    }
    format!("{:x}", b.wrapping_mul(65536).wrapping_add(a))
}

fn int(value: &Value) -> i32 {
    value.as_i64().expect("integer") as i32
}

#[test]
fn every_fixture_duel_plays_the_same_in_rust() {
    let duels: Vec<Value> = serde_json::from_str(FIXTURES).expect("fixtures");
    assert!(duels.len() >= 40);
    let mut shots_checked = 0;
    for duel in &duels {
        let seed = duel["seed"].as_u64().unwrap() as u32;
        let mut state = State::new(seed);
        assert_eq!([state.tanks[0].x, state.tanks[1].x], [int(&duel["tanks"][0]), int(&duel["tanks"][1])], "pads, seed {seed}");
        assert_eq!(checksum(&state.heights), duel["start"].as_str().unwrap(), "hills, seed {seed}");
        for (turn, shot) in duel["shots"].as_array().unwrap().iter().enumerate() {
            let outcome = state
                .fire(Shot { angle: int(&shot["angle"]), power: int(&shot["power"]), wind: int(&shot["wind"]) })
                .expect("legal shot");
            let impact = shot["impact"].as_array().map(|xy| (int(&xy[0]), int(&xy[1])));
            assert_eq!(outcome.impact, impact, "impact, seed {seed} turn {turn}");
            assert_eq!(outcome.damage, [int(&shot["damage"][0]), int(&shot["damage"][1])], "damage, seed {seed} turn {turn}");
            assert_eq!(outcome.direct, shot["direct"].as_bool().unwrap(), "direct, seed {seed} turn {turn}");
            assert_eq!([state.tanks[0].hp, state.tanks[1].hp], [int(&shot["hp"][0]), int(&shot["hp"][1])], "hp, seed {seed} turn {turn}");
            shots_checked += 1;
        }
        let winner = match &duel["winner"] {
            Value::String(s) if s == "draw" => Winner::Draw,
            value => Winner::Side(value.as_u64().unwrap() as u8),
        };
        assert_eq!(state.winner, Some(winner), "winner, seed {seed}");
        assert_eq!(checksum(&state.heights), duel["end"].as_str().unwrap(), "craters, seed {seed}");
    }
    println!("{} duels, {shots_checked} shots identical in TypeScript and Rust", duels.len());
}

#[test]
fn shots_out_of_range_and_after_the_end_are_refused() {
    let mut state = State::new(7);
    assert!(state.fire(Shot { angle: 181, power: 50, wind: 0 }).is_err());
    assert!(state.fire(Shot { angle: 45, power: 101, wind: 0 }).is_err());
    assert!(state.fire(Shot { angle: 45, power: 50, wind: MAX_WIND + 1 }).is_err());
    assert_eq!(state.turn, 0, "a refused shot is not a turn");
    state.winner = Some(Winner::Side(0));
    assert!(state.fire(Shot { angle: 45, power: 50, wind: 0 }).is_err());
}

#[test]
fn replay_ignores_shots_after_the_duel_is_won() {
    let duels: Vec<Value> = serde_json::from_str(FIXTURES).expect("fixtures");
    let duel = &duels[3];
    let seed = duel["seed"].as_u64().unwrap() as u32;
    let mut shots: Vec<Shot> = duel["shots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| Shot { angle: int(&s["angle"]), power: int(&s["power"]), wind: int(&s["wind"]) })
        .collect();
    let finished = replay(seed, shots.clone()).unwrap();
    shots.push(Shot { angle: 90, power: 100, wind: 0 });
    assert_eq!(replay(seed, shots).unwrap(), finished);
}
