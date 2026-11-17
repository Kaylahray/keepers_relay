//! Crown Rally. One set of race rules, compiled to wasm for the phones that drive and the relay that
//! passes moves between them, and to RISC-V for the script that referees the race. Integer maths
//! only, no allocation, no floats, so every target reaches the same finish from the same moves.
//!
//! Up to 5 cars race 3 laps of one closed road, all at once. A match races one of a few named maps,
//! each a road traced point by point round smooth bends, chicanes and hairpins, so players know
//! the road before they join. Practice and tests can also make a road from a seed: 16 points
//! around a centre, each pushed in or out. Cars drive themselves
//! forward; a player only steers, brakes and fires one of 3 boosts. Grass slows a car, the barrier
//! stops it, and cars bump each other: the car that drives into another loses speed and pushes the
//! one in front a little.
//!
//! Every car has 100 health. A crash costs health for the speed it takes off: hitting the barrier,
//! scraping another car, or ramming one. The car that is rammed takes the hardest hit. A car with no
//! health left is wrecked: it sits still for 2 seconds, then comes back on the middle of the road
//! with full health, and passes through other cars for a moment so it isn't wrecked again at once.
//!
//! Items. Rows of 3 pads lie across the road, each showing the item it gives, so a player picks a
//! lane for the item they want. A car holds one item and fires it with Use. Driving over a pad gives
//! its item if the car's hands are empty, and a crown shard either way; the pad then sits empty for a
//! few seconds. The items: Ram (a dash that hurts and shoves the car it hits), Slick (a patch behind
//! you that stops a car steering), Jolt (zaps the car just ahead), Barricade (a block behind you),
//! Crown Rush (a big burst of speed), Ward (blocks the next item aimed at you), Patch (health back) and
//! Draft (faster while close behind a car). Each car has at most one Slick and one Barricade down.
//!
//! A car's moves: events of 3 bytes, `tick u16 LE ‖ input u8`, ticks strictly increasing. An input
//! holds until the car's next event. Input bits: 1 left, 2 right, 4 boost, 8 brake, 16 use.
//!
//! Coordinates are drawn with y pointing down, so a bigger heading turns the car right.

#![no_std]

pub const TICK_HZ: u32 = 20;
pub const LAPS: i32 = 3;
/// A race stops after three minutes, finished or not: the slowest road takes the bots two.
pub const MAX_TICKS: u32 = 180 * TICK_HZ;
pub const MAX_CARS: usize = 5;
/// The most input changes one car may make in a race.
pub const MAX_EVENTS: usize = 1600;
pub const EVENT_LEN: usize = 3;
/// The points of a road made from a seed.
pub const POINTS: usize = 16;
/// The most points any road may have.
pub const MAX_POINTS: usize = 64;
/// How many segments either side of a car's own the road's nearest point is looked for. A bend is
/// many short segments, and on its inside the nearest one can be several away.
pub const NEAR: usize = 5;

/// A full turn of heading.
pub const ANGLES: i64 = 1024;
/// What sin and cos return for 1.
pub const ONE: i64 = 1024;
/// Positions are kept in 1/64 of a world unit.
pub const SCALE: i64 = 64;

pub const BASE_RADIUS: i64 = 480 * SCALE;
pub const RADIUS_SWING: i64 = 140 * SCALE;
/// The road: further than this from its middle line is grass.
pub const HALF_WIDTH: i64 = 55 * SCALE;
/// The barrier: no car gets further than this from the middle line.
pub const WALL: i64 = 85 * SCALE;
pub const CAR_RADIUS: i64 = 11 * SCALE;

/// Speeds are in position units per tick.
pub const MAX_SPEED: i64 = 6 * SCALE;
pub const BOOST_SPEED: i64 = 9 * SCALE;
pub const GRASS_SPEED: i64 = 3 * SCALE;
pub const ACCEL: i64 = SCALE / 4;
pub const BRAKING: i64 = SCALE / 2;
/// How fast a car above its top speed slows down to it.
pub const DRAG: i64 = SCALE / 3;
/// Heading change per tick while steering.
pub const TURN: i64 = 18;
pub const BOOSTS: u8 = 3;
pub const BOOST_TICKS: u32 = 40;

pub const MAX_HP: u8 = 100;
/// A crash costs 1 health for every this much speed it takes off.
pub const CRASH_COST: i64 = SCALE / 2;
/// A car rammed from behind takes this many times the health the car that rammed it loses in speed.
pub const RAMMED: i64 = 4;
/// How long a wrecked car sits still.
pub const WRECK_TICKS: u32 = 2 * TICK_HZ;
/// How long a car back from a wreck passes through other cars.
pub const GHOST_TICKS: u32 = 3 * TICK_HZ / 2;

pub const LEFT: u8 = 1;
pub const RIGHT: u8 = 2;
pub const BOOST: u8 = 4;
pub const BRAKE: u8 = 8;
/// Fires the item the car holds.
pub const USE: u8 = 16;
pub const INPUT_MASK: u8 = LEFT | RIGHT | BOOST | BRAKE | USE;

/// The items, by number. 0 is empty hands.
pub const NO_ITEM: u8 = 0;
pub const RAM: u8 = 1;
pub const SLICK: u8 = 2;
pub const JOLT: u8 = 3;
pub const BARRICADE: u8 = 4;
pub const RUSH: u8 = 5;
pub const WARD: u8 = 6;
pub const PATCH: u8 = 7;
pub const DRAFT: u8 = 8;

/// The most rows of pads a road has, 3 pads to a row.
pub const MAX_ROWS: usize = 4;
pub const LANES: usize = 3;
pub const MAX_PADS: usize = MAX_ROWS * LANES;
/// The pads' lanes, from the road's middle: left, middle, right.
pub const LANE_OFFSET: i64 = 32 * SCALE;
pub const PAD_RADIUS: i64 = 12 * SCALE;
/// How long a pad sits empty once a car has driven over it.
pub const PAD_TICKS: u32 = 6 * TICK_HZ;

/// Ram: a short dash at this speed. The first car it touches is hurt and shoved aside.
pub const RAM_TICKS: u32 = 3 * TICK_HZ / 4;
pub const RAM_SPEED: i64 = 11 * SCALE;
pub const RAM_DAMAGE: i64 = 30;
pub const RAM_SHOVE: i64 = 8 * SCALE;
/// Slick: a patch dropped behind the car. A car that drives onto it can't steer for a moment.
pub const SLICK_TICKS: u32 = 15 * TICK_HZ;
pub const SLICK_RADIUS: i64 = 22 * SCALE;
pub const SLIP_TICKS: u32 = 3 * TICK_HZ / 2;
pub const SLICK_DAMAGE: i64 = 10;
/// Jolt: zaps the nearest car ahead within reach.
pub const JOLT_RANGE: i64 = 110 * SCALE;
pub const JOLT_DAMAGE: i64 = 30;
/// Barricade: a block dropped behind the car. The first car to hit it bounces off and breaks it.
pub const BARRICADE_TICKS: u32 = 15 * TICK_HZ;
pub const BARRICADE_RADIUS: i64 = 16 * SCALE;
pub const BARRICADE_DAMAGE: i64 = 20;
/// Crown Rush: faster than a boost, for a moment.
pub const RUSH_TICKS: u32 = TICK_HZ;
pub const RUSH_SPEED: i64 = 10 * SCALE;
/// Ward: blocks the next item that would hit the car, while it lasts.
pub const WARD_TICKS: u32 = 8 * TICK_HZ;
pub const PATCH_HP: u8 = 40;
/// Draft: while it lasts, a car close ahead lifts the car's top speed and acceleration.
pub const DRAFT_TICKS: u32 = 4 * TICK_HZ;
pub const DRAFT_RANGE: i64 = 150 * SCALE;
pub const DRAFT_SPEED: i64 = 8 * SCALE;
/// Slicks and Barricades are dropped this far behind the car.
const DROP_BEHIND: i64 = 3 * CAR_RADIUS;
/// Set on a car's result once it has finished every lap.
pub const FINISHED: u8 = 0x80;

