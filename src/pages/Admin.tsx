import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamId } from "@/hooks/useTeamId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect as _useDocTitle } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  DollarSign,
  PhoneCall,
  RefreshCw,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

type Health = {
  provider: string;
  status: "ok" | "degraded" | "down" | "unknown";
  latency_ms: number | null;
  last_checked_at: string;
};

type Limits = {
  monthly_minutes_cap: number;
  monthly_tokens_cap: number;
  monthly_cost_cap_usd: number;
  plan: string;
};

type UsageAgg = {
  minutes: number;
  tokens: number;
  stt_seconds: number;
  tts_characters: number;
  cost_usd: number;
};

type SystemEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
};

const StatusBadge = ({ status }: { status: Health["status"] }) => {
  const map: Record<Health["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    ok: { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", Icon: CheckCircle2 },
    degraded: { label: "Degraded", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30", Icon: AlertCircle },
    down: { label: "Down", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
    unknown: { label: "Unknown", cls: "bg-muted text-muted-foreground border-border", Icon: CircleDashed },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      <Icon className="mr-1 h-3 w-3" /> {label}
    </Badge>
  );
};

export default function Admin() {
  const { teamId, loading: teamLoading } = useTeamId();
  const [usage, setUsage] = useState<UsageAgg | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [callStats, setCallStats] = useState<{ total: number; failed: number; active: number }>({
    total: 0,
    failed: 0,
    active: 0,
  });
  const [memberCount, setMemberCount] = useState(0);
  const [health, setHealth] = useState<Health[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  const load = async () => {
    if (!teamId) return;
    setLoading(true);
    const [usageRes, limitsRes, callsRes, membersRes, healthRes, eventsRes] = await Promise.all([
      supabase.rpc("team_usage_this_month", { _team_id: teamId }),
      supabase.from("plan_limits").select("plan,monthly_minutes_cap,monthly_tokens_cap,monthly_cost_cap_usd").eq("team_id", teamId).maybeSingle(),
      supabase.from("calls").select("status", { count: "exact" }).eq("team_id", teamId).gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
      supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId),
      supabase.from("provider_health").select("provider,status,latency_ms,last_checked_at"),
      supabase.from("system_events").select("id,level,source,message,created_at").or(`team_id.eq.${teamId},team_id.is.null`).order("created_at", { ascending: false }).limit(20),
    ]);
    const u = (usageRes.data as unknown as UsageAgg[] | null)?.[0] ?? null;
    setUsage(u ?? { minutes: 0, tokens: 0, stt_seconds: 0, tts_characters: 0, cost_usd: 0 });
    setLimits((limitsRes.data as Limits | null) ?? null);
    const callRows = (callsRes.data as { status: string }[] | null) ?? [];
    setCallStats({
      total: callsRes.count ?? callRows.length,
      failed: callRows.filter((c) => ["failed", "no-answer", "busy", "canceled"].includes(c.status)).length,
      active: callRows.filter((c) => ["ringing", "in-progress", "answered"].includes(c.status)).length,
    });
    setMemberCount(membersRes.count ?? 0);
    setHealth((healthRes.data as Health[] | null) ?? []);
    setEvents((eventsRes.data as SystemEvent[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (teamId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const runProbe = async () => {
    setProbing(true);
    const { error } = await supabase.functions.invoke("provider-health-check");
    setProbing(false);
    if (error) {
      toast({ title: "Probe failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Provider probe complete" });
      load();
    }
  };

  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  const minutesCap = limits?.monthly_minutes_cap ?? 60;
  const tokensCap = limits?.monthly_tokens_cap ?? 200_000;
  const costCap = limits?.monthly_cost_cap_usd ?? 5;

  const overLimit = useMemo(() => {
    if (!usage || !limits) return false;
    return usage.minutes >= minutesCap || usage.tokens >= tokensCap || usage.cost_usd >= costCap;
  }, [usage, limits, minutesCap, tokensCap, costCap]);

  if (teamLoading || (loading && !usage)) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Operations, usage, and provider health.</p>
        </div>
        <Button onClick={runProbe} disabled={probing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${probing ? "animate-spin" : ""}`} />
          Probe providers
        </Button>
      </header>

      {overLimit && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Workspace has reached or exceeded a monthly cap. New calls may be soft-blocked until limits reset or are increased.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={PhoneCall} label="Calls (30d)" value={callStats.total.toLocaleString()} sub={`${callStats.failed} failed · ${callStats.active} active`} />
        <MetricCard icon={Users} label="Active members" value={memberCount.toLocaleString()} sub="In this workspace" />
        <MetricCard icon={Zap} label="Tokens (mo)" value={usage ? usage.tokens.toLocaleString() : "—"} sub={`Cap ${tokensCap.toLocaleString()}`} />
        <MetricCard icon={DollarSign} label="Spend (mo)" value={`$${(usage?.cost_usd ?? 0).toFixed(2)}`} sub={`Cap $${costCap.toFixed(2)}`} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Usage this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar label="Minutes" value={usage?.minutes ?? 0} cap={minutesCap} suffix="min" />
            <UsageBar label="Tokens" value={usage?.tokens ?? 0} cap={tokensCap} />
            <UsageBar label="Cost" value={Number((usage?.cost_usd ?? 0).toFixed(2))} cap={costCap} prefix="$" />
            <div className="grid grid-cols-2 gap-4 pt-2 text-sm text-muted-foreground">
              <div>STT seconds: <span className="text-foreground">{Math.round(usage?.stt_seconds ?? 0).toLocaleString()}</span></div>
              <div>TTS characters: <span className="text-foreground">{(usage?.tts_characters ?? 0).toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Provider health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {health.length === 0 ? (
              <p className="text-sm text-muted-foreground">No probes yet. Click "Probe providers".</p>
            ) : (
              health.map((h) => (
                <div key={h.provider} className="flex items-center justify-between text-sm">
                  <div className="capitalize">{h.provider.replace("_", " ")}</div>
                  <div className="flex items-center gap-2">
                    {h.latency_ms != null && <span className="text-xs text-muted-foreground">{h.latency_ms}ms</span>}
                    <StatusBadge status={h.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent system events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        e.level === "error" ? "border-destructive/30 text-destructive" :
                        e.level === "warn" ? "border-amber-500/30 text-amber-500" :
                        "border-border text-muted-foreground"
                      }>{e.level}</Badge>
                      <span className="text-muted-foreground">{e.source}</span>
                    </div>
                    <p className="mt-1 truncate text-foreground">{e.message}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function UsageBar({
  label,
  value,
  cap,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  cap: number;
  prefix?: string;
  suffix?: string;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {prefix}{value.toLocaleString()}{suffix && ` ${suffix}`} <span className="text-muted-foreground">/ {prefix}{cap.toLocaleString()}{suffix && ` ${suffix}`}</span>
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
