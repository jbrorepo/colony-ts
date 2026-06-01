/**
 * Search the hosted plugin registry programmatically.
 *
 * Run:
 *   bun run examples/04-plugin-search.ts [query]
 */

import {
  searchPluginRegistry,
  formatPluginSearchResults,
} from "../src/mcp/plugin-registry-client";

async function main(): Promise<void> {
  const query = process.argv[2] ?? "git";

  console.log(`Searching plugin registry for: "${query}"\n`);

  const result = await searchPluginRegistry(query);

  // Pretty-printed human form
  console.log(formatPluginSearchResults(result, query));

  // Programmatic form
  if (result.ok && result.results.length > 0) {
    console.log("\n--- structured ---");
    for (const entry of result.results) {
      console.log(`${entry.id} v${entry.version} (${entry.tags.join(", ")})`);
    }
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
