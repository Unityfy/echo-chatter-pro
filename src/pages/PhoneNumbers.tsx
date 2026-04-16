import { useEffect, useState, useCallback } from "react";
import { Phone, Plus, MoreHorizontal, Link as LinkIcon, UserPlus, Trash2, ShoppingCart } from "lucide-react";
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeNumber, setActiveNumber] = useState<PhoneNumber | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [providerIdInput, setProviderIdInput] = useState("");
  const [assignAgentId, setAssignAgentId] = useState<string>("none");

  // Buy flow
  const [buyCountry, setBuyCountry] = useState("IN");
  const [buyType, setBuyType] = useState<"virtual" | "toll_free">("virtual");
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [available, setAvailable] = useState<
    { phone_number: string; type: string; monthly_rental?: string; setup_fee?: string }[]
  >([]);

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
  }, [load]);

  const resolveTeamId = async (): Promise<string | null> => {
    if (teamId) return teamId;
    if (!user) return null;
    const { data } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    return data?.team_id ?? null;
  };

  const handleBuy = async () => {
    const tid = await resolveTeamId();
    if (!tid) return toast.error("No workspace found");
    // Simulated provisioning — generate a placeholder Indian-style number
    const generated = `+91${Math.floor(7000000000 + Math.random() * 999999999)}`;
    const { error } = await db.from("phone_numbers").insert({
      team_id: tid,
      phone_number: generated,
      provider: "exotel",
      provider_number_id: `exo_${Date.now()}`,
      status: "active",
    });
    if (error) return toast.error(error.message);
    toast.success(`Number ${generated} provisioned`);
    setBuyOpen(false);
    setAreaCode("");
    load();
  };

  const handleConnect = async () => {
    if (!phoneInput.trim()) return toast.error("Phone number required");
    const tid = await resolveTeamId();
    if (!tid) return toast.error("No workspace found");
    const { error } = await db.from("phone_numbers").insert({
      team_id: tid,
      phone_number: phoneInput.trim(),
      provider: "exotel",
      provider_number_id: providerIdInput.trim() || null,
      status: "active",
    });
    if (error) return toast.error(error.message);
    toast.success("Number connected");
    setConnectOpen(false);
    setPhoneInput("");
    setProviderIdInput("");
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
            <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Connect Existing
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect existing number</DialogTitle>
                  <DialogDescription>
                    Link a number you already own with your Exotel account.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <Input
                      id="phone"
                      placeholder="+919876543210"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="providerId">Provider number ID (optional)</Label>
                    <Input
                      id="providerId"
                      placeholder="exotel_sid_..."
                      value={providerIdInput}
                      onChange={(e) => setProviderIdInput(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleConnect}>Connect</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
              <DialogTrigger asChild>
                <Button>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Buy Number
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Buy a new number</DialogTitle>
                  <DialogDescription>
                    Provision a new Exotel number for your workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select defaultValue="exotel" disabled>
                      <SelectTrigger id="provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exotel">Exotel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="area">Area code (optional)</Label>
                    <Input
                      id="area"
                      placeholder="e.g. 80"
                      value={areaCode}
                      onChange={(e) => setAreaCode(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A number will be reserved and billed to your workspace.
                  </p>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleBuy}>Confirm purchase</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

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
