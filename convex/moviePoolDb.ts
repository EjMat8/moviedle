import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const popularityTier = v.union(
  v.literal("mass_appeal"),
  v.literal("well_known"),
  v.literal("cult_classic"),
);

const poolEntry = v.object({
  title: v.string(),
  aliases: v.array(v.string()),
  year: v.number(),
  tier: popularityTier,
  genres: v.array(v.string()),
});

export const insertPoolEntries = internalMutation({
  args: { entries: v.array(poolEntry) },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const e of args.entries) {
      await ctx.db.insert("moviePool", { ...e, used: false });
      inserted++;
    }
    return inserted;
  },
});

// Drop all moviePool rows. Useful for re-running pool generation from scratch.
export const clearPool = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    while (true) {
      const batch = await ctx.db.query("moviePool").take(100);
      if (batch.length === 0) break;
      for (const row of batch) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return deleted;
  },
});

// Read-only counts by tier so we can sanity-check generatePool from the dashboard.
export const poolCounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("moviePool").take(2000);
    const counts: Record<string, number> = {
      mass_appeal: 0,
      well_known: 0,
      cult_classic: 0,
    };
    for (const row of all) counts[row.tier] = (counts[row.tier] ?? 0) + 1;
    return { total: all.length, byTier: counts };
  },
});

