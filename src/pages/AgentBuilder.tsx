import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Clock, Zap, Coins, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentPromptPanel } from "@/components/agent-builder/AgentPromptPanel";
import { AgentConfigPanel, type AgentConfigs } from "@/components/agent-builder/AgentConfigPanel";
import { AgentTestPanel } from "@/components/agent-builder/AgentTestPanel";
import { saveAgent, loadAgent, saveAgentConfig, loadAgentConfigs } from "@/services/agentDbService";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamId } from "@/hooks/useTeamId";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";

type AgentStatus = "draft" | "active" | "inactive";
type SaveState = "idle" | "saving" | "saved" | "error";

const AgentBuilder = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { teamId, loading: teamLoading } = useTeamId();
  const [activeTab, setActiveTab] = useState("create");
  const [agentName, setAgentName] = useState("New Agent");
  const [isEditingName, setIsEditingName] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<AgentStatus>("draft");

  // Agent state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("GPT-4.1");
  const [voice, setVoice] = useState("Nova");
  const [language, setLanguage] = useState("English");
  const [welcomeMode, setWelcomeMode] = useState<"user_first" | "agent_first">("user_first");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [configs, setConfigs] = useState<AgentConfigs>({});

  // Track whether we've finished initial load — prevents autosave-on-load
  const hasLoadedRef = useRef(false);

  // Load agent
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
          setStatus(((agent.status as AgentStatus) || "draft"));
        }
        const cfgs = await loadAgentConfigs(agentId);
        const map: AgentConfigs = {};
        for (const c of cfgs) map[c.section] = c.config as Record<string, unknown>;
        setConfigs(map);
      } catch {
        // new agent
      } finally {
        setIsLoading(false);
        // Defer enabling autosave until after first render commit
        setTimeout(() => {
          hasLoadedRef.current = true;
        }, 200);
      }
    };
    load();
  }, [agentId]);

  // Persist to DB
  const persist = useCallback(
    async (showToast = false) => {
      if (!agentId || !user || !teamId) return;
      setSaveState("saving");
      try {
        await saveAgent({
          id: agentId,
          team_id: teamId,
          created_by: user.id,
          name: agentName,
          description: "",
          status,
          type: "custom",
          language,
          voice,
          model,
          prompt,
          welcome_mode: welcomeMode,
          welcome_message: welcomeMessage,
        });
        for (const [section, config] of Object.entries(configs)) {
          await saveAgentConfig(agentId, section, config);
        }
        setSaveState("saved");
        if (showToast) toast.success("Agent saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e: any) {
        console.error("Save error:", e);
        setSaveState("error");
        toast.error(e.message || "Failed to save agent");
      }
    },
    [agentId, user, teamId, agentName, status, language, voice, model, prompt, welcomeMode, welcomeMessage, configs],
  );

  // Debounced snapshot of every persistable field — triggers autosave on change.
  const snapshot = JSON.stringify({
    agentName, status, language, voice, model, prompt, welcomeMode, welcomeMessage, configs,
  });
  const debouncedSnapshot = useDebounce(snapshot, 1000);

  useEffect(() => {
    if (!hasLoadedRef.current || !teamId) return;
    persist(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSnapshot, teamId]);

  const copyAgentId = () => {
    if (agentId) {
      navigator.clipboard.writeText(agentId);
      toast.success("Agent ID copied");
    }
  };

  if (isLoading || teamLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const SaveBadge = () => {
    if (saveState === "saving")
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </span>
      );
    if (saveState === "saved")
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-500">
          <Check className="h-3 w-3" /> Saved
        </span>
      );
    if (saveState === "error")
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" /> Error
        </span>
      );
    return <span className="text-xs text-muted-foreground">Auto-save on</span>;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-6">
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="agent-status" className="text-xs text-muted-foreground cursor-pointer">
              {status === "active" ? "Active" : "Inactive"}
            </Label>
            <Switch
              id="agent-status"
              checked={status === "active"}
              onCheckedChange={(c) => setStatus(c ? "active" : "inactive")}
            />
          </div>
          <SaveBadge />
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8">
              <TabsTrigger value="create" className="text-xs px-3 h-7">Create</TabsTrigger>
              <TabsTrigger value="simulation" className="text-xs px-3 h-7">Simulation</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
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

        <div className="flex-1 min-w-[280px] border-r border-border overflow-y-auto">
          <AgentConfigPanel configs={configs} onConfigsChange={setConfigs} agentId={agentId} />
        </div>

        <div className="w-[280px] min-w-[240px] flex flex-col overflow-y-auto">
          <AgentTestPanel systemPrompt={prompt} voiceName={voice} agentId={agentId} />
        </div>
      </div>
    </div>
  );
};

export default AgentBuilder;
