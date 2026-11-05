//! Crown Run. One set of rules, compiled to wasm for the browser that plays it and to RISC-V for the
//! script that referees it. Integer maths only, no allocation, no floats, so both targets reach the
//! same score from the same moves.
//!
//! Five laps on three lanes. Rows of blocks scroll toward the player. A row that reaches the player
//! while they overlap a blocked lane ends the run, unless a Shield takes the hit. After laps 1 to 3
//! the player picks an upgrade and the next road, and after lap 4 only the next road. Upgrades last
//! for the rest of the run. Score is distance, plus coins, plus danger road finish bonuses, all added.
//!
//! The road reacts to the player: every new row is drawn from random numbers stirred with the lane
//! the player is heading for. Rows already in view never change, except a moving block, which slides
//! one lane at a fixed distance.
//!
//! A lap's moves: events of 3 bytes, `tick u16 LE ‖ lane u8`, ticks strictly increasing, then its
//! picks: `upgrade u8 ‖ road u8` after laps 1 to 3, `road u8` after lap 4, none after lap 5 or a crash.
//! The picks are locked with the lap, before the block that makes the next road exists.

#![no_std]

pub const TICK_HZ: u32 = 30;
pub const LAPS: usize = 5;
pub const LAP_TICKS: u32 = TICK_HZ * 30;
pub const MAX_TICKS: u32 = LAP_TICKS * LAPS as u32;
pub const LANES: u8 = 3;
pub const LANE_W: i32 = 1_000;
/// Rows spawn this far ahead, which is also how far ahead the browser draws.
pub const VIEW_DEPTH: i32 = 6_000;
pub const EVENT_LEN: usize = 3;
pub const MAX_EVENTS: usize = 4_096;
/// Room for a whole run's picks across its laps.
pub const MAX_PICK_BYTES: usize = 7;
/// How long a lap may take to lock, from the block its road came from.
pub const LAP_WINDOW_MS: u32 = 2 * 60 * 1000;
/// The least a steal can leave on the clock after its last locked lap: a full run with some spare.
pub const MIN_LEFT_MS: u32 = 7 * 60 * 1000;

pub const SHIELD: u8 = 0;
pub const MAGNET: u8 = 1;
pub const OVERDRIVE: u8 = 2;
pub const FORTUNE: u8 = 3;
pub const COMBO: u8 = 4;
pub const UPGRADES: u8 = 5;

pub const SAFE: u8 = 0;
pub const DANGER: u8 = 1;

/// This game's rules for the money scripts: `laps u8 ‖ lap window ms u32 LE ‖ min left ms u32 LE`.
pub fn rules() -> [u8; 9] {
    let mut raw = [0u8; 9];
    raw[0] = LAPS as u8;
    raw[1..5].copy_from_slice(&LAP_WINDOW_MS.to_le_bytes());
    raw[5..9].copy_from_slice(&MIN_LEFT_MS.to_le_bytes());
    raw
}

const PLAYER_HALF: i32 = 280;
const BLOCK_HALF: i32 = 440;
/// Eight ticks per lane. Rows stay at least `MIN_GAP_TICKS` apart, so two lanes always fit.
const MOVE_PER_TICK: i32 = 125;
const START_SPEED: i32 = 60;
const MAX_SPEED: i32 = 220;
const SPEED_STEP: i32 = 2;
const SPEED_EVERY: u32 = 45;
const MIN_GAP_TICKS: i32 = 18;
const ROWS: usize = 16;

