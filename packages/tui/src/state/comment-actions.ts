export function normalizeCommentContent(content: string): string | null {
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}
