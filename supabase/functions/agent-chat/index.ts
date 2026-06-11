import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Helpers ─────────────────────────────────────────────────

function buildTranscriptQuery(messages: { role: string; content: string }[]): string {
  return messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n");
}

async function getRetrievalSettings(
  supabase: any,
  agentId: string
): Promise<{ chunksToRetrieve: number; similarityThreshold: number }> {
  const defaults = { chunksToRetrieve: 3, similarityThreshold: 0.6 };
  try {
    const { data } = await supabase
      .from("agent_configs")
      .select("config")
      .eq("agent_id", agentId)
      .eq("section", "knowledge")
      .maybeSingle();
    if (data?.config) {
      return {
        chunksToRetrieve: Number(data.config.chunksToRetrieve) || defaults.chunksToRetrieve,
        similarityThreshold: Number(data.config.similarityThreshold) || defaults.similarityThreshold,
      };
    }
  } catch (e) {
    console.error("Failed to fetch retrieval settings:", e);
  }
  return defaults;
}

// ─── Embedding ───────────────────────────────────────────────

async function getEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text, dimensions: 768 }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("Embedding API error:", resp.status, txt);
      return null;
    }
    const data = await resp.json();
    return data.data[0].embedding;
  } catch (e) {
    console.error("Embedding exception:", e);
    return null;
  }
}


// ─── Vector search ───────────────────────────────────────────

interface ChunkResult {
  content: string;
  metadata: any;
  similarity: number;
}

async function searchChunks(
  supabase: any,
  embedding: number[],
  kbIds: string[],
  matchCount: number,
  threshold: number
): Promise<ChunkResult[]> {
  if (kbIds.length === 0) return [];
  const { data } = await supabase.rpc("search_knowledge_chunks", {
    _query_embedding: JSON.stringify(embedding),
    _knowledge_base_ids: kbIds,
    _match_count: matchCount,
    _match_threshold: threshold,
  });
  return data || [];
}

// ─── Intent detection ────────────────────────────────────────

interface IntentWithKbs {
  id: string;
  name: string;
  description: string;
  kb_priority: string;
  kb_ids: string[];
}

async function detectIntent(
  transcript: string,
  intents: IntentWithKbs[],
  apiKey: string
): Promise<IntentWithKbs | null> {
  if (intents.length === 0) return null;
  try {
    const intentList = intents.map((i) => `- "${i.name}": ${i.description || i.name}`).join("\n");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an intent classifier. Given a conversation transcript and a list of intents, output ONLY the intent name that best matches. If none match, output "none".\n\nIntents:\n${intentList}`,
          },
          { role: "user", content: transcript },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const detected = (data.choices?.[0]?.message?.content || "").trim().toLowerCase().replace(/"/g, "");
    return intents.find((i) => i.name.toLowerCase() === detected) || null;
  } catch (e) {
    console.error("Intent detection error:", e);
    return null;
  }
}

// ─── Fetch agent intents with their KB IDs ───────────────────

async function getAgentIntents(supabase: any, agentId: string): Promise<IntentWithKbs[]> {
  const { data: intents } = await supabase
    .from("agent_intents")
    .select("id, name, description, kb_priority")
    .eq("agent_id", agentId);
  if (!intents || intents.length === 0) return [];

  const { data: links } = await supabase
    .from("agent_intent_knowledge_bases")
    .select("intent_id, knowledge_base_id")
    .in("intent_id", intents.map((i: any) => i.id));

  const kbMap: Record<string, string[]> = {};
  for (const l of links || []) {
    if (!kbMap[l.intent_id]) kbMap[l.intent_id] = [];
    kbMap[l.intent_id].push(l.knowledge_base_id);
  }

  return intents.map((i: any) => ({ ...i, kb_ids: kbMap[i.id] || [] }));
}

// ─── Debug info type ─────────────────────────────────────────

interface DebugInfo {
  detected_intent: string | null;
  intent_priority: string | null;
  chunks: {
    source: string;
    origin: "agent" | "intent";
    similarity: number;
    preview: string;
  }[];
  settings: { chunksToRetrieve: number; similarityThreshold: number };
}

// ─── RAG context builder ────────────────────────────────────

function formatChunks(chunks: ChunkResult[], label: string): string {
  if (chunks.length === 0) return "";
  const grouped: Record<string, string[]> = {};
  for (const c of chunks) {
    const source = c.metadata?.source_name || c.metadata?.file_name || label;
    if (!grouped[source]) grouped[source] = [];
    grouped[source].push(c.content);
  }
  let ctx = "";
  for (const [source, contents] of Object.entries(grouped)) {
    ctx += `### ${source}\n${contents.join("\n\n")}\n\n`;
  }
  return ctx;
}

