import { supabase } from "@/integrations/supabase/client";

export interface AgentData {
  id?: string;
  team_id: string;
  created_by: string;
  name: string;
  description: string;
  status: string;
  type: string;
  language: string;
  voice: string;
  model: string;
  prompt: string;
  welcome_mode: string;
  welcome_message: string;
}

export interface AgentConfigData {
  section: string;
  config: Record<string, unknown>;
}

export async function saveAgent(agent: AgentData) {
  const { data, error } = await supabase
    .from("agents")
    .upsert(agent as any, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadAgent(agentId: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveAgentConfig(agentId: string, section: string, config: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("agent_configs")
    .upsert(
      { agent_id: agentId, section, config } as any,
      { onConflict: "agent_id,section" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadAgentConfigs(agentId: string) {
  const { data, error } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("agent_id", agentId);

  if (error) throw error;
  return data || [];
}

export async function deleteAgent(agentId: string) {
  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("id", agentId);

  if (error) throw error;
}
