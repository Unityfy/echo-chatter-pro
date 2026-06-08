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
const MAX_ROWS = 1000;
const MAX_COLS = 50;
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

function splitIntoSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 10);
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

  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));
  return chunks.filter((c) => c.split(/\s+/).length >= MIN_CHUNK_WORDS || chunks.length === 1);
}

function deduplicateChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const chunk of chunks) {
    const fingerprint = chunk.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(chunk);
    }
  }
  return result;
}

// ─── Batch Embedding with Retry ─────────────────────────────────
async function generateEmbeddingsBatch(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
    const batch = texts.slice(batchStart, batchStart + BATCH_SIZE);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai/text-embedding-3-small", input: batch, dimensions: 768 }),
        });

        if (resp.status === 429) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);

        const data = await resp.json();
        for (let i = 0; i < data.data.length; i++) {
          results[batchStart + i] = data.data[i].embedding;
        }
        break;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) console.error(`Batch ${batchStart} failed:`, e);
        else await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  return results;
}

// ─── File Extractors ────────────────────────────────────────────
function extractTextFromCSV(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  const limited = lines.slice(0, MAX_ROWS + 1);
  const rows = limited.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells.slice(0, MAX_COLS);
  });

  if (rows.length === 0) return "";
  const headers = rows[0];
  return rows.slice(1).map((row, i) => {
    const parts = row.map((cell, j) => `${headers[j] || `Col${j + 1}`}: ${cell}`).filter(Boolean);
    return `Row ${i + 1}: ${parts.join(", ")}`;
  }).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { sourceId } = await req.json();
    if (!sourceId) throw new Error("sourceId is required");

    const { data: source, error: srcErr } = await supabase
      .from("knowledge_sources").select("*").eq("id", sourceId).single();
    if (srcErr || !source) throw new Error("Source not found");

    await supabase.from("knowledge_sources").update({ status: "processing" }).eq("id", sourceId);

    let content = "";
    const fileExt = (source.file_name || "").split(".").pop()?.toLowerCase() || "";

    if (source.type === "file" && source.file_path) {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("knowledge-files").download(source.file_path);
      if (dlErr || !fileData) throw new Error(`Failed to download: ${dlErr?.message}`);

      if (fileExt === "txt") {
        content = (await fileData.text()).trim();
      } else if (fileExt === "csv") {
        content = extractTextFromCSV(await fileData.text());
      } else if (fileExt === "pdf") {
        // Extract PDF text using unpdf (pure JS, runs in Deno, no AI roundtrip)
        try {
          const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
          const buffer = new Uint8Array(await fileData.arrayBuffer());
          const pdf = await getDocumentProxy(buffer);
          const { text } = await extractText(pdf, { mergePages: true });
          content = (Array.isArray(text) ? text.join("\n\n") : text).trim();
          console.log(`[pdf] extracted ${content.length} chars from ${pdf.numPages} pages`);
        } catch (e) {
          console.error("[pdf] extraction failed:", e);
          throw new Error(`PDF parse failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (fileExt === "docx") {
        // Extract DOCX text via mammoth
        try {
          const mammoth = await import("https://esm.sh/mammoth@1.8.0?target=denonext");
          const buffer = await fileData.arrayBuffer();
          const result = await (mammoth as any).extractRawText({ arrayBuffer: buffer });
          content = (result.value || "").trim();
          console.log(`[docx] extracted ${content.length} chars`);
        } catch (e) {
          console.error("[docx] extraction failed:", e);
          throw new Error(`DOCX parse failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (fileExt === "xlsx" || fileExt === "xls") {
        try {
          const XLSX = await import("https://esm.sh/xlsx@0.18.5");
          const buffer = new Uint8Array(await fileData.arrayBuffer());
          const wb = (XLSX as any).read(buffer, { type: "array" });
          const parts: string[] = [];
          for (const sheetName of wb.SheetNames) {
            const csv = (XLSX as any).utils.sheet_to_csv(wb.Sheets[sheetName]);
            parts.push(`# Sheet: ${sheetName}\n${extractTextFromCSV(csv)}`);
          }
          content = parts.join("\n\n").trim();
          console.log(`[xlsx] extracted ${content.length} chars`);
        } catch (e) {
          console.error("[xlsx] extraction failed:", e);
          throw new Error(`XLSX parse failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

    } else if (source.content_text) {
      content = fileExt === "csv" ? extractTextFromCSV(source.content_text) : source.content_text;
    }

    if (!content.trim()) {
      await supabase.from("knowledge_sources").update({ status: "error", error_message: "No content extracted" }).eq("id", sourceId);
      return new Response(JSON.stringify({ error: "No content extracted" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

    const rawChunks = semanticChunkText(content);
    const chunks = deduplicateChunks(rawChunks);
    const embeddings = await generateEmbeddingsBatch(chunks, LOVABLE_API_KEY);

    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (!embeddings[i]) continue;
      try {
        const { error } = await supabase.from("knowledge_chunks").insert({
          source_id: sourceId,
          content: chunks[i],
          embedding: JSON.stringify(embeddings[i]),
          chunk_index: i,
          metadata: { source_type: "file", source_name: source.file_name || "file", file_type: fileExt },
        });
        if (!error) successCount++;
      } catch (e) {
        console.error(`Insert chunk ${i} failed:`, e);
      }
    }

    await supabase.from("knowledge_sources").update({
      status: "ready", chunk_count: successCount, error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({ success: true, chunks: successCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-file-knowledge error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      const supabaseErr = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const body = await req.clone().json().catch(() => ({}));
      if (body?.sourceId) {
        await supabaseErr.from("knowledge_sources")
          .update({ status: "error", error_message: msg })
          .eq("id", body.sourceId);
      }
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