/// The named maps, by number: each road's middle line in world units, from the start line on. Each
/// bend is a run of short segments, so the road and its barrier curve. Parts of a road far apart
/// along it stay far enough apart on the ground that their barriers never touch.
///
/// Harbour Loop: the sample's dockside loop, corners rounded. 43 points.
const HARBOUR_LOOP: &[(i64, i64)] = &[
    (-301, -379), (272, -379), (479, -367), (534, -356), (581, -339), (615, -315), (639, -280), (661, -216),
    (670, -158), (675, -39), (669, 91), (658, 168), (636, 231), (589, 291), (521, 327), (378, 350),
    (251, 348), (214, 337), (196, 315), (168, 180), (145, 143), (115, 131), (67, 122), (-62, 120),
    (-139, 132), (-176, 152), (-197, 191), (-230, 305), (-245, 329), (-315, 352), (-393, 353), (-474, 342),
    (-537, 322), (-571, 297), (-601, 262), (-648, 165), (-669, 60), (-674, -93), (-664, -204), (-635, -286),
    (-593, -331), (-520, -360), (-435, -372),
];
/// Switchback Hill: the sample's mountain road and hairpins, 1.02x so the hairpins clear. 49 points.
const SWITCHBACK_HILL: &[(i64, i64)] = &[
    (-310, -375), (228, -358), (341, -348), (427, -333), (479, -315), (534, -282), (576, -246), (609, -207),
    (628, -170), (632, -140), (620, -107), (591, -66), (549, -24), (505, 9), (446, 37), (394, 40),
    (326, 21), (133, -52), (61, -61), (8, -36), (-44, 11), (-81, 67), (-93, 115), (-79, 145),
    (-24, 170), (321, 245), (413, 277), (500, 323), (561, 368), (591, 404), (530, 473), (421, 516),
    (312, 544), (219, 551), (75, 534), (-91, 495), (-213, 454), (-295, 407), (-387, 322), (-517, 164),
    (-591, 54), (-628, -30), (-633, -66), (-629, -109), (-598, -213), (-550, -295), (-519, -327), (-490, -347),
    (-416, -368),
];
/// Old Town: the sample's street circuit, corners rounded. 38 points.
const OLD_TOWN: &[(i64, i64)] = &[
    (-267, -313), (47, -300), (326, -305), (414, -291), (435, -279), (467, -184), (482, -48), (472, 39),
    (455, 64), (424, 75), (232, 67), (201, 70), (165, 128), (176, 284), (168, 311), (148, 327),
    (89, 347), (11, 357), (-67, 357), (-128, 346), (-149, 332), (-159, 306), (-162, 144), (-168, 118),
    (-200, 91), (-233, 89), (-371, 106), (-419, 107), (-449, 93), (-475, 55), (-490, 7), (-499, -51),
    (-494, -192), (-485, -230), (-470, -261), (-449, -284), (-420, -300), (-364, -310),
];
pub const MAPS: [&[(i64, i64)]; 3] = [HARBOUR_LOOP, SWITCHBACK_HILL, OLD_TOWN];

/// A row of pads across the road: on which segment, how far along it in 1/1024, and the item in
/// each lane from left to right.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PadRow {
    pub seg: u8,
    pub along: u16,
    pub items: [u8; LANES],
}

const fn row(seg: u8, items: [u8; LANES]) -> PadRow {
    PadRow { seg, along: 512, items }
}

/// The four mixes of items a row may hold, so every map offers each item twice.
const MIXES: [[u8; LANES]; MAX_ROWS] = [[RUSH, JOLT, PATCH], [SLICK, WARD, RAM], [DRAFT, BARRICADE, JOLT], [PATCH, RAM, SLICK]];

/// Each named map's rows of pads, halfway along straights at least 30 m long.
pub const MAP_ROWS: [[PadRow; MAX_ROWS]; 3] = [
    [row(1, MIXES[0]), row(14, MIXES[1]), row(22, MIXES[2]), row(36, MIXES[3])],
    [row(16, MIXES[0]), row(24, MIXES[1]), row(34, MIXES[2]), row(38, MIXES[3])],
    [row(1, MIXES[0]), row(9, MIXES[1]), row(21, MIXES[2]), row(31, MIXES[3])],
];

pub fn map_track(map: u8) -> Option<Track> {
    let rows = MAP_ROWS.get(map as usize)?;
    MAPS.get(map as usize).map(|points| Track { rows: *rows, ..Track::drawn(points) })
}

/// sin of a heading, times `ONE`. Bhaskara's formula: close to the real curve, and exact on every target.
pub fn sin(angle: i64) -> i64 {
    let a = angle.rem_euclid(ANGLES);
    let half = ANGLES / 2;
    let (x, sign) = if a < half { (a, 1) } else { (a - half, -1) };
    let k = x * (half - x);
    sign * 16 * k * ONE / (5 * half * half - 4 * k)
}

pub fn cos(angle: i64) -> i64 {
    sin(angle + ANGLES / 4)
}

pub fn isqrt(n: i64) -> i64 {
    if n <= 0 {
        return 0;
    }
    let n = n as u64;
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x as i64
}

fn mix(a: u64, b: u64) -> u64 {
    let mut z = a ^ b.wrapping_add(1).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

struct Rng(u64);

impl Rng {
    fn below(&mut self, n: u32) -> u32 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        (mix(self.0, 0) >> 33) as u32 % n
    }
}

/// The road's middle line: a closed loop through `len` points. Cars go from point 0 to 1 to 2 and on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Track {
    pub x: [i64; MAX_POINTS],
    pub y: [i64; MAX_POINTS],
    pub len: usize,
    pub rows: [PadRow; MAX_ROWS],
}

/// Rows spread evenly round a road with no rows of its own: a quarter of the way round each.
fn even_rows(len: usize) -> [PadRow; MAX_ROWS] {
    let mut rows = [PadRow::default(); MAX_ROWS];
    for (k, row) in rows.iter_mut().enumerate() {
        *row = PadRow { seg: ((k * len / MAX_ROWS + 1) % len) as u8, along: 512, items: MIXES[k] };
    }
    rows
}

impl Track {
    /// A road from a seed: `POINTS` points round a centre.
    pub fn new(seed: u64) -> Self {
        let mut rng = Rng(seed);
        let mut raw = [0i64; POINTS];
        for r in raw.iter_mut() {
            *r = BASE_RADIUS - RADIUS_SWING + rng.below((2 * RADIUS_SWING + 1) as u32) as i64;
        }
        let mut track = Track { x: [0; MAX_POINTS], y: [0; MAX_POINTS], len: POINTS, rows: even_rows(POINTS) };
        for i in 0..POINTS {
            // Each point leans toward its neighbours, so no corner is a spike.
            let r = (raw[(i + POINTS - 1) % POINTS] + 2 * raw[i] + raw[(i + 1) % POINTS]) / 4;
            let a = i as i64 * ANGLES / POINTS as i64;
            track.x[i] = cos(a) * r / ONE;
            track.y[i] = sin(a) * r / ONE;
        }
        track
    }

