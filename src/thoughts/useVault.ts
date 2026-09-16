import { useEffect, useState } from 'react';
import { Vault } from './vault';
import { ThoughtVaultState } from './types';

export function useVault(): ThoughtVaultState {
  const [, forceRender] = useState(0);
  useEffect(() => Vault.subscribe(() => forceRender((n) => n + 1)), []);
  return Vault.getSnapshot();
}
