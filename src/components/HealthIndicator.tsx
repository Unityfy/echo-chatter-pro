import { useBackendHealth, type HealthStatus } from "@/hooks/useBackendHealth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const dotClass: Record<HealthStatus, string> = {
  checking: "bg-muted-foreground/40 animate-pulse",
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-destructive",
};

const labelMap: Record<HealthStatus, string> = {
  checking: "Checking",
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

export function HealthIndicator() {
  const { db, elevenlabs, overall } = useBackendHealth();

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
            aria-label={`Backend status: ${labelMap[overall]}`}
          >
            <span className={cn("h-2 w-2 rounded-full", dotClass[overall])} />
            <span className="hidden sm:inline">{labelMap[overall]}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[db])} />
              Database: {labelMap[db]}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[elevenlabs])} />
              ElevenLabs: {labelMap[elevenlabs]}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
