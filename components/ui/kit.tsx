import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ART } from '@/lib/art';

/** A CKB amount: big gold number, small mono unit. */
const CKB_NUM = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl md:text-3xl', xl: 'text-4xl md:text-5xl', hero: 'text-6xl md:text-8xl' } as const;
const CKB_UNIT = { sm: 'text-[9px]', md: 'text-[10px]', lg: 'text-xs', xl: 'text-sm', hero: 'text-base md:text-xl' } as const;

export function Ckb({ value, size = 'md', sign, className = '' }: { value: number | string; size?: keyof typeof CKB_NUM; sign?: '+' | '−'; className?: string }) {
  const shown = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  return (
    <span className={`inline-flex items-baseline gap-1 text-gold ${className}`}>
      <span className={`font-poster font-extrabold tabular-nums leading-none ${CKB_NUM[size]}`}>
        {sign}
        {shown}
      </span>
      <span className={`font-mono font-bold tracking-wider ${CKB_UNIT[size]}`}>CKB</span>
    </span>
  );
}

/** Small mono label above a number or a heading. */
export function Eyebrow({ children, tone = 'mute', className = '' }: { children: ReactNode; tone?: 'mute' | 'lime' | 'pink' | 'gold' | 'chain'; className?: string }) {
  const color = { mute: 'text-mute', lime: 'text-lime', pink: 'text-pink', gold: 'text-gold', chain: 'text-chain-soft' }[tone];
  return <p className={`font-mono text-[10px] uppercase tracking-wider md:text-[11px] ${color} ${className}`}>{children}</p>;
}

export type ChipTone = 'live' | 'lobby' | 'closed' | 'pink' | 'chain';

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  const cls = {
    live: 'bg-lime/15 text-lime',
    lobby: 'bg-white/10 text-white',
    closed: 'bg-gold/15 text-gold',
    pink: 'bg-pink/15 text-pink',
    chain: 'bg-chain/15 text-chain-soft',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {tone === 'live' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type LapState = 'empty' | 'done' | 'crash' | 'current';

/** Five lap boxes: filled when sealed, red on a crash, ringed for the lap being driven. */
export function LapBoxes({
  states,
  scores,
  tone = 'lime',
  size = 'md',
  label,
}: {
  states: LapState[];
  scores?: (number | undefined)[];
  tone?: 'lime' | 'pink';
  size?: 'sm' | 'md';
  label?: string;
}) {
  const fill = tone === 'lime' ? 'bg-lime text-ink' : 'bg-pink text-ink';
  const ring = tone === 'lime' ? 'ring-lime' : 'ring-pink';
  return (
    <div aria-label={label ?? 'Laps'} className="flex gap-1.5">
      {states.map((s, i) => (
        <div
          key={i}
          aria-label={`Lap ${i + 1}: ${s === 'done' ? `sealed${scores?.[i] != null ? ` ${scores[i]}` : ''}` : s}`}
          className={`flex items-center justify-center font-mono font-bold ${size === 'sm' ? 'h-6 w-8 rounded-md text-[9px]' : 'h-9 w-12 rounded-lg text-[11px]'} ${
            s === 'empty' ? 'bg-white/10 text-white/40' : s === 'done' ? fill : s === 'crash' ? 'bg-danger text-ink' : `bg-white/10 text-white ring-2 ring-inset ${ring}`
          }`}
        >
          {s === 'done' && scores?.[i] != null ? scores[i] : s === 'crash' ? '✕' : i + 1}
        </div>
      ))}
    </div>
  );
}

/** Health as 10 blocks, red when three or fewer are left. */
export function HpBlocks({ hp, max = 100, tone, size = 'md', align = 'left' }: { hp: number; max?: number; tone: 'lime' | 'pink'; size?: 'sm' | 'md'; align?: 'left' | 'right' }) {
  const filled = Math.ceil((Math.max(0, hp) / max) * 10);
  const on = filled <= 3 ? 'bg-danger' : tone === 'lime' ? 'bg-lime' : 'bg-pink';
  return (
    <div role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} className={`flex gap-[3px] ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`${size === 'sm' ? 'h-2.5 w-2' : 'h-3.5 w-2.5 md:w-3'} rounded-[3px] transition-colors duration-200 ${i < filled ? on : 'bg-white/15'}`} />
      ))}
    </div>
  );
}

/** Nothing here yet: the waiting players, a line, and the way forward. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="clip-panel flex flex-col items-center bg-ink-2 px-6 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ART.empty} alt="Players waiting around" className="w-full max-w-xs rounded-2xl" />
      <h3 className="mt-6 font-poster text-lg font-bold uppercase">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-mute">{body}</p>
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
      className={`rounded-2xl p-4 text-left ring-2 ring-inset transition-[background-color,box-shadow] duration-150 disabled:opacity-40 ${selected ? sel : 'bg-ink-2 ring-transparent hover:bg-ink-3'} ${className}`}
    >
      {children}
    </button>
  );
}

/** Segmented filter tabs. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  tone = 'white',
  label,
}: {
  value: T;
  options: { id: T; label: ReactNode; count?: number }[];
  onChange: (id: T) => void;
  tone?: 'lime' | 'pink' | 'white';
  label: string;
}) {
  const on = { lime: 'bg-lime text-ink', pink: 'bg-pink text-ink', white: 'bg-white text-ink' }[tone];
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl bg-ink-2 p-1 no-scrollbar">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-10 shrink-0 rounded-lg px-4 text-sm font-semibold capitalize transition-colors duration-150 ${value === o.id ? on : 'text-mute hover:text-white'}`}
        >
          {o.label}
          {o.count != null ? <span className="ml-1 font-mono text-[11px] opacity-70">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A page's title block: eyebrow, big title, one line under it. */
export function PageTitle({ eyebrow, title, intro, tone = 'lime', action }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; tone?: 'lime' | 'pink' | 'chain' | 'mute'; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-1 font-poster text-3xl font-black uppercase leading-[1.05] md:text-5xl">{title}</h1>
        {intro ? <p className="mt-2 max-w-xl text-mute">{intro}</p> : null}
      </div>
      {action}
    </div>
  );
}
