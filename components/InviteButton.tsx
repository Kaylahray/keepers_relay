'use client';

import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';
import { buttonClass, tipStyle, type ButtonVariant } from '@/components/ui/Button';

/** Copy/share a join link. We do not send email — you send this however you already talk. */
export function InviteButton({
  url,
  title = 'Crowns',
  text = 'Jump in with me on Crowns.',
  compact = false,
  variant = 'default',
  tone = 'lime',
}: {
  url: string;
  title?: string;
  text?: string;
  compact?: boolean;
  /** `arena`: the big key on a lobby or duel page. */
  variant?: 'default' | 'arena';
  /** The key's colour: the mode's (lime for crowns, pink for duels). */
  tone?: ButtonVariant;
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

  const size = compact ? 'sm' : variant === 'arena' ? 'lg' : 'md';
  const className = buttonClass(compact ? 'ghost' : tone, size);

  return (
    <button type="button" onClick={() => void invite()} className={className} style={tipStyle(size)}>
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : typeof navigator !== 'undefined' && 'share' in navigator ? (
        <Share2 className="h-3.5 w-3.5" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {copied ? 'Link copied' : 'Invite friends'}
    </button>
  );
}
