//! Crown Depths. One set of rules, compiled to wasm for the browser that plays it and to RISC-V for
//! the script that referees it. Integer maths only, no allocation, no floats, so both targets reach
//! the same score from the same moves.
//!
//! A run is 4 floors, played in real time on a grid. Each floor is 3 by 3 rooms of 5 by 5 tiles,
//! joined by doors. The player steps one tile at a time; monsters step on their own timers and
//! chase the player around the room they share. Bumping a monster hits it. The torch burns down,
//! and a floor ends when the player takes the stairs. If the torch dies or the player falls, the
//! run ends and keeps its points.
//!
//! The floor reacts to the player: a room's monsters only take their places when the player first
//! walks in, and where they stand depends on the tick they walked in on.
//!
//! After floors 1 to 3 the player picks a relic and the next stairs, safe or deep. Deep floors hold
//! more monsters and more gold, and pay a bonus for clearing them. Relics last for the whole run.
//!
//! A floor's moves: events of 3 bytes, `tick u16 LE ‖ direction u8`, ticks strictly increasing and
//! counted from the floor's start, each one a step the player could take. A cleared floor before
//! the last ends with its picks, `relic u8 ‖ stairs u8`. Any other floor ends with no picks, so a
//! floor's length mod 3 says whether it has them.

#![no_std]

pub const TICK_HZ: u32 = 10;
pub const FLOORS: usize = 4;
/// The torch: a floor lasts at most this long, plus the Lantern's bonus.
pub const FLOOR_TICKS: u32 = 60 * TICK_HZ;
pub const LANTERN_TICKS: u32 = 20 * TICK_HZ;
/// How long a floor may take to lock, from the block its map came from.
pub const LAP_WINDOW_MS: u32 = 3 * 60 * 1000;
/// The least a steal can leave on the clock after its last locked floor: time for a full run.
pub const MIN_LEFT_MS: u32 = 10 * 60 * 1000;

pub const ROOMS: i32 = 3;
pub const ROOM: i32 = 5;
pub const CELL: i32 = ROOM + 1;
pub const MAP: i32 = ROOMS * CELL + 1;
pub const ROOM_COUNT: usize = (ROOMS * ROOMS) as usize;
pub const MAX_MONSTERS: usize = 4;
pub const EVENT_LEN: usize = 3;
pub const PICK_LEN: usize = 2;
pub const MAX_EVENTS: usize = (FLOOR_TICKS + LANTERN_TICKS) as usize;

pub const UP: u8 = 0;
pub const RIGHT: u8 = 1;
pub const DOWN: u8 = 2;
pub const LEFT: u8 = 3;

pub const WALL: u8 = 0;
pub const FLOOR: u8 = 1;
pub const DOOR: u8 = 2;
pub const STAIRS: u8 = 3;

pub const NOTHING: u8 = 0;
pub const GOLD: u8 = 1;
pub const KEY: u8 = 2;
pub const CHEST: u8 = 3;
pub const SHRINE: u8 = 4;

pub const SLIME: u8 = 0;
pub const BAT: u8 = 1;
pub const KNIGHT: u8 = 2;

pub const SWORD: u8 = 0;
pub const ARMOR: u8 = 1;
pub const BOOTS: u8 = 2;
pub const LANTERN: u8 = 3;
pub const GREED: u8 = 4;
pub const RELICS: u8 = 5;

pub const SAFE: u8 = 0;
pub const DEEP: u8 = 1;

pub const START_HP: i32 = 10;
pub const STEP_TICKS: u32 = 2;
/// After a hit the player can't be hit again for this long.
pub const GUARD_TICKS: u32 = 10;
pub const GOLD_POINTS: u64 = 10;
pub const CHEST_POINTS: u64 = 60;
pub const SHRINE_HEAL: i32 = 3;
/// Health back at the start of each floor after the first.
pub const FLOOR_HEAL: i32 = 2;
pub const ARMOR_HP: i32 = 2;
pub const CLEAR_POINTS: u64 = 100;
pub const DEEP_POINTS: u64 = 150;
/// Points per whole second of torch left when the stairs are taken.
pub const TORCH_POINTS: u64 = 5;

/// This game's rules for the money scripts: `laps u8 ‖ lap window ms u32 LE ‖ min left ms u32 LE`.
pub fn rules() -> [u8; 9] {
    let mut raw = [0u8; 9];
    raw[0] = FLOORS as u8;
    raw[1..5].copy_from_slice(&LAP_WINDOW_MS.to_le_bytes());
    raw[5..9].copy_from_slice(&MIN_LEFT_MS.to_le_bytes());
    raw
}

