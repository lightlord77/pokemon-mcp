// src/ui/pokedex/src/mcp-app.ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Pokedex App", version: "1.0.0" });

app.connect().then(() => {
  const root = document.getElementById("root");
  if (root) root.textContent = "Pokédex UI conectada.";
});
