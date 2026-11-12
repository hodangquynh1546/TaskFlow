/** The name people are addressed by in Vietnamese is the last word: "Nguyễn Văn An" becomes "An". */
export function givenName(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 ? words[words.length - 1] : '';
}
