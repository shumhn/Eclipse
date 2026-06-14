"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";

// Dynamic import with ssr: false - PhantomProvider must only run on client
const WalletContextProvider = dynamic(
  () => import("./wallet-provider").then((mod) => mod.WalletContextProvider),
  { ssr: false }
);

export function Providers({ children }: { children: ReactNode }) {
  return <WalletContextProvider>{children}</WalletContextProvider>;
}
