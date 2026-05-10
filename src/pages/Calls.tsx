import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Phone, Activity, Mic, Volume2, Zap, Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamId } from "@/hooks/useTeamId";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type CallRow = {
  id: string;
  from_number: string | null;
  to_number: string | null;
  agent_id: string | null;
  direction: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, any> | null;
};

type MessageRow = {
  id: string;
  call_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  latency_ms: number | null;
  created_at: string;
  metadata: Record<string, any> | null;
};

type AgentLite = { id: string; name: string };

const ACTIVE_STATUSES = new Set(["in-progress", "ringing", "answered"]);

function fmtDuration(secs: number | null) {
  if (!secs && secs !== 0) return "–";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (ACTIVE_STATUSES.has(status)) return "default";
  if (status === "completed") return "secondary";
  if (status === "fallback" || status === "no-agent" || status === "failed") return "destructive";
  return "outline";
}

const Calls = () => {
  const { teamId, loading: teamLoading } = useTeamId();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial load + realtime subscription on calls
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: callsData }, { data: agentsData }] = await Promise.all([
        supabase
          .from("calls")
          .select("id, from_number, to_number, agent_id, direction, status, started_at, ended_at, duration_seconds, metadata")
          .eq("team_id", teamId)
          .order("started_at", { ascending: false })
          .limit(50),
        supabase.from("agents").select("id, name").eq("team_id", teamId),
      ]);
      if (cancelled) return;
      setCalls((callsData ?? []) as CallRow[]);
      setAgents(Object.fromEntries(((agentsData ?? []) as AgentLite[]).map((a) => [a.id, a.name])));
      // Auto-select the first active call, else most recent
      const first = (callsData ?? []).find((c: any) => ACTIVE_STATUSES.has(c.status)) ?? (callsData ?? [])[0];
      if (first) setSelectedId(first.id);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`calls-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `team_id=eq.${teamId}` },
        (payload) => {
          setCalls((prev) => {
            if (payload.eventType === "INSERT") return [payload.new as CallRow, ...prev].slice(0, 50);
            if (payload.eventType === "UPDATE")
              return prev.map((c) => (c.id === (payload.new as CallRow).id ? (payload.new as CallRow) : c));
            if (payload.eventType === "DELETE")
              return prev.filter((c) => c.id !== (payload.old as CallRow).id);
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  // Load + subscribe to messages for selected call
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("call_messages")
        .select("*")
        .eq("call_id", selectedId)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((data ?? []) as MessageRow[]);
    })();

    const channel = supabase
      .channel(`call-messages-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_messages", filter: `call_id=eq.${selectedId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as MessageRow]),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  const selectedCall = useMemo(() => calls.find((c) => c.id === selectedId) ?? null, [calls, selectedId]);
  const isLive = selectedCall ? ACTIVE_STATUSES.has(selectedCall.status) : false;

  // Live metrics derived from messages + call metadata
  const lastMsg = messages[messages.length - 1];
  const speaking: "user" | "agent" | "idle" = !isLive
    ? "idle"
    : !lastMsg
    ? "idle"
    : lastMsg.role === "user"
    ? "agent" // user just spoke → agent is responding
    : "user"; // agent just replied → waiting for user
  const lastLatency = [...messages].reverse().find((m) => m.role === "assistant" && m.latency_ms)?.latency_ms ?? null;
  const totalTokens = messages.reduce((acc, m) => {
    const u = m.metadata?.usage;
    return acc + (u?.total_tokens ?? 0);
  }, 0);
  const callMetrics = selectedCall?.metadata?.metrics ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calls</h1>
        <p className="text-sm text-muted-foreground">Live monitor and history of all voice interactions.</p>
      </div>

      {teamLoading || loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : calls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">No calls yet</p>
          <p className="text-xs text-muted-foreground">Connect a phone number and assign an agent to start receiving calls.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* Call list */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent</span>
              <span className="text-[10px] text-muted-foreground">{calls.length}</span>
            </div>
            <ScrollArea className="h-[600px]">
              {calls.map((c) => {
                const live = ACTIVE_STATUSES.has(c.status);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors",
                      selectedId === c.id && "bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {c.direction === "inbound" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-foreground truncate flex-1">
                        {c.from_number || "Unknown"}
                      </span>
                      {live && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{agents[c.agent_id ?? ""] ?? "—"}</span>
                      <span>{formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}</span>
                    </div>
                  </button>
                );
              })}
            </ScrollArea>
          </div>

          {/* Detail panel */}
          <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
            {!selectedCall ? (
              <div className="p-12 text-center text-sm text-muted-foreground">Select a call to inspect</div>
            ) : (
              <>
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">
                          {selectedCall.from_number || "Unknown"} → {selectedCall.to_number || "—"}
                        </h2>
                        <Badge variant={statusVariant(selectedCall.status)} className="text-[10px]">
                          {selectedCall.status}
                        </Badge>
                        {isLive && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                            LIVE
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {agents[selectedCall.agent_id ?? ""] ?? "No agent"} ·{" "}
                        {formatDistanceToNow(new Date(selectedCall.started_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  {/* Live metrics row */}
                  <div className="grid grid-cols-4 gap-2">
                    <MetricChip
                      icon={speaking === "user" ? Mic : speaking === "agent" ? Volume2 : Activity}
                      label="Speaker"
                      value={isLive ? (speaking === "user" ? "User" : speaking === "agent" ? "Agent" : "Idle") : "—"}
                      pulse={isLive}
                    />
                    <MetricChip
                      icon={Zap}
                      label="Latency"
                      value={
                        lastLatency != null
                          ? `${lastLatency}ms`
                          : callMetrics?.avg_latency_ms
                          ? `${callMetrics.avg_latency_ms}ms avg`
                          : "—"
                      }
                    />
                    <MetricChip
                      icon={Coins}
                      label="Tokens"
                      value={
                        totalTokens
                          ? totalTokens.toLocaleString()
                          : callMetrics
                          ? `${(callMetrics.prompt_tokens ?? 0) + (callMetrics.completion_tokens ?? 0)}`
                          : "—"
                      }
                    />
                    <MetricChip
                      icon={Phone}
                      label="Duration"
                      value={
                        selectedCall.duration_seconds != null
                          ? fmtDuration(selectedCall.duration_seconds)
                          : isLive
                          ? fmtDuration(Math.floor((Date.now() - new Date(selectedCall.started_at).getTime()) / 1000))
                          : "—"
                      }
                    />
                  </div>
                </div>

                {/* Transcript */}
                <ScrollArea className="flex-1 max-h-[500px]">
                  <div className="p-5 space-y-3">
                    {messages.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        {isLive ? "Waiting for transcript…" : "No transcript captured."}
                      </p>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "flex flex-col gap-1",
                            m.role === "user" ? "items-start" : "items-end",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                              m.role === "user"
                                ? "bg-muted text-foreground"
                                : "bg-primary text-primary-foreground",
                            )}
                          >
                            {m.content}
                            {m.metadata?.interrupted && (
                              <span className="ml-1 text-[10px] opacity-70">[interrupted]</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                            <span>{m.role === "user" ? "Caller" : "Agent"}</span>
                            {m.latency_ms != null && (
                              <span className="flex items-center gap-0.5">
                                <Zap className="h-2.5 w-2.5" />
                                {m.latency_ms}ms
                              </span>
                            )}
                            {m.metadata?.usage?.total_tokens && (
                              <span className="flex items-center gap-0.5">
                                <Coins className="h-2.5 w-2.5" />
                                {m.metadata.usage.total_tokens}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {isLive && speaking !== "idle" && (
                      <div className={cn("flex", speaking === "agent" ? "justify-end" : "justify-start")}>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-muted/40">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {speaking === "agent" ? "Agent thinking…" : "Listening…"}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function MetricChip({
  icon: Icon,
  label,
  value,
  pulse,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        <Icon className={cn("h-2.5 w-2.5", pulse && "animate-pulse")} />
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground tabular-nums truncate">{value}</div>
    </div>
  );
}

export default Calls;
