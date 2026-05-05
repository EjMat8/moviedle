"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { generateHints } from "./lib/hintGen";
import type { Hint } from "./lib/validators";

// Thin debug wrapper so the user can run the hint generator on any title from
// the Convex dashboard during Phase 1 review.
export const generateHintsForTitle = internalAction({
  args: {
    title: v.string(),
    year: v.number(),
    aliases: v.array(v.string()),
  },
  handler: async (_ctx, args): Promise<Hint[]> => {
    return generateHints(args.title, args.year, args.aliases);
  },
});
