import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Build a concise search query from the conversation transcript.
 * Uses the last 3 user messages to capture recent context without bloating the embedding input.
 */
function buildTranscriptQuery(messages: { role: string; content: string }[]): string {
  const userMsgs = messages.filter((m) => m.role === "user").slice(-3);
  return userMsgs.map((m) => m.content).join("\n");
}

/**
 * Fetch agent-specific retrieval settings from agent_configs.
 */
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

/**
 * Retrieve relevant knowledge chunks using the conversation transcript.
 * Groups results by source for cleaner context injection.
 */
async function getRAGContext(
  transcriptQuery: string,
  agentId: string,
  lovableApiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parallel: fetch KB links + retrieval settings
    const [linksResult, settings] = await Promise.all([
      supabase
        .from("agent_knowledge_bases")
        .select("knowledge_base_id")
        .eq("agent_id", agentId),
      getRetrievalSettings(supabase, agentId),
    ]);

    const links = linksResult.data;
    if (!links || links.length === 0) return "";

    const kbIds = links.map((l: any) => l.knowledge_base_id);

    // Generate embedding from transcript
    const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: transcriptQuery,
        dimensions: 768,
      }),
    });

    if (!embResp.ok) return "";
    const embData = await embResp.json();
    const queryEmbedding = embData.data[0].embedding;

    // Vector search with agent-specific settings
    const { data: chunks } = await supabase.rpc("search_knowledge_chunks", {
      _query_embedding: JSON.stringify(queryEmbedding),
      _knowledge_base_ids: kbIds,
      _match_count: settings.chunksToRetrieve,
      _match_threshold: settings.similarityThreshold,
    });

    if (!chunks || chunks.length === 0) return "";

    // Group chunks by source for cleaner context
    const grouped: Record<string, string[]> = {};
    for (const c of chunks) {
      const source = c.metadata?.source_name || c.metadata?.file_name || "Knowledge Base";
      if (!grouped[source]) grouped[source] = [];
      grouped[source].push(c.content);
    }

    let context = "## Related Knowledge Base Contexts\n\n";
    for (const [source, contents] of Object.entries(grouped)) {
      context += `### ${source}\n`;
      context += contents.join("\n\n") + "\n\n";
    }

    return context;
  } catch (e) {
    console.error("RAG retrieval error:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, systemPrompt, model, agentId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RAG: retrieve using conversation transcript (not system prompt)
    let ragContext = "";
    if (agentId) {
      const transcriptQuery = buildTranscriptQuery(messages);
      if (transcriptQuery) {
        ragContext = await getRAGContext(
          transcriptQuery,
          agentId,
          LOVABLE_API_KEY,
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
      }
    }

    const systemContent = systemPrompt || "You are a helpful AI voice agent. Keep responses concise and conversational, as they will be spoken aloud.";

    // Build message array: system → RAG context (as separate user msg) → conversation
    const llmMessages: any[] = [{ role: "system", content: systemContent }];

    if (ragContext) {
      // Inject RAG as a separate context message before the conversation
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
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: llmMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
