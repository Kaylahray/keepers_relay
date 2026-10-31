'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

export function ProfileShareLink({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/u/${username}`;
  const fullUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-2 p-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-mute">Share</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-white">{fullUrl}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy profile link"
        className="grid h-9 w-9 place-items-center rounded-lg bg-ink-3 hover:bg-ink-4"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open profile"
        className="grid h-9 w-9 place-items-center rounded-lg bg-ink-3 hover:bg-ink-4"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
