'use client';

import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';

/** Copy/share a join link. We do not send email — you send this however you already talk. */
export function InviteButton({
  url,
  title,
  text,
  compact = false,
}: {
  url: string;
  title: string;
  text: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function invite() {
    const full =
      url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: full });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(`${text}\n${full}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void invite()}
      className={
        compact
          ? 'inline-flex items-center gap-1.5 border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase'
          : 'neo-button inline-flex items-center gap-1.5 bg-[#ffe454] px-3 py-2 text-[10px] font-black uppercase'
      }
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 stroke-[3]" />
      ) : typeof navigator !== 'undefined' && 'share' in navigator ? (
        <Share2 className="h-3.5 w-3.5 stroke-[3]" />
      ) : (
        <Link2 className="h-3.5 w-3.5 stroke-[3]" />
      )}
      {copied ? 'Link copied' : 'Invite friends'}
    </button>
  );
}
