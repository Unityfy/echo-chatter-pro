import { useEffect, useState, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Phone, MoreHorizontal, UserPlus, Trash2, ShoppingCart, Search, Loader2, Plug, AlertTriangle } from "lucide-react";
import ExotelConnectDialog from "@/components/exotel/ExotelConnectDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/contexts/AuthContext";
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

interface AgentLite {
  id: string;
  name: string;
}

const db = supabase as any; // phone_numbers not yet in generated types

export default function PhoneNumbers() {
  const { user } = useAuth();
  const { teamId, hasPermission } = useRBAC();
  const canManage = hasPermission("integrations.manage");

  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [buyOpen, setBuyOpen] = useState(false);
  const [exotelConnectOpen, setExotelConnectOpen] = useState(false);
  const [exotelConnected, setExotelConnected] = useState<boolean | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeNumber, setActiveNumber] = useState<PhoneNumber | null>(null);

  const [assignAgentId, setAssignAgentId] = useState<string>("none");

  // Buy flow
  const [buyCountry, setBuyCountry] = useState("IN");
  const [buyType, setBuyType] = useState<"virtual" | "toll_free">("virtual");
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [available, setAvailable] = useState<
    { phone_number: string; type: string; monthly_rental?: string; setup_fee?: string }[]
  >([]);

  const checkExotelStatus = useCallback(async () => {
    const { data } = await supabase.functions.invoke("exotel-connect", {
      body: { action: "status" },
    });
    setExotelConnected(((data as any)?.accounts ?? []).length > 0);
  }, []);

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

  useEffect(() => {
    load();
    checkExotelStatus();
  }, [load, checkExotelStatus]);

  // (resolveTeamId removed — no longer needed since manual connect was removed)

  const handleSearch = async () => {
    setSearching(true);
    setAvailable([]);
    const { data, error } = await supabase.functions.invoke("exotel-numbers", {
      body: { action: "list_available", country: buyCountry, number_type: buyType },
    });
    setSearching(false);
    if (error) return toast.error(error.message);
    const list = (data as any)?.numbers ?? [];
    if (list.length === 0) return toast.info("No numbers available right now");
    setAvailable(list);
  };

  const handlePurchase = async (phone_number: string) => {
    setPurchasing(phone_number);
    const { data, error } = await supabase.functions.invoke("exotel-numbers", {
      body: { action: "purchase", phone_number, number_type: buyType },
    });
    setPurchasing(null);
    if (error) return toast.error(error.message);
    const status = (data as any)?.status;
    toast.success(
      status === "active"
        ? `${phone_number} purchased and active`
        : `${phone_number} reserved — pending Exotel approval`,
    );
    setBuyOpen(false);
    setAvailable([]);
    load();
  };

  // Manual "Connect Existing" flow removed — setup is now handled in Integrations,
  // and numbers come in via Buy or Import from Exotel.

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

  const agentName = (id: string | null) =>
    id ? agents.find((a) => a.id === id)?.name ?? "Unknown" : null;

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
            <Button
              variant="outline"
              onClick={() => setExotelConnectOpen(true)}
              disabled={exotelConnected === false}
              title={exotelConnected === false ? "Connect Exotel in Integrations first" : undefined}
            >
              <Plug className="mr-2 h-4 w-4" />
              Import from Exotel
            </Button>

            <Dialog
              open={buyOpen}
              onOpenChange={(o) => {
                setBuyOpen(o);
                if (!o) setAvailable([]);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Buy Number
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Buy a new number</DialogTitle>
                  <DialogDescription>
                    Search Exotel inventory and purchase a number for your workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Select value={buyCountry} onValueChange={setBuyCountry}>
                        <SelectTrigger id="country">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="IN">🇮🇳 India</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ntype">Number type</Label>
                      <Select
                        value={buyType}
                        onValueChange={(v) => setBuyType(v as "virtual" | "toll_free")}
                      >
                        <SelectTrigger id="ntype">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="virtual">Virtual (Local)</SelectItem>
                          <SelectItem value="toll_free">Toll-Free</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSearch}
                    disabled={searching}
                  >
                    {searching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    Search available numbers
                  </Button>

                  {available.length > 0 && (
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                      {available.map((n) => (
                        <div
                          key={n.phone_number}
                          className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50"
                        >
                          <div>
                            <p className="font-mono text-sm text-foreground">{n.phone_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {n.monthly_rental ?? "—"}/mo
                              {n.setup_fee ? ` · setup ${n.setup_fee}` : ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handlePurchase(n.phone_number)}
                            disabled={purchasing === n.phone_number}
                          >
                            {purchasing === n.phone_number ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Buy"
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Exotel may require KYC/manual approval. Newly purchased numbers may show
                    as <span className="font-medium">pending</span> until activated.
                  </p>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {exotelConnected === false && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Exotel not connected</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              Connect your Exotel account in Integrations to import numbers and place calls.
            </span>
            <Button asChild size="sm" variant="outline">
              <RouterLink to="/integrations">Go to Integrations</RouterLink>
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
                  Buy or connect a number to start handling calls.
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
                        <Badge variant="secondary" className="capitalize">
                          {n.provider}
                        </Badge>
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
                            <DropdownMenuContent align="end" className="w-48 bg-popover">
                              <DropdownMenuItem onClick={() => openAssign(n)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Assign to agent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleStatus(n)}>
                                <Phone className="mr-2 h-4 w-4" />
                                {n.status === "active" ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemove(n)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove number
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

      <ExotelConnectDialog open={exotelConnectOpen} onOpenChange={setExotelConnectOpen} onImported={load} />

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
            <Label htmlFor="agent">Agent</Label>
            <Select value={assignAgentId} onValueChange={setAssignAgentId}>
              <SelectTrigger id="agent">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="none">Unassigned</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No agents available. Create an agent first.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAssign}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
