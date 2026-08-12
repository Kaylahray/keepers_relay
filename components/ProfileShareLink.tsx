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
    <div className="flex flex-wrap items-center gap-2 border-[3px] border-black bg-[#fff8e7] p-3">
      <span className="text-[10px] font-black uppercase tracking-[0.16em]">Share</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs font-bold">{fullUrl}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy profile link"
        className="border-2 border-black bg-[#d6ff00] p-1.5"
      >
        {copied ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <Copy className="h-3.5 w-3.5 stroke-[3]" />}
      </button>
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open profile"
        className="border-2 border-black bg-black p-1.5 text-[#d6ff00]"
      >
        <ExternalLink className="h-3.5 w-3.5 stroke-[3]" />
      </a>
    </div>
  );
}
