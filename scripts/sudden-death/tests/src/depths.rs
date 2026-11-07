//! Crown Depths' rules on their own, off chain: replay, refusals, and how much better a fast bot
//! plays than a person. Run the report with `cargo test --release -p tests depths_bot_gap -- --nocapture`.

use crowns_depths_core::{
    replay_encoded, replay_floors, room_of, Depths, Floor, RunError, ARMOR, BOOTS, CHEST, DEEP, DOWN, FLOORS, GOLD, GREED,
    KEY, LANTERN, LEFT, MAP, RIGHT, SAFE, STAIRS, SWORD, UP, WALL,
};

/// How a test player plays.
#[derive(Clone, Copy)]
pub(crate) struct Style {
    /// Ticks between looks at the screen. A person reacts in about 3 to 4 ticks (0.3 to 0.4 s).
    pub react: u32,
    /// Goes after treasure in other rooms, not just the one it is in.
    pub greedy: bool,
    pub stairs: u8,
}

/// A new player: grabs what is in the room and heads down safe stairs.
pub(crate) const NEW: Style = Style { react: 5, greedy: false, stairs: SAFE };
/// A good player: the bot's plan at a person's reaction speed.
pub(crate) const PERSON: Style = Style { react: 4, greedy: true, stairs: DEEP };
/// A bot: the same plan, looking again every tick.
pub(crate) const BOT: Style = Style { react: 1, greedy: true, stairs: DEEP };

const DIRS: [(u8, i32, i32); 4] = [(UP, 0, -1), (RIGHT, 1, 0), (DOWN, 0, 1), (LEFT, -1, 0)];

fn monster_at(run: &Depths, x: i32, y: i32) -> bool {
    run.monsters(room_of(x, y)).iter().any(|m| m.placed && m.hp > 0 && m.x == x && m.y == y)
}

/// The first step on a shortest path to the nearest tile `goal` accepts, that tile, and how far it is.
fn path(run: &Depths, goal: impl Fn(i32, i32) -> bool) -> Option<(u8, (i32, i32), u32)> {
    let mut first = [[255u8; MAP as usize]; MAP as usize];
    let mut dist = [[u32::MAX; MAP as usize]; MAP as usize];
    let mut queue = Vec::with_capacity((MAP * MAP) as usize);
    dist[run.y() as usize][run.x() as usize] = 0;
    queue.push((run.x(), run.y()));
    let mut head = 0;
    while head < queue.len() {
        let (x, y) = queue[head];
        head += 1;
        if (x, y) != (run.x(), run.y()) && goal(x, y) {
            return Some((first[y as usize][x as usize], (x, y), dist[y as usize][x as usize]));
        }
        for (dir, dx, dy) in DIRS {
            let (nx, ny) = (x + dx, y + dy);
            if nx < 0 || ny < 0 || nx >= MAP || ny >= MAP || run.tile(nx, ny) == WALL || dist[ny as usize][nx as usize] != u32::MAX {
                continue;
            }
            dist[ny as usize][nx as usize] = dist[y as usize][x as usize] + 1;
            first[ny as usize][nx as usize] = if (x, y) == (run.x(), run.y()) { dir } else { first[y as usize][x as usize] };
            queue.push((nx, ny));
        }
    }
    None
}

/// Where the player wants to go: a tile next to them with a monster, treasure, or the stairs.
fn choose_target(run: &Depths, style: Style) -> Option<(i32, i32)> {
    // Fight whatever is next to the player.
    for (_, dx, dy) in DIRS {
        if monster_at(run, run.x() + dx, run.y() + dy) {
            return Some((run.x() + dx, run.y() + dy));
        }
    }
    let room = room_of(run.x(), run.y());
    let wanted = |x: i32, y: i32| {
        let item = run.item(x, y);
        let here = room_of(x, y) == room;
        (style.greedy || here) && (item == GOLD || item == KEY || (item == CHEST && run.has_key()))
    };
    let to_stairs = path(run, |x, y| run.tile(x, y) == STAIRS);
    let left = run.torch() - run.tick();
    let spare = to_stairs.map_or(0, |(_, _, d)| left.saturating_sub(d * 3 + 40));
    if let Some((_, at, d)) = path(run, wanted) {
        if d * 6 < spare {
            return Some(at);
        }
    }
    to_stairs.map(|(_, at, _)| at)
}

