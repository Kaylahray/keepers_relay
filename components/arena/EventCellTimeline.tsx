'use client';

import type { CellTimelineItem } from '@/types/event';

const KIND_DOT: Record<CellTimelineItem['kind'], string> = {
  create: 'bg-white/50',
  join: 'bg-[#406aff]',
  sponsor: 'bg-[#a855f7]',
  start: 'bg-[#99ee2d]',
  turn: 'bg-[#99ee2d]',
  settle: 'bg-[#e1bf47]',
};

export function EventCellTimeline({
  items,
  title = 'Cell Timeline',
  compact = false,
}: {
  items: CellTimelineItem[];
  title?: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return (
      <section className="border border-white/10 bg-black/40 p-4 backdrop-blur-md">
        <h3 className="font-poster text-lg uppercase text-white">{title}</h3>
        <p className="mt-2 text-sm text-white/45">No transitions yet.</p>
      </section>
    );
  }

  return (
    <section className="border border-white/10 bg-black/40 p-4 backdrop-blur-md">
      <h3 className="font-poster text-lg uppercase text-white">{title}</h3>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/40">
        State lineage · each hop is a transition
      </p>
      <ol className={`mt-4 space-y-0 ${compact ? 'max-h-56 overflow-y-auto' : ''}`}>
        {items.map((item, i) => (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 ? (
              <span
                className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-white/15"
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[item.kind]}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold uppercase text-white">{item.label}</p>
              {item.detail ? (
                <p className="mt-0.5 font-mono text-[10px] text-white/45">{item.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
