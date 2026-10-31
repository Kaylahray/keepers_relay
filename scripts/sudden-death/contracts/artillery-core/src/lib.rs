//! Artillery duel rules. The browser runs the same rules in TypeScript (`lib/duel/artillery.ts`);
//! a conformance test replays the same duels in both and compares every shot, so a duel the
//! browser shows is exactly the duel the chain judges.
//!
//! Integer maths only: no floats, a literal sine table, and division that truncates toward zero.
//! Positions in flight are fixed point (1/256 of a pixel). The world is y-up: `heights[x]` is how
//! tall the ground is at column x. No allocation, so it runs as-is inside CKB-VM.

#![no_std]

pub const WORLD_W: usize = 960;
pub const MAX_HP: i32 = 100;
/// Fifteen shots each, then the healthier tank wins.
pub const MAX_TURNS: u32 = 30;
pub const TANK_HALF_W: i32 = 14;
pub const TANK_H: i32 = 14;
pub const MAX_WIND: i32 = 10;
/// A skipped turn: the player to move ran out of time. Stored as a shot with this angle (real shots
/// stop at 180), power 0 and wind 0.
pub const PASS: i32 = 255;
const BARREL: i32 = 18;
const FP: i32 = 256;
const GRAVITY: i32 = 6;
const SPEED_PER_POWER: i32 = 12;
const MAX_STEPS: i32 = 3000;
const BLAST_RADIUS: i32 = 30;
const DAMAGE_RADIUS: i32 = 45;
const MAX_DAMAGE: i32 = 50;

/// sin(d) × 1024 for d = 0…90 degrees, as a literal so every port agrees.
const SIN: [i32; 91] = [
    0, 18, 36, 54, 71, 89, 107, 125, 143, 160, 178, 195, 213, 230, 248, 265, 282, 299, 316, 333, 350, 367, 384, 400, 416,
    433, 449, 465, 481, 496, 512, 527, 543, 558, 573, 587, 602, 616, 630, 644, 658, 672, 685, 698, 711, 724, 737, 749, 761,
    773, 784, 796, 807, 818, 828, 839, 849, 859, 868, 878, 887, 896, 904, 912, 920, 928, 935, 943, 949, 956, 962, 968, 974,
    979, 984, 989, 994, 998, 1002, 1005, 1008, 1011, 1014, 1016, 1018, 1020, 1022, 1023, 1023, 1024, 1024,
];

/// Angle in whole degrees: 0 points right, 90 straight up, 180 left.
fn sin_deg(angle: i32) -> i32 {
    if angle <= 90 { SIN[angle as usize] } else { SIN[(180 - angle) as usize] }
}

fn cos_deg(angle: i32) -> i32 {
    if angle <= 90 { SIN[(90 - angle) as usize] } else { -SIN[(angle - 90) as usize] }
}

