import { useState, useEffect, useMemo } from "react";
import {
  BookOpen, Plus, Trash2, Globe, FileText, Type, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Pencil, Search,
  MoreHorizontal, Clock, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRBAC } from "@/hooks/useRBAC";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  team_id: string;
}

interface KnowledgeSource {
  id: string;
  knowledge_base_id: string;
  type: "url" | "file" | "text";
  source_url: string | null;
  file_name: string | null;
  content_text: string | null;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Loader2 }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "default", icon: Loader2 },
  ready: { label: "Indexed", variant: "outline", icon: CheckCircle2 },
  error: { label: "Failed", variant: "destructive", icon: AlertCircle },
};

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sourceLabel(src: KnowledgeSource) {
  if (src.type === "url") return src.source_url || "URL";
  if (src.type === "file") return src.file_name || "File";
  const preview = src.content_text?.slice(0, 60) || "Text";
  return preview.length >= 60 ? preview + "…" : preview;
}

// ─── Component ───────────────────────────────────────────────────────

const KnowledgeBasePage = () => {
  const { user } = useAuth();
  const { teamId, hasPermission } = useRBAC();
  const canManage = hasPermission("agents.manage");

  // Data
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  // KB form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  // Source form
  const [sourceType, setSourceType] = useState<"url" | "text" | "file">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  // Search
  const [search, setSearch] = useState("");

  // Tab filter inside KB detail
  const [sourceTab, setSourceTab] = useState<"all" | "url" | "file" | "text">("all");

  const selectedKb = knowledgeBases.find((kb) => kb.id === selectedKbId) || null;

  // ─── Data fetching ─────────────────────────────────────────────────

  useEffect(() => { fetchKnowledgeBases(); }, [teamId]);

  useEffect(() => {
    if (selectedKbId) fetchSources(selectedKbId);
    else setSources([]);
  }, [selectedKbId]);

  const fetchKnowledgeBases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_bases")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setKnowledgeBases(data as unknown as KnowledgeBase[]);
    setLoading(false);
  };

  const fetchSources = async (kbId: string) => {
    setSourcesLoading(true);
    const { data, error } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("knowledge_base_id", kbId)
      .order("created_at", { ascending: false });
    if (!error && data) setSources(data as unknown as KnowledgeSource[]);
    setSourcesLoading(false);
  };

  // ─── KB CRUD ───────────────────────────────────────────────────────

  const handleCreateKb = async () => {
    if (!formName.trim() || !user || !teamId) return;
    const { data, error } = await supabase
      .from("knowledge_bases")
      .insert({ name: formName.trim(), description: formDesc.trim(), team_id: teamId, created_by: user.id } as any)
      .select()
      .single();
    if (error) { toast.error("Failed to create knowledge base"); return; }
    toast.success("Knowledge base created");
    resetForm();
    setCreateOpen(false);
    fetchKnowledgeBases();
    if (data) setSelectedKbId((data as any).id);
  };

  const handleEditKb = async () => {
    if (!selectedKb || !formName.trim()) return;
    const { error } = await supabase
      .from("knowledge_bases")
      .update({ name: formName.trim(), description: formDesc.trim() } as any)
      .eq("id", selectedKb.id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Knowledge base updated");
    resetForm();
    setEditOpen(false);
    fetchKnowledgeBases();
  };

  const handleDeleteKb = async (id: string) => {
    const { error } = await supabase.from("knowledge_bases").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Knowledge base deleted");
    if (selectedKbId === id) { setSelectedKbId(null); setSources([]); }
    fetchKnowledgeBases();
  };

  const openEditDialog = () => {
    if (!selectedKb) return;
    setFormName(selectedKb.name);
    setFormDesc(selectedKb.description || "");
    setEditOpen(true);
  };

  const resetForm = () => { setFormName(""); setFormDesc(""); };

  // ─── Source CRUD ───────────────────────────────────────────────────

  const processSource = async (sourceId: string) => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-knowledge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ sourceId }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error || "Processing failed");
      }
      toast.success("Source processed successfully");
    } catch (e: any) {
      toast.error(e.message || "Processing failed");
    }
    if (selectedKbId) fetchSources(selectedKbId);
  };

  const handleAddSource = async () => {
    if (!selectedKb) return;
    setAddingSource(true);

    let contentText = "";
    let fileName = "";

    if (sourceType === "url" && !sourceUrl.trim()) { toast.error("Enter a URL"); setAddingSource(false); return; }
    if (sourceType === "text" && !sourceText.trim()) { toast.error("Enter text content"); setAddingSource(false); return; }
    if (sourceType === "file") {
      if (!sourceFile) { toast.error("Select a file"); setAddingSource(false); return; }
      contentText = await sourceFile.text();
      fileName = sourceFile.name;
    }

    const insertData: any = {
      knowledge_base_id: selectedKb.id,
      type: sourceType,
      source_url: sourceType === "url" ? sourceUrl.trim() : null,
      file_name: sourceType === "file" ? fileName : null,
      content_text: sourceType === "text" ? sourceText.trim() : sourceType === "file" ? contentText : null,
      status: "pending",
    };

    const { data, error } = await supabase.from("knowledge_sources").insert(insertData).select().single();
    if (error) { toast.error("Failed to add source"); setAddingSource(false); return; }

    setSourceUrl(""); setSourceText(""); setSourceFile(null);
    setAddSourceOpen(false);
    setAddingSource(false);

    if (data) processSource((data as any).id);
    fetchSources(selectedKb.id);
  };

  const handleDeleteSource = async (id: string) => {
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
    if (error) { toast.error("Failed to delete source"); return; }
    toast.success("Source deleted");
    if (selectedKbId) fetchSources(selectedKbId);
  };

  // ─── Derived data ─────────────────────────────────────────────────

  const filteredKbs = useMemo(() =>
    knowledgeBases.filter((kb) =>
      !search || kb.name.toLowerCase().includes(search.toLowerCase()) || kb.description?.toLowerCase().includes(search.toLowerCase())
    ), [knowledgeBases, search]);

  const filteredSources = useMemo(() =>
    sources.filter((s) => sourceTab === "all" || s.type === sourceTab),
    [sources, sourceTab]);

  const sourceCounts = useMemo(() => ({
    all: sources.length,
    url: sources.filter((s) => s.type === "url").length,
    file: sources.filter((s) => s.type === "file").length,
    text: sources.filter((s) => s.type === "text").length,
  }), [sources]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">Knowledge Base</h1>
          <p className="text-helper mt-1">Manage knowledge sources for RAG-powered AI agent responses.</p>
        </div>
        {canManage && (
          <Button className="gap-1.5 shrink-0" onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> New Knowledge Base
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Left: KB List ──────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search knowledge bases..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredKbs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {knowledgeBases.length === 0 ? "No knowledge bases yet" : "No results found"}
                </p>
                <p className="text-helper mt-1">
                  {knowledgeBases.length === 0
                    ? "Create your first knowledge base to get started."
                    : "Try a different search term."}
                </p>
                {canManage && knowledgeBases.length === 0 && (
                  <Button className="mt-4 gap-1.5" onClick={() => { resetForm(); setCreateOpen(true); }}>
                    <Plus className="h-4 w-4" /> Create First
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredKbs.map((kb) => {
                const isActive = selectedKbId === kb.id;
                return (
                  <Card
                    key={kb.id}
                    className={`cursor-pointer transition-all hover:border-primary/30 ${isActive ? "border-primary bg-primary/5" : ""}`}
                    onClick={() => setSelectedKbId(kb.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary/10" : "bg-muted"}`}>
                            <BookOpen className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate text-sm">{kb.name}</p>
                            {kb.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kb.description}</p>
                            )}
                            <p className="text-[11px] text-muted-foreground/70 mt-1">
                              Updated {relativeTime(kb.updated_at || kb.created_at)}
                            </p>
                          </div>
                        </div>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedKbId(kb.id); openEditDialog(); }}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: KB Detail ───────────────────────────────────── */}
        <div>
          {selectedKb ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{selectedKb.name}</CardTitle>
                    {selectedKb.description && (
                      <CardDescription className="mt-1">{selectedKb.description}</CardDescription>
                    )}
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Add Source
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSourceType("url"); setAddSourceOpen(true); }}>
                          <Globe className="h-3.5 w-3.5 mr-2" /> Add URL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSourceType("file"); setAddSourceOpen(true); }}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Upload File
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSourceType("text"); setAddSourceOpen(true); }}>
                          <Type className="h-3.5 w-3.5 mr-2" /> Add Text
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Source type tabs */}
                <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as any)} className="mt-4">
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs gap-1.5">
                      All <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{sourceCounts.all}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="url" className="text-xs gap-1.5">
                      <Globe className="h-3 w-3" /> URLs <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{sourceCounts.url}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="file" className="text-xs gap-1.5">
                      <FileText className="h-3 w-3" /> Files <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{sourceCounts.file}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="text" className="text-xs gap-1.5">
                      <Type className="h-3 w-3" /> Text <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{sourceCounts.text}</Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>

              <Separator />

              <CardContent className="pt-4 space-y-2">
                {sourcesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSources.length === 0 ? (
                  <div className="py-12 text-center">
                    <Database className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">
                      {sources.length === 0 ? "No sources yet" : "No sources in this category"}
                    </p>
                    <p className="text-helper mt-1">
                      {sources.length === 0
                        ? "Add URLs, upload files, or paste text to build your knowledge base."
                        : "Switch tabs or add a new source."}
                    </p>
                    {canManage && sources.length === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 gap-1.5"
                        onClick={() => { setSourceType("url"); setAddSourceOpen(true); }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add First Source
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredSources.map((src) => {
                    const st = statusMap[src.status] || statusMap.pending;
                    const StatusIcon = st.icon;
                    const isSpinning = src.status === "processing" || src.status === "pending";
                    return (
                      <div
                        key={src.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {src.type === "url" && <Globe className="h-4 w-4 text-muted-foreground" />}
                          {src.type === "file" && <FileText className="h-4 w-4 text-muted-foreground" />}
                          {src.type === "text" && <Type className="h-4 w-4 text-muted-foreground" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {sourceLabel(src)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={st.variant} className="text-[10px] px-1.5 py-0 gap-1">
                              <StatusIcon className={`h-2.5 w-2.5 ${isSpinning ? "animate-spin" : ""}`} />
                              {st.label}
                            </Badge>
                            {src.chunk_count > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                {src.chunk_count} chunks
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground/70">
                              {relativeTime(src.updated_at || src.created_at)}
                            </span>
                          </div>
                          {src.error_message && (
                            <p className="text-xs text-destructive mt-1 truncate">{src.error_message}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(src.status === "error" || src.status === "pending") && canManage && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Reprocess" onClick={() => processSource(src.id)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canManage && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSource(src.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium text-foreground">Select a knowledge base</p>
                <p className="text-helper mt-1 max-w-sm mx-auto">
                  Choose a knowledge base from the list or create a new one to manage its sources.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Create KB Dialog ──────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Knowledge Base</DialogTitle>
            <DialogDescription>Add a new knowledge base to organize your sources.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Product FAQ" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="What knowledge does this base contain?" rows={2} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleCreateKb} disabled={!formName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit KB Dialog ────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Base</DialogTitle>
            <DialogDescription>Update the name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleEditKb} disabled={!formName.trim()}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Source Dialog ─────────────────────────────────────── */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Source</DialogTitle>
            <DialogDescription>
              Add a source to <span className="font-medium text-foreground">{selectedKb?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="url" className="flex-1 gap-1.5"><Globe className="h-3.5 w-3.5" /> URL</TabsTrigger>
              <TabsTrigger value="file" className="flex-1 gap-1.5"><FileText className="h-3.5 w-3.5" /> File</TabsTrigger>
              <TabsTrigger value="text" className="flex-1 gap-1.5"><Type className="h-3.5 w-3.5" /> Text</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 pt-3">
              <Label>Website URL</Label>
              <Input placeholder="https://example.com/docs" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">The page content will be extracted and indexed.</p>
            </TabsContent>
            <TabsContent value="file" className="space-y-3 pt-3">
              <Label>Upload File</Label>
              <Input
                type="file"
                accept=".pdf,.docx,.txt,.csv"
                onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, TXT, CSV (max 20MB).</p>
            </TabsContent>
            <TabsContent value="text" className="space-y-3 pt-3">
              <Label>Text Content</Label>
              <Textarea placeholder="Paste your content here..." rows={6} value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
              <p className="text-xs text-muted-foreground">Raw text will be chunked and indexed.</p>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAddSource} disabled={addingSource}>
              {addingSource ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</> : "Add & Process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeBasePage;