const RELIC_ORDER: [u8; 5] = [SWORD, BOOTS, ARMOR, GREED, LANTERN];

/// Plays a run floor by floor. Returns each floor's bytes and the live run.
pub(crate) fn play_depths(seeds: &[u64], style: Style) -> (Vec<Vec<u8>>, Depths) {
    let mut run = Depths::new(seeds[0]);
    let mut floors = Vec::new();
    for (k, seed) in seeds.iter().enumerate() {
        if k > 0 {
            run.descend(*seed);
        }
        let mut moves = Vec::new();
        let mut aim: Option<(i32, i32)> = None;
        while !run.floor_over() {
            if run.tick() % style.react == 0 {
                aim = choose_target(&run, style);
            }
            // Between looks the player keeps walking to where they aimed, at full speed.
            let dir = aim
                .filter(|at| *at != (run.x(), run.y()))
                .and_then(|at| path(&run, |x, y| (x, y) == at))
                .map(|(dir, _, _)| dir)
                .filter(|dir| run.step_ok(*dir));
            if let Some(dir) = dir {
                moves.extend_from_slice(&(run.tick() as u16).to_le_bytes());
                moves.push(dir);
            }
            assert!(run.step(dir));
        }
        if run.cleared() && k + 1 < FLOORS {
            let relic = RELIC_ORDER.into_iter().find(|r| !run.owns(*r)).unwrap();
            run.choose(relic, style.stairs).expect("legal picks");
            moves.push(relic);
            moves.push(style.stairs);
        }
        floors.push(moves);
        if !run.cleared() {
            break;
        }
    }
    (floors, run)
}

pub(crate) fn encode(seeds: &[u64], floors: &[Vec<u8>]) -> Vec<u8> {
    let mut raw = vec![floors.len() as u8];
    for (seed, moves) in seeds.iter().zip(floors) {
        raw.extend_from_slice(&seed.to_le_bytes());
        raw.extend_from_slice(&(moves.len() as u16).to_le_bytes());
        raw.extend_from_slice(moves);
    }
    raw
}

fn seeds_for(seed: u64) -> [u64; FLOORS] {
    let mut out = [0; FLOORS];
    for (k, slot) in out.iter_mut().enumerate() {
        *slot = (seed ^ (k as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15)).wrapping_mul(0xBF58_476D_1CE4_E5B9) | 1;
    }
    out
}

const SEEDS: [u64; FLOORS] = [11, 22, 33, 44];

#[test]
fn a_replay_matches_live_play() {
    for style in [PERSON, BOT] {
        let (floors, live) = play_depths(&SEEDS, style);
        let laps: Vec<Floor> = SEEDS.iter().zip(&floors).map(|(seed, moves)| Floor { seed: *seed, moves }).collect();
        assert_eq!(replay_floors(&laps).expect("legal run"), live.outcome());
        assert_eq!(replay_encoded(&encode(&SEEDS, &floors)).unwrap(), live.outcome());
    }
}

#[test]
fn every_floor_has_a_way_to_the_stairs() {
    for seed in 1..300u64 {
        let run = Depths::new(seed);
        assert!(path(&run, |x, y| run.tile(x, y) == STAIRS).is_some(), "seed {seed}");
    }
}

#[test]
fn a_cleared_floor_without_its_picks_is_rejected() {
    let (mut floors, _) = play_depths(&SEEDS[..2], PERSON);
    assert!(floors.len() == 2, "the person clears floor 1");
    let picks = floors[0].len() - 2;
    floors[0].truncate(picks);
    assert_eq!(replay_encoded(&encode(&SEEDS, &floors)), Err(RunError::Picks));
}

