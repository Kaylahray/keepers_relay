"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { assertRegistryConfigured, network, rpcUrl } from "./config";

let cachedClient: ccc.Client | null = null;

export function getClient(): ccc.Client {
  assertRegistryConfigured();
  if (cachedClient) return cachedClient;

  if (network === "mainnet") {
    cachedClient = new ccc.ClientPublicMainnet({ url: rpcUrl });
  } else {
    cachedClient = new ccc.ClientPublicTestnet({ url: rpcUrl });
  }

  return cachedClient;
}
