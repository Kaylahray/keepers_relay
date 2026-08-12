import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface PageShellProps {
  eyebrow: string;
  title: string;
  intro?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

/** Shared layout for every interior page so they inherit the poster system. */
export function PageShell({
  eyebrow,
  title,
  intro,
  backHref,
  backLabel = 'Back',
  children,
}: PageShellProps) {
  return (
    <div className="relative min-h-full w-full overflow-hidden bg-[#d6ff00]">
      <div className="chain-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-5xl px-3 pb-20 pt-8 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            className="mb-5 inline-flex items-center gap-1.5 border-[3px] border-black bg-[#fff8e7] px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-[4px_4px_0_#101010]"
          >
            <ChevronLeft className="h-3.5 w-3.5 stroke-[3]" />
            {backLabel}
          </Link>
        )}

        <div className="border-[3px] border-black bg-[#fff8e7] p-5 shadow-[8px_8px_0_#224cff] sm:p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">{eyebrow}</p>
          <h1 className="mt-2 font-poster text-5xl uppercase leading-[.85] sm:text-6xl">{title}</h1>
          {intro && (
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed">{intro}</p>
          )}
        </div>

        <div className="mt-7">{children}</div>
      </div>
    </div>
  );
}
