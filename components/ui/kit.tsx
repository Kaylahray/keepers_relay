import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ART } from '@/lib/art';

/** A CKB amount: big gold number, small unit. */
const CKB_NUM = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl md:text-3xl', xl: 'text-4xl md:text-5xl', hero: 'text-6xl md:text-8xl' } as const;
const CKB_UNIT = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm', xl: 'text-lg', hero: 'text-xl md:text-3xl' } as const;

export function Ckb({ value, size = 'md', sign, className = '' }: { value: number | string; size?: keyof typeof CKB_NUM; sign?: '+' | '−'; className?: string }) {
  const shown = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  return (
    <span className={`inline-flex items-baseline gap-1 text-gold ${className}`}>
      <span className={`font-poster font-extrabold tabular-nums leading-none ${CKB_NUM[size]}`}>
        {sign}
        {shown}
      </span>
      <span className={`font-display font-bold tracking-wider opacity-70 ${CKB_UNIT[size]}`}>CKB</span>
    </span>
  );
}

/** The small kicker above a heading or a number. */
export function Eyebrow({ children, tone = 'mute', className = '' }: { children: ReactNode; tone?: 'mute' | 'lime' | 'pink' | 'gold' | 'chain'; className?: string }) {
  const color = { mute: 'text-mute', lime: 'text-lime', pink: 'text-pink', gold: 'text-gold', chain: 'text-chain-soft' }[tone];
  return <p className={`font-display text-sm font-extrabold uppercase tracking-wider md:text-base ${color} ${className}`}>{children}</p>;
}

/** Nothing here yet: the waiting players, a line, and the way forward. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ART.empty} alt="Players waiting around" className="w-full max-w-xs rounded-2xl" />
      <h3 className="mt-6 font-poster text-3xl leading-none">{title}</h3>
      <p className="mt-2 max-w-sm text-fog">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Step bars for a short form. */
export function Stepper({ steps, current, tone, onJump }: { steps: string[]; current: number; tone: 'lime' | 'pink'; onJump?: (i: number) => void }) {
  const on = tone === 'lime' ? 'bg-lime text-ink' : 'bg-pink text-ink';
  const bar = tone === 'lime' ? 'bg-lime' : 'bg-pink';
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-2">
          <span className={`h-1.5 rounded-full transition-colors duration-200 ${i <= current ? bar : 'bg-white/15'}`} />
          <button
            type="button"
            disabled={!onJump || i > current}
            onClick={() => onJump?.(i)}
            aria-current={i === current ? 'step' : undefined}
            className="hidden items-center gap-1.5 text-left text-xs font-semibold disabled:cursor-default sm:flex"
          >
            <span className={`grid h-5 w-5 place-items-center rounded-md text-[10px] ${i < current ? on : i === current ? 'bg-white text-ink' : 'bg-white/10 text-mute'}`}>
              {i < current ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
            </span>
            <span className={i === current ? 'text-white' : 'text-mute'}>{s}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A big selectable card in a radio group. */
export function ChoiceChip({
  selected,
  onClick,
  tone,
  children,
  className = '',
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  tone: 'lime' | 'pink';
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const sel = tone === 'lime' ? 'bg-lime/10 ring-lime text-white' : 'bg-pink/10 ring-pink text-white';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-3xl p-4 text-left ring-2 ring-inset transition-[background-color,box-shadow] duration-150 disabled:opacity-40 ${selected ? sel : 'bg-ink-2 ring-transparent hover:bg-ink-3'} ${className}`}
    >
      {children}
    </button>
  );
}

/** A page's title block: eyebrow, big title, one line under it. */
export function PageTitle({ eyebrow, title, intro, tone = 'lime', action }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; tone?: 'lime' | 'pink' | 'chain' | 'mute'; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-1 font-poster text-[56px] leading-[0.85] sm:text-[80px] md:text-[96px]">{title}</h1>
        {intro ? <p className="mt-4 max-w-xl text-lg text-fog">{intro}</p> : null}
      </div>
      {action}
    </div>
  );
}
