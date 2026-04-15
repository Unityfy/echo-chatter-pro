import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Globe, Type, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { DebugChunk } from "@/services/agentService";

interface KnowledgeDebugPanelProps {
  chunks: DebugChunk[];
}

const sourceIcon = (type: string) => {
  switch (type) {
    case "url": return <Globe className="h-3 w-3 text-blue-400" />;
    case "file": return <FileText className="h-3 w-3 text-amber-400" />;
    default: return <Type className="h-3 w-3 text-emerald-400" />;
  }
};

const similarityColor = (score: number) => {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-orange-400";
};

export function KnowledgeDebugPanel({ chunks }: KnowledgeDebugPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (chunks.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-[11px] text-muted-foreground">No knowledge chunks retrieved for this response.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[300px]">
      <div className="p-2 space-y-1.5">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {chunks.length} chunk{chunks.length !== 1 ? "s" : ""} retrieved
          </span>
        </div>

        {chunks.map((chunk, idx) => {
          const isExpanded = expandedIdx === idx;
          const preview = chunk.content.length > 120
            ? chunk.content.slice(0, 120) + "…"
            : chunk.content;

          return (
            <button
              key={idx}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full text-left rounded-md border border-border bg-muted/30 p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {sourceIcon(chunk.sourceType)}
                  <span className="text-[11px] font-medium truncate">{chunk.source}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${similarityColor(chunk.similarity)}`}>
                    {(chunk.similarity * 100).toFixed(0)}%
                  </Badge>
                  {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {isExpanded ? chunk.content : preview}
              </p>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
