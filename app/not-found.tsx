import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { IMG } from '@/lib/crowns/art';

/** Any address that isn't a page. */
export default function NotFound() {
  return (
    <section className="relative isolate -mt-16 flex min-h-[720px] flex-col justify-end overflow-hidden sm:-mt-20 sm:min-h-[820px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={IMG.notFound} alt="A closed road at night with a single cone" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 sm:px-8 sm:pb-24">
        <p className="font-display text-[120px] font-black leading-[0.8] text-pink sm:text-[220px]">404</p>
        <h1 className="mt-2 font-display text-5xl font-black uppercase leading-none sm:text-7xl">Dead end.</h1>
        <p className="mt-3 text-lg text-chalk/85">This page isn’t on the map.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/rally" className={buttonClass('lime', 'xl')}>
            Find a race
          </Link>
          <Link href="/" className={buttonClass('ghost', 'xl')}>
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
