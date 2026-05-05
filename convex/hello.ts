import { v } from "convex/values";
import { query } from "./_generated/server";

export const ping = query({
  args: {},
  returns: v.object({
    message: v.string(),
    timestamp: v.number(),
  }),
  handler: async () => {
    return {
      message: "Moviedle backend is alive.",
      timestamp: Date.now(),
    };
  },
});
