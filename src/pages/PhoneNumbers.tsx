import { useEffect, useState, useCallback } from "react";
import { Phone, MoreHorizontal, UserPlus, Trash2, Plus, Download, ShoppingCart, PhoneCall, RefreshCw, CheckCircle2, AlertCircle, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRBAC } from "@/hooks/useRBAC";
import { toast } from "sonner";

interface PhoneNumber {
  id: string;
  phone_number: string;
  provider: string;
  provider_number_id: string | null;
  status: string;
  agent_id: string | null;
  team_id: string;
  created_at: string;
}

interface AgentLite { id: string; name: string; }
interface TwilioNum { sid: string; phone_number: string; friendly_name: string; voice_url: string; status_callback: string; }
interface AvailableNum { phone_number: string; friendly_name: string; locality?: string; region?: string; }

interface Health {
  ok: boolean;
  configured: boolean;
  signature_validation?: boolean;
  webhook_url?: string;
  error?: string | null;
}

const db = supabase as any;

function normalizeE164(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

async function callTwilioMgmt(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("twilio-management", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function PhoneNumbers() {
  const { teamId, hasPermission } = useRBAC();
  const canManage = hasPermission("integrations.manage");

  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNum[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newAgent, setNewAgent] = useState<string>("none");
  const [adding, setAdding] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [activeNumber, setActiveNumber] = useState<PhoneNumber | null>(null);
  const [assignAgentId, setAssignAgentId] = useState<string>("none");

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSel, setImportSel] = useState<Set<string>>(new Set());

  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCountry, setBuyCountry] = useState("US");
  const [buyAreaCode, setBuyAreaCode] = useState("");
  const [buyResults, setBuyResults] = useState<AvailableNum[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [testOpen, setTestOpen] = useState(false);
  const [testFrom, setTestFrom] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: nums }, { data: ag }] = await Promise.all([
      db.from("phone_numbers").select("*").order("created_at", { ascending: false }),
      supabase.from("agents").select("id, name").order("name"),
    ]);
    setNumbers((nums as PhoneNumber[]) ?? []);
    setAgents((ag as AgentLite[]) ?? []);
    setLoading(false);
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await callTwilioMgmt("health");
      setHealth(h);
    } catch (e: any) {
      setHealth({ ok: false, configured: false, error: e.message });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadHealth(); }, [load, loadHealth]);

  const handleAdd = async () => {
    if (!teamId) return toast.error("No active workspace");
    const phone = normalizeE164(newNumber);
    if (!phone) return toast.error("Enter a phone number");
    setAdding(true);
    const assignment = newAgent === "none" ? null : newAgent;
    const { data: existing, error: lookupError } = await db
      .from("phone_numbers")
      .select("id")
      .eq("provider", "twilio")
      .eq("phone_number", phone)
      .maybeSingle();

    const { error } = lookupError
      ? { error: lookupError }
      : existing?.id
        ? await db.from("phone_numbers").update({ status: "active", agent_id: assignment }).eq("id", existing.id)
        : await db.from("phone_numbers").insert({
            team_id: teamId,
            phone_number: phone,
            provider: "twilio",
            status: "active",
            agent_id: assignment,
          });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(existing?.id ? "Number updated" : "Number added");
    setAddOpen(false);
    setNewNumber("");
    setNewAgent("none");
    load();
  };

  const handleAssign = async () => {
    if (!activeNumber) return;
    const { error } = await db
      .from("phone_numbers")
      .update({ agent_id: assignAgentId === "none" ? null : assignAgentId })
      .eq("id", activeNumber.id);
    if (error) return toast.error(error.message);
    toast.success("Agent assignment updated");
    setAssignOpen(false);
    setActiveNumber(null);
    load();
  };

  const handleToggleStatus = async (n: PhoneNumber) => {
    const newStatus = n.status === "active" ? "inactive" : "active";
    const { error } = await db.from("phone_numbers").update({ status: newStatus }).eq("id", n.id);
    if (error) return toast.error(error.message);
    toast.success(`Number ${newStatus}`);
    load();
  };

  const handleRemove = async (n: PhoneNumber) => {
    if (!confirm(`Remove ${n.phone_number}?`)) return;
    const { error } = await db.from("phone_numbers").delete().eq("id", n.id);
    if (error) return toast.error(error.message);
    toast.success("Number removed");
    load();
  };

  const openAssign = (n: PhoneNumber) => {
    setActiveNumber(n);
    setAssignAgentId(n.agent_id ?? "none");
    setAssignOpen(true);
  };

  const openImport = async () => {
    setImportOpen(true);
    setImportLoading(true);
    setImportSel(new Set());
    try {
      const data = await callTwilioMgmt("list-twilio-numbers");
      setTwilioNumbers(data.numbers || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportLoading(false);
    }
  };

  const doImport = async () => {
    if (!teamId) return toast.error("No workspace");
    setImportLoading(true);
    try {
      const sids = Array.from(importSel);
      const r = await callTwilioMgmt("import-numbers", { team_id: teamId, sids: sids.length ? sids : undefined });
      toast.success(`Imported ${r.imported}, skipped ${r.skipped}`);
      setImportOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setImportLoading(false); }
  };

  const doSearch = async () => {
    setSearching(true);
    try {
      const r = await callTwilioMgmt("search-available", { country: buyCountry, area_code: buyAreaCode || undefined });
      setBuyResults(r.numbers || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setSearching(false); }
  };

  const doBuy = async (num: AvailableNum) => {
    if (!teamId) return;
    setBuying(num.phone_number);
    try {
      await callTwilioMgmt("purchase-number", { team_id: teamId, phone_number: num.phone_number });
      toast.success(`Purchased ${num.phone_number}`);
      setBuyOpen(false);
      setBuyResults([]);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBuying(null); }
  };

  const configureWebhook = async (n: PhoneNumber) => {
    if (!n.provider_number_id) return toast.error("Number has no Twilio SID — re-import from Twilio.");
    try {
      await callTwilioMgmt("configure-webhook", { sid: n.provider_number_id });
      toast.success("Webhook configured on Twilio");
    } catch (e: any) { toast.error(e.message); }
  };

  const openTest = (n: PhoneNumber) => {
    setTestFrom(n.phone_number);
    setTestTo("");
    setTestOpen(true);
  };

  const doTest = async () => {
    if (!teamId || !testFrom || !testTo) return;
    setTesting(true);
    try {
      const r = await callTwilioMgmt("test-call", { team_id: teamId, from: testFrom, to: testTo });
      toast.success(`Test call placed (sid: ${r.call_sid})`);
      setTestOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setTesting(false); }
  };

  const agentName = (id: string | null) =>
    id ? agents.find((a) => a.id === id)?.name ?? "Unknown" : null;

  const webhookConfigured = (tw: TwilioNum) =>
    tw.voice_url?.includes("telephony-incoming-call");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Phone Numbers</h1>
          <p className="text-sm text-muted-foreground">
            Manage telephony numbers and assign them to your AI voice agents.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openImport}>
              <Download className="mr-2 h-4 w-4" /> Import from Twilio
            </Button>
            <Button variant="outline" onClick={() => setBuyOpen(true)}>
              <ShoppingCart className="mr-2 h-4 w-4" /> Buy Number
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Number
            </Button>
          </div>
        )}
      </div>

      {/* Health card */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            {healthLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : health?.ok ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                Twilio: {healthLoading ? "Checking…" : health?.ok ? "Connected" : (health?.configured ? "Error" : "Not connected")}
              </p>
              <p className="text-xs text-muted-foreground">
                {health?.error || (health?.signature_validation
                  ? "Signature validation enabled"
                  : "Add TWILIO_AUTH_TOKEN secret to enable signature validation")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {health?.webhook_url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(health.webhook_url!); toast.success("Webhook URL copied"); }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Copy webhook URL
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={loadHealth} disabled={healthLoading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Recheck
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All numbers</CardTitle>
          <CardDescription>
            {numbers.length} {numbers.length === 1 ? "number" : "numbers"} in this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : numbers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Phone className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">No phone numbers yet</p>
                <p className="text-sm text-muted-foreground">
                  Import from Twilio or buy a new number to start handling calls.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n) => {
                  const assigned = agentName(n.agent_id);
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-sm">{n.phone_number}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{n.provider}</Badge>
                      </TableCell>
                      <TableCell>
                        {assigned ? (
                          <span className="text-sm text-foreground">{assigned}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={n.status === "active" ? "success" : "outline"}>
                          <span
                            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                              n.status === "active" ? "bg-success-foreground" : "bg-muted-foreground"
                            }`}
                          />
                          {n.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-popover">
                              <DropdownMenuItem onClick={() => openAssign(n)}>
                                <UserPlus className="mr-2 h-4 w-4" /> Assign to agent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(n)}>
                                <Phone className="mr-2 h-4 w-4" />
                                {n.status === "active" ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTest(n)}>
                                <PhoneCall className="mr-2 h-4 w-4" /> Place test call
                              </DropdownMenuItem>
                              {n.provider === "twilio" && n.provider_number_id && (
                                <DropdownMenuItem onClick={() => configureWebhook(n)}>
                                  <RefreshCw className="mr-2 h-4 w-4" /> Re-configure webhook
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemove(n)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Remove number
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add manual */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add phone number</DialogTitle>
            <DialogDescription>
              Register a Twilio number manually. Configure the Twilio voice webhook to point at your{" "}
              <span className="font-mono">telephony-incoming-call</span> function.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="num">Phone number (E.164)</Label>
              <Input id="num" placeholder="+16623663791" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent">Assign to agent</Label>
              <Select value={newAgent} onValueChange={setNewAgent}>
                <SelectTrigger id="agent"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAdd} disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign agent</DialogTitle>
            <DialogDescription>
              Choose which agent should handle calls to{" "}
              <span className="font-mono">{activeNumber?.phone_number}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent2">Agent</Label>
            <Select value={assignAgentId} onValueChange={setAssignAgentId}>
              <SelectTrigger id="agent2"><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="none">Unassigned</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground">No agents available. Create an agent first.</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAssign}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Twilio */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import numbers from Twilio</DialogTitle>
            <DialogDescription>
              Select numbers from your Twilio account to import into this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            {importLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : twilioNumbers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No numbers found on this Twilio account.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Number</TableHead>
                    <TableHead>Friendly name</TableHead>
                    <TableHead>Webhook</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {twilioNumbers.map((n) => (
                    <TableRow key={n.sid}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={importSel.has(n.sid)}
                          onChange={(e) => {
                            const s = new Set(importSel);
                            e.target.checked ? s.add(n.sid) : s.delete(n.sid);
                            setImportSel(s);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{n.phone_number}</TableCell>
                      <TableCell className="text-sm">{n.friendly_name}</TableCell>
                      <TableCell>
                        {webhookConfigured(n) ? (
                          <Badge variant="success">Configured</Badge>
                        ) : (
                          <Badge variant="outline">Not set</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={doImport} disabled={importLoading || twilioNumbers.length === 0}>
              {importSel.size > 0 ? `Import ${importSel.size} selected` : "Import all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy number */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buy a phone number</DialogTitle>
            <DialogDescription>
              Search Twilio's inventory and purchase a number. Webhooks are auto-configured to your agent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 items-end">
            <div className="space-y-1.5 w-32">
              <Label htmlFor="country">Country</Label>
              <Input id="country" maxLength={2} value={buyCountry} onChange={(e) => setBuyCountry(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="ac">Area code (optional)</Label>
              <Input id="ac" placeholder="415" value={buyAreaCode} onChange={(e) => setBuyAreaCode(e.target.value)} />
            </div>
            <Button onClick={doSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          <div className="max-h-80 overflow-auto mt-2">
            {buyResults.length === 0 && !searching ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Search for available numbers above.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyResults.map((n) => (
                    <TableRow key={n.phone_number}>
                      <TableCell className="font-mono text-sm">{n.phone_number}</TableCell>
                      <TableCell className="text-sm">{[n.locality, n.region].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" disabled={!!buying} onClick={() => doBuy(n)}>
                          {buying === n.phone_number ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buy"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Test call */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place a test call</DialogTitle>
            <DialogDescription>
              Twilio will dial the destination from the selected number. The agent assigned to that number will answer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="from">From (your Twilio number)</Label>
              <Input id="from" value={testFrom} onChange={(e) => setTestFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To (E.164)</Label>
              <Input id="to" placeholder="+15558675309" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={doTest} disabled={testing || !testTo}>
              {testing ? "Calling…" : "Place call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
