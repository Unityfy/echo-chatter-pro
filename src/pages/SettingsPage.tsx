import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User, Users, Building2, Plus, Trash2, Save, Loader2 } from "lucide-react";

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
}

interface Team {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  created_by: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "member" | "viewer";
  joined_at: string;
  profile?: { display_name: string | null; email: string | null; avatar_url: string | null };
}

const SettingsPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");

  // Team form
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (profileData) {
        setProfile(profileData as Profile);
        setFullName(profileData.full_name || "");
        setDisplayName(profileData.display_name || "");
        setCompanyName(profileData.company_name || "");
      }

      // Load teams the user belongs to
      const { data: memberData } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id);

      if (memberData && memberData.length > 0) {
        const { data: teamData } = await supabase
          .from("teams")
          .select("*")
          .eq("id", memberData[0].team_id)
          .single();

        if (teamData) {
          setTeam(teamData as Team);
          setTeamName(teamData.name);
          setTeamSlug(teamData.slug || "");
          await loadMembers(teamData.id);
        }
      }
    } catch (err) {
      console.error("Failed to load settings data", err);
    }
    setLoading(false);
  };

  const loadMembers = async (teamId: string) => {
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);

    if (data) {
      // Load profiles for each member
      const userIds = data.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, avatar_url")
        .in("user_id", userIds);

      const membersWithProfiles = data.map((m: any) => ({
        ...m,
        profile: profiles?.find((p: any) => p.user_id === m.user_id) || null,
      }));

      setMembers(membersWithProfiles as TeamMember[]);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        display_name: displayName,
        company_name: companyName,
      })
      .eq("user_id", user.id);

    setSaving(false);
    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
    }
  };

  const createTeam = async () => {
    if (!user || !teamName.trim()) return;
    setSaving(true);

    const slug = teamName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { data: newTeam, error } = await supabase
      .from("teams")
      .insert({ name: teamName, slug, created_by: user.id })
      .select()
      .single();

    if (error || !newTeam) {
      toast.error("Failed to create workspace");
      setSaving(false);
      return;
    }

    // Add creator as admin
    await supabase
      .from("team_members")
      .insert({ team_id: newTeam.id, user_id: user.id, role: "admin" as any });

    setTeam(newTeam as Team);
    setTeamSlug(slug);
    await loadMembers(newTeam.id);
    toast.success("Workspace created");
    setSaving(false);
  };

  const saveTeam = async () => {
    if (!team) return;
    setSaving(true);
    const { error } = await supabase
      .from("teams")
      .update({ name: teamName, slug: teamSlug })
      .eq("id", team.id);

    setSaving(false);
    if (error) {
      toast.error("Failed to update workspace");
    } else {
      toast.success("Workspace updated");
    }
  };

  const removeMember = async (memberId: string) => {
    if (!team) return;
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast.error("Failed to remove member");
    } else {
      toast.success("Member removed");
      await loadMembers(team.id);
    }
  };

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return "?";
  };

  const roleLabel: Record<string, string> = { admin: "Admin", member: "Team Member", viewer: "Viewer" };
  const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
    admin: "default",
    member: "secondary",
    viewer: "outline",
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-page-title">Settings</h1>
        <p className="text-helper mt-1">Manage your profile, team, and workspace.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full justify-start bg-muted/30 border border-border">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" /> My Profile
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Team Members
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Workspace
          </TabsTrigger>
        </TabsList>

        {/* My Profile Tab */}
        <TabsContent value="profile" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-card-title">Profile Information</CardTitle>
              <CardDescription className="text-helper">Update your personal details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-2">
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarFallback className="bg-muted text-foreground text-lg">
                    {getInitials(fullName || displayName, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">{fullName || displayName || "No name set"}</p>
                  <p className="text-helper">{user?.email}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="johndoe" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ""} disabled className="opacity-60" />
                <p className="text-helper">Email cannot be changed here.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveProfile} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-card-title text-destructive">Danger Zone</CardTitle>
              <CardDescription className="text-helper">Permanently delete your account and all data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" size="sm">Delete Account</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Members Tab */}
        <TabsContent value="team" className="space-y-6 mt-6">
          {!team ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-foreground font-medium">No workspace yet</p>
                <p className="text-helper mt-1">Create a workspace first to manage team members.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-card-title">Team Members</CardTitle>
                  <CardDescription className="text-helper">{members.length} member{members.length !== 1 ? "s" : ""} in {team.name}</CardDescription>
                </div>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Invite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "viewer")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Team Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-helper">The user must already have an account. Invitation emails are not yet supported.</p>
                      <Button className="w-full" onClick={() => { toast.info("Invite functionality coming soon"); setInviteOpen(false); }}>
                        Send Invite
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-muted text-foreground text-xs">
                          {getInitials(member.profile?.display_name, member.profile?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {member.profile?.display_name || member.profile?.email || "Unknown"}
                        </p>
                        <p className="text-helper">{member.profile?.email || ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={roleBadgeVariant[member.role]}>{roleLabel[member.role]}</Badge>
                      {member.user_id !== user?.id && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeMember(member.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Workspace Tab */}
        <TabsContent value="workspace" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-card-title">{team ? "Workspace Settings" : "Create Workspace"}</CardTitle>
              <CardDescription className="text-helper">
                {team ? "Manage your workspace details." : "Set up a workspace to collaborate with your team."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Workspace Name</Label>
                <Input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My Company" />
              </div>
              {team && (
                <div className="space-y-2">
                  <Label htmlFor="teamSlug">Slug</Label>
                  <Input id="teamSlug" value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)} placeholder="my-company" />
                  <p className="text-helper">Used in URLs and API references.</p>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button onClick={team ? saveTeam : createTeam} disabled={saving || !teamName.trim()} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {team ? "Save Changes" : "Create Workspace"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {team && (
            <Card>
              <CardHeader>
                <CardTitle className="text-card-title">Workspace Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Workspace ID</span>
                  <span className="font-mono text-xs text-foreground">{team.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Members</span>
                  <span className="text-foreground">{members.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge variant="secondary">Free</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
