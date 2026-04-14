import { useState } from "react";
import { BookOpen, Upload, FileText, Search, Globe, Plus, Link, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KnowledgeBase = () => {
  const [webUrl, setWebUrl] = useState("");
  const [webPages, setWebPages] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Upload and manage documents to give your agents business context.
          </p>
        </div>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search documents..." className="pl-9" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Upload Documents */}
        <Card className="border-dashed border-2 flex items-center justify-center min-h-[200px] cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Drop files here or click to upload</span>
            <span className="text-xs">PDF, DOCX, TXT, CSV</span>
          </CardContent>
        </Card>

        {/* Add Web Pages */}
        <Card className="min-h-[200px]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              Add Web Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add website URLs to scrape and index content for your agents.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Button size="sm" className="gap-1.5 shrink-0" disabled={!webUrl.trim()}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {webPages.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No web pages added yet.</p>
              ) : (
                webPages.map((page, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground">{page}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Upload your business documents — FAQs, product guides, SOPs, etc.</p>
          <p>2. Documents are indexed and made searchable for your AI agents.</p>
          <p>3. Agents use RAG-style context injection to provide accurate, grounded responses.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeBase;
