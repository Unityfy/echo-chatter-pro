import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Clock, Zap, Coins, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AgentPromptPanel } from "@/components/agent-builder/AgentPromptPanel";
import { AgentConfigPanel, type AgentConfigs } from "@/components/agent-builder/AgentConfigPanel";
import { AgentTestPanel } from "@/components/agent-builder/AgentTestPanel";
import { saveAgent, loadAgent, saveAgentConfig, loadAgentConfigs } from "@/services/agentDbService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const AgentBuilder = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("create");
  const [agentName, setAgentName] = useState("New Agent");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Agent state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("GPT-4.1");
  const [voice, setVoice] = useState("Nova");
  const [language, setLanguage] = useState("English");
  const [welcomeMode, setWelcomeMode] = useState<"user_first" | "agent_first">("user_first");
  const [welcomeMessage, setWelcomeMessage] = useState("");

  // Config sections state
  const [configs, setConfigs] = useState<AgentConfigs>({});

  // Load agent data
  useEffect(() => {
    if (!agentId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const agent = await loadAgent(agentId);
        if (agent) {
          setAgentName(agent.name || "New Agent");
          setPrompt(agent.prompt || "");
          setModel(agent.model || "GPT-4.1");
          setVoice(agent.voice || "Nova");
          setLanguage(agent.language || "English");
          setWelcomeMode((agent.welcome_mode as any) || "user_first");
          setWelcomeMessage(agent.welcome_message || "");
        }

        const cfgs = await loadAgentConfigs(agentId);
        const configMap: AgentConfigs = {};
        for (const c of cfgs) {
          configMap[c.section] = c.config as Record<string, unknown>;
        }
        setConfigs(configMap);
      } catch {
        // Agent may not exist in DB yet (created locally)
        console.log("Agent not found in DB, using defaults");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [agentId]);

  const handleSave = useCallback(async () => {
    if (!agentId || !user) return;
    setIsSaving(true);
    try {
      // For now, use a placeholder team_id - in production this would come from the user's team
      await saveAgent({
        id: agentId,
        team_id: "00000000-0000-0000-0000-000000000000", // placeholder
        created_by: user.id,
        name: agentName,
        description: "",
        status: "draft",
        type: "custom",
        language,
        voice,
        model,
        prompt,
        welcome_mode: welcomeMode,
        welcome_message: welcomeMessage,
      });

      // Save each config section
      for (const [section, config] of Object.entries(configs)) {
        await saveAgentConfig(agentId, section, config);
      }

      toast.success("Agent saved successfully");
    } catch (e: any) {
      console.error("Save error:", e);
      toast.error(e.message || "Failed to save agent");
    } finally {
      setIsSaving(false);
    }
  }, [agentId, user, agentName, language, voice, model, prompt, welcomeMode, welcomeMessage, configs]);

  const copyAgentId = () => {
    if (agentId) {
      navigator.clipboard.writeText(agentId);
      toast.success("Agent ID copied");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate("/agents")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {isEditingName ? (
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
              className="h-8 w-48 text-sm font-semibold"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
            >
              {agentName}
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              ID: {agentId?.slice(0, 8)}…
              <button onClick={copyAgentId} className="hover:text-foreground">
                <Copy className="h-3 w-3" />
              </button>
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1">
              <Coins className="h-3 w-3" /> $0.115/min
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~1s latency
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> {model}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8">
              <TabsTrigger value="create" className="text-xs px-3 h-7">Create</TabsTrigger>
              <TabsTrigger value="simulation" className="text-xs px-3 h-7">Simulation</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* Main 3-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Prompt Editor */}
        <div className="w-[40%] min-w-[320px] border-r border-border flex flex-col overflow-y-auto">
          <AgentPromptPanel
            prompt={prompt}
            onPromptChange={setPrompt}
            model={model}
            onModelChange={setModel}
            voice={voice}
            onVoiceChange={setVoice}
            language={language}
            onLanguageChange={setLanguage}
            welcomeMode={welcomeMode}
            onWelcomeModeChange={setWelcomeMode}
            welcomeMessage={welcomeMessage}
            onWelcomeMessageChange={setWelcomeMessage}
          />
        </div>

        {/* Center Panel - Config Sections */}
        <div className="flex-1 min-w-[280px] border-r border-border overflow-y-auto">
          <AgentConfigPanel configs={configs} onConfigsChange={setConfigs} />
        </div>

        {/* Right Panel - Testing */}
        <div className="w-[280px] min-w-[240px] flex flex-col overflow-y-auto">
          <AgentTestPanel systemPrompt={prompt} voiceName={voice} />
        </div>
      </div>
    </div>
  );
};

export default AgentBuilder;
