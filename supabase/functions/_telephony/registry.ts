// Provider registry — single source of truth.
// To add a new provider: import its adapter and register it here.
import type { ProviderId, TelephonyProvider } from "./types.ts";
import { knowlarityAdapter } from "./knowlarity.ts";
import { twilioAdapter } from "./twilio.ts";

const REGISTRY: Record<ProviderId, TelephonyProvider> = {
  knowlarity: knowlarityAdapter,
  twilio: twilioAdapter,
};

export function getProvider(id: string): TelephonyProvider {
  const provider = REGISTRY[id as ProviderId];
  if (!provider) {
    throw new Error(`Unknown telephony provider: ${id}. Supported: ${Object.keys(REGISTRY).join(", ")}`);
  }
  return provider;
}

export function listProviders(): { id: ProviderId; displayName: string }[] {
  return Object.values(REGISTRY).map((p) => ({ id: p.id, displayName: p.displayName }));
}
