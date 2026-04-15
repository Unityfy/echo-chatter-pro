import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getRAGContext(
  query: string,
  agentId: string,
  lovableApiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get linked knowledge base IDs for this agent
    const { data: links } = await supabase
      .from("agent_knowledge_bases")
      .select("knowledge_base_id")
      .eq("agent_id", agentId);

    if (!links || links.length === 0) return "";

    const kbIds = links.map((l: any) => l.knowledge_base_id);

    // Generate embedding for the query
    const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
        dimensions: 768,
      }),
    });

    if (!embResp.ok) return "";
    const embData = await embResp.json();
    const queryEmbedding = embData.data[0].embedding;

    // Search for relevant chunks
    const { data: chunks } = await supabase.rpc("search_knowledge_chunks", {
      _query_embedding: JSON.stringify(queryEmbedding),
      _knowledge_base_ids: kbIds,
      _match_count: 5,
      _match_threshold: 0.5,
    });

    if (!chunks || chunks.length === 0) return "";

    return "\n\n--- Relevant Knowledge ---\n" +
      chunks.map((c: any) => c.content).join("\n\n") +
      "\n--- End Knowledge ---\n";
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

    // RAG: retrieve relevant knowledge from the latest user message
    let ragContext = "";
    if (agentId) {
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      if (lastUserMsg) {
        ragContext = await getRAGContext(
          lastUserMsg.content,
          agentId,
          LOVABLE_API_KEY,
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
      }
    }

    const systemContent = (systemPrompt || "You are a helpful AI voice agent. Keep responses concise and conversational, as they will be spoken aloud.") + ragContext;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
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
