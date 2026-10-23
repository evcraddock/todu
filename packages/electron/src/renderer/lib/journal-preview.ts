/** Create a compact, plain-text excerpt for a journal row. */
export function journalPreview(markdown: string): string {
  return (
    markdown
      .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, " ")
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, "")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240) || "Empty entry"
  );
}
