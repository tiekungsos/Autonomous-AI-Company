import { serveProvider } from '@archon/provider-contract/plugin';
import { descriptor } from './descriptor.ts';
import { DevinProvider } from './provider.ts';

if (import.meta.main) {
  await serveProvider({ descriptor, create: log => new DevinProvider(log) });
}
