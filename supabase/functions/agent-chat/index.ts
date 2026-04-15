import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildTranscriptQuery(messages: { role: string; content: string }[]): string {
  return messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n");
}

async function getRetrievalSettings(supabase: any, agentId: string) {
  const defaults = { chunksToRetrieve: 3, similarityThreshold: 0.6 };
  try {
    const { data } = await supabase
      .from("agent_configs").select("config")
      .eq("agent_id", agentId).eq("section", "knowledge").maybeSingle();
    if (data?.config) {
      return {
        chunksToRetrieve: Number(data.config.chunksToRetrieve) || defaults.chunksToRetrieve,
        similarityThreshold: Number(data.config.similarityThreshold) || defaults.similarityThreshold,
      };
    }
  } catch (e) { console.error("Settings fetch error:", e); }
  return defaults;
}

interface RAGResult {
  contextText: string;
  debugChunks: { content: string; similarity: number; source: string; sourceType: string }[];
}

async function getRAGContext(
  transcriptQuery: string, agentId: string, lovableApiKey: string,
  supabaseUrl: string, serviceRoleKey: string
): Promise<RAGResult> {
  const empty: RAGResult = { contextText: "", debugChunks: [] };
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const [linksResult, settings] = await Promise.all([
      supabase.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", agentId),
      getRetrievalSettings(supabase, agentId),
    ]);
    const links = linksResult.data;
    if (!links || links.length === 0) return empty;
    const kbIds = links.map((l: any) => l.knowledge_base_id);

    const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: transcriptQuery, dimensions: 768 }),
    });
    if (!embResp.ok) return empty;
    const embData = await embResp.json();

    const { data: chunks } = await supabase.rpc("search_knowledge_chunks", {
      _query_embedding: JSON.stringify(embData.data[0].embedding),
      _knowledge_base_ids: kbIds,
      _match_count: settings.chunksToRetrieve,
      _match_threshold: settings.similarityThreshold,
    });

    if (!chunks || chunks.length === 0) return empty;

    const debugChunks = chunks.map((c: any) => ({
      content: c.content,
      similarity: c.similarity,
      source: c.metadata?.source_name || c.metadata?.file_name || c.metadata?.source_url || "Knowledge Base",
      sourceType: c.metadata?.type || "text",
    }));

    // Group chunks by source
    const grouped: Record<string, string[]> = {};
    for (const c of chunks) {
      const source = c.metadata?.source_name || c.metadata?.file_name || "Knowledge Base";
      if (!grouped[source]) grouped[source] = [];
      grouped[source].push(c.content);
    }

    let contextText = "## Related Knowledge Base Contexts\n\n";
    for (const [source, contents] of Object.entries(grouped)) {
      contextText += `### ${source}\n${contents.join("\n\n")}\n\n`;
    }

    return { contextText, debugChunks };
  } catch (e) {
    console.error("RAG retrieval error:", e);
    return empty;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, systemPrompt, model, agentId, debug } = await req.json();

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

    let ragResult: RAGResult = { contextText: "", debugChunks: [] };
    if (agentId) {
      const transcriptQuery = buildTranscriptQuery(messages);
      if (transcriptQuery) {
        ragResult = await getRAGContext(
          transcriptQuery, agentId, LOVABLE_API_KEY,
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
      }
    }

    const systemContent = systemPrompt || "You are a helpful AI voice agent. Keep responses concise and conversational, as they will be spoken aloud.";
    const llmMessages: any[] = [{ role: "system", content: systemContent }];

    if (ragResult.contextText) {
      llmMessages.push(
        { role: "user", content: ragResult.contextText + "\nUse the above knowledge base contexts to inform your responses when relevant. Do not mention that you received this context." },
        { role: "assistant", content: "Understood. I'll use this context to provide informed responses." }
      );
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

    // If debug mode, prepend a custom SSE event with chunk metadata before the LLM stream
    if (debug && ragResult.debugChunks.length > 0) {
      const debugEvent = `data: ${JSON.stringify({ debugChunks: ragResult.debugChunks })}\n\n`;
      const encoder = new TextEncoder();
      const debugBytes = encoder.encode(debugEvent);

      const readable = new ReadableStream({
        async start(controller) {
          controller.enqueue(debugBytes);
          const reader = response.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
