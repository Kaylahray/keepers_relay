//! Crowns lane runner. One set of rules, compiled twice: to wasm for the browser that plays it and
//! to RISC-V for the script that referees it. Integer maths only, no allocation, no floats, so both
//! targets reach the same score from the same tape.
//!
//! Three lanes. Rows of blocks scroll toward the player, faster over time. The player picks a
//! target lane and slides to it. A row that reaches the player while they overlap a blocked lane
//! ends the run. Coins sit in open lanes. Score is distance plus coins.
//!
//! The road reacts to the player. Every row that appears on the horizon is drawn from random
//! numbers stirred with the lane the player is heading for at that moment. Rows already in view
//! never change, but two runs that choose differently soon face different roads, so a run cannot
//! be planned from the seed alone: a bot has to search, not calculate.
//!
//! Tape: events of 3 bytes, `tick u16 LE ‖ lane u8`, ticks strictly increasing. An event sets the
//! target lane at the start of that tick.
//!
//! A run is played in laps. Each lap after the first starts from a fresh seed that the chain hands
//! out only once the lap before it is sealed, so nobody can see a lap before the previous one is
//! locked in. Lane, speed, rows and score carry over from lap to lap.

#![no_std]

pub const TICK_HZ: u32 = 30;
/// Two minutes. A run that survives this long ends; coins break ties at the cap.
pub const MAX_TICKS: u32 = TICK_HZ * 120;
pub const LANES: u8 = 3;
pub const LANE_W: i32 = 1_000;
/// Rows spawn this far ahead, which is also how far ahead the browser draws.
pub const VIEW_DEPTH: i32 = 6_000;
pub const EVENT_LEN: usize = 3;
pub const MAX_EVENTS: usize = 4_096;
pub const COIN_POINTS: u64 = 50;
/// Laps in a full run, and the ticks in each (24 seconds).
pub const LAPS: usize = 5;
pub const LAP_TICKS: u32 = MAX_TICKS / LAPS as u32;

