const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

function pushChunk(parts: string[], chunk: string, maxBytes: number): void {
  if (!chunk) return;
  if (byteLength(chunk) <= maxBytes) {
    parts.push(chunk);
    return;
  }

  let current = '';
  for (const char of chunk) {
    if (byteLength(char) > maxBytes) {
      if (current) {
        parts.push(current);
        current = '';
      }
      const bytes = encoder.encode(char);
      let start = 0;
      while (start < bytes.length) {
        let end = Math.min(start + maxBytes, bytes.length);
        while (end > start) {
          try {
            parts.push(decoder.decode(bytes.slice(start, end)));
            break;
          } catch {
            end -= 1;
          }
        }
        start = end;
      }
      continue;
    }

    const next = current + char;
    if (byteLength(next) > maxBytes) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
}

function appendSegment(parts: string[], segment: string, maxBytes: number): void {
  if (!segment) return;
  const last = parts.at(-1) ?? '';
  if (last && byteLength(last + segment) <= maxBytes) {
    parts[parts.length - 1] = last + segment;
    return;
  }
  if (byteLength(segment) <= maxBytes) {
    parts.push(segment);
    return;
  }

  const words = segment.match(/\S+\s*/g) ?? [segment];
  for (const word of words) {
    const current = parts.at(-1) ?? '';
    if (current && byteLength(current + word) <= maxBytes) {
      parts[parts.length - 1] = current + word;
    } else if (byteLength(word) <= maxBytes) {
      parts.push(word);
    } else {
      pushChunk(parts, word, maxBytes);
    }
  }
}

function splitSentenceUnits(text: string): string[] {
  return text.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+/gu) ?? [text];
}

export function splitMessage(text: string, maxBytes = 900): string[] {
  if (maxBytes < 1) {
    throw new Error('maxBytes must be positive');
  }
  if (byteLength(text) <= maxBytes) return [text];

  const parts: string[] = [];
  const paragraphs = text.split(/(\n\n+)/u);
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if (/^\n\n+$/u.test(paragraph)) {
      appendSegment(parts, paragraph, maxBytes);
      continue;
    }
    for (const sentence of splitSentenceUnits(paragraph)) {
      appendSegment(parts, sentence, maxBytes);
    }
  }

  return parts;
}
