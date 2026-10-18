import { z } from 'zod';
import {
  PROVIDER_PLUGIN_PROTOCOL,
  providerPluginDescriptorSchema,
} from '@archon/provider-contract/plugin';

export const devinConfigSchema = z.strictObject({
  model: z.string().min(1).optional(),
  sandbox: z.boolean().optional(),
  binPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  /** Let sandboxed turns run `docker` (and `docker compose`) outside the sandbox. Grants host Docker access. */
  allowDocker: z.boolean().optional(),
});
export type DevinConfig = z.infer<typeof devinConfigSchema>;

const jsonSchema = z.toJSONSchema(devinConfigSchema, { io: 'input' });

export const descriptor = providerPluginDescriptorSchema.parse({
  protocol: PROVIDER_PLUGIN_PROTOCOL,
  id: 'devin',
  displayName: 'Devin CLI (Cognition)',
  version: '0.1.0',
  credentials: { kind: 'static', specs: [] },
  configSchema: jsonSchema,
  config: { install: jsonSchema, run: jsonSchema, snapshot: jsonSchema, stripUnknownKeys: true },
  capabilities: {
    backgroundWork: 'unobserved',
    sessionResume: true,
    mcp: false,
    hooks: false,
    skills: false,
    plugins: false,
    agents: false,
    toolRestrictions: false,
    structuredOutput: 'best-effort',
    requiresAllPropertiesRequired: false,
    envInjection: true,
    costControl: false,
    costReporting: false,
    tokenReporting: true,
    stopReasonReporting: true,
    resolvedModelReporting: true,
    effortControl: false,
    fallbackModel: false,
    sandbox: true,
    settingSources: false,
    nativeTools: false,
    containerExec: false,
  },
});
