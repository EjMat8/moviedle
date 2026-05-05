import { describe, expect, it } from "vitest";
import { applyMentions, discordMention, pingableUserId } from "./discordBot";

describe("discordMention", () => {
  it("returns <@id> for a real Discord snowflake", () => {
    expect(discordMention("123456789012345678", "alice")).toBe(
      "<@123456789012345678>",
    );
  });

  it("falls back to @username for local-dev userIds", () => {
    expect(discordMention("local-abc", "alice")).toBe("@alice");
  });

  it("falls back to @local-dev when there is no username", () => {
    expect(discordMention("local-abc", null)).toBe("@local-dev");
  });
});

describe("pingableUserId", () => {
  it("returns the id for real Discord users", () => {
    expect(pingableUserId("123456789012345678")).toBe("123456789012345678");
  });

  it("returns null for local-dev users", () => {
    expect(pingableUserId("local-abc")).toBeNull();
  });
});

describe("applyMentions", () => {
  it("rewrites @username to <@userId>", () => {
    const out = applyMentions("@alice clutched it today", [
      { userId: "111", username: "alice" },
    ]);
    expect(out).toBe("<@111> clutched it today");
  });

  it("rewrites every occurrence", () => {
    const out = applyMentions("@alice and @alice again", [
      { userId: "111", username: "alice" },
    ]);
    expect(out).toBe("<@111> and <@111> again");
  });

  it("rewrites multiple players", () => {
    const out = applyMentions("@alice and @bob both flexed", [
      { userId: "111", username: "alice" },
      { userId: "222", username: "bob" },
    ]);
    expect(out).toBe("<@111> and <@222> both flexed");
  });

  it("respects word boundaries — @bob does not match inside @bobby", () => {
    const out = applyMentions("@bobby was robbed", [
      { userId: "111", username: "bob" },
    ]);
    expect(out).toBe("@bobby was robbed");
  });

  it("leaves local-dev users as plain text", () => {
    const out = applyMentions("@alice and @localguy played", [
      { userId: "111", username: "alice" },
      { userId: "local-xyz", username: "localguy" },
    ]);
    expect(out).toBe("<@111> and @localguy played");
  });

  it("leaves unrecognized handles untouched", () => {
    const out = applyMentions("@stranger was here", [
      { userId: "111", username: "alice" },
    ]);
    expect(out).toBe("@stranger was here");
  });

  it("handles usernames with regex-special characters safely", () => {
    const out = applyMentions("@a.b.c was here", [
      { userId: "111", username: "a.b.c" },
    ]);
    expect(out).toBe("<@111> was here");
  });
});