/// How a monster plays: hit points, ticks between steps, damage, points for beating it.
pub const fn monster_stats(kind: u8) -> (i32, u32, i32, u64) {
    match kind {
        SLIME => (1, 6, 1, 10),
        BAT => (1, 3, 1, 15),
        _ => (2, 5, 2, 30),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunError {
    /// No floors, or more than `FLOORS`.
    Floors,
    /// Bytes cut short, left over, or a length that is neither events nor events and picks.
    Length,
    /// A step out of order, too soon after the last one, into a wall, or after the floor ended.
    Step,
    /// Picks missing, not allowed, or not legal.
    Picks,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Outcome {
    pub score: u64,
    pub gold: u32,
    pub slain: u32,
    pub floors: u32,
    pub fallen: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Monster {
    pub x: i32,
    pub y: i32,
    pub kind: u8,
    pub hp: i32,
    /// Placed when the player first walks into its room.
    pub placed: bool,
}

fn mix(a: u64, b: u64) -> u64 {
    let mut z = a ^ b.wrapping_add(1).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        mix(self.0, 0)
    }

    fn below(&mut self, n: u32) -> u32 {
        (self.next() >> 33) as u32 % n
    }
}

/// The room a tile belongs to. A door belongs to the room right of it or below it.
pub fn room_of(x: i32, y: i32) -> usize {
    ((y / CELL).min(ROOMS - 1) * ROOMS + (x / CELL).min(ROOMS - 1)) as usize
}

/// The middle tile of a room.
pub fn room_center(room: usize) -> (i32, i32) {
    let (rx, ry) = (room as i32 % ROOMS, room as i32 / ROOMS);
    (rx * CELL + 3, ry * CELL + 3)
}

fn step_to(x: i32, y: i32, dir: u8) -> (i32, i32) {
    match dir {
        UP => (x, y - 1),
        RIGHT => (x + 1, y),
        DOWN => (x, y + 1),
        _ => (x - 1, y),
    }
}

#[derive(Clone, Debug)]
pub struct Depths {
    seed: u64,
    floor: u8,
    stairs_kind: u8,
    tiles: [[u8; MAP as usize]; MAP as usize],
    items: [[u8; MAP as usize]; MAP as usize],
    monsters: [[Monster; MAX_MONSTERS]; ROOM_COUNT],
    counts: [u8; ROOM_COUNT],
    seen: u16,
    tick: u32,
    torch: u32,
    x: i32,
    y: i32,
    hp: i32,
    max_hp: i32,
    attack: i32,
    owned: u8,
    has_key: bool,
    next_step: u32,
    guarded_until: u32,
    score: u64,
    gold: u32,
    slain: u32,
    floors: u32,
    cleared: bool,
    fallen: bool,
}

impl Depths {
    /// A new run on its first floor, which is always safe.
    pub fn new(seed: u64) -> Self {
        let mut run = Depths {
            seed,
            floor: 0,
            stairs_kind: SAFE,
            tiles: [[WALL; MAP as usize]; MAP as usize],
            items: [[NOTHING; MAP as usize]; MAP as usize],
            monsters: [[Monster::default(); MAX_MONSTERS]; ROOM_COUNT],
            counts: [0; ROOM_COUNT],
            seen: 0,
            tick: 0,
            torch: FLOOR_TICKS,
            x: 0,
            y: 0,
            hp: START_HP,
            max_hp: START_HP,
            attack: 1,
            owned: 0,
            has_key: false,
            next_step: 0,
            guarded_until: 0,
            score: 0,
            gold: 0,
            slain: 0,
            floors: 0,
            cleared: false,
            fallen: false,
        };
        run.build();
        run
    }

    /// Goes down to the next floor, built from `seed`. Everything the player carries comes along.
    pub fn descend(&mut self, seed: u64) {
        self.seed = seed;
        self.floor += 1;
        self.hp = (self.hp + FLOOR_HEAL).min(self.max_hp);
        self.build();
    }

    fn build(&mut self) {
        let mut rng = Rng(mix(self.seed, self.floor as u64));
        self.tiles = [[WALL; MAP as usize]; MAP as usize];
        self.items = [[NOTHING; MAP as usize]; MAP as usize];
        self.monsters = [[Monster::default(); MAX_MONSTERS]; ROOM_COUNT];
        self.counts = [0; ROOM_COUNT];
        for room in 0..ROOM_COUNT {
            let (cx, cy) = room_center(room);
            for y in cy - 2..=cy + 2 {
                for x in cx - 2..=cx + 2 {
                    self.tiles[y as usize][x as usize] = FLOOR;
                }
            }
        }
        // A random spanning tree of doors from the start room, then one extra door for a loop.
        let corners = [0usize, 2, 6, 8];
        let start = corners[rng.below(4) as usize];
        let mut joined: u16 = 1 << start;
        let mut stack = [0usize; ROOM_COUNT];
        let mut depth = 1;
        stack[0] = start;
        while depth > 0 {
            let room = stack[depth - 1];
            let mut options = [0usize; 4];
            let mut n = 0;
            for next in neighbours(room).into_iter().flatten() {
                if joined & (1 << next) == 0 {
                    options[n] = next;
                    n += 1;
                }
            }
            if n == 0 {
                depth -= 1;
                continue;
            }
            let next = options[rng.below(n as u32) as usize];
            self.open_door(room, next);
            joined |= 1 << next;
            stack[depth] = next;
            depth += 1;
        }
        let extra = rng.below(ROOM_COUNT as u32) as usize;
        if let Some(next) = neighbours(extra).into_iter().flatten().nth(rng.below(2) as usize) {
            self.open_door(extra, next);
        }
        let stairs = self.farthest(start);
        let (sx, sy) = room_center(stairs);
        self.tiles[sy as usize][sx as usize] = STAIRS;

        let deep = self.stairs_kind == DEEP;
        let key_room = self.other_room(&mut rng, start, stairs);
        let chest_room = self.other_room(&mut rng, start, key_room);
        let shrine_room = if rng.below(2) == 0 { Some(self.other_room(&mut rng, start, stairs)) } else { None };
        for room in 0..ROOM_COUNT {
            if room == start {
                continue;
            }
            let piles = rng.below(3) + deep as u32;
            for _ in 0..piles {
                self.place_item(&mut rng, room, GOLD);
            }
            if room == key_room {
                self.place_item(&mut rng, room, KEY);
            }
            if room == chest_room {
                self.place_item(&mut rng, room, CHEST);
            }
            if Some(room) == shrine_room {
                self.place_item(&mut rng, room, SHRINE);
            }
            let count = (rng.below(2 + self.floor as u32 / 2) + deep as u32).min(MAX_MONSTERS as u32);
            self.counts[room] = count as u8;
            for slot in 0..count as usize {
                let roll = rng.below(100);
                let knight = 10 + 15 * self.floor as u32 + 15 * deep as u32;
                let kind = if roll < knight { KNIGHT } else if roll < knight + 35 { BAT } else { SLIME };
                self.monsters[room][slot] = Monster { kind, hp: monster_stats(kind).0, ..Monster::default() };
            }
        }
        let (px, py) = room_center(start);
        self.x = px;
        self.y = py;
        self.seen = 1 << start;
        self.tick = 0;
        self.torch = FLOOR_TICKS + if self.owns(LANTERN) { LANTERN_TICKS } else { 0 };
        self.next_step = 0;
        self.guarded_until = 0;
        self.has_key = false;
        self.cleared = false;
    }

    fn open_door(&mut self, a: usize, b: usize) {
        let (low, high) = (a.min(b), a.max(b));
        let (cx, cy) = room_center(low);
        let (dx, dy) = if high == low + 1 { (cx + 3, cy) } else { (cx, cy + 3) };
        self.tiles[dy as usize][dx as usize] = DOOR;
    }

    fn door_between(&self, a: usize, b: usize) -> bool {
        let (low, high) = (a.min(b), a.max(b));
        let (cx, cy) = room_center(low);
        let (dx, dy) = if high == low + 1 { (cx + 3, cy) } else { (cx, cy + 3) };
        self.tiles[dy as usize][dx as usize] == DOOR
    }

    /// The room the most doors away from `start`; the first one found on a tie.
    fn farthest(&self, start: usize) -> usize {
        let mut dist = [u8::MAX; ROOM_COUNT];
        let mut queue = [0usize; ROOM_COUNT];
        let (mut head, mut tail) = (0, 1);
        queue[0] = start;
        dist[start] = 0;
        let mut far = start;
        while head < tail {
            let room = queue[head];
            head += 1;
            if dist[room] > dist[far] {
                far = room;
            }
            for next in neighbours(room).into_iter().flatten() {
                if dist[next] == u8::MAX && self.door_between(room, next) {
                    dist[next] = dist[room] + 1;
                    queue[tail] = next;
                    tail += 1;
                }
            }
        }
        far
    }

    fn other_room(&self, rng: &mut Rng, a: usize, b: usize) -> usize {
        loop {
            let room = rng.below(ROOM_COUNT as u32) as usize;
            if room != a && room != b {
                return room;
            }
        }
    }

    fn place_item(&mut self, rng: &mut Rng, room: usize, item: u8) {
        let (cx, cy) = room_center(room);
        for _ in 0..16 {
            let x = cx - 2 + rng.below(ROOM as u32) as i32;
            let y = cy - 2 + rng.below(ROOM as u32) as i32;
            if self.tiles[y as usize][x as usize] == FLOOR && self.items[y as usize][x as usize] == NOTHING {
                self.items[y as usize][x as usize] = item;
                return;
            }
        }
    }

    pub fn owns(&self, relic: u8) -> bool {
        self.owned & (1 << relic) != 0
    }

    fn mult(&self) -> u64 {
        if self.owns(GREED) { 2 } else { 1 }
    }

    /// Whether the floor is over: stairs taken, torch out, or the player fallen.
    pub fn floor_over(&self) -> bool {
        self.cleared || self.fallen || self.tick >= self.torch
    }

    /// Whether the player can step on this tick.
    pub fn can_step(&self) -> bool {
        !self.floor_over() && self.tick >= self.next_step
    }

    /// Whether a step in `dir` this tick would be legal: the browser only records legal steps.
    pub fn step_ok(&self, dir: u8) -> bool {
        if dir > LEFT || !self.can_step() {
            return false;
        }
        let (nx, ny) = step_to(self.x, self.y, dir);
        nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && self.tiles[ny as usize][nx as usize] != WALL
    }

    /// One tick. `dir` is this tick's step, or `None`. Returns false for an illegal step, which
    /// leaves the run unchanged.
    pub fn step(&mut self, dir: Option<u8>) -> bool {
        if self.floor_over() {
            return false;
        }
        if let Some(dir) = dir {
            if !self.step_ok(dir) {
                return false;
            }
            self.next_step = self.tick + if self.owns(BOOTS) { STEP_TICKS - 1 } else { STEP_TICKS };
            let (nx, ny) = step_to(self.x, self.y, dir);
            if let Some(slot) = self.monster_at(nx, ny) {
                self.hit(slot, nx, ny);
            } else {
                self.x = nx;
                self.y = ny;
                self.enter();
                self.collect();
            }
        }
        if !self.cleared {
            self.monsters_act();
        }
        self.tick += 1;
        true
    }

    fn monster_at(&self, x: i32, y: i32) -> Option<usize> {
        let room = room_of(x, y);
        self.monsters[room][..self.counts[room] as usize]
            .iter()
            .position(|m| m.placed && m.hp > 0 && m.x == x && m.y == y)
    }

    fn hit(&mut self, slot: usize, x: i32, y: i32) {
        let room = room_of(x, y);
        let attack = self.attack + self.owns(SWORD) as i32;
        let monster = &mut self.monsters[room][slot];
        monster.hp -= attack;
        if monster.hp <= 0 {
            self.score += monster_stats(monster.kind).3;
            self.slain += 1;
        }
    }

    /// The first time the player walks into a room, its monsters take their places. Where they
    /// stand depends on the tick, so a floor can't be fully planned from its seed alone.
    fn enter(&mut self) {
        if self.tiles[self.y as usize][self.x as usize] == DOOR {
            return;
        }
        let room = room_of(self.x, self.y);
        if self.seen & (1 << room) != 0 {
            return;
        }
        self.seen |= 1 << room;
        let mut rng = Rng(mix(self.seed, ((self.floor as u64) << 40) | ((room as u64) << 32) | self.tick as u64));
        let (cx, cy) = room_center(room);
        for slot in 0..self.counts[room] as usize {
            for _ in 0..24 {
                let x = cx - 2 + rng.below(ROOM as u32) as i32;
                let y = cy - 2 + rng.below(ROOM as u32) as i32;
                let far = (x - self.x).abs().max((y - self.y).abs()) >= 2;
                if far && self.tiles[y as usize][x as usize] == FLOOR && self.monster_at(x, y).is_none() {
                    let monster = &mut self.monsters[room][slot];
                    monster.x = x;
                    monster.y = y;
                    monster.placed = true;
                    break;
                }
            }
        }
    }

    fn collect(&mut self) {
        let (x, y) = (self.x as usize, self.y as usize);
        if self.tiles[y][x] == STAIRS {
            self.clear();
            return;
        }
        match self.items[y][x] {
            GOLD => {
                self.score += GOLD_POINTS * self.mult();
                self.gold += 1;
                self.items[y][x] = NOTHING;
            }
            KEY => {
                self.has_key = true;
                self.items[y][x] = NOTHING;
            }
            CHEST if self.has_key => {
                self.score += CHEST_POINTS * self.mult();
                self.gold += 1;
                self.has_key = false;
                self.items[y][x] = NOTHING;
            }
            SHRINE => {
                self.hp = (self.hp + SHRINE_HEAL).min(self.max_hp);
                self.items[y][x] = NOTHING;
            }
            _ => {}
        }
    }

    fn clear(&mut self) {
        self.cleared = true;
        self.floors += 1;
        let seconds_left = (self.torch - self.tick) / TICK_HZ;
        self.score += CLEAR_POINTS * (self.floor as u64 + 1) + TORCH_POINTS * seconds_left as u64;
        if self.stairs_kind == DEEP {
            self.score += DEEP_POINTS * self.floor as u64;
        }
    }

    /// Monsters in the player's room step toward the player on their own timers. A monster that
    /// would step onto the player hits them instead. Monsters never leave their room.
    fn monsters_act(&mut self) {
        let room = room_of(self.x, self.y);
        if self.tiles[self.y as usize][self.x as usize] == DOOR {
            return;
        }
        for slot in 0..self.counts[room] as usize {
            let monster = self.monsters[room][slot];
            if !monster.placed || monster.hp <= 0 {
                continue;
            }
            let (_, every, damage, _) = monster_stats(monster.kind);
            if (self.tick + slot as u32) % every != 0 {
                continue;
            }
            let (dx, dy) = (self.x - monster.x, self.y - monster.y);
            let mut dirs = if dx.abs() >= dy.abs() {
                [if dx > 0 { RIGHT } else { LEFT }, if dy > 0 { DOWN } else { UP }]
            } else {
                [if dy > 0 { DOWN } else { UP }, if dx > 0 { RIGHT } else { LEFT }]
            };
            // Bats flutter: half their steps go a random way.
            if monster.kind == BAT {
                let roll = mix(self.seed, ((room as u64) << 48) | ((slot as u64) << 40) | self.tick as u64);
                if roll & 1 == 0 {
                    dirs = [(roll >> 8) as u8 & 3, (roll >> 16) as u8 & 3];
                }
            }
            for dir in dirs {
                let (nx, ny) = step_to(monster.x, monster.y, dir);
                if nx == self.x && ny == self.y {
                    if self.tick >= self.guarded_until {
                        self.hp -= damage;
                        self.guarded_until = self.tick + GUARD_TICKS;
                        if self.hp <= 0 {
                            self.fallen = true;
                        }
                    }
                    break;
                }
                let inside = room_of(nx, ny) == room && self.tiles[ny as usize][nx as usize] == FLOOR;
                if inside && self.monster_at(nx, ny).is_none() {
                    self.monsters[room][slot].x = nx;
                    self.monsters[room][slot].y = ny;
                    break;
                }
            }
            if self.fallen {
                return;
            }
        }
    }

    /// Applies a cleared floor's picks: a relic not owned yet, and the next stairs.
    pub fn choose(&mut self, relic: u8, stairs: u8) -> Result<(), RunError> {
        if !self.cleared || relic >= RELICS || self.owns(relic) || stairs > DEEP {
            return Err(RunError::Picks);
        }
        self.owned |= 1 << relic;
        if relic == ARMOR {
            self.max_hp += ARMOR_HP;
            self.hp += ARMOR_HP;
        }
        self.stairs_kind = stairs;
        Ok(())
    }

    pub fn outcome(&self) -> Outcome {
        Outcome { score: self.score, gold: self.gold, slain: self.slain, floors: self.floors, fallen: self.fallen }
    }

    pub fn floor(&self) -> u8 {
        self.floor
    }
    pub fn stairs_kind(&self) -> u8 {
        self.stairs_kind
    }
    pub fn tick(&self) -> u32 {
        self.tick
    }
    pub fn torch(&self) -> u32 {
        self.torch
    }
    pub fn x(&self) -> i32 {
        self.x
    }
    pub fn y(&self) -> i32 {
        self.y
    }
    pub fn hp(&self) -> i32 {
        self.hp
    }
    pub fn max_hp(&self) -> i32 {
        self.max_hp
    }
    pub fn owned(&self) -> u8 {
        self.owned
    }
    pub fn has_key(&self) -> bool {
        self.has_key
    }
    pub fn score(&self) -> u64 {
        self.score
    }
    pub fn cleared(&self) -> bool {
        self.cleared
    }
    pub fn fallen(&self) -> bool {
        self.fallen
    }
    pub fn guarded(&self) -> bool {
        self.tick < self.guarded_until
    }
    pub fn seen(&self, room: usize) -> bool {
        self.seen & (1 << room) != 0
    }
    pub fn tile(&self, x: i32, y: i32) -> u8 {
        self.tiles[y as usize][x as usize]
    }
    pub fn item(&self, x: i32, y: i32) -> u8 {
        self.items[y as usize][x as usize]
    }
    /// A room's monsters, placed or not, beaten ones included.
    pub fn monsters(&self, room: usize) -> &[Monster] {
        &self.monsters[room][..self.counts[room] as usize]
    }
}

fn neighbours(room: usize) -> [Option<usize>; 4] {
    let (rx, ry) = (room as i32 % ROOMS, room as i32 / ROOMS);
    let at = |x: i32, y: i32| if (0..ROOMS).contains(&x) && (0..ROOMS).contains(&y) { Some((y * ROOMS + x) as usize) } else { None };
    [at(rx, ry - 1), at(rx + 1, ry), at(rx, ry + 1), at(rx - 1, ry)]
}

/// One floor of a run, as the chain hands it over: its seed, then its moves and picks.
#[derive(Clone, Copy, Debug, Default)]
pub struct Floor<'a> {
    pub seed: u64,
    pub moves: &'a [u8],
}

/// Replays a whole run, floor by floor.
pub fn replay_floors(floors: &[Floor]) -> Result<Outcome, RunError> {
    if floors.is_empty() || floors.len() > FLOORS {
        return Err(RunError::Floors);
    }
    let mut run = Depths::new(floors[0].seed);
    for (k, floor) in floors.iter().enumerate() {
        if k > 0 {
            if !run.cleared() {
                return Err(RunError::Floors);
            }
            run.descend(floor.seed);
        }
        let picks = match floor.moves.len() % EVENT_LEN {
            0 => 0,
            PICK_LEN => PICK_LEN,
            _ => return Err(RunError::Length),
        };
        let events = &floor.moves[..floor.moves.len() - picks];
        let mut last: Option<u32> = None;
        for event in events.chunks_exact(EVENT_LEN) {
            let at = u16::from_le_bytes([event[0], event[1]]) as u32;
            if last.is_some_and(|t| at <= t) || run.floor_over() {
                return Err(RunError::Step);
            }
            while run.tick() < at {
                if !run.step(None) {
                    return Err(RunError::Step);
                }
            }
            if !run.step(Some(event[2])) {
                return Err(RunError::Step);
            }
            last = Some(at);
        }
        while !run.floor_over() {
            run.step(None);
        }
        let last_floor = k == FLOORS - 1;
        match (run.cleared() && !last_floor, picks) {
            (true, PICK_LEN) => {
                let tail = &floor.moves[floor.moves.len() - PICK_LEN..];
                run.choose(tail[0], tail[1])?;
            }
            (false, 0) => {}
            _ => return Err(RunError::Picks),
        }
        if !run.cleared() && k + 1 < floors.len() {
            return Err(RunError::Floors);
        }
    }
    Ok(run.outcome())
}

/// Replays a run in the form the money scripts send it: `floors u8`, then per floor
/// `seed u64 LE ‖ length u16 LE ‖ moves and picks`.
pub fn replay_encoded(raw: &[u8]) -> Result<Outcome, RunError> {
    let count = *raw.first().ok_or(RunError::Floors)? as usize;
    if count == 0 || count > FLOORS {
        return Err(RunError::Floors);
    }
    let mut floors = [Floor::default(); FLOORS];
    let mut at = 1;
    for floor in floors.iter_mut().take(count) {
        let head = raw.get(at..at + 10).ok_or(RunError::Length)?;
        let seed = u64::from_le_bytes(head[..8].try_into().unwrap());
        let len = u16::from_le_bytes([head[8], head[9]]) as usize;
        let moves = raw.get(at + 10..at + 10 + len).ok_or(RunError::Length)?;
        *floor = Floor { seed, moves };
        at += 10 + len;
    }
    if at != raw.len() {
        return Err(RunError::Length);
    }
    replay_floors(&floors[..count])
}