async function getRAGContext(
  transcriptQuery: string,
  agentId: string,
  lovableApiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ context: string; debug: DebugInfo }> {
  const emptyDebug: DebugInfo = {
    detected_intent: null,
    intent_priority: null,
    chunks: [],
    settings: { chunksToRetrieve: 3, similarityThreshold: 0.6 },
  };

  try {
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const [linksResult, settings, intents] = await Promise.all([
      sb.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", agentId),
      getRetrievalSettings(sb, agentId),
      getAgentIntents(sb, agentId),
    ]);

    const debug: DebugInfo = { ...emptyDebug, settings };

    const agentKbIds = (linksResult.data || []).map((l: any) => l.knowledge_base_id);
    const hasIntents = intents.some((i) => i.kb_ids.length > 0);

    if (agentKbIds.length === 0 && !hasIntents) return { context: "", debug };

    const embedding = await getEmbedding(transcriptQuery, lovableApiKey);
    if (!embedding) return { context: "", debug };

    const [agentChunks, detectedIntent] = await Promise.all([
      agentKbIds.length > 0
        ? searchChunks(sb, embedding, agentKbIds, settings.chunksToRetrieve, settings.similarityThreshold)
        : Promise.resolve([]),
      hasIntents ? detectIntent(transcriptQuery, intents, lovableApiKey) : Promise.resolve(null),
    ]);

    debug.detected_intent = detectedIntent?.name || null;
    debug.intent_priority = detectedIntent?.kb_priority || null;

    // Build debug chunk info for agent chunks
    for (const c of agentChunks) {
      debug.chunks.push({
        source: c.metadata?.source_name || c.metadata?.file_name || "Knowledge Base",
        origin: "agent",
        similarity: Math.round(c.similarity * 1000) / 1000,
        preview: c.content.slice(0, 120),
      });
    }

    let intentChunks: ChunkResult[] = [];
    let priority = "intent_first"; // safe default
    if (detectedIntent && detectedIntent.kb_ids.length > 0) {
      priority = detectedIntent.kb_priority || "intent_first";
      intentChunks = await searchChunks(
        sb, embedding, detectedIntent.kb_ids, settings.chunksToRetrieve, settings.similarityThreshold
      );
      for (const c of intentChunks) {
        debug.chunks.push({
          source: c.metadata?.source_name || c.metadata?.file_name || `Intent: ${detectedIntent.name}`,
          origin: "intent",
          similarity: Math.round(c.similarity * 1000) / 1000,
          preview: c.content.slice(0, 120),
        });
      }
    }

    let context = "## Related Knowledge Base Contexts\n\n";

    if (priority === "intent_first") {
      context += formatChunks(intentChunks, `Intent: ${detectedIntent?.name}`);
      context += formatChunks(agentChunks, "Knowledge Base");
    } else if (priority === "agent_first") {
      context += formatChunks(agentChunks, "Knowledge Base");
      context += formatChunks(intentChunks, `Intent: ${detectedIntent?.name}`);
    } else {
      const all = [
        ...agentChunks.map((c) => ({ ...c, _src: "agent" as const })),
        ...intentChunks.map((c) => ({ ...c, _src: "intent" as const })),
      ].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      context += formatChunks(all, "Knowledge Base");
    }

    const hasContent = context.trim() !== "## Related Knowledge Base Contexts";
    return { context: hasContent ? context : "", debug };
  } catch (e) {
    console.error("RAG retrieval error:", e);
    return { context: "", debug: emptyDebug };
  }
}

// ─── Main handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, systemPrompt, model, agentId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let ragContext = "";
    let debugInfo: DebugInfo | null = null;
    if (agentId) {
      const transcriptQuery = buildTranscriptQuery(messages);
      if (transcriptQuery) {
        const result = await getRAGContext(
          transcriptQuery, agentId, LOVABLE_API_KEY,
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        ragContext = result.context;
        debugInfo = result.debug;
      }
    }

    const systemContent = systemPrompt || "You are a helpful AI voice agent. Keep responses concise and conversational, as they will be spoken aloud.";
    const llmMessages: any[] = [{ role: "system", content: systemContent }];

    if (ragContext) {
      llmMessages.push({
        role: "user",
        content: ragContext + "\nUse the above knowledge base contexts to inform your responses when relevant. Do not mention that you received this context.",
      });
      llmMessages.push({
        role: "assistant",
        content: "Understood. I'll use this context to provide informed responses.",
      });
    }

    llmMessages.push(...messages);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || "google/gemini-3-flash-preview", messages: llmMessages, stream: true }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Encode debug info as a safe header value
    const debugHeader = debugInfo ? encodeURIComponent(JSON.stringify(debugInfo)) : "";

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        ...(debugHeader ? { "X-RAG-Debug": debugHeader } : {}),
      },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
