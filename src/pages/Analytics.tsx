import { BarChart3, TrendingUp, Clock, PhoneCall } from "lucide-react";

const stats = [
  { label: "Total Calls", value: "1,247", change: "+12%", icon: PhoneCall },
  { label: "Avg Duration", value: "3:42", change: "+5%", icon: Clock },
  { label: "Success Rate", value: "94.2%", change: "+2.1%", icon: TrendingUp },
  { label: "Conversations", value: "892", change: "+18%", icon: BarChart3 },
];

const Analytics = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
      <p className="text-sm text-muted-foreground">Track performance across all your agents and calls.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{stat.value}</p>
          <p className="mt-1 text-xs text-primary">{stat.change} from last month</p>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-medium text-foreground">Call Volume</h3>
      <p className="text-xs text-muted-foreground">Daily call volume over the last 30 days</p>
      <div className="mt-6 flex items-end gap-1 h-40">
        {Array.from({ length: 30 }, (_, i) => {
          const h = 20 + Math.random() * 80;
          return (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary/20 hover:bg-primary/40 transition-colors"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  </div>
);

export default Analytics;
