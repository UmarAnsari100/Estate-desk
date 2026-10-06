export function databaseSafeText(value: string) {
  return value.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
}

// Local PostgreSQL clusters created under some Windows locales use WIN1252.
// A WhatsApp push name must never make the entire inbound webhook fail when it
// contains another script or decorative symbols. Message content continues to
// use databaseSafeText so UTF-8 production databases retain customer language.
export function databaseSafeDisplayName(value: string) {
  return value
    .normalize("NFKC")
    .replace(
      /[^\x20-\x7e\u00a0-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