const COIN_REACH: i32 = 500;
const MAGNET_REACH: i32 = 750;
const OVERDRIVE_BOOST: i32 = 40;
const OVERDRIVE_TOP: i32 = 260;
const COIN_POINTS: u64 = 50;
const FORTUNE_POINTS: u64 = 100;
const DANGER_COIN_POINTS: u64 = 25;
const COMBO_STEP: u64 = 10;
const COMBO_CAP: u32 = 10;
/// Finish bonus for a danger road, by lap. Lap 1 is always safe.
const DANGER_BONUS: [u64; LAPS] = [0, 700, 600, 500, 400];
const DANGER_DOUBLE_ODDS: u32 = 20;
const DANGER_DOUBLE_TOP: u32 = 85;
const DANGER_GAP_TICKS: i32 = 6;
/// How far from the player a moving block slides, and the laps it appears on a safe road.
const SHIFT_AT: i32 = 4_000;
const SAFE_SHIFT_FROM_LAP: u32 = 2;
const SAFE_SHIFT_ODDS: u32 = 15;
const DANGER_SHIFT_ODDS: u32 = 34;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunError {
    Length,
    TooMany,
    Order,
    Lane,
    Late,
    /// No laps, more than `LAPS`, or lap data that does not parse.
    Laps,
    /// Picks that are missing, repeated, unknown, or on a lap that crashed.
    Picks,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub score: u64,
    pub ticks: u32,
    pub coins: u32,
    pub crashed: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Row {
    /// Distance from the player. Rows are removed once they pass zero.
    pub y: i32,
    /// Bit `n` set means lane `n` is blocked. Never all three.
    pub blocked: u8,
    /// Lane holding a coin plus one, or zero.
    pub coin: u8,
    /// Lane this row's block will slide to plus one, or zero.
    pub shift: u8,
}

#[derive(Clone, Debug)]
pub struct Run {
    rng: u64,
    tick: u32,
    x: i32,
    target: u8,
    speed: i32,
    gap_left: i32,
    rows: [Row; ROWS],
    len: usize,
    distance: u64,
    coins: u32,
    points: u64,
    streak: u32,
    owned: u8,
    shield_ready: bool,
    road: u8,
    crashed: bool,
}

/// How many pick bytes a clean lap ends with, by its index from zero.
pub fn picks_due(lap: usize) -> usize {
    match lap {
        0..=2 => 2,
        3 => 1,
        _ => 0,
    }
}

impl Run {
    pub fn new(seed: u64) -> Self {
        Run {
            rng: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed },
            tick: 0,
            x: LANE_W,
            target: 1,
            speed: START_SPEED,
            gap_left: 0,
            rows: [Row::default(); ROWS],
            len: 0,
            distance: 0,
            coins: 0,
            points: 0,
            streak: 0,
            owned: 0,
            shield_ready: false,
            road: SAFE,
            crashed: false,
        }
    }

    pub fn over(&self) -> bool {
        self.crashed || self.tick >= MAX_TICKS
    }

    pub fn crashed(&self) -> bool {
        self.crashed
    }

    pub fn tick(&self) -> u32 {
        self.tick
    }

    pub fn x(&self) -> i32 {
        self.x
    }

    pub fn target(&self) -> u8 {
        self.target
    }

    pub fn owned(&self) -> u8 {
        self.owned
    }

    pub fn road(&self) -> u8 {
        self.road
    }

    pub fn shield_ready(&self) -> bool {
        self.shield_ready
    }

    pub fn streak(&self) -> u32 {
        self.streak
    }

    pub fn rows(&self) -> &[Row] {
        &self.rows[..self.len]
    }

    pub fn outcome(&self) -> Outcome {
        Outcome {
            score: self.distance / 100 + self.points,
            ticks: self.tick,
            coins: self.coins,
            crashed: self.crashed,
        }
    }

    fn owns(&self, upgrade: u8) -> bool {
        self.owned & (1 << upgrade) != 0
    }

    /// The road's speed right now. Overdrive adds to it, up to its own top speed.
    pub fn road_speed(&self) -> i32 {
        if self.owns(OVERDRIVE) {
            (self.speed + OVERDRIVE_BOOST).min(OVERDRIVE_TOP.max(self.speed))
        } else {
            self.speed
        }
    }

    /// Applies the picks made after a clean lap. They take effect on the next lap.
    pub fn choose(&mut self, upgrade: Option<u8>, road: u8) -> Result<(), RunError> {
        if self.crashed || self.tick == 0 || self.tick % LAP_TICKS != 0 || self.tick >= MAX_TICKS {
            return Err(RunError::Picks);
        }
        let lap = (self.tick / LAP_TICKS) as usize - 1;
        if road > DANGER || upgrade.is_some() != (picks_due(lap) == 2) {
            return Err(RunError::Picks);
        }
        if let Some(upgrade) = upgrade {
            if upgrade >= UPGRADES || self.owns(upgrade) {
                return Err(RunError::Picks);
            }
            self.owned |= 1 << upgrade;
            if upgrade == SHIELD {
                self.shield_ready = true;
            }
        }
        self.road = road;
        Ok(())
    }

    /// Advance one tick. `lane` is the event for this tick, if any. Out-of-range lanes are ignored
    /// here; replay rejects them before they get this far.
    pub fn step(&mut self, lane: Option<u8>) {
        if self.over() {
            return;
        }
        if let Some(lane) = lane {
            if lane < LANES {
                self.target = lane;
            }
        }

        let goal = self.target as i32 * LANE_W;
        if self.x < goal {
            self.x = (self.x + MOVE_PER_TICK).min(goal);
        } else if self.x > goal {
            self.x = (self.x - MOVE_PER_TICK).max(goal);
        }

        if self.tick > 0 && self.tick % SPEED_EVERY == 0 && self.speed < MAX_SPEED {
            self.speed += SPEED_STEP;
        }
        let speed = self.road_speed();

        // Rows are kept in spawn order, so the ones that pass the player are always at the front.
        let mut passed = 0;
        for i in 0..self.len {
            let mut row = self.rows[i];
            row.y -= speed;
            if row.shift != 0 && row.y <= SHIFT_AT {
                row.blocked = 1 << (row.shift - 1);
                row.shift = 0;
            }
            if row.y <= 0 {
                passed += 1;
                self.pass(row);
            }
            self.rows[i] = row;
        }
        if passed > 0 {
            self.rows.copy_within(passed..self.len, 0);
            self.len -= passed;
        }

        self.distance += speed as u64;
        self.gap_left -= speed;
        while self.gap_left <= 0 {
            self.spawn(VIEW_DEPTH + self.gap_left);
            self.gap_left += self.next_gap();
        }
        self.tick += 1;

        if self.tick % LAP_TICKS == 0 && !self.crashed && self.road == DANGER {
            self.points += DANGER_BONUS[(self.tick / LAP_TICKS) as usize - 1];
        }
    }

    /// A row reaches the player: a block hits or a Shield takes it, and a coin is collected or missed.
    fn pass(&mut self, row: Row) {
        if self.hits(row.blocked) {
            if self.shield_ready {
                self.shield_ready = false;
            } else {
                self.crashed = true;
            }
        }
        if row.coin == 0 {
            return;
        }
        let reach = if self.owns(MAGNET) { MAGNET_REACH } else { COIN_REACH };
        if (self.x - (row.coin as i32 - 1) * LANE_W).abs() >= reach {
            self.streak = 0;
            return;
        }
        let mut value = if self.owns(FORTUNE) { FORTUNE_POINTS } else { COIN_POINTS };
        if self.road == DANGER {
            value += DANGER_COIN_POINTS;
        }
        if self.owns(COMBO) {
            value += self.streak.min(COMBO_CAP) as u64 * COMBO_STEP;
            self.streak += 1;
        }
        self.points += value;
        self.coins += 1;
    }

    fn hits(&self, blocked: u8) -> bool {
        (0..LANES).any(|lane| {
            blocked & (1 << lane) != 0 && (self.x - lane as i32 * LANE_W).abs() < PLAYER_HALF + BLOCK_HALF
        })
    }

    fn next_gap(&mut self) -> i32 {
        let closer = if self.road == DANGER { DANGER_GAP_TICKS } else { 0 };
        let min_ticks = (40 - (self.tick / 180) as i32 - closer).max(MIN_GAP_TICKS);
        let ticks = min_ticks + (self.next() % 24) as i32;
        ticks * self.road_speed()
    }

    fn spawn(&mut self, y: i32) {
        if self.len == ROWS {
            return;
        }
        self.stir();
        let danger = self.road == DANGER;
        let base = (20 + self.tick / 90).min(70);
        let double_odds = if danger { (base + DANGER_DOUBLE_ODDS).min(DANGER_DOUBLE_TOP) } else { base };
        let double = self.next() % 100 < double_odds;
        let lane = (self.next() % 3) as u8;
        let blocked = if double { 0b111 & !(1u8 << lane) } else { 1u8 << lane };

        let shift_odds = if danger {
            DANGER_SHIFT_ODDS
        } else if self.tick / LAP_TICKS >= SAFE_SHIFT_FROM_LAP {
            SAFE_SHIFT_ODDS
        } else {
            0
        };
        let roll = self.next() % 100;
        let side = self.next() % 2;
        let shift = if !double && roll < shift_odds {
            Some(match lane {
                1 => side as u8 * 2,
                _ => 1,
            })
        } else {
            None
        };

        // A coin sits in a lane that stays open, even after a moving block has slid.
        let wants_coin = self.next() % (if danger { 2 } else { 3 }) == 0;
        let coin = if wants_coin {
            let open = 0b111 & !blocked & !shift.map_or(0, |to| 1u8 << to);
            let mut pick = self.next() % open.count_ones();
            let mut lane = 0u8;
            while lane < LANES {
                if open & (1 << lane) != 0 {
                    if pick == 0 {
                        break;
                    }
                    pick -= 1;
                }
                lane += 1;
            }
            lane + 1
        } else {
            0
        };
        self.rows[self.len] = Row { y, blocked, coin, shift: shift.map_or(0, |to| to + 1) };
        self.len += 1;
    }

    /// Starts a new lap's road from its seed. Rows left from the last road go, since a new speed could make them impossible to dodge.
    pub fn reseed(&mut self, seed: u64) {
        self.len = 0;
        self.rng = seed ^ 0xD1B5_4A32_D192_ED03;
        if self.rng == 0 {
            self.rng = 0x9E37_79B9_7F4A_7C15;
        }
    }

    /// Mixes the lane the player is heading for into the random state, so what comes next depends
    /// on what they chose. xorshift must never hold zero, so a zero state is replaced.
    fn stir(&mut self) {
        self.rng ^= (self.target as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        if self.rng == 0 {
            self.rng = 0x9E37_79B9_7F4A_7C15;
        }
    }

    /// xorshift64*.
    fn next(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng = x;
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 32) as u32
    }
}

