import { Bot, Phone, TrendingUp, Activity } from "lucide-react";

const stats = [
  { title: "Active Agents", value: "3", desc: "2 deployed, 1 draft", icon: Bot },
  { title: "Total Calls", value: "1,247", desc: "+12% from last week", icon: Phone },
  { title: "Success Rate", value: "94.2%", desc: "+2.1% improvement", icon: TrendingUp },
  { title: "Avg Duration", value: "3:42", desc: "Across all agents", icon: Activity },
];

const recentCalls = [
  { contact: "+1 (555) 012-3456", agent: "Support Bot", duration: "3:24", status: "Completed", time: "2 min ago" },
  { contact: "+1 (555) 987-6543", agent: "Sales Bot", duration: "1:47", status: "Completed", time: "15 min ago" },
  { contact: "+1 (555) 456-7890", agent: "Booking Bot", duration: "5:02", status: "Transferred", time: "1 hr ago" },
];

const Dashboard = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Overview of your AI voice agent platform.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.title} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{stat.title}</span>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{stat.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{stat.desc}</p>
        </div>
      ))}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-medium text-foreground">Recent Calls</h3>
        <div className="mt-4 space-y-3">
          {recentCalls.map((call, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{call.contact}</p>
                <p className="text-xs text-muted-foreground">{call.agent} · {call.duration}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {call.status}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">{call.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-medium text-foreground">Agent Performance</h3>
        <div className="mt-4 space-y-4">
          {[
            { name: "Support Bot", calls: 520, rate: 96 },
            { name: "Sales Bot", calls: 412, rate: 91 },
            { name: "Booking Bot", calls: 315, rate: 94 },
          ].map((agent) => (
            <div key={agent.name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{agent.name}</span>
                <span className="text-muted-foreground">{agent.rate}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${agent.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default Dashboard;
