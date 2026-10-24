'use client';

import { useEffect, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';

/**
 * The connected wallet's lock hash, or null. The hash is stored with the signer it came from, so
 * switching or disconnecting the wallet hides the old hash at once instead of waiting for an effect.
 */
export function useMyLockHash(): string | null {
  const signer = ccc.useSigner();
  const [found, setFound] = useState<{ signer: unknown; hash: string } | null>(null);

  useEffect(() => {
    if (!signer) return;
    let stop = false;
    void signer
      .getRecommendedAddressObj()
      .then((obj) => {
        if (!stop) setFound({ signer, hash: obj.script.hash() });
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [signer]);

  return signer && found?.signer === signer ? found.hash : null;
}
