import { Phone, PhoneCall, TrendingUp, Clock, Activity, Bot, AlertTriangle, CheckCircle, Info, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, AreaChart, Area } from "recharts";

// --- Placeholder Data ---

const kpiCards = [
  { title: "Active Calls", value: "7", change: "+3", trend: "up" as const, icon: PhoneCall, sparkData: [3, 5, 4, 7, 6, 8, 7] },
  { title: "Calls Today", value: "284", change: "+18%", trend: "up" as const, icon: Phone, sparkData: [120, 180, 210, 195, 240, 260, 284] },
  { title: "Success Rate", value: "94.2%", change: "+2.1%", trend: "up" as const, icon: TrendingUp, sparkData: [88, 90, 91, 92, 93, 93, 94] },
  { title: "Avg Duration", value: "3:42", change: "-12s", trend: "down" as const, icon: Clock, sparkData: [4.2, 4.0, 3.9, 3.8, 3.7, 3.7, 3.7] },
];

const liveActivity = [
  { id: 1, type: "call_started", agent: "Support Bot", contact: "+1 (555) 012-3456", time: "Just now", status: "active" },
  { id: 2, type: "call_ended", agent: "Sales Bot", contact: "+1 (555) 987-6543", time: "2 min ago", status: "completed" },
  { id: 3, type: "transfer", agent: "Booking Bot", contact: "+1 (555) 456-7890", time: "5 min ago", status: "transferred" },
  { id: 4, type: "call_ended", agent: "Support Bot", contact: "+1 (555) 321-0987", time: "8 min ago", status: "completed" },
  { id: 5, type: "call_started", agent: "Sales Bot", contact: "+1 (555) 654-3210", time: "12 min ago", status: "active" },
  { id: 6, type: "voicemail", agent: "Support Bot", contact: "+1 (555) 111-2233", time: "15 min ago", status: "voicemail" },
];

const agentPerformance = [
  { name: "Support Bot", calls: 520, successRate: 96, avgDuration: "3:12", status: "active" },
  { name: "Sales Bot", calls: 412, successRate: 91, avgDuration: "4:05", status: "active" },
  { name: "Booking Bot", calls: 315, successRate: 94, avgDuration: "2:48", status: "active" },
  { name: "Follow-up Bot", calls: 187, successRate: 89, avgDuration: "1:55", status: "paused" },
];

const recentCalls = [
  { contact: "+1 (555) 012-3456", agent: "Support Bot", duration: "3:24", status: "Completed", sentiment: "Positive", time: "2 min ago" },
  { contact: "+1 (555) 987-6543", agent: "Sales Bot", duration: "1:47", status: "Completed", sentiment: "Neutral", time: "15 min ago" },
  { contact: "+1 (555) 456-7890", agent: "Booking Bot", duration: "5:02", status: "Transferred", sentiment: "Positive", time: "1 hr ago" },
  { contact: "+1 (555) 321-0987", agent: "Support Bot", duration: "2:15", status: "Completed", sentiment: "Negative", time: "1.5 hr ago" },
  { contact: "+1 (555) 654-3210", agent: "Sales Bot", duration: "0:42", status: "Dropped", sentiment: "Neutral", time: "2 hr ago" },
];

const alerts = [
  { id: 1, type: "warning" as const, message: "Sales Bot success rate dropped below 90%", time: "10 min ago" },
  { id: 2, type: "info" as const, message: "Booking Bot handled 50 calls milestone today", time: "1 hr ago" },
  { id: 3, type: "success" as const, message: "Support Bot updated to prompt v2.4", time: "3 hr ago" },
  { id: 4, type: "warning" as const, message: "High call volume detected — consider scaling", time: "4 hr ago" },
];

