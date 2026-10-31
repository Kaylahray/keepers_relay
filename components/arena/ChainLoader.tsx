/**
 * A wait on the chain: three blocks lighting up one after another, like blocks landing, with what we
 * are waiting for underneath. Full page by default; `compact` inside a panel; `inline` in a line of text.
 */
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
  const block = inline ? 'h-3 w-3 rounded-[4px]' : 'h-5 w-5 rounded-md';
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${inline ? '' : compact ? 'px-4 py-10' : 'min-h-[55vh] px-4'}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center ${inline ? 'gap-1.5' : 'gap-2.5'}`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex items-center ${inline ? 'gap-1.5' : 'gap-2.5'}`}>
            {i > 0 ? <span className={`chain-loader-link h-0.5 ${inline ? 'w-2' : 'w-4'}`} style={{ animationDelay: `${i * 0.3}s` }} /> : null}
            <span className={`chain-loader-block ${block}`} style={{ animationDelay: `${i * 0.3}s` }} />
          </div>
        ))}
      </div>
      {title ? <p className={`font-semibold text-white ${inline ? 'mt-2 text-xs' : 'mt-5 text-base'}`}>{title}</p> : null}
      {note ? <p className={`max-w-xs text-mute ${inline ? 'text-[11px]' : 'mt-1 text-sm'}`}>{note}</p> : null}
    </div>
  );
}
