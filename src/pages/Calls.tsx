import { Phone, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const calls = [
  { id: 1, type: "inbound", number: "+1 (555) 012-3456", agent: "Support Bot", duration: "3:24", status: "Completed", time: "2 min ago" },
  { id: 2, type: "outbound", number: "+1 (555) 987-6543", agent: "Sales Bot", duration: "1:47", status: "Completed", time: "15 min ago" },
  { id: 3, type: "inbound", number: "+1 (555) 456-7890", agent: "Booking Bot", duration: "5:02", status: "Transferred", time: "1 hr ago" },
];

const Calls = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Calls</h1>
      <p className="text-sm text-muted-foreground">Monitor and review all voice interactions.</p>
    </div>

    <div className="rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <span>Contact</span>
        <span>Agent</span>
        <span>Duration</span>
        <span>Status</span>
        <span>Time</span>
      </div>
      {calls.map((call) => (
        <div
          key={call.id}
          className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 items-center border-b border-border/50 px-6 py-4 last:border-0 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            {call.type === "inbound" ? (
              <ArrowDownLeft className="h-4 w-4 text-primary" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm text-foreground">{call.number}</span>
          </div>
          <span className="text-sm text-muted-foreground">{call.agent}</span>
          <span className="text-sm text-foreground">{call.duration}</span>
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {call.status}
          </span>
          <span className="text-xs text-muted-foreground">{call.time}</span>
        </div>
      ))}
    </div>
  </div>
);

export default Calls;
