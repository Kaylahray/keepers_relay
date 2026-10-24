'use client';

import { useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function noSubscription() {
  return () => undefined;
}

/** Same job as the prototype watch code: a phone scans this and opens the play page. */
export function PlayCode({ id, size = 160 }: { id: string; size?: number }) {
  // The origin is only known in the browser; the server renders the empty placeholder.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => '');
  const url = origin ? `${origin}/play/${id}` : '';

  if (!url) return <div className="bg-white" style={{ width: size + 24, height: size + 24 }} />;

  return (
    <div>
      <div className="w-fit bg-white p-3">
        <QRCodeSVG value={url} size={size} fgColor="#111111" bgColor="#ffffff" />
      </div>
      <p className="mt-3 font-poster text-2xl uppercase leading-none text-white">Scan to play</p>
      <p className="mt-2 break-all text-sm text-white/70">{url.replace(/^https?:\/\//, '')}</p>
    </div>
  );
}
