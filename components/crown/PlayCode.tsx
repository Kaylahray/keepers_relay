'use client';

import { useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function noSubscription() {
  return () => undefined;
}

/** Same job as the prototype watch code: a phone scans this and opens the play page. */
export function PlayCode({ id, size = 160, caption = true }: { id: string; size?: number; /** The "Scan to play" line under the code. */ caption?: boolean }) {
  // The origin is only known in the browser; the server renders the empty placeholder.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => '');
  const url = origin ? `${origin}/play/${id}` : '';

  if (!url) return <div className="bg-white" style={{ width: size + 24, height: size + 24 }} />;

  return (
    <div>
      <div className="mx-auto w-fit rounded-2xl bg-white p-3">
        <QRCodeSVG value={url} size={size} fgColor="#111111" bgColor="#ffffff" />
      </div>
      {caption ? <p className="mt-3 font-poster text-xl font-black uppercase leading-none">Scan to play</p> : null}
      <p className="mt-2 break-all text-center font-mono text-sm font-bold opacity-80">{url.replace(/^https?:\/\//, '')}</p>
    </div>
  );
}
