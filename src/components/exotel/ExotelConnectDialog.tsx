import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExotelAccount {
  id: string;
  account_sid: string;
  subdomain: string;
  status: string;
  last_validated_at: string | null;
  created_at: string;
}

interface ExotelNumber {
  phone_number: string;
  friendly_name: string;
  status: string;
  sid: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

export default function ExotelConnectDialog({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<"connect" | "connected" | "numbers">("connect");
  const [accounts, setAccounts] = useState<ExotelAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Connect form
  const [sid, setSid] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [subdomain, setSubdomain] = useState("api.exotel.com");
  const [connecting, setConnecting] = useState(false);

  // Numbers
  const [numbers, setNumbers] = useState<ExotelNumber[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetchingNumbers, setFetchingNumbers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadStatus();
  }, [open]);

  const loadStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "status" },
    });
    setLoading(false);
    if (error) return;
    const accts = (data as any)?.accounts ?? [];
    setAccounts(accts);
    if (accts.length > 0) {
      setStep("connected");
      setActiveAccountId(accts[0].id);
    } else {
      setStep("connect");
    }
  };

  const handleConnect = async () => {
    if (!sid || !apiKey || !apiToken) return toast.error("All fields are required");
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "connect", account_sid: sid, api_key: apiKey, api_token: apiToken, subdomain },
    });
    setConnecting(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    toast.success("Exotel account connected");
    setSid(""); setApiKey(""); setApiToken("");
    loadStatus();
  };

  const handleFetchNumbers = async () => {
    if (!activeAccountId) return;
    setFetchingNumbers(true);
    setNumbers([]);
    setSelected(new Set());
    const { data, error } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "list_numbers", account_id: activeAccountId },
    });
    setFetchingNumbers(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    const nums = (data as any)?.numbers ?? [];
    if (nums.length === 0) return toast.info("No numbers found in your Exotel account");
    setNumbers(nums);
    setStep("numbers");
  };

  const toggleNumber = (phone: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return toast.error("Select at least one number");
    setImporting(true);
    const toImport = numbers
      .filter((n) => selected.has(n.phone_number))
      .map((n) => ({ phone_number: n.phone_number, sid: n.sid }));
    const { data, error } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "import_numbers", account_id: activeAccountId, numbers: toImport },
    });
    setImporting(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    toast.success(`${selected.size} number(s) imported`);
    onOpenChange(false);
    onImported?.();
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("Disconnect this Exotel account? Imported numbers will remain.")) return;
    const { error } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "disconnect", account_id: accountId },
    });
    if (error) return toast.error(error.message);
    toast.success("Exotel account disconnected");
    loadStatus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "connect" && "Connect Your Exotel Account"}
            {step === "connected" && "Exotel Account"}
            {step === "numbers" && "Select Numbers to Import"}
          </DialogTitle>
          <DialogDescription>
            {step === "connect" && "Enter your Exotel API credentials. They will be encrypted and stored securely."}
            {step === "connected" && "Your Exotel account is connected. Fetch and import numbers."}
            {step === "numbers" && "Choose which numbers to add to your workspace."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === "connect" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account SID</Label>
              <Input placeholder="your_exotel_sid" value={sid} onChange={(e) => setSid(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input placeholder="API key from Exotel dashboard" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>API Token</Label>
              <Input type="password" placeholder="API token" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subdomain</Label>
              <Input placeholder="api.exotel.com" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Credentials are encrypted server-side and never exposed to the browser.
            </p>
          </div>
        ) : step === "connected" ? (
          <div className="space-y-4">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.account_sid}</p>
                    <p className="text-xs text-muted-foreground">{a.subdomain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Connected</Badge>
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(a.id)}>
                    <Unplug className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {numbers.map((n) => (
              <label
                key={n.phone_number}
                className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.has(n.phone_number)}
                  onCheckedChange={() => toggleNumber(n.phone_number)}
                />
                <div className="flex-1">
                  <p className="font-mono text-sm text-foreground">{n.phone_number}</p>
                  {n.friendly_name && (
                    <p className="text-xs text-muted-foreground">{n.friendly_name}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs capitalize">{n.status}</Badge>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {step === "connect" && (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect
            </Button>
          )}
          {step === "connected" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("connect")}>
                <Plug className="mr-2 h-4 w-4" />
                Add Another
              </Button>
              <Button onClick={handleFetchNumbers} disabled={fetchingNumbers}>
                {fetchingNumbers && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Fetch Numbers
              </Button>
            </div>
          )}
          {step === "numbers" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("connected")}>Back</Button>
              <Button onClick={handleImport} disabled={importing || selected.size === 0}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
