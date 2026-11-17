export type TrackTheme = 'harbour' | 'switchback' | 'oldtown';

export type QualityLevel = 'high' | 'medium' | 'low';

export type CameraMode = 'chase' | 'topdown';

export type ItemType = 'ram' | 'slick' | 'jolt' | 'barricade' | 'crown';

export interface TrackPoint {
  x: number;
  y: number;
  elevation?: number;
}

export interface TrackData {
  id: string;
  name: string;
  subtitle: string;
  theme: TrackTheme;
  roadWidth: number;
  wallDistance: number;
  laps?: number;
  timeLimitSeconds?: number;
  points: TrackPoint[];
  /** Draw the centre line as straight lines with sharp corners, exactly as given, not smoothed. */
  sharpCorners?: boolean;
  /** Optional explicit water side offset hint for harbour theme ('left' | 'right' | 'outside') */
  waterSide?: 'left' | 'right' | 'outside';
}

export interface CarFrameState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  steer?: number;
  health: number;
  lap: number;
  place?: number;
  progress?: number;
  item: ItemType | null;
  finished: boolean;
  finishTime?: number | null;
  dnf?: boolean;
  boosting?: boolean;
  braking?: boolean;
  ramming?: boolean;
  crownActive?: boolean;
  jolted?: boolean;
  spinning?: boolean;
  wrecked?: boolean;
  warded?: boolean;
  drafting?: boolean;
  ghost?: boolean;
  isPlayer?: boolean;
}

export interface ItemBoxFrameState {
  id: string;
  x: number;
  y: number;
  active: boolean;
  /** The colour of the item this box gives. */
  color?: string;
  /** The rules' number for the item this box gives, which picks its shape. */
  item?: number;
  /** The pad's radius on the road, in metres. */
  radius?: number;
  /** A picture of the item, shown over the pad in place of its shape. */
  image?: string;
}

export interface HazardFrameState {
  id: string;
  type: 'slick' | 'barricade';
  x: number;
  y: number;
  angle: number;
  ownerId?: string;
  /** Width across, in metres. */
  size?: number;
}

export interface BoostPadFrameState {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface RaceEvent {
  type: 'collision' | 'boost' | 'pickup' | 'item' | 'jolt' | 'lap' | 'wreck' | 'finish' | 'countdown';
  x: number;
  y: number;
  carId?: string;
  intensity?: number;
  label?: string;
}

export interface RaceFrame {
  timeRemaining: number;
  elapsed: number;
  countdown: number;
  phase: 'countdown' | 'racing' | 'finished';
  cars: CarFrameState[];
  itemBoxes: ItemBoxFrameState[];
  hazards: HazardFrameState[];
  boostPads?: BoostPadFrameState[];
  events?: RaceEvent[];
}

export interface PlayerInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  useItem: boolean;
}
