import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  emptyCatalog,
  pickFromState,
  type CatalogState,
} from "../lib/picker.ts";

const KV_KEY = "slideshow/catalog";

function isCatalogState(value: unknown): value is CatalogState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as CatalogState;
  return Array.isArray(record.photos) && Array.isArray(record.shownPaths);
}

export default defineTool({
  description:
    "Wählt das nächste Dia-Foto gleichverteilt zufällig. Bilder dieser Runde werden nicht wiederholt, bis jedes Kandidatfoto gezeigt wurde. Ohne photos gilt der zuletzt gespeicherte Katalog.",
  effect: "write",
  inputSchema: z.object({
    photos: z
      .array(
        z.object({
          path: z.string(),
          synologyId: z.number().optional(),
          created: z.number().optional(),
        }),
      )
      .optional(),
    reset: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    const stored = await ctx.host.kv.get(KV_KEY);
    const previous = isCatalogState(stored) ? stored : emptyCatalog();
    const { state, result } = pickFromState(previous, input);
    await ctx.host.kv.put(KV_KEY, state);
    return result;
  },
});
