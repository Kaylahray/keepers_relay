'use client';

import { ccc } from '@ckb-ccc/connector-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { post, request } from '@/lib/api/client';

type SessionState = {
  authenticated: boolean;
  /** First session check has finished. Until then, authenticated is still unknown. */
  checked: boolean;
  address: string | null;
  busy: boolean;
  error: string | null;
  /** One action: open wallet if needed, then sign in. Label this “Connect”. */
  ensureAuth: () => Promise<string>;
  signOut: () => Promise<void>;
  refresh: () => Promise<{ authenticated: boolean; address: string | null }>;
};

type SignerLike = {
  signMessage: (message: string) => Promise<{
    signature: string;
    identity: string;
    signType: string;
  }>;
};

/**
 * One “Connect” path: wallet + session signature.
 * Callers should never show a separate “Sign in” control.
 */
export function useAuthSession(): SessionState {
  const { address, signer, isConnected, isReady, connect } = useWallet();
  const { isOpen } = ccc.useCcc();
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiterRef = useRef<{
    resolve: (addr: string) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One automatic sign-in prompt per restored address. A dismiss does not loop. */
  const promptedRef = useRef<string | null>(null);
  const connectedRef = useRef(isConnected);
  connectedRef.current = isConnected;

  const refresh = useCallback(async () => {
    try {
      const data = await request<{
        authenticated: boolean;
        address?: string;
      }>('/api/auth/session');
      const next = {
        authenticated: Boolean(data.authenticated),
        address: data.address ?? null,
      };
      setAuthenticated(next.authenticated);
      setSessionAddress(next.address);
      return next;
    } catch {
      setAuthenticated(false);
      setSessionAddress(null);
      return { authenticated: false, address: null };
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * JoyID restores the address with no prompt. That is only the wallet.
   * The session is a second signature, "Connect to Crowns", and without it
   * the header shows an address that cannot publish, join, or take a proof.
   * Ask for that signature once when a restored wallet has no session.
   */
  useEffect(() => {
    if (!isReady || !checked || !isConnected || !address || !signer || busy) return;
    const normalized = address.trim().toLowerCase();
    if (authenticated && sessionAddress === normalized) {
      promptedRef.current = null;
      return;
    }
    if (promptedRef.current === normalized) return;
    promptedRef.current = normalized;
    void runChallenge(address, signer).catch(() => undefined);
  }, [address, authenticated, busy, checked, isConnected, isReady, runChallenge, sessionAddress, signer]);

  const clearWaiter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/session', { method: 'DELETE', cache: 'no-store' });
    setAuthenticated(false);
    setSessionAddress(null);
  }, []);

  const runChallenge = useCallback(
    async (walletAddress: string, walletSigner: SignerLike) => {
      setBusy(true);
      setError(null);
      try {
        const challenge = await post<{
          address: string;
          nonce: string;
          expiresAt: number;
          message: string;
          challengeId: string;
        }>('/api/auth/challenge', { address: walletAddress });

        const signed = await walletSigner.signMessage(challenge.message);

        await post('/api/auth/verify', {
          address: challenge.address,
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          message: challenge.message,
          challengeId: challenge.challengeId,
          signature: signed.signature,
          identity: signed.identity,
          signType: signed.signType,
        });

        const normalized = walletAddress.trim().toLowerCase();
        setAuthenticated(true);
        setSessionAddress(normalized);
        return walletAddress;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Connect failed.';
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const ensureAuth = useCallback(async () => {
    if (!isReady) throw new Error('Wallet still loading.');

    const normalized = address.trim().toLowerCase();
    const current = await refresh();
    if (
      isConnected &&
      address &&
      current.authenticated &&
      current.address === normalized
    ) {
      return address;
    }

    if (isConnected && address && signer) {
      return runChallenge(address, signer);
    }

    // Open wallet, then continue signing once it connects.
    setBusy(true);
    setError(null);
    clearWaiter();

    return new Promise<string>((resolve, reject) => {
      waiterRef.current = { resolve, reject };
      connect();
      timeoutRef.current = setTimeout(() => {
        if (!waiterRef.current) return;
        waiterRef.current.reject(new Error('Wallet connection cancelled.'));
        waiterRef.current = null;
        setBusy(false);
      }, 120_000);
    });
  }, [
    address,
    clearWaiter,
    connect,
    isConnected,
    isReady,
    refresh,
    runChallenge,
    signer,
  ]);

  /**
   * A successful pick closes the modal, then the wallet appears.
   * A dismiss closes it and nothing arrives. Drop the waiter so
   * Connect is clickable again instead of sitting on “Connecting…”.
   */
  useEffect(() => {
    if (isOpen || !waiterRef.current) return;
    const timer = setTimeout(() => {
      if (!waiterRef.current || connectedRef.current) return;
      waiterRef.current.reject(new Error('Wallet connection cancelled.'));
      waiterRef.current = null;
      clearWaiter();
      setBusy(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [clearWaiter, isOpen]);

  /** After Connect opens the wallet modal, finish with the sign-in message. */
  useEffect(() => {
    if (!waiterRef.current) return;
    if (!isConnected || !address || !signer) return;

    const waiter = waiterRef.current;
    waiterRef.current = null;
    clearWaiter();

    void runChallenge(address, signer).then(waiter.resolve, (err: unknown) => {
      waiter.reject(err instanceof Error ? err : new Error('Connect failed.'));
    });
  }, [address, clearWaiter, isConnected, runChallenge, signer]);

  useEffect(() => () => clearWaiter(), [clearWaiter]);

  return {
    authenticated,
    checked,
    address: sessionAddress,
    busy,
    error,
    ensureAuth,
    signOut,
    refresh,
  };
}