const PLAYER_HALF: i32 = 280;
const BLOCK_HALF: i32 = 440;
const COIN_REACH: i32 = 500;
/// Eight ticks per lane. Rows are never closer than `MIN_GAP_TICKS`, so two lanes always fit.
const MOVE_PER_TICK: i32 = 125;
const START_SPEED: i32 = 60;
const MAX_SPEED: i32 = 220;
const SPEED_STEP: i32 = 2;
const SPEED_EVERY: u32 = 45;
const MIN_GAP_TICKS: i32 = 18;
const ROWS: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TapeError {
    Length,
    TooMany,
    Order,
    Lane,
    Late,
    /// No laps, more than `LAPS`, or lap data that does not parse.
    Laps,
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
    crashed: bool,
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
            crashed: false,
        }
    }

    pub fn over(&self) -> bool {
        self.crashed || self.tick >= MAX_TICKS
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

    pub fn speed(&self) -> i32 {
        self.speed
    }

    pub fn rows(&self) -> &[Row] {
        &self.rows[..self.len]
    }

    pub fn outcome(&self) -> Outcome {
        Outcome {
            score: self.distance / 100 + self.coins as u64 * COIN_POINTS,
            ticks: self.tick,
            coins: self.coins,
            crashed: self.crashed,
        }
    }

    /// Advance one tick. `lane` is the event for this tick, if any. Out-of-range lanes are ignored
    /// here; `replay` rejects them before they get this far.
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

        // Rows are kept in spawn order, so the ones that pass the player are always at the front.
        let mut passed = 0;
        for i in 0..self.len {
            let row = self.rows[i];
            let next = row.y - self.speed;
            if next <= 0 {
                passed += 1;
                if self.hits(row.blocked) {
                    self.crashed = true;
                }
                if row.coin != 0 && (self.x - (row.coin as i32 - 1) * LANE_W).abs() < COIN_REACH {
                    self.coins += 1;
                }
            }
            self.rows[i].y = next;
        }
        if passed > 0 {
            self.rows.copy_within(passed..self.len, 0);
            self.len -= passed;
        }

        self.distance += self.speed as u64;
        self.gap_left -= self.speed;
        while self.gap_left <= 0 {
            self.spawn(VIEW_DEPTH + self.gap_left);
            self.gap_left += self.next_gap();
        }
        self.tick += 1;
    }

    fn hits(&self, blocked: u8) -> bool {
        (0..LANES).any(|lane| {
            blocked & (1 << lane) != 0 && (self.x - lane as i32 * LANE_W).abs() < PLAYER_HALF + BLOCK_HALF
        })
    }

    fn next_gap(&mut self) -> i32 {
        let min_ticks = (40 - (self.tick / 180) as i32).max(MIN_GAP_TICKS);
        let ticks = min_ticks + (self.next() % 24) as i32;
        ticks * self.speed
    }

    fn spawn(&mut self, y: i32) {
        if self.len == ROWS {
            return;
        }
        self.stir();
        let double_odds = (20 + self.tick / 90).min(70);
        let blocked = if self.next() % 100 < double_odds {
            0b111 & !(1u8 << (self.next() % 3))
        } else {
            1u8 << (self.next() % 3)
        };
        let coin = if self.next() % 3 == 0 {
            let open = 0b111 & !blocked;
            let count = open.count_ones();
            let mut pick = self.next() % count;
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
        self.rows[self.len] = Row { y, blocked, coin };
        self.len += 1;
    }

    /// Starts a new lap's random numbers from its seed. Everything else carries over.
    pub fn reseed(&mut self, seed: u64) {
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

/// Checks a tape's shape: whole events, legal lanes, ticks strictly increasing and in `from..to`.
fn validate(tape: &[u8], from: u32, to: u32) -> Result<usize, TapeError> {
    if tape.len() % EVENT_LEN != 0 {
        return Err(TapeError::Length);
    }
    let count = tape.len() / EVENT_LEN;
    if count > MAX_EVENTS {
        return Err(TapeError::TooMany);
    }
    let mut last: Option<u32> = None;
    for i in 0..count {
        let (tick, lane) = event(tape, i);
        if lane >= LANES {
            return Err(TapeError::Lane);
        }
        if tick >= to {
            return Err(TapeError::Late);
        }
        if tick < from || last.is_some_and(|prev| tick <= prev) {
            return Err(TapeError::Order);
        }
        last = Some(tick);
    }
    Ok(count)
}

/// One lap of a run: the seed it was played on and its moves (ticks counted from the run's start).
#[derive(Clone, Copy, Debug, Default)]
pub struct Lap<'a> {
    pub seed: u64,
    pub tape: &'a [u8],
}

/// Replays the laps of a run, 1 to `LAPS` of them, and returns the outcome when the last one ends
/// (or the run crashes). Lap `k`'s moves must fall inside lap `k`'s ticks.
pub fn replay_laps(laps: &[Lap]) -> Result<Outcome, TapeError> {
    if laps.is_empty() || laps.len() > LAPS {
        return Err(TapeError::Laps);
    }
    let mut total = 0;
    for (k, lap) in laps.iter().enumerate() {
        total += validate(lap.tape, k as u32 * LAP_TICKS, (k as u32 + 1) * LAP_TICKS)?;
    }
    if total > MAX_EVENTS {
        return Err(TapeError::TooMany);
    }
    let end = laps.len() as u32 * LAP_TICKS;
    let mut run = Run::new(laps[0].seed);
    let mut lap = 0;
    let mut cursor = 0;
    while !run.over() && run.tick() < end {
        let k = (run.tick() / LAP_TICKS) as usize;
        if k != lap {
            lap = k;
            cursor = 0;
            run.reseed(laps[k].seed);
        }
        let tape = laps[k].tape;
        let mut input = None;
        if cursor * EVENT_LEN < tape.len() {
            let (tick, lane) = event(tape, cursor);
            if tick == run.tick() {
                input = Some(lane);
                cursor += 1;
            }
        }
        run.step(input);
    }
    Ok(run.outcome())
}

/// Game ABI v2 input: `lap count u8`, then per lap `seed u64 LE ‖ tape length u16 LE ‖ tape`.
pub fn replay_encoded(raw: &[u8]) -> Result<Outcome, TapeError> {
    let count = *raw.first().ok_or(TapeError::Laps)? as usize;
    if count == 0 || count > LAPS {
        return Err(TapeError::Laps);
    }
    let mut laps = [Lap::default(); LAPS];
    let mut at = 1;
    for lap in laps.iter_mut().take(count) {
        let head = raw.get(at..at + 10).ok_or(TapeError::Laps)?;
        let mut seed = [0u8; 8];
        seed.copy_from_slice(&head[..8]);
        let len = u16::from_le_bytes([head[8], head[9]]) as usize;
        at += 10;
        let tape = raw.get(at..at + len).ok_or(TapeError::Laps)?;
        at += len;
        *lap = Lap { seed: u64::from_le_bytes(seed), tape };
    }
    if at != raw.len() {
        return Err(TapeError::Laps);
    }
    replay_laps(&laps[..count])
}

/// Replays a single unlapped tape from a seed. Events after the run ends are ignored.
pub fn replay(seed: u64, tape: &[u8]) -> Result<Outcome, TapeError> {
    let count = validate(tape, 0, MAX_TICKS)?;

    let mut run = Run::new(seed);
    let mut cursor = 0;
    while !run.over() {
        let mut input = None;
        if cursor < count {
            let (tick, lane) = event(tape, cursor);
            if tick == run.tick() {
                input = Some(lane);
                cursor += 1;
            }
        }
        run.step(input);
    }
    Ok(run.outcome())
}

fn event(tape: &[u8], i: usize) -> (u32, u8) {
    let at = i * EVENT_LEN;
    (u16::from_le_bytes([tape[at], tape[at + 1]]) as u32, tape[at + 2])
}
