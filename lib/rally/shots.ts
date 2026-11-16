import { loadRally, type RallyRunner } from '@/lib/rally/rules';
import type { RallyView3D } from '@/lib/rally/view3d';

/**
 * Still 3D pictures of the real maps, taken from a real race: the bots drive `ticks` ticks from the
 * grid, then the camera looks from where the shot says. One hidden renderer takes every picture in
 * turn, so a page full of pictures costs one WebGL context.
 */
export type Shot = { map: number; cars: number; ticks: number; view: 'chase' | 'side'; car?: number };

const WIDTH = 960;
const HEIGHT = 600;

let maker: Promise<{ runner: RallyRunner; view: RallyView3D }> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const taken = new Map<string, Promise<string>>();

function startMaker() {
  maker ??= Promise.all([loadRally(), import('@/lib/rally/view3d')]).then(([runner, { RallyView3D }]) => {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:fixed;left:-${WIDTH * 2}px;top:0;width:${WIDTH}px;height:${HEIGHT}px;pointer-events:none`;
    document.body.appendChild(box);
    return { runner, view: new RallyView3D(box) };
  });
  return maker;
}

/** A JPEG data URL of the shot, taken once per page load. */
export function shotOf(shot: Shot): Promise<string> {
  const key = `${shot.map}:${shot.cars}:${shot.ticks}:${shot.view}:${shot.car ?? 0}`;
  let picture = taken.get(key);
  if (!picture) {
    picture = queue.then(async () => {
      const { runner, view } = await startMaker();
      runner.start(0, shot.map, shot.cars);
      for (let tick = 0; tick < shot.ticks && !runner.over(0); tick += 1) {
        runner.step(0, Array.from({ length: shot.cars }, (_, i) => runner.bot(0, i)));
      }
      const frame = {
        track: runner.track(0),
        cars: Array.from({ length: shot.cars }, (_, i) => runner.car(0, i)),
        me: shot.car ?? 0,
        map: shot.map,
        pads: runner.pads(0),
        hazards: runner.hazards(0),
      };
      const picture = view.still(frame, shot.view);
      if (!picture) throw new Error('No car to look from');
      return picture;
    });
    queue = picture.catch(() => undefined);
    taken.set(key, picture);
  }
  return picture;
}
