import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the current user's team_id, auto-creating a default workspace
 * the first time a user signs in. Returns null while loading.
 */
export function useTeamId() {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTeamId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (data?.team_id) {
        setTeamId(data.team_id);
      } else {
        // Auto-provision a default workspace on first run
        const { data: newTeamId } = await supabase.rpc("create_team_with_admin", {
          _name: "My Workspace",
          _user_id: user.id,
        });
        if (!cancelled) setTeamId((newTeamId as string) ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { teamId, loading };
}
