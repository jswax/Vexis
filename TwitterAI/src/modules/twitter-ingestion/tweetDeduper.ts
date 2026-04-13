import crypto from 'node:crypto';

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, ' ');
}

function canonicalizeText(text: string): string {
  return stripUrls(text)
    .toLowerCase()
    .replace(/@\w+/g, '@user')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function exactTextHash(text: string): string {
  return crypto.createHash('sha1').update(text.trim()).digest('hex');
}

export function nearDupHash(text: string): string {
  return crypto.createHash('sha1').update(canonicalizeText(text)).digest('hex');
}

export function extractLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/\S+/gi) ?? [];
  return matches
    .map((u) => {
      try {
        const url = new URL(u);
        url.hash = '';
        return url.toString();
      } catch {
        return null;
      }
    })
    .filter((x): x is string => Boolean(x));
}