const dailyCallVolume = [
  { day: "Mon", calls: 180, success: 168 },
  { day: "Tue", calls: 220, success: 204 },
  { day: "Wed", calls: 195, success: 182 },
  { day: "Thu", calls: 260, success: 248 },
  { day: "Fri", calls: 240, success: 221 },
  { day: "Sat", calls: 140, success: 132 },
  { day: "Sun", calls: 110, success: 104 },
];

const chartConfig = {
  calls: { label: "Total Calls", color: "hsl(var(--primary))" },
  success: { label: "Successful", color: "hsl(var(--success))" },
};

// --- Status helpers ---

const statusColor: Record<string, string> = {
  active: "bg-success/15 text-success border-success/20",
  completed: "bg-muted text-muted-foreground border-border",
  transferred: "bg-info/15 text-info border-info/20",
  voicemail: "bg-warning/15 text-warning border-warning/20",
  Completed: "bg-muted text-muted-foreground border-border",
  Transferred: "bg-info/15 text-info border-info/20",
  Dropped: "bg-destructive/15 text-destructive border-destructive/20",
  paused: "bg-warning/15 text-warning border-warning/20",
};

const sentimentColor: Record<string, string> = {
  Positive: "text-success",
  Neutral: "text-muted-foreground",
  Negative: "text-destructive",
};

const alertIcon: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  info: <Info className="h-4 w-4 text-info" />,
  success: <CheckCircle className="h-4 w-4 text-success" />,
};

// --- Component ---

const Dashboard = () => (
  <div className="space-y-6">
    {/* Page Header */}
    <div>
      <h1 className="text-page-title">Dashboard</h1>
      <p className="text-helper mt-1">Real-time overview of your AI voice agent platform.</p>
    </div>

    {/* KPI Cards */}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpiCards.map((kpi) => (
        <Card key={kpi.title} className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-helper">{kpi.title}</span>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground tracking-tight">{kpi.value}</p>
                <div className="mt-1 flex items-center gap-1">
                  {kpi.trend === "up" ? (
                    <ArrowUpRight className="h-3 w-3 text-success" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-success" />
                  )}
                  <span className="text-xs text-success">{kpi.change}</span>
                </div>
              </div>
              {/* Mini sparkline */}
              <div className="h-10 w-20 opacity-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.sparkData.map((v, i) => ({ v, i }))}>
                    <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Main Grid: Chart + Alerts */}
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Call Volume Chart */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-card-title">Weekly Call Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={dailyCallVolume} barGap={4}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} width={35} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="calls" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="success" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Alerts Panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-card-title">Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="mt-0.5 shrink-0">{alertIcon[alert.type]}</div>
              <div className="min-w-0">
                <p className="text-sm text-foreground leading-snug">{alert.message}</p>
                <p className="text-helper mt-0.5">{alert.time}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>

    {/* Middle Grid: Live Feed + Agent Performance */}
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Live Activity Feed */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-card-title">Live Activity</CardTitle>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {liveActivity.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{item.agent}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="text-muted-foreground">{item.contact}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor[item.status] || ""}`}>
                  {item.status}
                </Badge>
                <span className="text-helper whitespace-nowrap">{item.time}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Agent Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-card-title">Agent Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agentPerformance.map((agent) => (
            <div key={agent.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{agent.name}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor[agent.status] || ""}`}>
                    {agent.status}
                  </Badge>
                </div>
                <span className="text-helper">{agent.calls} calls · {agent.avgDuration} avg</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${agent.successRate}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground w-10 text-right">{agent.successRate}%</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>

    {/* Recent Calls Table */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-card-title">Recent Calls</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentCalls.map((call, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-foreground">{call.contact}</TableCell>
                <TableCell className="text-muted-foreground">{call.agent}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{call.duration}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor[call.status] || ""}`}>
                    {call.status}
                  </Badge>
                </TableCell>
                <TableCell className={sentimentColor[call.sentiment] || ""}>{call.sentiment}</TableCell>
                <TableCell className="text-right text-muted-foreground">{call.time}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

export default Dashboard;
