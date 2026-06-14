import fs from 'fs';
import os from 'os';
import path from 'path';

import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface LoadedKeypair {
  source: string;
  keypair: Keypair;
}

function loadKeypairFromEnv(envName: string): LoadedKeypair | null {
  const value = process.env[envName];
  if (!value) return null;

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(value));
    return { source: `env:${envName}`, keypair };
  } catch {
    return null;
  }
}

function loadKeypairFromFile(filePath: string, label: string): LoadedKeypair | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
    return { source: label, keypair };
  } catch {
    return null;
  }
}

function dedupeKeypairs(keypairs: LoadedKeypair[]): LoadedKeypair[] {
  const seen = new Set<string>();
  return keypairs.filter((entry) => {
    const pubkey = entry.keypair.publicKey.toBase58();
    if (seen.has(pubkey)) return false;
    seen.add(pubkey);
    return true;
  });
}

export function getCandidateKeypairs(): LoadedKeypair[] {
  const localKeypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');

  return dedupeKeypairs(
    [
      loadKeypairFromEnv('SOLANA_PRIVATE_KEY'),
      loadKeypairFromEnv('SOLANA_ADMIN_PRIVATE_KEY'),
      loadKeypairFromEnv('SOLANA_ORACLE_PRIVATE_KEY'),
      loadKeypairFromFile(localKeypairPath, `file:${localKeypairPath}`),
    ].filter(Boolean) as LoadedKeypair[]
  );
}

export function findKeypairByPublicKey(publicKey: PublicKey | string): LoadedKeypair | null {
  const target = typeof publicKey === 'string' ? publicKey : publicKey.toBase58();
  return (
    getCandidateKeypairs().find(
      (entry) => entry.keypair.publicKey.toBase58() === target
    ) || null
  );
}

export function getDefaultKeypair(): LoadedKeypair | null {
  return getCandidateKeypairs()[0] || null;
}
