// src/tools/pokedex-ui.ts
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const POKEDEX_RESOURCE_URI = "ui://pokedex/mcp-app.html";

// Compilado para dist/tools/pokedex-ui.js: sobe 2 níveis até a raiz do projeto.
// fileURLToPath (não import.meta.dirname) porque engines.node é >=18 e
// import.meta.dirname só existe a partir do Node 20.11.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UI_HTML_PATH = path.join(PROJECT_ROOT, "src/ui/pokedex/dist/mcp-app.html");

export function registerPokedexUiResource(server: McpServer) {
  registerAppResource(
    server,
    POKEDEX_RESOURCE_URI,
    POKEDEX_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(UI_HTML_PATH, "utf-8");
      return {
        contents: [
          {
            uri: POKEDEX_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // CSP fica só aqui (no content item retornado pelo readCallback), nunca
            // no _meta.ui de uma tool — vale para pokedex_search e pokedex_view porque
            // as duas apontam pro mesmo resourceUri, logo pro mesmo readCallback.
            _meta: {
              ui: {
                csp: {
                  resourceDomains: ["https://raw.githubusercontent.com"],
                },
              },
            },
          },
        ],
      };
    },
  );
}