    /// A road drawn by hand, in world units. Takes at most `MAX_POINTS` points.
    pub fn drawn(points: &[(i64, i64)]) -> Self {
        let len = points.len().min(MAX_POINTS);
        let mut track = Track { x: [0; MAX_POINTS], y: [0; MAX_POINTS], len, rows: even_rows(len.max(1)) };
        for (i, (x, y)) in points.iter().take(MAX_POINTS).enumerate() {
            track.x[i] = x * SCALE;
            track.y[i] = y * SCALE;
        }
        track
    }

    /// Segment `i`: its start and the step to the next point.
    pub fn segment(&self, i: usize) -> (i64, i64, i64, i64) {
        let j = (i + 1) % self.len;
        (self.x[i], self.y[i], self.x[j] - self.x[i], self.y[j] - self.y[i])
    }

    /// How far along segment `i` a point lies: `t` over `len²`, 0 at its start and 1 at its end.
    pub fn along(&self, i: usize, px: i64, py: i64) -> (i64, i64) {
        let (ax, ay, dx, dy) = self.segment(i);
        ((px - ax) * dx + (py - ay) * dy, (dx * dx + dy * dy).max(1))
    }

    /// The nearest point of segment `i`, and the squared distance to it.
    pub fn nearest(&self, i: usize, px: i64, py: i64) -> (i64, i64, i64) {
        let (ax, ay, dx, dy) = self.segment(i);
        let (t, len2) = self.along(i, px, py);
        let t = t.clamp(0, len2);
        let (cx, cy) = (ax + dx * t / len2, ay + dy * t / len2);
        let (ex, ey) = (px - cx, py - cy);
        (cx, cy, ex * ex + ey * ey)
    }

    /// The nearest point of the road's middle line within `NEAR` segments of segment `seg`.
    pub fn closest(&self, seg: usize, px: i64, py: i64) -> (i64, i64, i64) {
        let mut best = self.nearest(seg, px, py);
        for k in 1..=NEAR.min((self.len - 1) / 2) {
            for s in [(seg + self.len - k) % self.len, (seg + k) % self.len] {
                let other = self.nearest(s, px, py);
                if other.2 < best.2 {
                    best = other;
                }
            }
        }
        best
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Car {
    pub x: i64,
    pub y: i64,
    pub heading: i64,
    pub speed: i64,
    /// The segment of the road the car is on, and how many times it has crossed the start line.
    pub seg: usize,
    pub lap: i32,
    pub boosts: u8,
    pub boost_ticks: u32,
    /// The input it held last tick, so a boost fires once per press.
    pub held: u8,
    /// The tick it crossed the line for the last time.
    pub finished: Option<u32>,
    pub hp: u8,
    /// Ticks left sitting still after a wreck.
    pub wreck_ticks: u32,
    /// Ticks left passing through other cars, after coming back from a wreck.
    pub ghost_ticks: u32,
    /// The item it holds, or `NO_ITEM`.
    pub item: u8,
    /// Crown shards picked up this race.
    pub shards: u16,
    /// Ticks left on each item that lasts.
    pub ram_ticks: u32,
    pub rush_ticks: u32,
    pub ward_ticks: u32,
    pub draft_ticks: u32,
    /// Ticks left unable to steer, after driving onto a Slick.
    pub slip_ticks: u32,
}

impl Car {
    /// Takes `damage` health off; at none left the car is wrecked.
    fn hurt(&mut self, damage: i64) {
        if damage <= 0 || self.wreck_ticks > 0 || self.finished.is_some() {
            return;
        }
        self.hp = (self.hp as i64 - damage).max(0) as u8;
        if self.hp == 0 {
            self.wreck_ticks = WRECK_TICKS;
            self.speed = 0;
            self.boost_ticks = 0;
            self.ram_ticks = 0;
            self.rush_ticks = 0;
            self.slip_ticks = 0;
        }
    }

    /// Takes the health a crash costs for slowing from `before` to the car's speed now.
    fn crashed(&mut self, before: i64) {
        self.hurt((before - self.speed) / CRASH_COST);
    }

    /// Wrecked, or just back and passing through: it touches no other car.
    pub fn untouchable(&self) -> bool {
        self.wreck_ticks > 0 || self.ghost_ticks > 0 || self.finished.is_some()
    }

    /// An item hits the car: its Ward takes it if it has one up, and says whether it got through.
    fn struck(&mut self) -> bool {
        if self.ward_ticks > 0 {
            self.ward_ticks = 0;
            return false;
        }
        true
    }
}

/// One pad: where it lies, the item it gives, and how long until it's back.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Pad {
    pub x: i64,
    pub y: i64,
    pub item: u8,
    pub empty_ticks: u32,
}

/// A Slick or Barricade on the road. Car `owner` dropped it; `ticks` 0 means it's gone.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Hazard {
    pub kind: u8,
    pub x: i64,
    pub y: i64,
    pub ticks: u32,
    pub owner: usize,
}

