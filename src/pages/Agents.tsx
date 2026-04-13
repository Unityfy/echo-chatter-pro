import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const Agents = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">Create and manage your AI voice agents.</p>
      </div>
      <Button>
        <Plus className="h-4 w-4" />
        New Agent
      </Button>
    </div>

    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {["Sales Bot", "Support Bot", "Booking Bot"].map((name) => (
        <div
          key={name}
          className="rounded-xl border border-border bg-card p-6 space-y-3 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">Template</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Pre-configured agent template ready to customize.
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              Draft
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Agents;
