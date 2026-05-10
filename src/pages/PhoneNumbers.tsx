import { useEffect, useState, useCallback } from "react";
import { Phone, MoreHorizontal, UserPlus, Trash2, Plus } from "lucide-react";
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

interface AgentLite {
  id: string;
  name: string;
}

const db = supabase as any;

export default function PhoneNumbers() {
  const { teamId, hasPermission } = useRBAC();
  const canManage = hasPermission("integrations.manage");

  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newAgent, setNewAgent] = useState<string>("none");
  const [adding, setAdding] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [activeNumber, setActiveNumber] = useState<PhoneNumber | null>(null);
  const [assignAgentId, setAssignAgentId] = useState<string>("none");

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

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!teamId) return toast.error("No active workspace");
    const phone = newNumber.trim();
    if (!phone) return toast.error("Enter a phone number");
    setAdding(true);
    const { error } = await db.from("phone_numbers").insert({
      team_id: teamId,
      phone_number: phone,
      provider: "twilio",
      status: "active",
      agent_id: newAgent === "none" ? null : newAgent,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Number added");
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
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Number
          </Button>
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
                  Add a number to start handling calls.
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add phone number</DialogTitle>
            <DialogDescription>
              Register a Twilio number for this workspace. Configure the Twilio voice webhook to
              point at your <span className="font-mono">telephony-incoming-call</span> function.
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
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAdd} disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
