import { CHUNK_MAX_CHARS } from "./config.js";

export interface Chunk {
  section: string;
  content: string;
  index: number;
}

function splitAtParagraphs(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const pieces: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      pieces.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

// A section body is "substantial" — worth embedding — when it carries enough
// meaningful text: at least MIN_BODY_MEANINGFUL_CHARS letters/digits. Empty
// template scaffolds (`---`, placeholder comments, bare list stubs) fall short and
// are pruned as index noise. Only letters/digits count, so punctuation-only or
// markup-only bodies score zero. The `(title)` chunk is never subjected to this
// filter, so the F8 title-only invariant is preserved.
const MIN_BODY_MEANINGFUL_CHARS = 25;

function isSubstantialBody(body: string): boolean {
  const meaningful = body.match(/[\p{L}\p{N}]/gu);
  return (meaningful?.length ?? 0) >= MIN_BODY_MEANINGFUL_CHARS;
}

export function chunkMarkdown(content: string, title?: string): Chunk[] {
  const lines = content.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let currentHeading = "(intro)";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n") });
      }
      currentHeading = headingMatch[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n") });
  }

  const chunks: Chunk[] = [];
  let index = 0;

  // Seed a dedicated title chunk so that (a) a title-only / empty-body page never
  // collapses to 0 chunks (and gets silently dropped at indexing time), and (b) the
  // title is always a first-class search signal — even for pages whose body never
  // repeats it (F8 + F11).
  const titleTrimmed = title?.trim();
  if (titleTrimmed) {
    chunks.push({ section: "(title)", content: titleTrimmed, index: index++ });
  }

  for (const section of sections) {
    const bodyTrimmed = section.body.trim();
    if (!isSubstantialBody(bodyTrimmed)) continue;

    const fullText = `${section.heading}\n\n${bodyTrimmed}`;

    if (fullText.length <= CHUNK_MAX_CHARS) {
      chunks.push({ section: section.heading, content: fullText, index: index++ });
    } else {
      const pieces = splitAtParagraphs(fullText, CHUNK_MAX_CHARS);
      for (const piece of pieces) {
        chunks.push({ section: section.heading, content: piece, index: index++ });
      }
    }
  }

  return chunks;
}
