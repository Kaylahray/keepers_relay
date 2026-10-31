type Step = { readonly title: string; readonly body: string };

export const CROWN_STEPS = [
  { title: 'Pay the entry', body: 'Join any crown for its entry fee.' },
  { title: 'Drive 5 laps', body: 'Dodge the road blocks. Grab the coins.' },
  { title: 'Beat the best score', body: 'Your entry joins the pot and the clock gets shorter.' },
  { title: 'Hold it at zero', body: 'Still on top when the clock runs out? The whole pot is yours.' },
] as const;

export const DUEL_STEPS = [
  { title: 'Challenge a player', body: 'Pick Artillery or Lane race, and a stake.' },
  { title: 'Both lock the same stake', body: 'It sits in a smart contract, not with us.' },
  { title: 'Play. Winner takes both', body: 'A draw sends each stake back.' },
] as const;

export const FAIR_PLAY_FACTS = [
  'Your stake goes into a smart contract, never to us.',
  'Every move is recorded on the chain.',
  'The chain replays the whole game and pays the real winner.',
];

/** Numbered steps joined by a line, in the mode's colour. */
export function StepList({ steps, tone }: { steps: readonly Step[]; tone: 'lime' | 'pink' }) {
  const accent = tone === 'lime' ? 'bg-lime text-ink' : 'bg-pink text-ink';
  const line = tone === 'lime' ? 'bg-lime/30' : 'bg-pink/30';
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        return (
          <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
            {i < steps.length - 1 ? <span className={`absolute left-[23px] top-12 h-[calc(100%-48px)] w-0.5 ${line}`} aria-hidden="true" /> : null}
            <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-poster text-lg font-black ${accent}`}>{i + 1}</span>
            <div className="pt-1">
              <h4 className="font-poster text-sm font-bold uppercase">{s.title}</h4>
              <p className="mt-1 text-sm text-mute">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
