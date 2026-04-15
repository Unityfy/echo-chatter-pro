import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_URLS_PER_KB = 500;
const MAX_CHUNK_WORDS = 400;
const MIN_CHUNK_WORDS = 50;
const OVERLAP_SENTENCES = 1;
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// ─── Semantic Chunking ─────────────────────────────────────────
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
      if (currentChunk.length > 0) { chunks.push(currentChunk.join("\n\n")); currentChunk = []; currentWords = 0; }
      const sentences = splitIntoSentences(para);
      let sentBuf: string[] = [], sentWords = 0;
      for (const sent of sentences) {
        const sw = sent.split(/\s+/).length;
        if (sentWords + sw > MAX_CHUNK_WORDS && sentBuf.length > 0) {
          chunks.push(sentBuf.join(" "));
          sentBuf = [...sentBuf.slice(-OVERLAP_SENTENCES), sent];
          sentWords = sentBuf.join(" ").split(/\s+/).length;
        } else { sentBuf.push(sent); sentWords += sw; }
      }
      if (sentBuf.length > 0) chunks.push(sentBuf.join(" "));
      continue;
    }
    if (currentWords + paraWords > MAX_CHUNK_WORDS && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      const lastPara = currentChunk[currentChunk.length - 1];
      const lw = lastPara.split(/\s+/).length;
      currentChunk = lw <= MAX_CHUNK_WORDS / 4 ? [lastPara, para] : [para];
      currentWords = currentChunk.join(" ").split(/\s+/).length;
    } else { currentChunk.push(para); currentWords += paraWords; }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));
  return chunks.filter((c) => c.split(/\s+/).length >= MIN_CHUNK_WORDS || chunks.length === 1);
}

function deduplicateChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const fp = c.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

// ─── Batch Embedding with Retry ─────────────────────────────────
async function generateEmbeddingsBatch(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  for (let bs = 0; bs < texts.length; bs += BATCH_SIZE) {
    const batch = texts.slice(bs, bs + BATCH_SIZE);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: batch, dimensions: 768 }),
        });
        if (resp.status === 429) { await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000)); continue; }
        if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);
        const data = await resp.json();
        for (let i = 0; i < data.data.length; i++) results[bs + i] = data.data[i].embedding;
        break;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) console.error(`Batch ${bs} failed:`, e);
        else await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  return results;
}

// ─── HTML Processing ────────────────────────────────────────────
function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ").trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).href;
      const base = new URL(baseUrl);
      const link = new URL(resolved);
      if (link.origin === base.origin && !resolved.match(/\.(jpg|jpeg|png|gif|svg|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|zip|pdf)$/i)) {
        links.push(link.origin + link.pathname);
      }
    } catch { /* skip */ }
  }
  return [...new Set(links)];
}

async function fetchAndClean(url: string): Promise<{ text: string; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "VoxAgent-Crawler/1.0" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    return { text: cleanHtml(html), html };
  } finally { clearTimeout(timeout); }
}

async function processUrl(
  supabase: any, sourceId: string, url: string, apiKey: string, metadata: Record<string, unknown>
): Promise<number> {
  const { text } = await fetchAndClean(url);
  if (!text || text.length < 20) return 0;

  await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

  const rawChunks = semanticChunkText(text);
  const chunks = deduplicateChunks(rawChunks);
  const embeddings = await generateEmbeddingsBatch(chunks, apiKey);

  let count = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (!embeddings[i]) continue;
    const { error } = await supabase.from("knowledge_chunks").insert({
      source_id: sourceId, content: chunks[i], embedding: JSON.stringify(embeddings[i]),
      chunk_index: i, metadata: { ...metadata, url },
    });
    if (!error) count++;
  }
  return count;
}