fn isqrt(n: i32) -> i32 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// xorshift32. The seed comes from a block hash on chain.
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        Rng(if seed == 0 { 0x9e37_79b9 } else { seed })
    }

    fn next(&mut self) -> u32 {
        let mut s = self.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        self.0 = s;
        s
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Tank {
    pub x: i32,
    pub hp: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Winner {
    Side(u8),
    Draw,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct State {
    pub seed: u32,
    pub heights: [i32; WORLD_W],
    pub tanks: [Tank; 2],
    /// Shots fired so far. Even turns are side 0 (the challenger), odd turns side 1.
    pub turn: u32,
    pub winner: Option<Winner>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Shot {
    /// 0 to 180 degrees.
    pub angle: i32,
    /// 0 to 100.
    pub power: i32,
    /// −10 to 10.
    pub wind: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// Where the shell burst, or `None` if it left the field.
    pub impact: Option<(i32, i32)>,
    pub damage: [i32; 2],
    /// It struck a tank's body, not the ground near it.
    pub direct: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShotError {
    /// The duel already has a winner.
    Over,
    /// Angle, power or wind out of range.
    Range,
}

impl State {
    /// Low rolling ground, two tank pads, and a tower in the middle that every shot has to clear
    /// (and that craters chip away), all from the seed.
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng::new(seed);
        const SPACING: i32 = 160;
        let mut points = [0i32; WORLD_W / SPACING as usize + 1];
        for point in points.iter_mut() {
            *point = 70 + (rng.next() % 61) as i32;
        }
        let mut heights = [0i32; WORLD_W];
        for (x, height) in heights.iter_mut().enumerate() {
            let x = x as i32;
            let i = (x / SPACING) as usize;
            let t = x - i as i32 * SPACING;
            *height = points[i] + (points[i + 1] - points[i]) * t / SPACING;
        }
        for _ in 0..3 {
            let mut smoothed = [0i32; WORLD_W];
            for (x, out) in smoothed.iter_mut().enumerate() {
                let mut sum = 0;
                for k in -4i32..=4 {
                    let at = (x as i32 + k).clamp(0, WORLD_W as i32 - 1) as usize;
                    sum += heights[at];
                }
                *out = sum / 9;
            }
            heights = smoothed;
        }
        let left = 90 + (rng.next() % 80) as i32;
        let right = WORLD_W as i32 - 90 - (rng.next() % 80) as i32;
        for x in [left, right] {
            let pad = heights[x as usize];
            for k in -TANK_HALF_W - 4..=TANK_HALF_W + 4 {
                heights[(x + k) as usize] = pad;
            }
        }
        const TOWER_CENTRE: i32 = WORLD_W as i32 / 2;
        const TOWER_DRIFT: i32 = 40;
        let tower = TOWER_CENTRE - TOWER_DRIFT + (rng.next() % (2 * TOWER_DRIFT as u32 + 1)) as i32;
        let half = 18 + (rng.next() % 9) as i32;
        let top = heights[tower as usize] + 120 + (rng.next() % 81) as i32;
        for k in -half..=half {
            heights[(tower + k) as usize] = top;
        }
        State {
            seed,
            heights,
            tanks: [Tank { x: left, hp: MAX_HP }, Tank { x: right, hp: MAX_HP }],
            turn: 0,
            winner: None,
        }
    }

    pub fn side_to_move(&self) -> usize {
        (self.turn % 2) as usize
    }

    /// The barrel's tip for a tank aiming at `angle`, in pixels.
    fn barrel_tip(&self, side: usize, angle: i32) -> (i32, i32) {
        let tank = self.tanks[side];
        let ground = self.heights[tank.x as usize];
        (tank.x + cos_deg(angle) * BARREL / 1024, ground + TANK_H + sin_deg(angle) * BARREL / 1024)
    }

    /// Fires the side to move: the shell flies, bursts, digs a crater and hurts whoever is near.
    /// A pass (angle `PASS`, no power, no wind) is a skipped turn: nothing flies, the turn moves on.
    pub fn fire(&mut self, shot: Shot) -> Result<Outcome, ShotError> {
        if self.winner.is_some() {
            return Err(ShotError::Over);
        }
        if shot.angle == PASS {
            if shot.power != 0 || shot.wind != 0 {
                return Err(ShotError::Range);
            }
            self.end_turn();
            return Ok(Outcome { impact: None, damage: [0, 0], direct: false });
        }
        if !(0..=180).contains(&shot.angle) || !(0..=100).contains(&shot.power) || shot.wind.abs() > MAX_WIND {
            return Err(ShotError::Range);
        }
        let side = self.side_to_move();
        let (tip_x, tip_y) = self.barrel_tip(side, shot.angle);
        let mut x = tip_x * FP;
        let mut y = tip_y * FP;
        let speed = shot.power * SPEED_PER_POWER;
        let mut vx = speed * cos_deg(shot.angle) / 1024;
        let mut vy = speed * sin_deg(shot.angle) / 1024;
        let mut impact: Option<(i32, i32)> = None;
        let mut direct = false;

        for step in 1..=MAX_STEPS {
            x += vx;
            y += vy;
            vy -= GRAVITY;
            if step % 8 == 0 {
                vx += shot.wind;
            }
            if x < 0 {
                break;
            }
            let px = x / FP;
            let py = y.div_euclid(FP);
            if px >= WORLD_W as i32 {
                break;
            }
            // The shell clears its own barrel before it can hit anything.
            if step > 4 {
                for tank in self.tanks.iter() {
                    let ground = self.heights[tank.x as usize];
                    if (px - tank.x).abs() <= TANK_HALF_W && py >= ground && py <= ground + TANK_H + 2 {
                        impact = Some((px, py));
                        direct = true;
                    }
                }
            }
            if impact.is_none() && py <= self.heights[px as usize] {
                impact = Some((px, py.max(0)));
            }
            if impact.is_some() {
                break;
            }
        }

        let mut damage = [0i32; 2];
        if let Some((ix, iy)) = impact {
            for (index, tank) in self.tanks.iter().enumerate() {
                let dx = tank.x - ix;
                let dy = self.heights[tank.x as usize] + TANK_H / 2 - iy;
                let distance = isqrt(dx * dx + dy * dy);
                if distance < DAMAGE_RADIUS {
                    damage[index] = (DAMAGE_RADIUS - distance) * MAX_DAMAGE / DAMAGE_RADIUS;
                }
            }
            for dx in -BLAST_RADIUS..=BLAST_RADIUS {
                let column = ix + dx;
                if column < 0 || column >= WORLD_W as i32 {
                    continue;
                }
                let floor = (iy - isqrt(BLAST_RADIUS * BLAST_RADIUS - dx * dx)).max(0);
                let height = &mut self.heights[column as usize];
                if *height > floor {
                    *height = floor;
                }
            }
            for index in 0..2 {
                self.tanks[index].hp = (self.tanks[index].hp - damage[index]).max(0);
            }
        }

        self.end_turn();
        Ok(Outcome { impact, damage, direct })
    }

    /// The next turn, and a winner if a tank is gone or the turns have run out.
    fn end_turn(&mut self) {
        self.turn += 1;
        let [a, b] = [self.tanks[0].hp, self.tanks[1].hp];
        self.winner = if a == 0 && b == 0 {
            Some(Winner::Draw)
        } else if a == 0 {
            Some(Winner::Side(1))
        } else if b == 0 {
            Some(Winner::Side(0))
        } else if self.turn >= MAX_TURNS {
            Some(if a == b { Winner::Draw } else if a > b { Winner::Side(0) } else { Winner::Side(1) })
        } else {
            None
        };
    }
}

/// Plays a whole duel from its seed and shots, as the chain judges it. Shots after the duel is won
/// are ignored; an out-of-range shot is an error.
pub fn replay(seed: u32, shots: impl IntoIterator<Item = Shot>) -> Result<State, ShotError> {
    let mut state = State::new(seed);
    for shot in shots {
        if state.winner.is_some() {
            break;
        }
        state.fire(shot)?;
    }
    Ok(state)
}
