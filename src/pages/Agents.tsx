import { useState } from "react";
import {
  Bot, Plus, Search, MoreHorizontal, Pencil, Copy, Trash2, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRBAC } from "@/hooks/useRBAC";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────

type AgentStatus = "active" | "draft" | "paused" | "archived";
type AgentType = "sales" | "support" | "booking" | "follow-up" | "custom";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  type: AgentType;
  language: string;
  voice: string;
  updatedAt: string;
  calls: number;
  successRate: number;
}

// ─── Placeholder Data ────────────────────────────────────────────────

const INITIAL_AGENTS: Agent[] = [];

const LANGUAGES = ["All", "English", "Spanish", "French", "German"];
const STATUSES: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];
const TYPES: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Sales", value: "sales" },
  { label: "Support", value: "support" },
  { label: "Booking", value: "booking" },
  { label: "Follow-up", value: "follow-up" },
  { label: "Custom", value: "custom" },
];

// ─── Helpers ─────────────────────────────────────────────────────────

const statusConfig: Record<AgentStatus, { variant: "default" | "secondary" | "outline" | "success" | "warning"; className?: string }> = {
  active: { variant: "success" },
  draft: { variant: "secondary" },
  paused: { variant: "warning" },
  archived: { variant: "outline" },
};

const typeLabel: Record<AgentType, string> = {
  sales: "Sales", support: "Support", booking: "Booking", "follow-up": "Follow-up", custom: "Custom",
};

// ─── Component ───────────────────────────────────────────────────────

const Agents = () => {
  const { hasPermission } = useRBAC();
  const canManage = hasPermission("agents.manage");

  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<AgentType>("custom");
  const [newLang, setNewLang] = useState("English");
  const [newVoice, setNewVoice] = useState("Nova");

  // Filtered list
  const filtered = agents.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (languageFilter !== "All" && a.language !== languageFilter) return false;
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    return true;
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    const agent: Agent = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim(),
      status: "draft",
      type: newType,
      language: newLang,
      voice: newVoice,
      updatedAt: new Date().toISOString().slice(0, 10),
      calls: 0,
      successRate: 0,
    };
    setAgents((prev) => [agent, ...prev]);
    setNewName(""); setNewDesc(""); setNewType("custom"); setNewLang("English"); setNewVoice("Nova");
    setCreateOpen(false);
    toast.success(`Agent "${agent.name}" created`);
  };

  const handleDuplicate = (agent: Agent) => {
    const dup: Agent = {
      ...agent,
      id: crypto.randomUUID(),
      name: `${agent.name} (Copy)`,
      status: "draft",
      updatedAt: new Date().toISOString().slice(0, 10),
      calls: 0,
      successRate: 0,
    };
    setAgents((prev) => [dup, ...prev]);
    toast.success(`Agent duplicated as "${dup.name}"`);
  };

  const handleDelete = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    toast.success("Agent deleted");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">Agents</h1>
          <p className="text-helper mt-1">Create and manage your AI voice agents.</p>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 shrink-0">
                <Plus className="h-4 w-4" /> New Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Agent Name</Label>
                  <Input placeholder="e.g. Support Bot" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea placeholder="What does this agent do?" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as AgentType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.filter((t) => t.value !== "all").map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={newLang} onValueChange={setNewLang}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.filter((l) => l !== "All").map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Voice</Label>
                    <Select value={newVoice} onValueChange={setNewVoice}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Nova", "Onyx", "Shimmer", "Echo", "Alloy", "Fable"].map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleCreate} disabled={!newName.trim()}>Create Agent</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Agent Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium text-foreground">No agents found</p>
            <p className="text-helper mt-1 max-w-sm mx-auto">
              {agents.length === 0
                ? "Get started by creating your first AI voice agent."
                : "Try adjusting your search or filters."}
            </p>
            {canManage && agents.length === 0 && (
              <Button className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create First Agent
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <Card
              key={agent.id}
              className="group relative hover:border-primary/30 transition-colors"
            >
              <CardContent className="p-5 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{agent.name}</p>
                      <p className="text-helper">{typeLabel[agent.type]}</p>
                    </div>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast.info("Edit coming soon")}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(agent)}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(agent.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {agent.description}
                </p>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={statusConfig[agent.status].variant} className="text-[10px] px-1.5 py-0">
                    {agent.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {agent.language}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {agent.voice}
                  </Badge>
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Calls</p>
                      <p className="text-sm font-medium text-foreground">{agent.calls.toLocaleString()}</p>
                    </div>
                    {agent.calls > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Success</p>
                        <p className="text-sm font-medium text-foreground">{agent.successRate}%</p>
                      </div>
                    )}
                  </div>
                  <p className="text-helper">{agent.updatedAt}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Agents;
