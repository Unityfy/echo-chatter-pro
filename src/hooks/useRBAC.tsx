import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─── Role & Permission Definitions ───────────────────────────────────

export type TeamRole = "admin" | "member" | "viewer";

export type Permission =
  | "agents.manage"
  | "agents.view"
  | "calls.manage"
  | "calls.view"
  | "workflows.manage"
  | "workflows.view"
  | "analytics.view"
  | "integrations.manage"
  | "integrations.view"
  | "settings.manage"
  | "settings.view"
  | "team.manage"
  | "team.view"
  | "billing.manage";

const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  admin: [
    "agents.manage", "agents.view",
    "calls.manage", "calls.view",
    "workflows.manage", "workflows.view",
    "analytics.view",
    "integrations.manage", "integrations.view",
    "settings.manage", "settings.view",
    "team.manage", "team.view",
    "billing.manage",
  ],
  member: [
    "agents.manage", "agents.view",
    "calls.manage", "calls.view",
    "workflows.manage", "workflows.view",
    "analytics.view",
    "integrations.view",
    "settings.view",
    "team.view",
  ],
  viewer: [
    "agents.view",
    "calls.view",
    "workflows.view",
    "analytics.view",
    "settings.view",
    "team.view",
  ],
};

// ─── Context ─────────────────────────────────────────────────────────

interface RBACContextType {
  role: TeamRole | null;
  teamId: string | null;
  loading: boolean;
  hasPermission: (permission: Permission) => boolean;
  can: (...permissions: Permission[]) => boolean;
  refreshRole: () => Promise<void>;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export function RBACProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<TeamRole | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user) {
      setRole(null);
      setTeamId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase
        .from("team_members")
        .select("role, team_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        setRole(data.role as TeamRole);
        setTeamId(data.team_id);
      } else {
        // No team membership — treat as admin (solo user / workspace creator)
        setRole("admin");
        setTeamId(null);
      }
    } catch {
      setRole("admin");
      setTeamId(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!role) return false;
      return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
    },
    [role]
  );

  const can = useCallback(
    (...permissions: Permission[]): boolean => permissions.every(hasPermission),
    [hasPermission]
  );

  return (
    <RBACContext.Provider value={{ role, teamId, loading, hasPermission, can, refreshRole: fetchRole }}>
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC() {
  const ctx = useContext(RBACContext);
  if (!ctx) throw new Error("useRBAC must be used within <RBACProvider>");
  return ctx;
}

export { ROLE_PERMISSIONS };
