import type { RelayAttemptStatus } from '@/types/keeper';

const STATUS: Record<RelayAttemptStatus, { label: string; bg: string; fg: string }> = {
  not_started: { label: 'Not started', bg: '#fff8e7', fg: '#101010' },
  started: { label: 'In progress', bg: '#ffe454', fg: '#101010' },
  submitted: { label: 'In review', bg: '#ff6b2d', fg: '#101010' },
  verified: { label: 'Verified', bg: '#d6ff00', fg: '#101010' },
  claimed: { label: 'Claimed', bg: '#224cff', fg: '#fff8e7' },
  rejected: { label: 'Needs work', bg: '#ff4cbd', fg: '#101010' },
};

export function relayStatusLabel(status: RelayAttemptStatus): string {
  return STATUS[status].label;
}

export function RelayStatusBadge({ status }: { status: RelayAttemptStatus }) {
  const tone = STATUS[status];
  return (
    <span
      className="border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-wider"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}
