import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HealthStatus = "checking" | "healthy" | "degraded" | "down";

interface Health {
  db: HealthStatus;
  elevenlabs: HealthStatus;
  overall: HealthStatus;
}

/**
 * Lightweight backend connection + API health probe.
 * - DB: head request to a public table
 * - ElevenLabs: edge function ping
 * Re-checks every 60s.
 */
export function useBackendHealth(intervalMs = 60_000): Health {
  const [health, setHealth] = useState<Health>({
    db: "checking",
    elevenlabs: "checking",
    overall: "checking",
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // DB probe
      let db: HealthStatus = "down";
      try {
        const { error } = await supabase.from("teams").select("id", { head: true, count: "exact" }).limit(1);
        db = error ? "degraded" : "healthy";
      } catch {
        db = "down";
      }

      // ElevenLabs probe via edge function
      let elevenlabs: HealthStatus = "down";
      try {
        const { data, error } = await supabase.functions.invoke("elevenlabs-token-check");
        if (error) elevenlabs = "down";
        else elevenlabs = (data as any)?.ok ? "healthy" : "degraded";
      } catch {
        elevenlabs = "down";
      }

      if (cancelled) return;
      const overall: HealthStatus =
        db === "healthy" && elevenlabs === "healthy"
          ? "healthy"
          : db === "down" || elevenlabs === "down"
          ? "degraded"
          : "degraded";
      setHealth({ db, elevenlabs, overall });
    };

    check();
    const t = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [intervalMs]);

  return health;
}
