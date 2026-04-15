import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, Globe, FileText, Type, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRBAC } from "@/hooks/useRBAC";
import { toast } from "sonner";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  created_at: string;
  team_id: string;
}

interface KnowledgeSource {
  id: string;
  knowledge_base_id: string;
  type: string;
  source_url: string | null;
  file_name: string | null;
  content_text: string | null;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Loader2 className="h-3 w-3 animate-spin" />, color: "text-muted-foreground" },
  processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, color: "text-primary" },
  ready: { icon: <CheckCircle2 className="h-3 w-3" />, color: "text-green-500" },
  error: { icon: <AlertCircle className="h-3 w-3" />, color: "text-destructive" },
};

const KnowledgeBasePage = () => {
  const { user } = useAuth();
  const { teamId, hasPermission } = useRBAC();
  const canManage = hasPermission("agents.manage");

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Add source form
  const [sourceType, setSourceType] = useState<"url" | "text" | "file">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [teamId]);

  useEffect(() => {
    if (selectedKb) fetchSources(selectedKb.id);
  }, [selectedKb]);

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
    const { data, error } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("knowledge_base_id", kbId)
      .order("created_at", { ascending: false });
    if (!error && data) setSources(data as unknown as KnowledgeSource[]);
  };

  const handleCreateKb = async () => {
    if (!newName.trim() || !user || !teamId) return;
    const { data, error } = await supabase
      .from("knowledge_bases")
      .insert({ name: newName.trim(), description: newDesc.trim(), team_id: teamId, created_by: user.id } as any)
      .select()
      .single();
    if (error) {
      toast.error("Failed to create knowledge base");
      return;
    }
    toast.success("Knowledge base created");
    setNewName("");
    setNewDesc("");
    setCreateOpen(false);
    fetchKnowledgeBases();
    if (data) setSelectedKb(data as unknown as KnowledgeBase);
  };

  const handleDeleteKb = async (id: string) => {
    const { error } = await supabase.from("knowledge_bases").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Knowledge base deleted");
    if (selectedKb?.id === id) { setSelectedKb(null); setSources([]); }
    fetchKnowledgeBases();
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
    if (selectedKb) fetchSources(selectedKb.id);
  };

  const handleAddSource = async () => {
    if (!selectedKb) return;
    setAddingSource(true);

    let contentText = "";
    let fileName = "";

    if (sourceType === "url" && !sourceUrl.trim()) {
      toast.error("Please enter a URL");
      setAddingSource(false);
      return;
    }
    if (sourceType === "text" && !sourceText.trim()) {
      toast.error("Please enter text content");
      setAddingSource(false);
      return;
    }
    if (sourceType === "file") {
      if (!sourceFile) {
        toast.error("Please select a file");
        setAddingSource(false);
        return;
      }
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
    if (error) {
      toast.error("Failed to add source");
      setAddingSource(false);
      return;
    }

    setSourceUrl("");
    setSourceText("");
    setSourceFile(null);
    setAddSourceOpen(false);
    setAddingSource(false);

    // Start processing
    if (data) processSource((data as any).id);
    fetchSources(selectedKb.id);
  };

  const handleDeleteSource = async (id: string) => {
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
    if (error) { toast.error("Failed to delete source"); return; }
    toast.success("Source deleted");
    if (selectedKb) fetchSources(selectedKb.id);
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "url": return <Globe className="h-4 w-4 text-muted-foreground" />;
      case "file": return <FileText className="h-4 w-4 text-muted-foreground" />;
      case "text": return <Type className="h-4 w-4 text-muted-foreground" />;
      default: return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">Knowledge Base</h1>
          <p className="text-helper mt-1">Manage knowledge bases for RAG-powered AI agent responses.</p>
        </div>
        {canManage && (
          <Button className="gap-1.5 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Knowledge Base
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* KB List */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Knowledge Bases</p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : knowledgeBases.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No knowledge bases yet.</p>
              </CardContent>
            </Card>
          ) : (
            knowledgeBases.map((kb) => (
              <Card
                key={kb.id}
                className={`cursor-pointer transition-colors hover:border-primary/30 ${selectedKb?.id === kb.id ? "border-primary" : ""}`}
                onClick={() => setSelectedKb(kb)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{kb.name}</p>
                      {kb.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kb.description}</p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Sources Panel */}
        <div className="lg:col-span-2">
          {selectedKb ? (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selectedKb.name} — Sources</CardTitle>
                  {canManage && (
                    <Button size="sm" className="gap-1.5" onClick={() => setAddSourceOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Add Source
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sources.length === 0 ? (
                  <div className="py-8 text-center">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No sources added yet. Add URLs, files, or text.</p>
                  </div>
                ) : (
                  sources.map((src) => {
                    const st = statusConfig[src.status] || statusConfig.pending;
                    return (
                      <div key={src.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                        {sourceIcon(src.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {src.file_name || src.source_url || "Text input"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`flex items-center gap-1 text-xs ${st.color}`}>
                              {st.icon} {src.status}
                            </span>
                            {src.chunk_count > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {src.chunk_count} chunks
                              </Badge>
                            )}
                          </div>
                          {src.error_message && (
                            <p className="text-xs text-destructive mt-1">{src.error_message}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {(src.status === "error" || src.status === "pending") && canManage && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => processSource(src.id)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canManage && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleDeleteSource(src.id)}>
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
              <CardContent className="py-16 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium text-foreground">Select a knowledge base</p>
                <p className="text-helper mt-1">Choose or create a knowledge base to manage its sources.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create KB Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Knowledge Base</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Product FAQ" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="What knowledge does this base contain?" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleCreateKb} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Source Dialog */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Source</DialogTitle></DialogHeader>
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="url" className="flex-1 gap-1.5"><Globe className="h-3.5 w-3.5" /> URL</TabsTrigger>
              <TabsTrigger value="file" className="flex-1 gap-1.5"><FileText className="h-3.5 w-3.5" /> File</TabsTrigger>
              <TabsTrigger value="text" className="flex-1 gap-1.5"><Type className="h-3.5 w-3.5" /> Text</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 pt-3">
              <Label>URL</Label>
              <Input placeholder="https://example.com/docs" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </TabsContent>
            <TabsContent value="file" className="space-y-3 pt-3">
              <Label>File (PDF, DOCX, TXT, CSV)</Label>
              <Input
                type="file"
                accept=".pdf,.docx,.txt,.csv"
                onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
              />
            </TabsContent>
            <TabsContent value="text" className="space-y-3 pt-3">
              <Label>Text Content</Label>
              <Textarea placeholder="Paste your content here..." rows={6} value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAddSource} disabled={addingSource}>
              {addingSource ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : "Add & Process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeBasePage;
