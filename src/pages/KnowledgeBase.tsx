import { useState, useEffect, useMemo } from "react";
import {
  BookOpen, Plus, Trash2, Globe, FileText, Type, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Pencil, Search,
  MoreHorizontal, Clock, Database, Settings2, Link2, X,
  ChevronDown, ChevronRight, Zap, Upload,
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

interface CrawlConfig {
  auto_refresh?: boolean;
  auto_crawl?: boolean;
  exclusion_list?: string[];
  max_urls?: number;
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
  parent_source_id: string | null;
  crawl_config: CrawlConfig | null;
  crawl_status: string | null;
  last_refreshed_at: string | null;
  discovered_urls_count: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Loader2 }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "default", icon: Loader2 },
  ready: { label: "Indexed", variant: "outline", icon: CheckCircle2 },
  error: { label: "Failed", variant: "destructive", icon: AlertCircle },
};

const crawlStatusMap: Record<string, { label: string; color: string }> = {
  idle: { label: "Idle", color: "text-muted-foreground" },
  crawling: { label: "Crawling", color: "text-primary" },
  done: { label: "Crawled", color: "text-green-500" },
  error: { label: "Crawl Failed", color: "text-destructive" },
};

function relativeTime(dateStr: string | null) {
  if (!dateStr) return "never";
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
  // For text: use file_name as title if set, otherwise preview content
  if (src.file_name) return src.file_name;
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
  const [urlSettingsOpen, setUrlSettingsOpen] = useState(false);

  // KB form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  // Source form
  const [sourceType, setSourceType] = useState<"url" | "text" | "file">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceTextTitle, setSourceTextTitle] = useState("");
  const [textPreview, setTextPreview] = useState(false);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [addingSource, setAddingSource] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // URL crawl settings
  const [urlMode, setUrlMode] = useState<"single" | "crawl">("single");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoCrawl, setAutoCrawl] = useState(false);
  const [exclusionInput, setExclusionInput] = useState("");
  const [exclusionList, setExclusionList] = useState<string[]>([]);

  // URL settings dialog state (for editing existing source)
  const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);
  const [editAutoRefresh, setEditAutoRefresh] = useState(false);
  const [editAutoCrawl, setEditAutoCrawl] = useState(false);
  const [editExclusions, setEditExclusions] = useState<string[]>([]);
  const [editExclusionInput, setEditExclusionInput] = useState("");

  // Search & tabs
  const [search, setSearch] = useState("");
  const [sourceTab, setSourceTab] = useState<"all" | "url" | "file" | "text">("all");

  // Expanded URL parents (to show children)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

  const getOrCreateTeamId = async (): Promise<string | null> => {
    if (teamId) return teamId;
    if (!user) return null;
    // Auto-create a personal team for solo users using atomic DB function
    const { data, error } = await supabase.rpc("create_team_with_admin", {
      _name: "My Workspace",
      _user_id: user.id,
    });
    if (error || !data) { toast.error("Failed to create workspace"); return null; }
    return data as string;
  };

  const handleCreateKb = async () => {
    if (!formName.trim() || !user) return;
    const resolvedTeamId = await getOrCreateTeamId();
    if (!resolvedTeamId) return;
    const { data, error } = await supabase
      .from("knowledge_bases")
      .insert({ name: formName.trim(), description: formDesc.trim(), team_id: resolvedTeamId, created_by: user.id } as any)
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

  const triggerCrawl = async (sourceId: string, mode: "single" | "crawl") => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crawl-knowledge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ sourceId, mode }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error || "Processing failed");
      }
      const result = await resp.json();
      if (mode === "crawl") {
        toast.success(`Crawled ${result.crawledUrls || 0} pages, ${result.totalChunks || 0} chunks created`);
      } else {
        toast.success(`Processed: ${result.chunks || result.totalChunks || 0} chunks created`);
      }
    } catch (e: any) {
      toast.error(e.message || "Processing failed");
    }
    if (selectedKbId) fetchSources(selectedKbId);
  };

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

    if (sourceType === "url" && !sourceUrl.trim()) { toast.error("Enter a URL"); setAddingSource(false); return; }
    if (sourceType === "text" && !sourceText.trim()) { toast.error("Enter text content"); setAddingSource(false); return; }
    if (sourceType === "file") {
      if (sourceFiles.length === 0) { toast.error("Select files"); setAddingSource(false); return; }
      // Check file count limit
      const existingFiles = sources.filter(s => s.type === "file" && !s.parent_source_id).length;
      if (existingFiles + sourceFiles.length > 25) {
        toast.error(`Max 25 files per knowledge base (${existingFiles} existing)`);
        setAddingSource(false);
        return;
      }
    }

    if (sourceType === "url") {
      const crawlConfig: CrawlConfig = {
        auto_refresh: autoRefresh,
        auto_crawl: urlMode === "crawl" ? true : autoCrawl,
        exclusion_list: exclusionList,
        max_urls: 500,
      };
      const insertData: any = {
        knowledge_base_id: selectedKb.id,
        type: "url",
        source_url: sourceUrl.trim(),
        status: "pending",
        crawl_config: crawlConfig,
      };
      const { data, error } = await supabase.from("knowledge_sources").insert(insertData).select().single();
      if (error) { toast.error("Failed to add source"); setAddingSource(false); return; }
      resetSourceForm();
      setAddSourceOpen(false);
      setAddingSource(false);
      if (data) triggerCrawl((data as any).id, urlMode);
      fetchSources(selectedKb.id);
      return;
    }

    if (sourceType === "file") {
      // Upload files to storage and create sources
      for (const file of sourceFiles) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 50MB limit`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!["pdf", "docx", "txt", "csv", "xlsx", "xls"].includes(ext || "")) {
          toast.error(`${file.name}: unsupported format`);
          continue;
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));

        const filePath = `${selectedKb.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("knowledge-files")
          .upload(filePath, file);
        
        if (uploadErr) {
          toast.error(`Failed to upload ${file.name}`);
          setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; });
          continue;
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 50 }));

        const { data, error } = await supabase.from("knowledge_sources").insert({
          knowledge_base_id: selectedKb.id,
          type: "file",
          file_name: file.name,
          file_path: filePath,
          status: "pending",
        } as any).select().single();

        if (error) {
          toast.error(`Failed to create source for ${file.name}`);
          continue;
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 80 }));

        // Trigger processing
        if (data) {
          processFileSource((data as any).id);
        }
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }

      setUploadProgress({});
      resetSourceForm();
      setAddSourceOpen(false);
      setAddingSource(false);
      fetchSources(selectedKb.id);
      return;
    }

    // Text source
    const insertData: any = {
      knowledge_base_id: selectedKb.id,
      type: "text",
      content_text: sourceText.trim(),
      status: "pending",
    };
    const { data, error } = await supabase.from("knowledge_sources").insert(insertData).select().single();
    if (error) { toast.error("Failed to add source"); setAddingSource(false); return; }
    resetSourceForm();
    setAddSourceOpen(false);
    setAddingSource(false);
    if (data) processSource((data as any).id);
    fetchSources(selectedKb.id);
  };

  const processFileSource = async (sourceId: string) => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-file-knowledge`,
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
      toast.success("File processed successfully");
    } catch (e: any) {
      toast.error(e.message || "File processing failed");
    }
    if (selectedKbId) fetchSources(selectedKbId);
  };

  const handleDeleteSource = async (id: string) => {
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
    if (error) { toast.error("Failed to delete source"); return; }
    toast.success("Source deleted");
    if (selectedKbId) fetchSources(selectedKbId);
  };

  const handleUpdateUrlSettings = async () => {
    if (!editingSource) return;
    const config: CrawlConfig = {
      auto_refresh: editAutoRefresh,
      auto_crawl: editAutoCrawl,
      exclusion_list: editExclusions,
      max_urls: 500,
    };
    const { error } = await supabase
      .from("knowledge_sources")
      .update({ crawl_config: config } as any)
      .eq("id", editingSource.id);
    if (error) { toast.error("Failed to update settings"); return; }
    toast.success("URL settings updated");
    setUrlSettingsOpen(false);
    setEditingSource(null);
    if (selectedKbId) fetchSources(selectedKbId);
  };

  const openUrlSettings = (src: KnowledgeSource) => {
    setEditingSource(src);
    const cfg = src.crawl_config || {};
    setEditAutoRefresh(cfg.auto_refresh || false);
    setEditAutoCrawl(cfg.auto_crawl || false);
    setEditExclusions(cfg.exclusion_list || []);
    setEditExclusionInput("");
    setUrlSettingsOpen(true);
  };

  const resetSourceForm = () => {
    setSourceUrl(""); setSourceText(""); setSourceFiles([]);
    setUrlMode("single"); setAutoRefresh(false); setAutoCrawl(false);
    setExclusionList([]); setExclusionInput("");
    setUploadProgress({});
  };

  const addExclusion = (list: string[], setList: (l: string[]) => void, input: string, setInput: (s: string) => void) => {
    const val = input.trim();
    if (!val || list.includes(val)) return;
    if (list.length >= 200) { toast.error("Max 200 exclusion URLs"); return; }
    setList([...list, val]);
    setInput("");
  };

  // ─── Derived data ─────────────────────────────────────────────────

  const filteredKbs = useMemo(() =>
    knowledgeBases.filter((kb) =>
      !search || kb.name.toLowerCase().includes(search.toLowerCase()) || kb.description?.toLowerCase().includes(search.toLowerCase())
    ), [knowledgeBases, search]);

  // Separate parent (root) and child sources
  const parentSources = useMemo(() =>
    sources.filter((s) => !s.parent_source_id), [sources]);

  const childSourcesByParent = useMemo(() => {
    const map: Record<string, KnowledgeSource[]> = {};
    sources.filter((s) => s.parent_source_id).forEach((s) => {
      if (!map[s.parent_source_id!]) map[s.parent_source_id!] = [];
      map[s.parent_source_id!].push(s);
    });
    return map;
  }, [sources]);

  const filteredSources = useMemo(() =>
    parentSources.filter((s) => sourceTab === "all" || s.type === sourceTab),
    [parentSources, sourceTab]);

  const sourceCounts = useMemo(() => ({
    all: parentSources.length,
    url: parentSources.filter((s) => s.type === "url").length,
    file: parentSources.filter((s) => s.type === "file").length,
    text: parentSources.filter((s) => s.type === "text").length,
  }), [parentSources]);

  const toggleExpanded = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Source Row Renderer ───────────────────────────────────────────

  const renderSourceRow = (src: KnowledgeSource, isChild = false) => {
    const st = statusMap[src.status] || statusMap.pending;
    const StatusIcon = st.icon;
    const isSpinning = src.status === "processing" || src.status === "pending";
    const hasChildren = !isChild && (childSourcesByParent[src.id]?.length || 0) > 0;
    const isExpanded = expandedParents.has(src.id);
    const crawlSt = src.crawl_status && crawlStatusMap[src.crawl_status];
    const isUrlParent = src.type === "url" && !src.parent_source_id;
    const cfg = src.crawl_config || {};

    return (
      <div key={src.id}>
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group ${isChild ? "ml-8 border-l-2 border-l-primary/20" : ""}`}
        >
          {/* Expand toggle for parents with children */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(src.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            {src.type === "url" && <Globe className="h-4 w-4 text-muted-foreground" />}
            {src.type === "file" && <FileText className="h-4 w-4 text-muted-foreground" />}
            {src.type === "text" && <Type className="h-4 w-4 text-muted-foreground" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {sourceLabel(src)}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={st.variant} className="text-[10px] px-1.5 py-0 gap-1">
                <StatusIcon className={`h-2.5 w-2.5 ${isSpinning ? "animate-spin" : ""}`} />
                {st.label}
              </Badge>

              {crawlSt && src.crawl_status !== "idle" && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${crawlSt.color}`}>
                  {crawlSt.label}
                </Badge>
              )}

              {src.chunk_count > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {src.chunk_count} chunks
                </span>
              )}

              {(src.discovered_urls_count || 0) > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {src.discovered_urls_count} pages
                </span>
              )}

              {isUrlParent && cfg.auto_refresh && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-primary">
                  <RefreshCw className="h-2 w-2" /> Auto
                </Badge>
              )}

              {isUrlParent && cfg.auto_crawl && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-primary">
                  <Link2 className="h-2 w-2" /> Crawl
                </Badge>
              )}

              <span className="text-[11px] text-muted-foreground/70">
                {src.last_refreshed_at ? `Refreshed ${relativeTime(src.last_refreshed_at)}` : relativeTime(src.updated_at || src.created_at)}
              </span>
            </div>
            {src.error_message && (
              <p className="text-xs text-destructive mt-1 truncate">{src.error_message}</p>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isUrlParent && canManage && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="URL Settings" onClick={() => openUrlSettings(src)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {src.type === "url" && canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Re-crawl"
                onClick={() => triggerCrawl(src.id, cfg.auto_crawl ? "crawl" : "single")}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {src.type !== "url" && (src.status === "error" || src.status === "pending") && canManage && (
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

        {/* Child URLs */}
        {hasChildren && isExpanded && (
          <div className="space-y-1 mt-1">
            {childSourcesByParent[src.id].map((child) => renderSourceRow(child, true))}
          </div>
        )}
      </div>
    );
  };

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
                  {knowledgeBases.length === 0 ? "Create your first knowledge base to get started." : "Try a different search term."}
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
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedKbId(kb.id); setTimeout(openEditDialog, 50); }}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb.id); }}>
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
                      {parentSources.length === 0 ? "No sources yet" : "No sources in this category"}
                    </p>
                    <p className="text-helper mt-1">
                      {parentSources.length === 0
                        ? "Add URLs, upload files, or paste text to build your knowledge base."
                        : "Switch tabs or add a new source."}
                    </p>
                    {canManage && parentSources.length === 0 && (
                      <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => { setSourceType("url"); setAddSourceOpen(true); }}>
                        <Plus className="h-3.5 w-3.5" /> Add First Source
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredSources.map((src) => renderSourceRow(src))
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
      <Dialog open={addSourceOpen} onOpenChange={(open) => { setAddSourceOpen(open); if (!open) resetSourceForm(); }}>
        <DialogContent className="sm:max-w-lg">
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

            <TabsContent value="url" className="space-y-4 pt-3">
              {/* URL Mode */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={urlMode === "single" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setUrlMode("single")}
                >
                  <Globe className="h-3.5 w-3.5" /> Single URL
                </Button>
                <Button
                  type="button"
                  variant={urlMode === "crawl" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setUrlMode("crawl")}
                >
                  <Link2 className="h-3.5 w-3.5" /> Crawl Path
                </Button>
              </div>

              <div className="space-y-2">
                <Label>{urlMode === "crawl" ? "Base URL Path" : "Website URL"}</Label>
                <Input
                  placeholder={urlMode === "crawl" ? "https://example.com/docs" : "https://example.com/page"}
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {urlMode === "crawl"
                    ? "All pages under this path will be auto-discovered and indexed (max 500 URLs)."
                    : "The page content will be extracted and indexed."}
                </p>
              </div>

              {/* URL Settings */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground w-full justify-start">
                    <Settings2 className="h-3.5 w-3.5" /> Advanced Settings
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3 px-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Auto-refresh (24h)</Label>
                      <p className="text-xs text-muted-foreground">Re-index content every 24 hours.</p>
                    </div>
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                  </div>

                  {urlMode === "single" && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Auto-crawl sub-pages</Label>
                        <p className="text-xs text-muted-foreground">Discover and index linked pages.</p>
                      </div>
                      <Switch checked={autoCrawl} onCheckedChange={setAutoCrawl} />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm">Exclusion URLs</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="/privacy, /terms, /login"
                        value={exclusionInput}
                        onChange={(e) => setExclusionInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExclusion(exclusionList, setExclusionList, exclusionInput, setExclusionInput); } }}
                        className="text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addExclusion(exclusionList, setExclusionList, exclusionInput, setExclusionInput)}>Add</Button>
                    </div>
                    {exclusionList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {exclusionList.map((ex, i) => (
                          <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                            {ex}
                            <button onClick={() => setExclusionList(exclusionList.filter((_, j) => j !== i))} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">URLs containing these paths will be skipped (max 200).</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            <TabsContent value="file" className="space-y-3 pt-3">
              <Label>Upload Files</Label>
              <Input
                type="file"
                accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 25) {
                    toast.error("Max 25 files at once");
                    return;
                  }
                  const oversized = files.filter(f => f.size > 50 * 1024 * 1024);
                  if (oversized.length) {
                    toast.error(`${oversized[0].name} exceeds 50MB limit`);
                    return;
                  }
                  setSourceFiles(files);
                }}
              />
              {sourceFiles.length > 0 && (
                <div className="space-y-1.5">
                  {sourceFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      {uploadProgress[f.name] !== undefined && (
                        <Progress value={uploadProgress[f.name]} className="w-16 h-1.5" />
                      )}
                      <button onClick={() => setSourceFiles(sourceFiles.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Supported: PDF, DOCX, TXT, CSV, XLSX (max 50MB per file, 25 files per KB).
              </p>
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
              {addingSource ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
              ) : sourceType === "url" && urlMode === "crawl" ? (
                <><Zap className="h-4 w-4 mr-2" /> Crawl & Index</>
              ) : (
                "Add & Process"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── URL Settings Dialog ───────────────────────────────────── */}
      <Dialog open={urlSettingsOpen} onOpenChange={setUrlSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>URL Settings</DialogTitle>
            <DialogDescription className="truncate">
              {editingSource?.source_url}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-refresh (24h)</Label>
                <p className="text-xs text-muted-foreground">Re-index content every 24 hours.</p>
              </div>
              <Switch checked={editAutoRefresh} onCheckedChange={setEditAutoRefresh} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-crawl sub-pages</Label>
                <p className="text-xs text-muted-foreground">Discover and index linked pages under this path.</p>
              </div>
              <Switch checked={editAutoCrawl} onCheckedChange={setEditAutoCrawl} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm">Exclusion URLs</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="/privacy, /terms"
                  value={editExclusionInput}
                  onChange={(e) => setEditExclusionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExclusion(editExclusions, setEditExclusions, editExclusionInput, setEditExclusionInput); } }}
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addExclusion(editExclusions, setEditExclusions, editExclusionInput, setEditExclusionInput)}>Add</Button>
              </div>
              {editExclusions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {editExclusions.map((ex, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                      {ex}
                      <button onClick={() => setEditExclusions(editExclusions.filter((_, j) => j !== i))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {editingSource?.last_refreshed_at && (
              <p className="text-xs text-muted-foreground">
                Last refreshed: {relativeTime(editingSource.last_refreshed_at)}
              </p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleUpdateUrlSettings}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeBasePage;