/// One lap of a run: the seed it was played on, then its moves and picks (ticks counted from the
/// run's start).
#[derive(Clone, Copy, Debug, Default)]
pub struct Lap<'a> {
    pub seed: u64,
    pub moves: &'a [u8],
}

/// Splits a lap's bytes into its events and its picks. Leftover bytes after whole events are picks.
fn split(moves: &[u8], lap: usize) -> Result<(&[u8], &[u8]), RunError> {
    let extra = moves.len() % EVENT_LEN;
    if extra != 0 && extra != picks_due(lap) {
        return Err(RunError::Length);
    }
    Ok(moves.split_at(moves.len() - extra))
}

/// Checks a lap's events: legal lanes, ticks strictly increasing and in `from..to`.
fn validate(events: &[u8], from: u32, to: u32) -> Result<usize, RunError> {
    let count = events.len() / EVENT_LEN;
    if count > MAX_EVENTS {
        return Err(RunError::TooMany);
    }
    let mut last: Option<u32> = None;
    for i in 0..count {
        let (tick, lane) = event(events, i);
        if lane >= LANES {
            return Err(RunError::Lane);
        }
        if tick >= to {
            return Err(RunError::Late);
        }
        if tick < from || last.is_some_and(|prev| tick <= prev) {
            return Err(RunError::Order);
        }
        last = Some(tick);
    }
    Ok(count)
}

