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
    if (!bodyTrimmed) continue;

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
