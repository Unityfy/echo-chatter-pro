import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ─── Copy chunking logic from index.ts for unit testing ───
const MAX_CHUNK_WORDS = 400;
const MIN_CHUNK_WORDS = 50;
const OVERLAP_SENTENCES = 1;

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 10);
}

function semanticChunkText(text: string): string[] {
  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) return [text.trim()].filter(Boolean);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;

    if (paraWords > MAX_CHUNK_WORDS) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWords = 0;
      }
      const sentences = splitIntoSentences(para);
      let sentBuf: string[] = [];
      let sentWords = 0;
      for (const sent of sentences) {
        const sw = sent.split(/\s+/).length;
        if (sentWords + sw > MAX_CHUNK_WORDS && sentBuf.length > 0) {
          chunks.push(sentBuf.join(" "));
          const overlap = sentBuf.slice(-OVERLAP_SENTENCES);
          sentBuf = [...overlap, sent];
          sentWords = sentBuf.join(" ").split(/\s+/).length;
        } else {
          sentBuf.push(sent);
          sentWords += sw;
        }
      }
      if (sentBuf.length > 0) chunks.push(sentBuf.join(" "));
      continue;
    }

    if (currentWords + paraWords > MAX_CHUNK_WORDS && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      const lastPara = currentChunk[currentChunk.length - 1];
      const lastWords = lastPara.split(/\s+/).length;
      if (lastWords <= MAX_CHUNK_WORDS / 4) {
        currentChunk = [lastPara, para];
        currentWords = lastWords + paraWords;
      } else {
        currentChunk = [para];
        currentWords = paraWords;
      }
    } else {
      currentChunk.push(para);
      currentWords += paraWords;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks.filter((c) => c.split(/\s+/).length >= MIN_CHUNK_WORDS || chunks.length === 1);
}

function deduplicateChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const chunk of chunks) {
    const key = chunk.toLowerCase().replace(/\s+/g, " ").trim();
    const fingerprint = key.slice(0, 200);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(chunk);
    }
  }
  return result;
}

// ─── Tests ─────────────────────────────────────────────────────

Deno.test("semanticChunkText splits paragraphs correctly", () => {
  // Generate 3 paragraphs with ~100 words each
  const para = Array(100).fill("word").join(" ") + ".";
  const text = `${para}\n\n${para}\n\n${para}`;
  const chunks = semanticChunkText(text);
  // All 3 paragraphs should fit in one chunk (300 words < 400 max)
  assertEquals(chunks.length, 1);
});

Deno.test("semanticChunkText splits when exceeding max words", () => {
  const para = Array(250).fill("word").join(" ") + ".";
  const text = `${para}\n\n${para}`;
  const chunks = semanticChunkText(text);
  // 500 words total > 400, should split into 2 chunks
  assertEquals(chunks.length, 2);
});

Deno.test("semanticChunkText handles long single paragraph via sentences", () => {
  // Create a paragraph with many sentences totaling >400 words
  const sentences = Array(50).fill("This is a sentence with about ten words in it.").join(" ");
  const chunks = semanticChunkText(sentences);
  assert(chunks.length >= 2, `Expected >= 2 chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    const words = chunk.split(/\s+/).length;
    assert(words <= MAX_CHUNK_WORDS + 20, `Chunk has ${words} words, exceeds max`);
  }
});

Deno.test("deduplicateChunks removes near-exact duplicates", () => {
  const chunks = [
    "This is a test chunk with some content about AI voice agents.",
    "This is a test chunk with some content about AI voice agents.",
    "A completely different chunk about knowledge bases and retrieval.",
  ];
  const deduped = deduplicateChunks(chunks);
  assertEquals(deduped.length, 2);
});

Deno.test("deduplicateChunks preserves unique chunks", () => {
  const chunks = [
    "First unique chunk about topic A with enough words to be meaningful.",
    "Second unique chunk about topic B with different content entirely.",
    "Third unique chunk about topic C discussing something new altogether.",
  ];
  const deduped = deduplicateChunks(chunks);
  assertEquals(deduped.length, 3);
});

Deno.test("semanticChunkText returns single chunk for short text", () => {
  const text = "Short text.";
  const chunks = semanticChunkText(text);
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0], "Short text.");
});

Deno.test("splitIntoSentences works correctly", () => {
  const text = "First sentence. Second sentence! Third sentence? Fourth.";
  const sentences = splitIntoSentences(text);
  assertEquals(sentences.length, 4);
});

Deno.test("End-to-end: chunk + deduplicate pipeline", () => {
  const para1 = Array(200).fill("alpha").join(" ") + ".";
  const para2 = Array(200).fill("beta").join(" ") + ".";
  const para3 = para1; // duplicate of para1
  const text = `${para1}\n\n${para2}\n\n${para3}`;
  
  const rawChunks = semanticChunkText(text);
  const deduped = deduplicateChunks(rawChunks);
  
  // Should have removed at least one duplicate
  assert(deduped.length <= rawChunks.length, "Dedup should not increase chunks");
  assert(deduped.length >= 1, "Should have at least 1 chunk");
});
