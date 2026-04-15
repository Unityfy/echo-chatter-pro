import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_URLS_PER_KB = 500;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + CHUNK_SIZE >= words.length) break;
  }
  return chunks;
}

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
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).href;
      // Only same-origin links, no fragments, no query-heavy URLs
      const base = new URL(baseUrl);
      const link = new URL(resolved);
      if (link.origin === base.origin && !resolved.match(/\.(jpg|jpeg|png|gif|svg|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|zip|pdf)$/i)) {
        links.push(link.origin + link.pathname);
      }
    } catch { /* skip invalid URLs */ }
  }
  return [...new Set(links)];
}

function isExcluded(url: string, exclusions: string[]): boolean {
  return exclusions.some((ex) => url.includes(ex));
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text, dimensions: 768 }),
  });
  if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);
  const data = await resp.json();
  return data.data[0].embedding;
}

async function fetchAndClean(url: string): Promise<{ text: string; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "VoxAgent-Crawler/1.0" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    return { text: cleanHtml(html), html };
  } finally {
    clearTimeout(timeout);
  }
}

async function processUrl(
  supabase: any,
  sourceId: string,
  url: string,
  apiKey: string,
  metadata: Record<string, unknown>
): Promise<number> {
  const { text } = await fetchAndClean(url);
  if (!text || text.length < 20) return 0;

  // Delete existing chunks
  await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

  const chunks = chunkText(text);
  let count = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await generateEmbedding(chunks[i], apiKey);
      const { error } = await supabase.from("knowledge_chunks").insert({
        source_id: sourceId,
        content: chunks[i],
        embedding: JSON.stringify(embedding),
        chunk_index: i,
        metadata: { ...metadata, url },
      });
      if (!error) count++;
    } catch (e) {
      console.error(`Chunk ${i} embedding failed:`, e);
    }
  }
  return count;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { sourceId, mode } = await req.json();
    // mode: "single" (default) or "crawl"
    if (!sourceId) throw new Error("sourceId is required");

    const { data: source, error: srcErr } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    if (srcErr || !source) throw new Error("Source not found");

    const crawlMode = mode === "crawl" || source.crawl_config?.auto_crawl === true;
    const url = source.source_url;
    if (!url) throw new Error("No URL on source");

    // Update status
    await supabase.from("knowledge_sources").update({
      status: "processing",
      crawl_status: crawlMode ? "crawling" : "idle",
    }).eq("id", sourceId);

    if (!crawlMode) {
      // ── Single URL mode ──────────────────────────────────────
      try {
        const chunkCount = await processUrl(supabase, sourceId, url, LOVABLE_API_KEY, { source_type: "url" });
        await supabase.from("knowledge_sources").update({
          status: "ready",
          chunk_count: chunkCount,
          last_refreshed_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", sourceId);

        return new Response(JSON.stringify({ success: true, chunks: chunkCount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        await supabase.from("knowledge_sources").update({
          status: "error",
          error_message: e.message,
        }).eq("id", sourceId);
        throw e;
      }
    }

    // ── Crawl mode ──────────────────────────────────────────────
    const config = source.crawl_config || {};
    const exclusions: string[] = config.exclusion_list || [];
    const maxUrls = Math.min(config.max_urls || MAX_URLS_PER_KB, MAX_URLS_PER_KB);

    // Get existing child count for this KB
    const { count: existingCount } = await supabase
      .from("knowledge_sources")
      .select("id", { count: "exact", head: true })
      .eq("knowledge_base_id", source.knowledge_base_id)
      .eq("type", "url");
    const currentCount = existingCount || 0;

    // Process the root URL first
    let totalChunks = 0;
    let discoveredUrls: string[] = [];

    try {
      const { text, html } = await fetchAndClean(url);
      if (text && text.length >= 20) {
        const rootChunks = await processUrl(supabase, sourceId, url, LOVABLE_API_KEY, { source_type: "url", is_root: true });
        totalChunks += rootChunks;
        await supabase.from("knowledge_sources").update({ chunk_count: rootChunks }).eq("id", sourceId);
      }

      // Discover links under the same path
      const basePath = new URL(url).pathname;
      const allLinks = extractLinks(html, url);
      discoveredUrls = allLinks.filter((link) => {
        try {
          const linkPath = new URL(link).pathname;
          return linkPath.startsWith(basePath) && !isExcluded(link, exclusions) && link !== url;
        } catch { return false; }
      });
    } catch (e: any) {
      await supabase.from("knowledge_sources").update({
        status: "error",
        crawl_status: "error",
        error_message: `Root URL failed: ${e.message}`,
      }).eq("id", sourceId);
      throw e;
    }

    // Limit total URLs
    const slotsAvailable = maxUrls - currentCount;
    const urlsToCrawl = discoveredUrls.slice(0, Math.max(0, slotsAvailable));

    // Get already-crawled child URLs to avoid duplicates
    const { data: existingChildren } = await supabase
      .from("knowledge_sources")
      .select("source_url")
      .eq("parent_source_id", sourceId);
    const existingUrls = new Set((existingChildren || []).map((c: any) => c.source_url));

    let crawledCount = 0;
    for (const childUrl of urlsToCrawl) {
      if (existingUrls.has(childUrl)) continue;

      try {
        // Create child source
        const { data: childSource, error: childErr } = await supabase
          .from("knowledge_sources")
          .insert({
            knowledge_base_id: source.knowledge_base_id,
            type: "url",
            source_url: childUrl,
            parent_source_id: sourceId,
            status: "processing",
          })
          .select()
          .single();

        if (childErr || !childSource) continue;

        const chunks = await processUrl(supabase, childSource.id, childUrl, LOVABLE_API_KEY, {
          source_type: "url",
          parent_url: url,
        });

        await supabase.from("knowledge_sources").update({
          status: "ready",
          chunk_count: chunks,
          last_refreshed_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", childSource.id);

        totalChunks += chunks;
        crawledCount++;
      } catch (e: any) {
        console.error(`Failed to crawl ${childUrl}:`, e.message);
      }
    }

    // Update parent source
    await supabase.from("knowledge_sources").update({
      status: "ready",
      crawl_status: "done",
      discovered_urls_count: crawledCount,
      last_refreshed_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({
      success: true,
      totalChunks,
      discoveredUrls: discoveredUrls.length,
      crawledUrls: crawledCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crawl-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
