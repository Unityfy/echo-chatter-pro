import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, MoreHorizontal, Clock, Zap, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AgentPromptPanel } from "@/components/agent-builder/AgentPromptPanel";
import { AgentConfigPanel } from "@/components/agent-builder/AgentConfigPanel";
import { AgentTestPanel } from "@/components/agent-builder/AgentTestPanel";
import { toast } from "sonner";

const AgentBuilder = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("create");
  const [agentName, setAgentName] = useState("New Agent");
  const [isEditingName, setIsEditingName] = useState(false);

  // Agent state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4.1");
  const [voice, setVoice] = useState("Nova");
  const [language, setLanguage] = useState("English");
  const [welcomeMode, setWelcomeMode] = useState<"user_first" | "agent_first">("user_first");
  const [welcomeMessage, setWelcomeMessage] = useState("");

  const handleSave = () => {
    toast.success("Agent configuration saved");
  };

  const copyAgentId = () => {
    if (agentId) {
      navigator.clipboard.writeText(agentId);
      toast.success("Agent ID copied");
    }
  };

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
              Agent ID: {agentId?.slice(0, 8)}…
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
              <Clock className="h-3 w-3" /> 970-1300ms
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> 575-805 tokens
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
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
            Save
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
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
          <AgentConfigPanel />
        </div>

        {/* Right Panel - Testing */}
        <div className="w-[280px] min-w-[240px] flex flex-col overflow-y-auto">
          <AgentTestPanel />
        </div>
      </div>
    </div>
  );
};

export default AgentBuilder;
