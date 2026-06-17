// Composition root + stdio boot for the `golden-source-sync` MCP server.
//
// This is the ONLY place that knows about concrete adapters: it wires the real
// filesystem + Notion SPI implementations into the Domain Service, then exposes
// the tool surface (createMcpServer, see index.ts) over a stdio transport. Keeping
// the boot here — and OUT of index.ts — means the tool surface stays unit-testable
// against an injected port, while "where to deploy" remains a packaging variable
// (PRD §4/§5). The .mcp.json entry points at THIS file.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './index.js';
import { GoldenSourceSync } from './domain/golden-source-sync.js';
import { FsConfigStore } from './adapters/fs-config-store.js';
import { FsStateStore } from './adapters/fs-state-store.js';
import { FsVaultWriter } from './adapters/fs-vault-writer.js';
import { SystemClock } from './adapters/system-clock.js';
import { notionConnectorFactory } from './adapters/notion-gateway.js';
import { VAULT_DIR, SIDECAR_DIR, CONFIG_PATH } from './lib/config.js';

function buildApi(): GoldenSourceSync {
  return new GoldenSourceSync({
    configStore: new FsConfigStore(CONFIG_PATH),
    stateStore: new FsStateStore(SIDECAR_DIR),
    vaultWriter: new FsVaultWriter(VAULT_DIR),
    clock: new SystemClock(),
    connectorFor: notionConnectorFactory,
  });
}

async function main(): Promise<void> {
  const server = createMcpServer(buildApi());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[golden-source-sync] MCP server running on stdio');
}

main().catch((err) => {
  console.error('[golden-source-sync] Fatal:', err);
  process.exit(1);
});
