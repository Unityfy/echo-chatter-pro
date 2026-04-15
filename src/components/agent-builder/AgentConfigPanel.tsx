import { useState, useEffect } from "react";
import {
  Grid3X3, BookOpen, Volume2, AudioLines, Phone, BarChart3,
  Shield, Webhook, Puzzle, Plus, Upload, Trash2, X, Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AgentConfigs = Record<string, Record<string, unknown>>;

interface AgentConfigPanelProps {
  configs: AgentConfigs;
  onConfigsChange: (configs: AgentConfigs) => void;
  agentId?: string;
}

interface ConfigSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

function SectionWrapper({ section }: { section: ConfigSection }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{section.label}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-3">
        {section.content}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Section Contents ────────────────────────────────────────

function FunctionsSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const enabled = (config.enabled as boolean) ?? false;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Function Calling</Label>
        <Switch checked={enabled} onCheckedChange={(v) => onChange({ ...config, enabled: v })} />
      </div>
      {enabled && (
        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Function
        </Button>
      )}
    </div>
  );
}

// ─── Knowledge Base Section (Real Integration) ───────────────

interface KBOption {
  id: string;
  name: string;
  description: string | null;
}

function KnowledgeBaseSection({
  config,
  onChange,
  agentId,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  agentId?: string;
}) {
  const enabled = (config.enabled as boolean) ?? true;
  const chunksToRetrieve = (config.chunksToRetrieve as number) ?? 3;
  const similarityThreshold = (config.similarityThreshold as number) ?? 0.6;

  const [allKbs, setAllKbs] = useState<KBOption[]>([]);
  const [linkedKbIds, setLinkedKbIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  // Load available KBs and linked KBs
  useEffect(() => {
    if (!agentId) return;
    const load = async () => {
      setLoading(true);
      const [kbRes, linkRes] = await Promise.all([
        supabase.from("knowledge_bases").select("id, name, description").order("name"),
        supabase.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", agentId),
      ]);
      if (kbRes.data) setAllKbs(kbRes.data as KBOption[]);
      if (linkRes.data) setLinkedKbIds(linkRes.data.map((r: any) => r.knowledge_base_id));
      setLoading(false);
    };
    load();
  }, [agentId]);

  const linkedKbs = allKbs.filter((kb) => linkedKbIds.includes(kb.id));
  const availableKbs = allKbs.filter((kb) => !linkedKbIds.includes(kb.id));

  const linkKb = async (kbId: string) => {
    if (!agentId) return;
    setLinking(true);
    const { error } = await supabase.from("agent_knowledge_bases").insert({
      agent_id: agentId,
      knowledge_base_id: kbId,
    } as any);
    if (error) {
      toast.error("Failed to link knowledge base");
    } else {
      setLinkedKbIds((prev) => [...prev, kbId]);
      toast.success("Knowledge base linked");
    }
    setLinking(false);
  };

  const unlinkKb = async (kbId: string) => {
    if (!agentId) return;
    const { error } = await supabase
      .from("agent_knowledge_bases")
      .delete()
      .eq("agent_id", agentId)
      .eq("knowledge_base_id", kbId);
    if (error) {
      toast.error("Failed to unlink knowledge base");
    } else {
      setLinkedKbIds((prev) => prev.filter((id) => id !== kbId));
      toast.success("Knowledge base unlinked");
    }
  };

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Knowledge Base</Label>
        <Switch checked={enabled} onCheckedChange={(v) => update("enabled", v)} />
      </div>

      {enabled && (
        <>
          {/* Linked KBs */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Linked Knowledge Bases</Label>
            {loading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : linkedKbs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-1">No knowledge bases linked yet.</p>
            ) : (
              <div className="space-y-1.5">
                {linkedKbs.map((kb) => (
                  <div
                    key={kb.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{kb.name}</p>
                      {kb.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{kb.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => unlinkKb(kb.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add KB dropdown */}
          {availableKbs.length > 0 && (
            <Select onValueChange={linkKb} disabled={linking}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Link a knowledge base..." />
              </SelectTrigger>
              <SelectContent>
                {availableKbs.map((kb) => (
                  <SelectItem key={kb.id} value={kb.id} className="text-xs">
                    {kb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Retrieval Settings */}
          <div className="pt-2 border-t border-border space-y-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Retrieval Settings</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Chunks to Retrieve</Label>
                <span className="text-[11px] text-muted-foreground font-mono">{chunksToRetrieve}</span>
              </div>
              <Slider
                value={[chunksToRetrieve]}
                onValueChange={([v]) => update("chunksToRetrieve", v)}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Higher values provide more context but increase latency and cost.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Similarity Threshold</Label>
                <span className="text-[11px] text-muted-foreground font-mono">{similarityThreshold.toFixed(2)}</span>
              </div>
              <Slider
                value={[similarityThreshold]}
                onValueChange={([v]) => update("similarityThreshold", parseFloat(v.toFixed(2)))}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Higher values require stricter matches — fewer but more relevant results.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Other Sections (unchanged) ─────────────────────────────

function SpeechSettingsSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const speed = (config.speed as number) ?? 1.0;
  const pitch = (config.pitch as number) ?? 1.0;
  const bargeIn = (config.bargeIn as boolean) ?? true;
  const noiseSuppression = (config.noiseSuppression as boolean) ?? true;

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Speed</Label>
          <span className="text-[11px] text-muted-foreground">{speed.toFixed(1)}x</span>
        </div>
        <Slider value={[speed]} onValueChange={([v]) => update("speed", v)} min={0.5} max={2.0} step={0.1} className="w-full" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pitch</Label>
          <span className="text-[11px] text-muted-foreground">{pitch.toFixed(1)}</span>
        </div>
        <Slider value={[pitch]} onValueChange={([v]) => update("pitch", v)} min={0.5} max={2.0} step={0.1} className="w-full" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Interrupt (Barge-in)</Label>
        <Switch checked={bargeIn} onCheckedChange={(v) => update("bargeIn", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Noise Suppression</Label>
        <Switch checked={noiseSuppression} onCheckedChange={(v) => update("noiseSuppression", v)} />
      </div>
    </div>
  );
}

function TranscriptionSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const enabled = (config.enabled as boolean) ?? true;
  const partial = (config.partial as boolean) ?? true;
  const langDetect = (config.langDetect as boolean) ?? false;
  const latencyPref = (config.latencyPref as string) ?? "balanced";

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Transcription</Label>
        <Switch checked={enabled} onCheckedChange={(v) => update("enabled", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Partial Transcripts</Label>
        <Switch checked={partial} onCheckedChange={(v) => update("partial", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Language Detection</Label>
        <Switch checked={langDetect} onCheckedChange={(v) => update("langDetect", v)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Latency Preference</Label>
        <Select value={latencyPref} onValueChange={(v) => update("latencyPref", v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low Latency</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="high_accuracy">High Accuracy</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CallSettingsSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const maxDuration = (config.maxDuration as string) ?? "30";
  const silenceTimeout = (config.silenceTimeout as string) ?? "10";
  const voicemail = (config.voicemail as boolean) ?? true;
  const recording = (config.recording as boolean) ?? true;
  const transfer = (config.transfer as boolean) ?? false;

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Max Call Duration (min)</Label>
        <Input value={maxDuration} onChange={(e) => update("maxDuration", e.target.value)} className="h-8 text-xs" type="number" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Silence Timeout (sec)</Label>
        <Input value={silenceTimeout} onChange={(e) => update("silenceTimeout", e.target.value)} className="h-8 text-xs" type="number" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Voicemail Detection</Label>
        <Switch checked={voicemail} onCheckedChange={(v) => update("voicemail", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Call Recording</Label>
        <Switch checked={recording} onCheckedChange={(v) => update("recording", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Call Transfer</Label>
        <Switch checked={transfer} onCheckedChange={(v) => update("transfer", v)} />
      </div>
    </div>
  );
}

function PostCallSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const fields = (config.fields as { name: string; type: string }[]) ?? [
    { name: "name", type: "string" },
    { name: "email", type: "string" },
    { name: "intent", type: "string" },
    { name: "summary", type: "string" },
  ];

  const setFields = (newFields: { name: string; type: string }[]) => onChange({ ...config, fields: newFields });

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Define structured data to extract after each call.</p>
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={f.name}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...next[i], name: e.target.value };
              setFields(next);
            }}
            placeholder="Field name"
            className="h-7 text-xs flex-1"
          />
          <Select
            value={f.type}
            onValueChange={(v) => {
              const next = [...fields];
              next[i] = { ...next[i], type: v };
              setFields(next);
            }}
          >
            <SelectTrigger className="h-7 text-xs w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="array">Array</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setFields(fields.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => setFields([...fields, { name: "", type: "string" }])}>
        <Plus className="h-3.5 w-3.5" /> Add Field
      </Button>
    </div>
  );
}

function SecuritySection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const hallucination = (config.hallucination as boolean) ?? true;
  const unsafeHandling = (config.unsafeHandling as boolean) ?? true;
  const fallback = (config.fallback as string) ?? "I'm sorry, I didn't understand that. Could you rephrase?";
  const maxRetries = (config.maxRetries as string) ?? "3";

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Fallback Response</Label>
        <Input value={fallback} onChange={(e) => update("fallback", e.target.value)} className="h-8 text-xs" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Hallucination Guard</Label>
        <Switch checked={hallucination} onCheckedChange={(v) => update("hallucination", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Unsafe Query Handling</Label>
        <Switch checked={unsafeHandling} onCheckedChange={(v) => update("unsafeHandling", v)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Max Retries</Label>
        <Input value={maxRetries} onChange={(e) => update("maxRetries", e.target.value)} className="h-8 text-xs" type="number" />
      </div>
    </div>
  );
}

function WebhookSection({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const url = (config.url as string) ?? "";
  const events = (config.events as string[]) ?? ["call_ended"];

  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const toggleEvent = (ev: string) => {
    const next = events.includes(ev) ? events.filter((e) => e !== ev) : [...events, ev];
    update("events", next);
  };

  const allEvents = ["call_started", "call_ended", "transcript_updated"];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Webhook URL</Label>
        <Input value={url} onChange={(e) => update("url", e.target.value)} placeholder="https://your-api.com/webhook" className="h-8 text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Events</Label>
        <div className="flex flex-wrap gap-1.5">
          {allEvents.map((ev) => (
            <Badge
              key={ev}
              variant={events.includes(ev) ? "default" : "outline"}
              className="text-[10px] cursor-pointer"
              onClick={() => toggleEvent(ev)}
            >
              {ev.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Webhook logs will appear here after events fire.</p>
    </div>
  );
}

function MCPsSection() {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Advanced AI tools and plugins. Connect external MCPs to extend agent capabilities.
      </p>
      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add MCP
      </Button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function AgentConfigPanel({ configs, onConfigsChange, agentId }: AgentConfigPanelProps) {
  const getConfig = (section: string) => configs[section] || {};
  const setConfig = (section: string) => (config: Record<string, unknown>) => {
    onConfigsChange({ ...configs, [section]: config });
  };

  const sections: ConfigSection[] = [
    { id: "functions", label: "Functions", icon: Grid3X3, content: <FunctionsSection config={getConfig("functions")} onChange={setConfig("functions")} /> },
    { id: "knowledge", label: "Knowledge Base", icon: BookOpen, content: <KnowledgeBaseSection config={getConfig("knowledge")} onChange={setConfig("knowledge")} agentId={agentId} /> },
    { id: "speech", label: "Speech Settings", icon: Volume2, content: <SpeechSettingsSection config={getConfig("speech")} onChange={setConfig("speech")} /> },
    { id: "transcription", label: "Realtime Transcription Settings", icon: AudioLines, content: <TranscriptionSection config={getConfig("transcription")} onChange={setConfig("transcription")} /> },
    { id: "call", label: "Call Settings", icon: Phone, content: <CallSettingsSection config={getConfig("call")} onChange={setConfig("call")} /> },
    { id: "postcall", label: "Post-Call Data Extraction", icon: BarChart3, content: <PostCallSection config={getConfig("postcall")} onChange={setConfig("postcall")} /> },
    { id: "security", label: "Security & Fallback Settings", icon: Shield, content: <SecuritySection config={getConfig("security")} onChange={setConfig("security")} /> },
    { id: "webhook", label: "Webhook Settings", icon: Webhook, content: <WebhookSection config={getConfig("webhook")} onChange={setConfig("webhook")} /> },
    { id: "mcps", label: "MCPs", icon: Puzzle, content: <MCPsSection /> },
  ];

  return (
    <div className="flex flex-col">
      {sections.map((section) => (
        <SectionWrapper key={section.id} section={section} />
      ))}
    </div>
  );
}
