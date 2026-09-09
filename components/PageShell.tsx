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

export function PageShell({
  eyebrow,
  title,
  intro,
  backHref,
  backLabel = 'Back',
  children,
}: PageShellProps) {
  return (
    <div className="relative min-h-full w-full bg-[#111]">
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            className="mb-5 inline-flex items-center gap-1.5 border border-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        )}

        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#99ee2d]">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-poster text-4xl uppercase leading-[1.05] text-white sm:text-5xl">
            {title}
          </h1>
          {intro ? (
            <p className="mt-3 max-w-2xl text-sm font-light leading-relaxed text-white/55 sm:text-base">
              {intro}
            </p>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
}
