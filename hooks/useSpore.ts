'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSigner, ccc } from '@ckb-ccc/connector-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

export type MintedSpore = {
  id: string;
  imageUrl: string;
  contentType: string;
  sizeBytes: number;
  ckbCapacity: string;
  name: string;
  role: string;
  bio: string;
};

const sporeKeys = {
  minted: ['keepers', 'minted-spores'] as const,
};

/** CCC Spore mint / list / melt — same pattern as Spore ID. */
export function useSpore() {
  const signer = useSigner();
  const queryClient = useQueryClient();
  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'error' | 'success';
    message: string;
  }>({ type: 'idle', message: '' });
  const [mintedImageUrl, setMintedImageUrl] = useState<string | null>(null);
  const [deletingSporeId, setDeletingSporeId] = useState<string | null>(null);
  const mintedImageUrlRef = useRef<string | null>(null);
  const mintedSporesRef = useRef<MintedSpore[]>([]);

  const sporesQuery = useQuery({
    queryKey: [...sporeKeys.minted, signer ? 'connected' : 'disconnected'],
    enabled: Boolean(signer),
    queryFn: async (): Promise<MintedSpore[]> => {
      if (!signer) return [];
      const loaded: MintedSpore[] = [];
      for await (const found of ccc.spore.findSporesBySigner({
        signer,
        order: 'desc',
        limit: 12,
      })) {
        const storedContentType =
          found.sporeData.contentType || 'application/octet-stream';
        const sporeId = found.spore.cellOutput.type?.args ?? crypto.randomUUID();
        const ckbCapacity = (
          Number(BigInt(String(found.spore.cellOutput.capacity))) / 100_000_000
        ).toFixed(2);

        if (storedContentType.startsWith('image/')) {
          const bytes = Uint8Array.from(ccc.bytesFrom(found.sporeData.content));
          const imageUrl = URL.createObjectURL(
            new Blob([bytes], { type: storedContentType }),
          );
          loaded.push({
            id: sporeId,
            imageUrl,
            contentType: storedContentType,
            sizeBytes: bytes.byteLength,
            ckbCapacity,
            name: '',
            role: storedContentType.replace('image/', '').toUpperCase(),
            bio: '',
          });
        }
      }
      return loaded;
    },
  });

  const mintedSpores = useMemo(() => sporesQuery.data ?? [], [sporesQuery.data]);
  const isLoadingSpores = sporesQuery.isLoading || sporesQuery.isFetching;

  const mintSpore = async (file: File): Promise<string | null> => {
    if (!signer) {
      setStatus({ type: 'error', message: 'Connect your wallet first.' });
      return null;
    }

    setIsMinting(true);
    setStatus({ type: 'idle', message: 'Reading image…' });

    try {
      if (file.size > 50 * 1024) {
        throw new Error('Avatar must be under 50KB to keep CKB cost low.');
      }

      const arrayBuffer = await file.arrayBuffer();
      const imageBytes = new Uint8Array(new ArrayBuffer(arrayBuffer.byteLength));
      imageBytes.set(new Uint8Array(arrayBuffer));
      const contentType = file.type || 'image/jpeg';

      setStatus({ type: 'idle', message: 'Drafting Spore transaction…' });
      const { tx: sporeTx, id: sporeId } = await ccc.spore.createSpore({
        signer,
        data: { contentType, content: imageBytes },
      });
      await sporeTx.completeFeeBy(signer, 2000);

      setStatus({ type: 'idle', message: 'Waiting for wallet approval…' });
      const txHash = await signer.sendTransaction(sporeTx);

      setStatus({ type: 'idle', message: 'Confirming on CKB…' });
      await signer.client.waitTransaction(txHash);

      setStatus({
        type: 'success',
        message: `Spore minted! ${sporeId.slice(0, 12)}…`,
      });
      await queryClient.invalidateQueries({ queryKey: sporeKeys.minted });
      requestWalletRefresh();

      const avatarUrl = URL.createObjectURL(
        new Blob([imageBytes], { type: contentType }),
      );
      if (mintedImageUrlRef.current) URL.revokeObjectURL(mintedImageUrlRef.current);
      setMintedImageUrl(avatarUrl);
      return sporeId;
    } catch (err) {
      console.error(err);
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to mint Spore.',
      });
      return null;
    } finally {
      setIsMinting(false);
    }
  };

  const deleteImage = async (sporeId: string) => {
    if (!signer) {
      setStatus({ type: 'error', message: 'Connect your wallet first.' });
      return;
    }

    setDeletingSporeId(sporeId);
    setStatus({ type: 'idle', message: 'Preparing melt…' });
    try {
      const { tx } = await ccc.spore.meltSpore({ signer, id: sporeId });
      await tx.completeFeeBy(signer, 2000);
      setStatus({ type: 'idle', message: 'Waiting for wallet approval…' });
      const txHash = await signer.sendTransaction(tx);
      setStatus({ type: 'idle', message: 'Confirming delete…' });
      await signer.client.waitTransaction(txHash);
      setStatus({
        type: 'success',
        message: `Spore melted: ${sporeId.slice(0, 12)}…`,
      });
      await queryClient.invalidateQueries({ queryKey: sporeKeys.minted });
      requestWalletRefresh();
    } catch (err) {
      console.error(err);
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete Spore.',
      });
    } finally {
      setDeletingSporeId(null);
    }
  };

  useEffect(() => {
    mintedImageUrlRef.current = mintedImageUrl;
  }, [mintedImageUrl]);

  useEffect(() => {
    const prev = mintedSporesRef.current;
    prev.forEach((item) => URL.revokeObjectURL(item.imageUrl));
    mintedSporesRef.current = mintedSpores;
  }, [mintedSpores]);

  useEffect(() => {
    return () => {
      mintedSporesRef.current.forEach((item) => URL.revokeObjectURL(item.imageUrl));
      if (mintedImageUrlRef.current) URL.revokeObjectURL(mintedImageUrlRef.current);
    };
  }, []);

  const resetSpore = () => {
    if (mintedImageUrl) URL.revokeObjectURL(mintedImageUrl);
    setMintedImageUrl(null);
    setStatus({ type: 'idle', message: '' });
  };

  return {
    mintSpore,
    isMinting,
    isLoadingSpores,
    status,
    mintedImageUrl,
    mintedSpores,
    deletingSporeId,
    resetSpore,
    deleteImage,
    reload: () => queryClient.invalidateQueries({ queryKey: sporeKeys.minted }),
  };
}
