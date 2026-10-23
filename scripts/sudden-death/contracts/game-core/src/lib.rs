//! Crowns lane runner. One set of rules, compiled twice: to wasm for the browser that plays it and
//! to RISC-V for the script that referees it. Integer maths only, no allocation, no floats, so both
//! targets reach the same score from the same tape.
//!
//! Three lanes. Rows of blocks scroll toward the player, faster over time. The player picks a
//! target lane and slides to it. A row that reaches the player while they overlap a blocked lane
//! ends the run. Coins sit in open lanes. Score is distance plus coins.
//!
//! Tape: events of 3 bytes, `tick u16 LE ‖ lane u8`, ticks strictly increasing. An event sets the
//! target lane at the start of that tick.

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

/// Replays a tape from a seed and returns the outcome. Events after the run ends are ignored.
pub fn replay(seed: u64, tape: &[u8]) -> Result<Outcome, TapeError> {
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
        if tick >= MAX_TICKS {
            return Err(TapeError::Late);
        }
        if last.is_some_and(|prev| tick <= prev) {
            return Err(TapeError::Order);
        }
        last = Some(tick);
    }

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
