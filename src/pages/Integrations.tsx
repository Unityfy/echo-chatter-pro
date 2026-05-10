import { Plug, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const staticIntegrations = [
  { name: "Twilio", desc: "Connect your Twilio number to your voice agent.", connected: true },
  { name: "HubSpot", desc: "Sync contacts and deals with your CRM.", connected: false },
  { name: "Google Calendar", desc: "Create events from booking conversations.", connected: false },
  { name: "Slack", desc: "Receive real-time notifications in channels.", connected: true },
  { name: "Zapier", desc: "Connect to 5,000+ apps via automation.", connected: false },
  { name: "Salesforce", desc: "Push call data and leads to Salesforce.", connected: false },
  { name: "Webhooks", desc: "Send call events to custom endpoints.", connected: false },
];

const Integrations = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect your tools and extend your voice agents.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staticIntegrations.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-border bg-card p-5 space-y-3 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-foreground">{item.name}</span>
              </div>
              {item.connected && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Connected
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
            <Button variant="outline" size="sm" className="w-full">
              {item.connected ? "Configure" : "Connect"}
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Integrations;