/// The heading that points closest along `dx, dy`.
fn heading_along(dx: i64, dy: i64) -> i64 {
    (0..ANGLES).max_by_key(|a| cos(*a) * dx + sin(*a) * dy).unwrap_or(0)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Race {
    pub track: Track,
    pub cars: [Car; MAX_CARS],
    pub count: usize,
    pub tick: u32,
    pub pads: [Pad; MAX_PADS],
    /// Car `i`'s Slick at `2i`, its Barricade at `2i + 1`.
    pub hazards: [Hazard; 2 * MAX_CARS],
}

impl Race {
    /// A race of `count` cars on the road from `seed`.
    pub fn seeded(seed: u64, count: usize) -> Self {
        Race::new(Track::new(seed), count)
    }

    /// A race of `count` cars on a named map.
    pub fn on_map(map: u8, count: usize) -> Option<Self> {
        map_track(map).map(|track| Race::new(track, count))
    }

    /// A race of `count` cars on `track`, lined up two by two just past the start line.
    pub fn new(track: Track, count: usize) -> Self {
        let count = count.clamp(1, MAX_CARS);
        let (ax, ay, dx, dy) = track.segment(0);
        let len = isqrt(dx * dx + dy * dy).max(1);
        let heading = heading_along(dx, dy);
        let mut cars = [Car::default(); MAX_CARS];
        for (i, car) in cars.iter_mut().enumerate().take(count) {
            let along = (70 - (i / 2) as i64 * 30) * SCALE;
            let side = if i % 2 == 0 { -22 } else { 22 } * SCALE;
            *car = Car {
                x: ax + (dx * along - dy * side) / len,
                y: ay + (dy * along + dx * side) / len,
                heading,
                boosts: BOOSTS,
                hp: MAX_HP,
                ..Car::default()
            };
        }
        let mut pads = [Pad::default(); MAX_PADS];
        for (r, row) in track.rows.iter().enumerate() {
            let (ax, ay, dx, dy) = track.segment(row.seg as usize % track.len);
            let len = isqrt(dx * dx + dy * dy).max(1);
            let (mx, my) = (ax + dx * row.along as i64 / ONE, ay + dy * row.along as i64 / ONE);
            for (lane, item) in row.items.iter().enumerate() {
                // Left of the middle is minus: the road's right is (-dy, dx).
                let side = (lane as i64 - 1) * LANE_OFFSET;
                pads[r * LANES + lane] = Pad { x: mx - dy * side / len, y: my + dx * side / len, item: *item, empty_ticks: 0 };
            }
        }
        Race { track, cars, count, tick: 0, pads, hazards: [Hazard::default(); 2 * MAX_CARS] }
    }

    /// Every car has finished, or the time is up.
    pub fn over(&self) -> bool {
        self.tick >= MAX_TICKS || self.cars[..self.count].iter().all(|car| car.finished.is_some())
    }

    /// One tick: each car fires its item if it pressed Use and drives, the cars that touch bump,
    /// hazards and pads do their work, and finishes are counted.
    pub fn step(&mut self, inputs: &[u8]) {
        if self.over() {
            return;
        }
        for i in 0..self.count {
            let input = inputs.get(i).copied().unwrap_or(0) & INPUT_MASK;
            if input & !self.cars[i].held & USE != 0 {
                self.use_item(i);
            }
            let drafting = self.cars[i].draft_ticks > 0 && self.close_ahead(i, DRAFT_RANGE, true).is_some();
            drive(&self.track, &mut self.cars[i], input, drafting);
        }
        self.bump();
        self.hazards();
        self.pads();
        self.tick += 1;
        for car in self.cars[..self.count].iter_mut() {
            if car.finished.is_none() {
                follow(&self.track, car);
                if car.lap >= LAPS {
                    car.finished = Some(self.tick);
                }
            }
        }
    }

    fn bump(&mut self) {
        let min = 2 * CAR_RADIUS;
        for i in 0..self.count {
            for j in i + 1..self.count {
                let (a, b) = (self.cars[i], self.cars[j]);
                if a.untouchable() || b.untouchable() {
                    continue;
                }
                let (dx, dy) = (b.x - a.x, b.y - a.y);
                let d2 = dx * dx + dy * dy;
                if d2 >= min * min {
                    continue;
                }
                let d = isqrt(d2);
                let (nx, ny) = if d == 0 { (ONE, 0) } else { (dx * ONE / d, dy * ONE / d) };
                // Each car moves half the overlap away from the other.
                let push = (min - d) / 2 + 1;
                self.cars[i].x -= nx * push / ONE;
                self.cars[i].y -= ny * push / ONE;
                self.cars[j].x += nx * push / ONE;
                self.cars[j].y += ny * push / ONE;
                // Who drove into whom: how much each car faces the other.
                let a_into = (cos(a.heading) * nx + sin(a.heading) * ny) / ONE;
                let b_into = -(cos(b.heading) * nx + sin(b.heading) * ny) / ONE;
                if a.ram_ticks > 0 || b.ram_ticks > 0 {
                    // A Ram ends on the first car it touches, which is hurt and shoved away.
                    let (rammer, victim, away) = if a.ram_ticks > 0 { (i, j, 1) } else { (j, i, -1) };
                    self.cars[rammer].ram_ticks = 0;
                    self.cars[rammer].speed = self.cars[rammer].speed * 3 / 4;
                    if self.cars[victim].struck() {
                        self.cars[victim].x += away * nx * RAM_SHOVE / ONE;
                        self.cars[victim].y += away * ny * RAM_SHOVE / ONE;
                        self.cars[victim].speed /= 2;
                        self.cars[victim].hurt(RAM_DAMAGE);
                    }
                } else if a_into > b_into + ONE / 4 {
                    self.hit(i, j);
                } else if b_into > a_into + ONE / 4 {
                    self.hit(j, i);
                } else {
                    // Side by side: both scrape.
                    for k in [i, j] {
                        let before = self.cars[k].speed;
                        self.cars[k].speed = before * 7 / 8;
                        self.cars[k].crashed(before);
                    }
                }
                wall(&self.track, &mut self.cars[i]);
                wall(&self.track, &mut self.cars[j]);
            }
        }
    }

    /// The car behind loses a quarter of its speed and gives half of that to the car in front. The car
    /// in front takes `RAMMED` times the damage.
    fn hit(&mut self, rear: usize, front: usize) {
        let lost = self.cars[rear].speed / 4;
        self.cars[rear].speed -= lost;
        self.cars[front].speed = (self.cars[front].speed + lost / 2).min(BOOST_SPEED);
        self.cars[rear].hurt(lost / CRASH_COST);
        self.cars[front].hurt(lost * RAMMED / CRASH_COST);
    }

    /// Fires car `i`'s item. A Jolt with nobody in reach stays in hand.
    fn use_item(&mut self, i: usize) {
        let car = self.cars[i];
        if car.item == NO_ITEM || car.wreck_ticks > 0 || car.finished.is_some() {
            return;
        }
        let behind = (car.x - cos(car.heading) * DROP_BEHIND / ONE, car.y - sin(car.heading) * DROP_BEHIND / ONE);
        let me = &mut self.cars[i];
        match car.item {
            RAM => {
                me.ram_ticks = RAM_TICKS;
                me.speed = RAM_SPEED;
            }
            SLICK => self.hazards[2 * i] = Hazard { kind: SLICK, x: behind.0, y: behind.1, ticks: SLICK_TICKS, owner: i },
            BARRICADE => self.hazards[2 * i + 1] = Hazard { kind: BARRICADE, x: behind.0, y: behind.1, ticks: BARRICADE_TICKS, owner: i },
            JOLT => {
                let Some(target) = self.close_ahead(i, JOLT_RANGE, false) else {
                    return;
                };
                let hit = &mut self.cars[target];
                if hit.struck() {
                    // Slowed and briefly unable to steer, but not so much the car behind runs into it.
                    hit.speed = hit.speed * 2 / 3;
                    hit.slip_ticks = SLIP_TICKS;
                    hit.hurt(JOLT_DAMAGE);
                }
            }
            RUSH => me.rush_ticks = RUSH_TICKS,
            WARD => me.ward_ticks = WARD_TICKS,
            PATCH => me.hp = (me.hp + PATCH_HP).min(MAX_HP),
            DRAFT => me.draft_ticks = DRAFT_TICKS,
            _ => {}
        }
        self.cars[i].item = NO_ITEM;
    }

    /// The nearest car further round the road than car `i` and within `reach`, still racing and
    /// touchable. With `in_front`, only one roughly where car `i` is pointing.
    fn close_ahead(&self, i: usize, reach: i64, in_front: bool) -> Option<usize> {
        let me = &self.cars[i];
        let mine = self.progress(me);
        let mut best: Option<(i64, usize)> = None;
        for (j, other) in self.cars[..self.count].iter().enumerate() {
            if j == i || other.untouchable() || self.progress(other) <= mine {
                continue;
            }
            let (dx, dy) = (other.x - me.x, other.y - me.y);
            let d = isqrt(dx * dx + dy * dy);
            if d > reach || in_front && cos(me.heading) * dx + sin(me.heading) * dy < d * ONE * 7 / 10 {
                continue;
            }
            if best.is_none_or(|(near, _)| d < near) {
                best = Some((d, j));
            }
        }
        best.map(|(_, j)| j)
    }

    /// Slicks and Barricades: each wears out, and catches any car but its own that drives onto it.
    fn hazards(&mut self) {
        for h in 0..self.hazards.len() {
            let hazard = self.hazards[h];
            if hazard.ticks == 0 {
                continue;
            }
            self.hazards[h].ticks -= 1;
            let reach = if hazard.kind == SLICK { SLICK_RADIUS } else { BARRICADE_RADIUS } + CAR_RADIUS;
            for i in 0..self.count {
                let car = self.cars[i];
                if i == hazard.owner || car.untouchable() || car.slip_ticks > 0 && hazard.kind == SLICK {
                    continue;
                }
                let (dx, dy) = (car.x - hazard.x, car.y - hazard.y);
                let d2 = dx * dx + dy * dy;
                if d2 >= reach * reach {
                    continue;
                }
                let car = &mut self.cars[i];
                if hazard.kind == SLICK {
                    if car.struck() {
                        car.slip_ticks = SLIP_TICKS;
                        car.speed /= 2;
                        car.hurt(SLICK_DAMAGE);
                    }
                    continue;
                }
                // A Barricade breaks on the first car to hit it, which bounces off it like the barrier.
                self.hazards[h].ticks = 0;
                if car.struck() {
                    let d = isqrt(d2).max(1);
                    car.x = hazard.x + dx * reach / d;
                    car.y = hazard.y + dy * reach / d;
                    let before = car.speed;
                    car.speed /= 2;
                    car.crashed(before);
                    car.hurt(BARRICADE_DAMAGE);
                    wall(&self.track, car);
                }
                break;
            }
        }
    }

    /// Pads: a car driving over one that's there takes a shard, and its item if its hands are empty.
    fn pads(&mut self) {
        let reach = PAD_RADIUS + CAR_RADIUS;
        for pad in self.pads.iter_mut() {
            if pad.item == NO_ITEM {
                continue;
            }
            if pad.empty_ticks > 0 {
                pad.empty_ticks -= 1;
                continue;
            }
            for car in self.cars[..self.count].iter_mut() {
                if car.wreck_ticks > 0 || car.finished.is_some() {
                    continue;
                }
                let (dx, dy) = (car.x - pad.x, car.y - pad.y);
                if dx * dx + dy * dy >= reach * reach {
                    continue;
                }
                car.shards += 1;
                if car.item == NO_ITEM {
                    car.item = pad.item;
                }
                pad.empty_ticks = PAD_TICKS;
                break;
            }
        }
    }

    /// How far a car has come: laps, then segments, then the share of its segment, in 1/1024.
    pub fn progress(&self, car: &Car) -> i64 {
        let (t, len2) = self.track.along(car.seg, car.x, car.y);
        let share = (t.clamp(0, len2) * ONE / len2).min(ONE - 1);
        (car.lap as i64 * self.track.len as i64 + car.seg as i64) * ONE + share
    }

    /// Each car's place, 0 for first. Finishers rank by finish tick, the rest by how far they got.
    /// Cars that tie share a place.
    pub fn places(&self) -> [u8; MAX_CARS] {
        let key = |car: &Car| match car.finished {
            Some(tick) => (0u8, tick as i64),
            None => (1u8, -self.progress(car)),
        };
        let mut out = [0u8; MAX_CARS];
        for i in 0..self.count {
            let mine = key(&self.cars[i]);
            out[i] = self.cars[..self.count].iter().filter(|other| key(other) < mine).count() as u8;
        }
        out
    }

    /// Each car's place, with `FINISHED` set if it finished. What a match is judged on.
    pub fn results(&self) -> [u8; MAX_CARS] {
        let mut out = self.places();
        for (result, car) in out.iter_mut().zip(&self.cars[..self.count]) {
            if car.finished.is_some() {
                *result |= FINISHED;
            }
        }
        out
    }
}

fn drive(track: &Track, car: &mut Car, input: u8, drafting: bool) {
    if car.finished.is_some() {
        return;
    }
    let pressed = input & !car.held;
    car.held = input;
    car.ghost_ticks = car.ghost_ticks.saturating_sub(1);
    car.ward_ticks = car.ward_ticks.saturating_sub(1);
    car.draft_ticks = car.draft_ticks.saturating_sub(1);
    if car.wreck_ticks > 0 {
        car.wreck_ticks -= 1;
        if car.wreck_ticks == 0 {
            back_on_the_road(track, car);
        }
        return;
    }
    // On a Slick the wheels don't answer.
    let slipping = car.slip_ticks > 0;
    car.slip_ticks = car.slip_ticks.saturating_sub(1);
    if !slipping && input & LEFT != 0 && input & RIGHT == 0 {
        car.heading -= TURN;
    }
    if !slipping && input & RIGHT != 0 && input & LEFT == 0 {
        car.heading += TURN;
    }
    car.heading = car.heading.rem_euclid(ANGLES);
    if pressed & BOOST != 0 && car.boosts > 0 && car.boost_ticks == 0 {
        car.boosts -= 1;
        car.boost_ticks = BOOST_TICKS;
    }
    let boosting = car.boost_ticks > 0;
    car.boost_ticks = car.boost_ticks.saturating_sub(1);
    let ramming = car.ram_ticks > 0;
    car.ram_ticks = car.ram_ticks.saturating_sub(1);
    let rushing = car.rush_ticks > 0;
    car.rush_ticks = car.rush_ticks.saturating_sub(1);
    let on_grass = track.closest(car.seg, car.x, car.y).2 > HALF_WIDTH * HALF_WIDTH;
    let cap = if ramming {
        RAM_SPEED
    } else if on_grass {
        GRASS_SPEED
    } else if rushing {
        RUSH_SPEED
    } else if boosting {
        BOOST_SPEED
    } else if drafting {
        DRAFT_SPEED
    } else {
        MAX_SPEED
    };
    let fast = boosting || rushing || drafting;
    if input & BRAKE != 0 && !ramming {
        car.speed = (car.speed - BRAKING).max(0);
    } else if car.speed < cap {
        car.speed = (car.speed + if fast { 2 * ACCEL } else { ACCEL }).min(cap);
    } else {
        car.speed = (car.speed - DRAG).max(cap);
    }
    car.x += cos(car.heading) * car.speed / ONE;
    car.y += sin(car.heading) * car.speed / ONE;
    wall(track, car);
}

/// A car past the barrier is put back against it and loses half its speed.
fn wall(track: &Track, car: &mut Car) {
    let (cx, cy, d2) = track.closest(car.seg, car.x, car.y);
    if d2 > WALL * WALL {
        let d = isqrt(d2).max(1);
        car.x = cx + (car.x - cx) * WALL / d;
        car.y = cy + (car.y - cy) * WALL / d;
        let before = car.speed;
        car.speed /= 2;
        car.crashed(before);
    }
}

/// A wreck comes back on the middle line where it stopped, facing along the road, with full health.
fn back_on_the_road(track: &Track, car: &mut Car) {
    let (cx, cy, _) = track.closest(car.seg, car.x, car.y);
    let (_, _, dx, dy) = track.segment(car.seg);
    car.x = cx;
    car.y = cy;
    car.heading = heading_along(dx, dy);
    car.speed = 0;
    car.hp = MAX_HP;
    car.ghost_ticks = GHOST_TICKS;
}

/// Moves a car on to the next segment once it passes the end of its own, or back once it is well
/// behind the start. A car that cuts the inside of a sharp corner never passes the end of its
/// segment, so it also moves on once it is nearer the next segment and past that one's start (and
/// back the same way). Crossing segment 0's start counts a lap, either way.
fn follow(track: &Track, car: &mut Car) {
    let n = track.len;
    let (next, prev) = ((car.seg + 1) % n, (car.seg + n - 1) % n);
    let (t, len2) = track.along(car.seg, car.x, car.y);
    let here = track.nearest(car.seg, car.x, car.y).2;
    let ahead = track.along(next, car.x, car.y).0 >= 0 && track.nearest(next, car.x, car.y).2 < here;
    let behind = t < 0 && track.nearest(prev, car.x, car.y).2 < here;
    if t >= len2 || ahead {
        if car.seg == track.len - 1 {
            car.seg = 0;
            car.lap += 1;
        } else {
            car.seg += 1;
        }
    } else if t < -len2 / 2 || behind {
        if car.seg == 0 {
            car.seg = track.len - 1;
            car.lap -= 1;
        } else {
            car.seg -= 1;
        }
    }
}

/// A simple driver: aims about one segment ahead and steers toward it, each car in its own lane so
/// they spread across the road instead of queueing on the middle line. For practice races and tests.
pub fn bot_input(race: &Race, i: usize) -> u8 {
    let car = &race.cars[i];
    let n = race.track.len;
    // A point about one segment ahead on the middle line, moved sideways into this car's lane.
    let (t, len2) = race.track.along(car.seg, car.x, car.y);
    let share = t.clamp(0, len2) * ONE / len2;
    let (a, b) = ((car.seg + 1) % n, (car.seg + 2) % n);
    let (sx, sy) = (race.track.x[b] - race.track.x[a], race.track.y[b] - race.track.y[a]);
    let step = isqrt(sx * sx + sy * sy).max(1);
    // Full lanes on the straights; near the middle round tight corners, so no bot runs into the barrier.
    let lane = (2 * i as i64 - (race.count as i64 - 1)) * if step >= 200 * SCALE { 7 } else { 2 } * SCALE;
    let aim_x = race.track.x[a] + sx * share / ONE - sy * lane / step;
    let aim_y = race.track.y[a] + sy * share / ONE + sx * lane / step;
    let (tx, ty) = (aim_x - car.x, aim_y - car.y);
    let len = isqrt(tx * tx + ty * ty).max(1);
    let cross = cos(car.heading) * ty - sin(car.heading) * tx;
    let facing = cos(car.heading) * tx + sin(car.heading) * ty;
    let steer = if cross * 20 > len * ONE {
        RIGHT
    } else if -cross * 20 > len * ONE {
        LEFT
    } else {
        0
    };
    // Well off line at speed: brake into the corner.
    let sharp = facing < len * ONE / 4 && car.speed > MAX_SPEED / 2;
    // Fire an item as soon as it's any use: a Patch once hurt, a Ram with a car right in front, a
    // Jolt with a car in reach.
    let fire = car.held & USE == 0
        && match car.item {
            NO_ITEM => false,
            PATCH => car.hp < 60,
            RAM => race.close_ahead(i, 4 * CAR_RADIUS, true).is_some(),
            JOLT => race.close_ahead(i, JOLT_RANGE, false).is_some(),
            _ => true,
        };
    steer | if sharp { BRAKE } else { 0 } | if fire { USE } else { 0 }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaceError {
    /// No cars, or more than `MAX_CARS`.
    Cars,
    /// Bytes cut short or left over.
    Length,
    /// No map by that number.
    Map,
    /// Too many events, ticks out of order or past the end, or an input with unknown bits.
    Events,
}

fn tick_of(tape: &[u8], n: usize) -> u32 {
    u16::from_le_bytes([tape[n * EVENT_LEN], tape[n * EVENT_LEN + 1]]) as u32
}

/// Checks one car's events: in order, inside the race, known bits only.
pub fn check_tape(tape: &[u8]) -> Result<(), RaceError> {
    if tape.len() % EVENT_LEN != 0 || tape.len() / EVENT_LEN > MAX_EVENTS {
        return Err(RaceError::Events);
    }
    let mut last: Option<u32> = None;
    for n in 0..tape.len() / EVENT_LEN {
        let tick = tick_of(tape, n);
        if tick >= MAX_TICKS || last.is_some_and(|before| tick <= before) || tape[n * EVENT_LEN + 2] & !INPUT_MASK != 0 {
            return Err(RaceError::Events);
        }
        last = Some(tick);
    }
    Ok(())
}

/// Plays a whole race from its record: `seed u64 LE ‖ cars u8 ‖ per car: count u16 LE ‖ events`.
pub fn replay_encoded(raw: &[u8]) -> Result<Race, RaceError> {
    let seed = u64::from_le_bytes(raw.get(..8).ok_or(RaceError::Length)?.try_into().unwrap());
    replay_cars(Track::new(seed), &raw[8..])
}

/// Plays a match's race from its record: `map u8 ‖ cars u8 ‖ per car: count u16 LE ‖ events`.
pub fn replay_map(raw: &[u8]) -> Result<Race, RaceError> {
    let track = map_track(*raw.first().ok_or(RaceError::Length)?).ok_or(RaceError::Map)?;
    replay_cars(track, &raw[1..])
}

/// The record after its road: `cars u8 ‖ per car: count u16 LE ‖ events`.
fn replay_cars(track: Track, raw: &[u8]) -> Result<Race, RaceError> {
    let count = *raw.first().ok_or(RaceError::Length)? as usize;
    if count == 0 || count > MAX_CARS {
        return Err(RaceError::Cars);
    }
    let mut tapes: [&[u8]; MAX_CARS] = [&[]; MAX_CARS];
    let mut at = 1;
    for tape in tapes.iter_mut().take(count) {
        let head = raw.get(at..at + 2).ok_or(RaceError::Length)?;
        let len = u16::from_le_bytes([head[0], head[1]]) as usize * EVENT_LEN;
        *tape = raw.get(at + 2..at + 2 + len).ok_or(RaceError::Length)?;
        check_tape(tape)?;
        at += 2 + len;
    }
    if at != raw.len() {
        return Err(RaceError::Length);
    }
    Ok(replay(track, &tapes[..count]))
}

/// Plays a race from checked tapes, one per car.
pub fn replay(track: Track, tapes: &[&[u8]]) -> Race {
    let mut race = Race::new(track, tapes.len());
    let mut next = [0usize; MAX_CARS];
    let mut held = [0u8; MAX_CARS];
    while !race.over() {
        for (c, tape) in tapes.iter().enumerate().take(race.count) {
            if next[c] * EVENT_LEN < tape.len() && tick_of(tape, next[c]) == race.tick {
                held[c] = tape[next[c] * EVENT_LEN + 2];
                next[c] += 1;
            }
        }
        race.step(&held);
    }
    race
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use std::vec::Vec;

    /// Bots race; each car's input changes become its tape.
    fn bot_race(seed: u64, count: usize) -> (Race, Vec<Vec<u8>>) {
        bot_race_on(Track::new(seed), count)
    }

    fn bot_race_on(track: Track, count: usize) -> (Race, Vec<Vec<u8>>) {
        let mut race = Race::new(track, count);
        let mut tapes: Vec<Vec<u8>> = (0..count).map(|_| Vec::new()).collect();
        let mut last = [0u8; MAX_CARS];
        while !race.over() {
            let mut inputs = [0u8; MAX_CARS];
            for i in 0..count {
                // Car 1 boosts on its first ticks, so the cars meet early.
                inputs[i] = bot_input(&race, i) | if i == 1 && race.tick < 4 { BOOST } else { 0 };
                if inputs[i] != last[i] {
                    tapes[i].extend_from_slice(&(race.tick as u16).to_le_bytes());
                    tapes[i].push(inputs[i]);
                    last[i] = inputs[i];
                }
            }
            race.step(&inputs);
        }
        (race, tapes)
    }

    fn encode(seed: u64, tapes: &[Vec<u8>]) -> Vec<u8> {
        let mut raw = seed.to_le_bytes().to_vec();
        raw.push(tapes.len() as u8);
        for tape in tapes {
            raw.extend_from_slice(&((tape.len() / EVENT_LEN) as u16).to_le_bytes());
            raw.extend_from_slice(tape);
        }
        raw
    }

    #[test]
    fn trig_is_close() {
        assert_eq!(sin(0), 0);
        assert_eq!(sin(256), ONE);
        assert_eq!(cos(0), ONE);
        assert_eq!(sin(768), -ONE);
        assert!((sin(128) - 724).abs() <= 3);
    }

    #[test]
    fn bots_finish_every_road() {
        for seed in 0..40u64 {
            let (race, _) = bot_race(seed * 7919 + 3, 2);
            for car in &race.cars[..2] {
                assert!(car.finished.is_some(), "seed {seed}: a bot never finished, lap {}", car.lap);
            }
        }
    }

    #[test]
    fn replay_matches_the_live_race() {
        for seed in [1u64, 42, 9_000_001] {
            for count in 1..=MAX_CARS {
                let (live, tapes) = bot_race(seed, count);
                let replayed = replay_encoded(&encode(seed, &tapes)).unwrap();
                assert_eq!(live, replayed);
                assert_eq!(live.places(), replayed.places());
            }
        }
    }

    #[test]
    fn cars_bump() {
        // Two cars driven at each other from the grid must never overlap after a tick.
        let mut race = Race::seeded(5, 2);
        let mut touched = false;
        for _ in 0..200 {
            let inputs = [RIGHT, LEFT];
            race.step(&inputs);
            let (a, b) = (race.cars[0], race.cars[1]);
            let d2 = (a.x - b.x).pow(2) + (a.y - b.y).pow(2);
            if d2 < (2 * CAR_RADIUS + 2 * SCALE).pow(2) {
                touched = true;
            }
            assert!(d2 >= (2 * CAR_RADIUS - 2 * SCALE).pow(2), "cars overlap at tick {}", race.tick);
        }
        assert!(touched, "the cars never met");
    }

    #[test]
    fn a_car_left_on_the_grid_comes_last() {
        let seed = 77;
        let (_, tapes) = bot_race(seed, 2);
        let parked = [tapes[0].clone(), [0u8, 0, BRAKE].to_vec()];
        let race = replay_encoded(&encode(seed, &parked)).unwrap();
        assert_eq!(race.places()[..2], [0, 1]);
    }

    #[test]
    fn bad_records_are_refused() {
        let seed = 3;
        assert_eq!(replay_encoded(&encode(seed, &[])), Err(RaceError::Cars));
        assert_eq!(replay_encoded(&encode(seed, &[[5, 0, 1, 5, 0, 2].to_vec()])), Err(RaceError::Events));
        assert_eq!(replay_encoded(&encode(seed, &[[0, 0, 32].to_vec()])), Err(RaceError::Events));
        let late = (MAX_TICKS as u16).to_le_bytes();
        assert_eq!(replay_encoded(&encode(seed, &[[late[0], late[1], 1].to_vec()])), Err(RaceError::Events));
        let mut extra = encode(seed, &[Vec::new()]);
        extra.push(0);
        assert_eq!(replay_encoded(&extra), Err(RaceError::Length));
    }

    #[test]
    fn a_match_is_judged_on_its_map_and_finishes() {
        let (live, tapes) = bot_race_on(map_track(1).unwrap(), 5);
        let mut raw = encode(0, &tapes);
        raw.drain(..7);
        raw[0] = 1;
        let race = replay_map(&raw).unwrap();
        assert_eq!(race, live);
        for (i, result) in race.results()[..5].iter().enumerate() {
            assert_eq!(*result & !FINISHED, race.places()[i]);
            assert_eq!(*result & FINISHED != 0, race.cars[i].finished.is_some());
        }
        raw[0] = MAPS.len() as u8;
        assert_eq!(replay_map(&raw), Err(RaceError::Map));
    }

    #[test]
    fn bots_finish_every_map_five_up() {
        for map in 0..MAPS.len() as u8 {
            let (race, _) = bot_race_on(map_track(map).unwrap(), MAX_CARS);
            for (i, car) in race.cars.iter().enumerate() {
                assert!(car.finished.is_some(), "map {map}: bot {i} never finished, lap {}", car.lap);
            }
            std::println!("map {map}: last bot home at tick {:?}", race.cars.iter().map(|car| car.finished.unwrap()).max());
        }
    }

    /// How far along the road each point is from the start, in world units times `SCALE`.
    fn distances(track: &Track) -> Vec<i64> {
        let mut out = Vec::new();
        let mut d = 0;
        for i in 0..track.len {
            out.push(d);
            let (_, _, dx, dy) = track.segment(i);
            d += isqrt(dx * dx + dy * dy);
        }
        out.push(d);
        out
    }

    #[test]
    fn maps_are_drawn_apart() {
        // Parts of a road far apart along it stay far enough apart on the ground that their barriers
        // never touch. Close along the road is the same bend, which may fold as tight as it likes.
        for (map, points) in MAPS.iter().enumerate() {
            let track = map_track(map as u8).unwrap();
            assert_eq!(track.len, points.len());
            assert!(track.len <= MAX_POINTS);
            let along = distances(&track);
            let lap = along[track.len];
            for i in 0..track.len {
                let (_, _, dx, dy) = track.segment(i);
                assert!(dx * dx + dy * dy >= (16 * SCALE).pow(2), "map {map}: segment {i} is too short");
                for j in 0..track.len {
                    // The nearer end of segment j, along the road, either way round.
                    let gap = [along[j], along[j + 1]].iter().map(|at| (at - along[i]).rem_euclid(lap)).map(|d| d.min(lap - d)).min().unwrap();
                    if gap < 300 * SCALE {
                        continue;
                    }
                    let (_, _, d2) = track.nearest(j, track.x[i], track.y[i]);
                    assert!(d2 >= (2 * WALL + 20 * SCALE).pow(2), "map {map}: point {i} comes too close to segment {j}");
                }
            }
        }
    }

    #[test]
    fn the_barrier_is_where_the_whole_road_says() {
        // Anywhere up to the barrier beside a segment, the search round that segment finds the same
        // nearest point of the road as a search of all of it: no barrier inside a bend.
        for map in 0..MAPS.len() as u8 {
            let track = map_track(map).unwrap();
            for i in 0..track.len {
                let (ax, ay, dx, dy) = track.segment(i);
                let len = isqrt(dx * dx + dy * dy).max(1);
                for step in 0..=10 {
                    for off in (-WALL..=WALL).step_by((5 * SCALE) as usize) {
                        let px = ax + dx * step / 10 - dy * off / len;
                        let py = ay + dy * step / 10 + dx * off / len;
                        let whole = (0..track.len).map(|j| track.nearest(j, px, py).2).min().unwrap();
                        if whole > WALL * WALL {
                            continue;
                        }
                        assert_eq!(track.closest(i, px, py).2, whole, "map {map}: beside segment {i}, step {step}, off {off}");
                    }
                }
            }
        }
    }

    /// Two cars on Harbour Loop's first straight, car 0 a little behind car 1 in the same lane.
    fn nose_to_tail(gap: i64) -> Race {
        let mut race = Race::on_map(0, 2).unwrap();
        let heading = race.cars[0].heading;
        race.cars[1] = Car { x: race.cars[0].x + gap * SCALE, y: race.cars[0].y, ..race.cars[1] };
        race.cars[1].heading = heading;
        race
    }

    #[test]
    fn the_rammed_car_takes_the_hardest_hit() {
        let mut race = nose_to_tail(60);
        race.cars[0].speed = BOOST_SPEED;
        for _ in 0..10 {
            race.step(&[0, BRAKE]);
        }
        let (rear, front) = (race.cars[0].hp, race.cars[1].hp);
        assert!(front < rear && rear < MAX_HP, "rear {rear}, front {front}");
    }

    #[test]
    fn the_barrier_hurts() {
        let mut race = Race::on_map(0, 1).unwrap();
        while race.cars[0].hp == MAX_HP && !race.over() {
            race.step(&[LEFT]);
        }
        assert!(race.cars[0].hp < MAX_HP, "never hurt by the barrier");
    }

    #[test]
    fn a_wreck_sits_out_then_comes_back() {
        let mut race = nose_to_tail(300);
        race.cars[0].hurt(MAX_HP as i64);
        assert_eq!(race.cars[0].wreck_ticks, WRECK_TICKS);
        let at = (race.cars[0].x, race.cars[0].y);
        for _ in 0..WRECK_TICKS - 1 {
            race.step(&[BOOST, BRAKE]);
            assert_eq!((race.cars[0].x, race.cars[0].y, race.cars[0].speed), (at.0, at.1, 0), "a wreck moved");
        }
        race.step(&[0, BRAKE]);
        let car = race.cars[0];
        assert_eq!((car.hp, car.wreck_ticks, car.ghost_ticks, car.speed), (MAX_HP, 0, GHOST_TICKS, 0));
        // Back on the middle line, and its boosts kept.
        assert_eq!(race.track.closest(car.seg, car.x, car.y).2, 0);
        assert_eq!(car.boosts, BOOSTS);
        // It drives straight through the car in front while it is a ghost, and touches it after.
        race.cars[1].x = car.x + 10 * SCALE;
        race.cars[1].y = car.y;
        race.step(&[0, BRAKE]);
        assert_eq!(race.cars[1].hp, MAX_HP);
        for _ in 0..GHOST_TICKS {
            race.step(&[0, BRAKE]);
        }
        assert!(!race.cars[0].untouchable());
    }

    #[test]
    fn rammed_again_and_again_a_car_is_wrecked() {
        let mut race = nose_to_tail(60);
        let mut wrecked = false;
        for _ in 0..400 {
            if race.cars[0].speed < MAX_SPEED && race.cars[0].wreck_ticks == 0 {
                // Back off, then come again at full boost.
                race.cars[0].x = race.cars[1].x - 60 * SCALE;
                race.cars[0].y = race.cars[1].y;
                race.cars[0].heading = race.cars[1].heading;
                race.cars[0].speed = BOOST_SPEED;
            }
            race.step(&[0, BRAKE]);
            wrecked |= race.cars[1].wreck_ticks > 0;
        }
        assert!(wrecked, "the car in front was never wrecked");
    }

    #[test]
    fn a_pad_gives_its_item_and_a_shard_then_sits_empty() {
        let mut race = nose_to_tail(300);
        let pad = race.pads[0];
        race.cars[0].x = pad.x;
        race.cars[0].y = pad.y;
        race.step(&[BRAKE, BRAKE]);
        assert_eq!((race.cars[0].item, race.cars[0].shards), (pad.item, 1));
        assert_eq!(race.pads[0].empty_ticks, PAD_TICKS);
        // A second car over the empty pad gets nothing; hands already full still get the shard.
        race.cars[1].x = pad.x;
        race.cars[1].y = pad.y;
        race.step(&[BRAKE, BRAKE]);
        assert_eq!((race.cars[1].item, race.cars[1].shards), (NO_ITEM, 0));
    }

    /// Car 0 fires `item` with car 1 `gap` world units ahead of it.
    fn fire(item: u8, gap: i64) -> Race {
        let mut race = nose_to_tail(gap);
        race.cars[0].item = item;
        race.step(&[USE, BRAKE]);
        race
    }

    #[test]
    fn a_jolt_hits_the_car_ahead_unless_its_ward_is_up() {
        let race = fire(JOLT, 50);
        assert_eq!(race.cars[1].hp, MAX_HP - JOLT_DAMAGE as u8);
        assert_eq!(race.cars[0].item, NO_ITEM);
        // Out of reach: nothing happens and the Jolt stays in hand.
        assert_eq!(fire(JOLT, 300).cars[0].item, JOLT);
        let mut race = nose_to_tail(50);
        race.cars[0].item = JOLT;
        race.cars[1].ward_ticks = WARD_TICKS;
        race.step(&[USE, BRAKE]);
        assert_eq!((race.cars[1].hp, race.cars[1].ward_ticks), (MAX_HP, 0));
    }

    #[test]
    fn a_ram_hurts_and_shoves_the_first_car_it_touches() {
        let mut race = fire(RAM, 40);
        for _ in 0..RAM_TICKS {
            race.step(&[0, BRAKE]);
        }
        assert!(race.cars[1].hp <= MAX_HP - RAM_DAMAGE as u8, "hp {}", race.cars[1].hp);
        assert_eq!(race.cars[0].ram_ticks, 0);
        // The ram costs the rammer nothing; only the bumps after it, which are small.
        assert!(race.cars[0].hp > race.cars[1].hp + 15, "rammer {}, rammed {}", race.cars[0].hp, race.cars[1].hp);
    }

    #[test]
    fn a_slick_stops_the_next_car_steering() {
        // Car 1 drops it, car 0 drives onto it from behind.
        let mut race = nose_to_tail(80);
        race.cars[1].item = SLICK;
        race.step(&[0, USE]);
        let slick = race.hazards[2];
        assert_eq!((slick.kind, slick.owner), (SLICK, 1));
        let mut slipped = false;
        for _ in 0..60 {
            let (heading, slipping) = (race.cars[0].heading, race.cars[0].slip_ticks > 0);
            race.step(&[LEFT, BRAKE]);
            if slipping {
                slipped = true;
                assert_eq!(race.cars[0].heading, heading, "steered on a Slick");
            }
        }
        assert!(slipped, "never reached the Slick");
    }

    #[test]
    fn a_barricade_bounces_the_first_car_and_breaks() {
        let mut race = nose_to_tail(80);
        race.cars[1].item = BARRICADE;
        race.step(&[0, USE]);
        assert_eq!(race.hazards[3].kind, BARRICADE);
        while race.hazards[3].ticks > 0 && race.tick < 100 {
            race.step(&[0, BRAKE]);
        }
        assert_eq!(race.hazards[3].ticks, 0, "never hit");
        assert!(race.cars[0].hp <= MAX_HP - BARRICADE_DAMAGE as u8);
    }

    #[test]
    fn rush_ward_patch_and_draft_do_their_work() {
        let mut race = fire(RUSH, 300);
        for _ in 0..RUSH_TICKS - 1 {
            race.step(&[0, BRAKE]);
        }
        assert!(race.cars[0].speed > BOOST_SPEED, "rush reached {}", race.cars[0].speed);

        assert_eq!(fire(WARD, 300).cars[0].ward_ticks, WARD_TICKS - 1);

        let mut race = nose_to_tail(300);
        race.cars[0].hp = 30;
        race.cars[0].item = PATCH;
        race.step(&[USE, BRAKE]);
        assert_eq!(race.cars[0].hp, 30 + PATCH_HP);

        // Close behind a car, a Draft lifts the top speed past the normal one.
        let mut race = fire(DRAFT, 120);
        let mut top = 0;
        for _ in 0..DRAFT_TICKS - 2 {
            race.cars[1].x = race.cars[0].x + 60 * SCALE;
            race.step(&[0, 0]);
            top = top.max(race.cars[0].speed);
        }
        assert!(top > MAX_SPEED, "draft top {top}");
    }

    #[test]
    fn bots_pick_up_and_fire_items() {
        let (race, tapes) = bot_race_on(map_track(0).unwrap(), MAX_CARS);
        let shards: u32 = race.cars.iter().map(|car| car.shards as u32).sum();
        assert!(shards >= 10, "only {shards} shards");
        assert!(tapes.iter().any(|tape| tape.chunks(EVENT_LEN).any(|event| event[2] & USE != 0)), "no bot fired an item");
    }

    #[test]
    fn the_wall_holds() {
        // Steering hard one way the whole race never leaves the barrier.
        let mut race = Race::seeded(11, 1);
        while !race.over() {
            race.step(&[LEFT]);
            let car = race.cars[0];
            let (_, _, d2) = race.track.closest(car.seg, car.x, car.y);
            assert!(d2 <= (WALL + SCALE).pow(2));
        }
    }
}

