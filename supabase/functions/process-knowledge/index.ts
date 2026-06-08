import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Semantic Chunking ─────────────────────────────────────────
const MAX_CHUNK_WORDS = 400;
const MIN_CHUNK_WORDS = 50;
const OVERLAP_SENTENCES = 1;

function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries (., !, ?) followed by whitespace or end
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

    // If a single paragraph exceeds max, split it by sentences
    if (paraWords > MAX_CHUNK_WORDS) {
      // Flush current
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWords = 0;
      }
      // Split long paragraph by sentences
      const sentences = splitIntoSentences(para);
      let sentBuf: string[] = [];
      let sentWords = 0;
      for (const sent of sentences) {
        const sw = sent.split(/\s+/).length;
        if (sentWords + sw > MAX_CHUNK_WORDS && sentBuf.length > 0) {
          chunks.push(sentBuf.join(" "));
          // Keep last sentence for overlap
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

    // If adding this paragraph would exceed limit, flush
    if (currentWords + paraWords > MAX_CHUNK_WORDS && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      // Keep last paragraph for context overlap
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

  // Filter out tiny chunks
  return chunks.filter((c) => c.split(/\s+/).length >= MIN_CHUNK_WORDS || chunks.length === 1);
}

// ─── Deduplication ──────────────────────────────────────────────
function deduplicateChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const chunk of chunks) {
    // Normalize for comparison
    const key = chunk.toLowerCase().replace(/\s+/g, " ").trim();
    // Check for near-exact duplicates (first 200 chars as fingerprint)
    const fingerprint = key.slice(0, 200);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(chunk);
    }
  }
  return result;
}

// ─── Batch Embedding with Retry ─────────────────────────────────
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
    const batch = texts.slice(batchStart, batchStart + BATCH_SIZE);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/text-embedding-3-small",
            input: batch,
            dimensions: 768,
          }),
        });

        if (resp.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Embedding failed: ${resp.status} ${err}`);
        }

        const data = await resp.json();
        for (let i = 0; i < data.data.length; i++) {
          results[batchStart + i] = data.data[i].embedding;
        }
        lastError = null;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    if (lastError) {
      console.error(`Batch at ${batchStart} failed after ${MAX_RETRIES} retries:`, lastError);
    }
  }

  return results;
}

// ─── URL Fetching ───────────────────────────────────────────────
async function fetchUrlContent(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
  const html = await resp.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Main Handler ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { sourceId } = await req.json();
    if (!sourceId) throw new Error("sourceId is required");

    const { data: source, error: srcErr } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    if (srcErr || !source) throw new Error("Source not found");

    await supabase.from("knowledge_sources").update({ status: "processing" }).eq("id", sourceId);

    let content = "";
    if (source.type === "text") {
      content = source.content_text || "";
    } else if (source.type === "url") {
      content = await fetchUrlContent(source.source_url);
    } else if (source.type === "file") {
      if (source.file_path) {
        // Delegate to process-file-knowledge
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resp = await fetch(`${baseUrl}/functions/v1/process-file-knowledge`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ sourceId }),
        });
        const result = await resp.json();
        return new Response(JSON.stringify(result), {
          status: resp.ok ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      content = source.content_text || "";
    }

    if (!content.trim()) {
      await supabase.from("knowledge_sources").update({ status: "error", error_message: "No content to process" }).eq("id", sourceId);
      return new Response(JSON.stringify({ error: "No content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing chunks
    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

    // Semantic chunking + deduplication
    const rawChunks = semanticChunkText(content);
    const chunks = deduplicateChunks(rawChunks);

    // Batch embeddings with retry
    const embeddings = await generateEmbeddingsBatch(chunks, LOVABLE_API_KEY);

    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (!embeddings[i]) continue;
      try {
        const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
          source_id: sourceId,
          content: chunks[i],
          embedding: JSON.stringify(embeddings[i]),
          chunk_index: i,
          metadata: {
            source_type: source.type,
            source_name: source.file_name || source.source_url || "text",
          },
        });
        if (!insertErr) successCount++;
      } catch (e) {
        console.error(`Insert chunk ${i} failed:`, e);
      }
    }

    await supabase.from("knowledge_sources").update({
      status: "ready",
      chunk_count: successCount,
      error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({ success: true, chunks: successCount, deduped: rawChunks.length - chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
