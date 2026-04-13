import { useState } from "react";
import {
  Grid3X3, BookOpen, Volume2, AudioLines, Phone, BarChart3,
  Shield, Webhook, Puzzle, Plus, Upload, Trash2,
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

function FunctionsSection() {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Function Calling</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      {enabled && (
        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Function
        </Button>
      )}
    </div>
  );
}

function KnowledgeBaseSection() {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Knowledge Base</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
        <Upload className="h-3.5 w-3.5" /> Upload Documents
      </Button>
      <p className="text-[11px] text-muted-foreground">No documents uploaded yet.</p>
    </div>
  );
}

function SpeechSettingsSection() {
  const [speed, setSpeed] = useState([1.0]);
  const [pitch, setPitch] = useState([1.0]);
  const [bargeIn, setBargeIn] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Speed</Label>
          <span className="text-[11px] text-muted-foreground">{speed[0].toFixed(1)}x</span>
        </div>
        <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} className="w-full" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pitch</Label>
          <span className="text-[11px] text-muted-foreground">{pitch[0].toFixed(1)}</span>
        </div>
        <Slider value={pitch} onValueChange={setPitch} min={0.5} max={2.0} step={0.1} className="w-full" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Interrupt (Barge-in)</Label>
        <Switch checked={bargeIn} onCheckedChange={setBargeIn} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Noise Suppression</Label>
        <Switch checked={noiseSuppression} onCheckedChange={setNoiseSuppression} />
      </div>
    </div>
  );
}

function TranscriptionSection() {
  const [enabled, setEnabled] = useState(true);
  const [partial, setPartial] = useState(true);
  const [langDetect, setLangDetect] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Transcription</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Partial Transcripts</Label>
        <Switch checked={partial} onCheckedChange={setPartial} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Language Detection</Label>
        <Switch checked={langDetect} onCheckedChange={setLangDetect} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Latency Preference</Label>
        <Select defaultValue="balanced">
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
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

function CallSettingsSection() {
  const [maxDuration, setMaxDuration] = useState("30");
  const [silenceTimeout, setSilenceTimeout] = useState("10");
  const [voicemail, setVoicemail] = useState(true);
  const [recording, setRecording] = useState(true);
  const [transfer, setTransfer] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Max Call Duration (min)</Label>
        <Input value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} className="h-8 text-xs" type="number" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Silence Timeout (sec)</Label>
        <Input value={silenceTimeout} onChange={(e) => setSilenceTimeout(e.target.value)} className="h-8 text-xs" type="number" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Voicemail Detection</Label>
        <Switch checked={voicemail} onCheckedChange={setVoicemail} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Call Recording</Label>
        <Switch checked={recording} onCheckedChange={setRecording} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Call Transfer</Label>
        <Switch checked={transfer} onCheckedChange={setTransfer} />
      </div>
    </div>
  );
}

function PostCallSection() {
  const [fields, setFields] = useState([
    { name: "name", type: "string" },
    { name: "email", type: "string" },
    { name: "intent", type: "string" },
    { name: "summary", type: "string" },
  ]);

  const addField = () => setFields([...fields, { name: "", type: "string" }]);
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));

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
            <SelectTrigger className="h-7 text-xs w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="array">Array</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeField(i)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={addField}>
        <Plus className="h-3.5 w-3.5" /> Add Field
      </Button>
    </div>
  );
}

function SecuritySection() {
  const [hallucination, setHallucination] = useState(true);
  const [unsafeHandling, setUnsafeHandling] = useState(true);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Fallback Response</Label>
        <Input defaultValue="I'm sorry, I didn't understand that. Could you rephrase?" className="h-8 text-xs" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Hallucination Guard</Label>
        <Switch checked={hallucination} onCheckedChange={setHallucination} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Unsafe Query Handling</Label>
        <Switch checked={unsafeHandling} onCheckedChange={setUnsafeHandling} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Max Retries</Label>
        <Input defaultValue="3" className="h-8 text-xs" type="number" />
      </div>
    </div>
  );
}

function WebhookSection() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["call_ended"]);

  const toggleEvent = (ev: string) => {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  };

  const allEvents = ["call_started", "call_ended", "transcript_updated"];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Webhook URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-api.com/webhook" className="h-8 text-xs" />
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

export function AgentConfigPanel() {
  const sections: ConfigSection[] = [
    { id: "functions", label: "Functions", icon: Grid3X3, content: <FunctionsSection /> },
    { id: "knowledge", label: "Knowledge Base", icon: BookOpen, content: <KnowledgeBaseSection /> },
    { id: "speech", label: "Speech Settings", icon: Volume2, content: <SpeechSettingsSection /> },
    { id: "transcription", label: "Realtime Transcription Settings", icon: AudioLines, content: <TranscriptionSection /> },
    { id: "call", label: "Call Settings", icon: Phone, content: <CallSettingsSection /> },
    { id: "postcall", label: "Post-Call Data Extraction", icon: BarChart3, content: <PostCallSection /> },
    { id: "security", label: "Security & Fallback Settings", icon: Shield, content: <SecuritySection /> },
    { id: "webhook", label: "Webhook Settings", icon: Webhook, content: <WebhookSection /> },
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
