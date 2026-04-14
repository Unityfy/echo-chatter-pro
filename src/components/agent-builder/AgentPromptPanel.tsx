import { useState } from "react";
import { BookOpen, Settings2, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AgentPromptPanelProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  voice: string;
  onVoiceChange: (v: string) => void;
  language: string;
  onLanguageChange: (v: string) => void;
  welcomeMode: "user_first" | "agent_first";
  onWelcomeModeChange: (v: "user_first" | "agent_first") => void;
  welcomeMessage: string;
  onWelcomeMessageChange: (v: string) => void;
}

const MODELS = ["GPT-4.1", "GPT-4o", "GPT-3.5 Turbo", "Gemini Flash", "Claude 3.5"];
const VOICES = ["Nova", "Onyx", "Shimmer", "Echo", "Alloy", "Fable", "Neha", "Roopa", "Sumeet", "Ankush"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Japanese", "Hindi"];

interface KBFile {
  id: string;
  name: string;
  size: string;
}

export function AgentPromptPanel({
  prompt, onPromptChange,
  model, onModelChange,
  voice, onVoiceChange,
  language, onLanguageChange,
  welcomeMode, onWelcomeModeChange,
  welcomeMessage, onWelcomeMessageChange,
}: AgentPromptPanelProps) {
  const [kbFiles, setKbFiles] = useState<KBFile[]>([]);
  const [kbExpanded, setKbExpanded] = useState(true);

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.txt,.doc,.docx,.csv,.json,.md";
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      const newFiles: KBFile[] = Array.from(files).map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size < 1024 * 1024
          ? `${(f.size / 1024).toFixed(1)} KB`
          : `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
      }));
      setKbFiles((prev) => [...prev, ...newFiles]);
    };
    input.click();
  };

  const removeFile = (id: string) => {
    setKbFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <Settings2 className="h-3 w-3 mr-1.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={voice} onValueChange={onVoiceChange}>
          <SelectTrigger className="w-[110px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICES.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger className="w-[110px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto">
          <BookOpen className="h-3.5 w-3.5" /> Agent Handbook
        </Button>
      </div>

      {/* Prompt Area */}
      <div className="flex-1 p-4">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Type in a universal prompt for your agent, such as its role, conversational style, objective, etc."
          className="min-h-[300px] h-full resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Type {"{{ }}"} to add dynamic variables
        </p>
      </div>

      {/* Knowledge Base */}
      <div className="border-t border-border px-4 py-3 space-y-2.5">
        <button
          onClick={() => setKbExpanded(!kbExpanded)}
          className="flex items-center justify-between w-full text-xs font-medium text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Knowledge Base
            {kbFiles.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({kbFiles.length} file{kbFiles.length !== 1 ? "s" : ""})
              </span>
            )}
          </span>
          <span className="text-muted-foreground text-[10px]">{kbExpanded ? "▾" : "▸"}</span>
        </button>

        {kbExpanded && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Upload documents to give your agent business context (FAQs, product info, policies).
            </p>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 w-full border-dashed"
              onClick={handleFileUpload}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Files
            </Button>

            {kbFiles.length > 0 && (
              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                {kbFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-foreground">{file.name}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">{file.size}</span>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Welcome Message */}
      <div className="border-t border-border px-4 py-3 space-y-2.5">
        <Label className="text-xs font-medium">Welcome Message</Label>
        <Select
          value={welcomeMode}
          onValueChange={(v) => onWelcomeModeChange(v as "user_first" | "agent_first")}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user_first">User speaks first</SelectItem>
            <SelectItem value="agent_first">Agent speaks first</SelectItem>
          </SelectContent>
        </Select>
        {welcomeMode === "agent_first" && (
          <Input
            value={welcomeMessage}
            onChange={(e) => onWelcomeMessageChange(e.target.value)}
            placeholder="Hi! How can I help you today?"
            className="h-8 text-xs"
          />
        )}
      </div>
    </div>
  );
}
