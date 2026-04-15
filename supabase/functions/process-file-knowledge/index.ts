import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const MAX_ROWS = 1000;
const MAX_COLS = 50;

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + CHUNK_SIZE >= words.length) break;
  }
  return chunks.length ? chunks : [text.trim()];
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 768,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding failed: ${resp.status} ${err}`);
  }
  const data = await resp.json();
  return data.data[0].embedding;
}

function extractTextFromCSV(content: string): string {
  const lines = content.split("\n").filter(l => l.trim());
  const limited = lines.slice(0, MAX_ROWS + 1); // +1 for header
  const rows = limited.map(line => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells.slice(0, MAX_COLS);
  });

  if (rows.length === 0) return "";
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Convert each row into readable text
  return dataRows.map((row, i) => {
    const parts = row.map((cell, j) => `${headers[j] || `Col${j+1}`}: ${cell}`).filter(p => p);
    return `Row ${i + 1}: ${parts.join(", ")}`;
  }).join("\n");
}

function extractTextFromTXT(content: string): string {
  return content.trim();
}

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
    const fileExt = (source.file_name || "").split(".").pop()?.toLowerCase() || "";

    if (source.type === "file" && source.file_path) {
      // Download from storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("knowledge-files")
        .download(source.file_path);
      
      if (dlErr || !fileData) {
        throw new Error(`Failed to download file: ${dlErr?.message || "unknown"}`);
      }

      if (fileExt === "txt") {
        content = extractTextFromTXT(await fileData.text());
      } else if (fileExt === "csv") {
        content = extractTextFromCSV(await fileData.text());
      } else if (fileExt === "pdf") {
        // Use AI gateway to extract text from PDF
        const base64 = btoa(
          new Uint8Array(await fileData.arrayBuffer())
            .reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Extract ALL text content from this PDF document. Return only the extracted text, preserving structure. Do not add commentary." },
                  { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
                ],
              },
            ],
            max_tokens: 16000,
          }),
        });
        if (!resp.ok) throw new Error(`PDF extraction failed: ${resp.status}`);
        const result = await resp.json();
        content = result.choices?.[0]?.message?.content || "";
      } else if (fileExt === "docx") {
        // DOCX: extract text from XML inside zip
        // Simple approach: send to AI for extraction
        const base64 = btoa(
          new Uint8Array(await fileData.arrayBuffer())
            .reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Extract ALL text content from this document. Return only the extracted text, preserving structure. Do not add commentary." },
                  { type: "image_url", image_url: { url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}` } },
                ],
              },
            ],
            max_tokens: 16000,
          }),
        });
        if (!resp.ok) throw new Error(`DOCX extraction failed: ${resp.status}`);
        const result = await resp.json();
        content = result.choices?.[0]?.message?.content || "";
      } else if (fileExt === "xlsx" || fileExt === "xls") {
        // For Excel, read as text (will be limited)
        const text = await fileData.text();
        content = extractTextFromCSV(text);
        if (!content.trim()) {
          // Fallback: send to AI
          const base64 = btoa(
            new Uint8Array(await fileData.arrayBuffer())
              .reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Extract ALL data from this spreadsheet. Convert each row into readable text format with column headers. Max 1000 rows. Return only the data." },
                    { type: "image_url", image_url: { url: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}` } },
                  ],
                },
              ],
              max_tokens: 16000,
            }),
          });
          if (!resp.ok) throw new Error(`XLSX extraction failed: ${resp.status}`);
          const result = await resp.json();
          content = result.choices?.[0]?.message?.content || "";
        }
      }
    } else if (source.content_text) {
      // Fallback for text/file sources with inline content
      if (fileExt === "csv") {
        content = extractTextFromCSV(source.content_text);
      } else {
        content = source.content_text;
      }
    }

    if (!content.trim()) {
      await supabase.from("knowledge_sources").update({ 
        status: "error", 
        error_message: "No content could be extracted from file" 
      }).eq("id", sourceId);
      return new Response(JSON.stringify({ error: "No content extracted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing chunks
    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

    // Chunk and embed
    const chunks = chunkText(content);
    let successCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i], LOVABLE_API_KEY);
        const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
          source_id: sourceId,
          content: chunks[i],
          embedding: JSON.stringify(embedding),
          chunk_index: i,
          metadata: { source_type: "file", source_name: source.file_name || "file", file_type: fileExt },
        });
        if (!insertErr) successCount++;
      } catch (e) {
        console.error(`Chunk ${i} failed:`, e);
      }
    }

    await supabase.from("knowledge_sources").update({
      status: "ready",
      chunk_count: successCount,
      error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({ success: true, chunks: successCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-file-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