// ─── Main Handler ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { sourceId, mode } = await req.json();
    if (!sourceId) throw new Error("sourceId is required");

    const { data: source, error: srcErr } = await supabase
      .from("knowledge_sources").select("*").eq("id", sourceId).single();
    if (srcErr || !source) throw new Error("Source not found");

    const crawlMode = mode === "crawl" || source.crawl_config?.auto_crawl === true;
    const url = source.source_url;
    if (!url) throw new Error("No URL on source");

    await supabase.from("knowledge_sources").update({
      status: "processing", crawl_status: crawlMode ? "crawling" : "idle",
    }).eq("id", sourceId);

    if (!crawlMode) {
      try {
        const chunkCount = await processUrl(supabase, sourceId, url, LOVABLE_API_KEY, { source_type: "url" });
        await supabase.from("knowledge_sources").update({
          status: "ready", chunk_count: chunkCount, last_refreshed_at: new Date().toISOString(), error_message: null,
        }).eq("id", sourceId);
        return new Response(JSON.stringify({ success: true, chunks: chunkCount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        await supabase.from("knowledge_sources").update({ status: "error", error_message: e.message }).eq("id", sourceId);
        throw e;
      }
    }

    // ── Crawl mode ──
    const config = source.crawl_config || {};
    const exclusions: string[] = config.exclusion_list || [];
    const maxUrls = Math.min(config.max_urls || MAX_URLS_PER_KB, MAX_URLS_PER_KB);

    const { count: existingCount } = await supabase
      .from("knowledge_sources").select("id", { count: "exact", head: true })
      .eq("knowledge_base_id", source.knowledge_base_id).eq("type", "url");

    let totalChunks = 0;
    let discoveredUrls: string[] = [];

    try {
      const { text, html } = await fetchAndClean(url);
      if (text && text.length >= 20) {
        totalChunks += await processUrl(supabase, sourceId, url, LOVABLE_API_KEY, { source_type: "url", is_root: true });
      }

      const basePath = new URL(url).pathname;
      discoveredUrls = extractLinks(html, url).filter((link) => {
        try { return new URL(link).pathname.startsWith(basePath) && !exclusions.some((ex) => link.includes(ex)) && link !== url; }
        catch { return false; }
      });
    } catch (e: any) {
      await supabase.from("knowledge_sources").update({ status: "error", crawl_status: "error", error_message: `Root URL failed: ${e.message}` }).eq("id", sourceId);
      throw e;
    }

    const slotsAvailable = maxUrls - (existingCount || 0);
    const urlsToCrawl = discoveredUrls.slice(0, Math.max(0, slotsAvailable));

    const { data: existingChildren } = await supabase
      .from("knowledge_sources").select("source_url").eq("parent_source_id", sourceId);
    const existingUrls = new Set((existingChildren || []).map((c: any) => c.source_url));

    let crawledCount = 0;
    for (const childUrl of urlsToCrawl) {
      if (existingUrls.has(childUrl)) continue;
      try {
        const { data: childSource, error: childErr } = await supabase
          .from("knowledge_sources").insert({
            knowledge_base_id: source.knowledge_base_id, type: "url",
            source_url: childUrl, parent_source_id: sourceId, status: "processing",
          }).select().single();
        if (childErr || !childSource) continue;

        const chunks = await processUrl(supabase, childSource.id, childUrl, LOVABLE_API_KEY, { source_type: "url", parent_url: url });
        await supabase.from("knowledge_sources").update({
          status: "ready", chunk_count: chunks, last_refreshed_at: new Date().toISOString(), error_message: null,
        }).eq("id", childSource.id);
        totalChunks += chunks;
        crawledCount++;
      } catch (e: any) {
        console.error(`Failed to crawl ${childUrl}:`, e.message);
      }
    }

    await supabase.from("knowledge_sources").update({
      status: "ready", crawl_status: "done", discovered_urls_count: crawledCount,
      last_refreshed_at: new Date().toISOString(), error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({ success: true, totalChunks, discoveredUrls: discoveredUrls.length, crawledUrls: crawledCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crawl-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