#[test]
fn a_relic_twice_or_unknown_stairs_are_rejected() {
    let (mut floors, _) = play_depths(&SEEDS, PERSON);
    assert!(floors.len() >= 3, "the person clears two floors");
    let (a, b) = (floors[0].len() - 2, floors[1].len() - 2);
    floors[1][b] = floors[0][a];
    assert_eq!(replay_encoded(&encode(&SEEDS, &floors)), Err(RunError::Picks));
    let (mut floors, _) = play_depths(&SEEDS, PERSON);
    let end = floors[0].len() - 1;
    floors[0][end] = 2;
    assert_eq!(replay_encoded(&encode(&SEEDS, &floors)), Err(RunError::Picks));
}

#[test]
fn steps_into_walls_too_fast_or_out_of_order_are_rejected() {
    let (floors, _) = play_depths(&SEEDS[..1], PERSON);
    let lap = &floors[0];
    // Two steps on the same tick: the second comes too soon.
    let mut twice = lap.clone();
    twice.splice(3..3, lap[..3].iter().copied());
    assert_eq!(replay_encoded(&encode(&SEEDS, &[twice])), Err(RunError::Step));
    // A step that walks into the room's wall.
    let run = Depths::new(SEEDS[0]);
    let wall = DIRS.iter().find(|(_, dx, dy)| run.tile(run.x() + dx * 3, run.y() + dy * 3) == WALL).unwrap().0;
    let mut bump = Vec::new();
    for k in 0..3u16 {
        bump.extend_from_slice(&(k * 2).to_le_bytes());
        bump.push(wall);
    }
    assert_eq!(replay_encoded(&encode(&SEEDS, &[bump])), Err(RunError::Step));
    // A step and then one on an earlier tick.
    let mut back = lap[..6].to_vec();
    back[3..5].copy_from_slice(&0u16.to_le_bytes());
    assert_eq!(replay_encoded(&encode(&SEEDS, &[back])), Err(RunError::Step));
}

#[test]
fn a_floor_after_the_torch_died_is_rejected() {
    // No moves at all: the torch dies on floor 1, so no floor may follow it.
    let floors = vec![Vec::new(), Vec::new()];
    assert_eq!(replay_encoded(&encode(&SEEDS, &floors)), Err(RunError::Floors));
    assert_eq!(replay_encoded(&encode(&SEEDS, &floors[..1])).unwrap().score, 0);
}

#[test]
fn copied_moves_on_another_seed_do_not_carry_the_score() {
    let (floors, live) = play_depths(&SEEDS, PERSON);
    let other = seeds_for(99);
    match replay_encoded(&encode(&other, &floors)) {
        Ok(copied) => assert!(copied.score < live.outcome().score),
        Err(_) => {}
    }
}

#[test]
#[ignore = "report: run with --ignored --nocapture"]
fn depths_bot_gap() {
    let runs = 60;
    let mut lines = Vec::new();
    for (name, style) in [("new player", NEW), ("good player", PERSON), ("bot", BOT)] {
        let (mut total, mut early, mut ticks) = (0u64, 0, 0u64);
        for k in 0..runs {
            let (floors, run) = play_depths(&seeds_for(1_000 + k), style);
            total += run.outcome().score;
            early += (run.outcome().floors < FLOORS as u32) as u32;
            ticks += floors.iter().map(|f| f.len() as u64 / 3).sum::<u64>();
        }
        lines.push((name, total / runs, early, ticks / runs));
    }
    let good = lines[1].1.max(1) as i64;
    for (name, score, early, steps) in lines {
        println!(
            "{name:>11}: averages {score:>5} ({:+}% on a good player), {early} of {runs} runs ended early, {steps} steps a run",
            (score as i64 - good) * 100 / good
        );
    }
}
