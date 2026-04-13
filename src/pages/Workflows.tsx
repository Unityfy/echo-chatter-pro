import { Workflow, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const Workflows = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
        <p className="text-sm text-muted-foreground">Automate actions triggered by call events and intents.</p>
      </div>
      <Button>
        <Plus className="h-4 w-4" />
        New Workflow
      </Button>
    </div>

    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Workflow className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-foreground">No workflows yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Create your first automation to get started.</p>
      <Button className="mt-6" size="sm">
        <Plus className="h-4 w-4" />
        Create Workflow
      </Button>
    </div>
  </div>
);

export default Workflows;
