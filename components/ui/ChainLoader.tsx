import { IMG } from '@/lib/crowns/art';

/** Lime blocks dropping onto a stack, again and again, like blocks landing on the chain. */
function BlockStack({ small = false }: { small?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-1.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].slice(0, small ? 3 : 5).map((i) => (
        <span
          key={i}
          className={`chain-drop block rounded-md border border-lime/70 bg-lime/25 shadow-[0_0_24px_rgba(153,238,45,0.45)] ${small ? 'h-4 w-10' : 'h-9 w-20'}`}
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
    </div>
  );
}

/** A wait on the chain, with what we are waiting for: a full scene for a page, smaller inside a panel or a row. */
export function ChainLoader({
  title,
  note,
  compact = false,
  inline = false,
}: {
  title: string;
  note?: string;
  /** Inside a panel, not the whole page. */
  compact?: boolean;
  /** Small, for a message bar or a button row. */
  inline?: boolean;
}) {
  if (inline || compact) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${inline ? '' : 'px-4 py-10'}`} role="status" aria-live="polite">
        <BlockStack small />
        {title ? <p className={`font-display font-black uppercase leading-none ${inline ? 'mt-3 text-lg' : 'mt-5 text-2xl'}`}>{title}</p> : null}
        {note ? <p className={`max-w-xs text-fog ${inline ? 'mt-1 text-sm' : 'mt-2'}`}>{note}</p> : null}
      </div>
    );
  }
  return (
    <div className="grid min-h-[60vh] items-center gap-10 py-6 lg:grid-cols-2" role="status" aria-live="polite">
      <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-[32px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.chainLanding} alt="" className="chain-breathe absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 flex items-end justify-center pb-[18%]">
          <BlockStack />
        </div>
      </div>
      <div>
        <h1 className="font-display text-[44px] font-black uppercase leading-[0.9] sm:text-[64px]">{title}</h1>
        {note ? <p className="mt-4 text-lg text-fog">{note}</p> : null}
      </div>
    </div>
  );
}