/// Replays the laps of a run, 1 to `LAPS` of them, and returns the outcome when the last one ends
/// (or the run crashes). A clean lap must end with its picks. A crashed lap has none and must be last.
pub fn replay_laps(laps: &[Lap]) -> Result<Outcome, RunError> {
    if laps.is_empty() || laps.len() > LAPS {
        return Err(RunError::Laps);
    }
    let mut total = 0;
    for (k, lap) in laps.iter().enumerate() {
        let (events, _) = split(lap.moves, k)?;
        total += validate(events, k as u32 * LAP_TICKS, (k as u32 + 1) * LAP_TICKS)?;
    }
    if total > MAX_EVENTS {
        return Err(RunError::TooMany);
    }

    let mut run = Run::new(laps[0].seed);
    for (k, lap) in laps.iter().enumerate() {
        if k > 0 {
            run.reseed(lap.seed);
        }
        let (events, picks) = split(lap.moves, k)?;
        let end = (k as u32 + 1) * LAP_TICKS;
        let mut cursor = 0;
        while !run.over() && run.tick() < end {
            let mut input = None;
            if cursor * EVENT_LEN < events.len() {
                let (tick, lane) = event(events, cursor);
                if tick == run.tick() {
                    input = Some(lane);
                    cursor += 1;
                }
            }
            run.step(input);
        }
        if run.crashed() {
            if !picks.is_empty() || k + 1 != laps.len() {
                return Err(RunError::Picks);
            }
            break;
        }
        match (picks_due(k), picks) {
            (0, []) => {}
            (1, [road]) => run.choose(None, *road)?,
            (2, [upgrade, road]) => run.choose(Some(*upgrade), *road)?,
            _ => return Err(RunError::Picks),
        }
    }
    Ok(run.outcome())
}

/// Game ABI v2 input: `lap count u8`, then per lap `seed u64 LE ‖ length u16 LE ‖ moves and picks`.
pub fn replay_encoded(raw: &[u8]) -> Result<Outcome, RunError> {
    let count = *raw.first().ok_or(RunError::Laps)? as usize;
    if count == 0 || count > LAPS {
        return Err(RunError::Laps);
    }
    let mut laps = [Lap::default(); LAPS];
    let mut at = 1;
    for lap in laps.iter_mut().take(count) {
        let head = raw.get(at..at + 10).ok_or(RunError::Laps)?;
        let mut seed = [0u8; 8];
        seed.copy_from_slice(&head[..8]);
        let len = u16::from_le_bytes([head[8], head[9]]) as usize;
        at += 10;
        let moves = raw.get(at..at + len).ok_or(RunError::Laps)?;
        at += len;
        *lap = Lap { seed: u64::from_le_bytes(seed), moves };
    }
    if at != raw.len() {
        return Err(RunError::Laps);
    }
    replay_laps(&laps[..count])
}

fn event(events: &[u8], i: usize) -> (u32, u8) {
    let at = i * EVENT_LEN;
    (u16::from_le_bytes([events[at], events[at + 1]]) as u32, events[at + 2])
}
