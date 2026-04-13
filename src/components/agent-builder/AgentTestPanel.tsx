import { useState } from "react";
import { Mic, Play, Volume2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AgentTestPanel() {
  const [testMode, setTestMode] = useState<"audio" | "llm">("audio");
  const [isRunning, setIsRunning] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);

  const handleRunTest = () => {
    setIsRunning(true);
    setTranscript([]);

    // Simulated test
    setTimeout(() => {
      setTranscript([{ role: "agent", text: "Hello! How can I help you today?" }]);
    }, 1000);
    setTimeout(() => {
      setTranscript((prev) => [...prev, { role: "user", text: "I'd like to book an appointment." }]);
    }, 2500);
    setTimeout(() => {
      setTranscript((prev) => [
        ...prev,
        { role: "agent", text: "Sure! Let me check available slots for you. What date works best?" },
      ]);
      setIsRunning(false);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Test Mode Tabs */}
      <div className="flex items-center justify-center px-4 py-3 border-b border-border">
        <Tabs value={testMode} onValueChange={(v) => setTestMode(v as "audio" | "llm")}>
          <TabsList className="h-8">
            <TabsTrigger value="audio" className="text-xs px-3 h-7 gap-1.5">
              <Volume2 className="h-3 w-3" /> Test Audio
            </TabsTrigger>
            <TabsTrigger value="llm" className="text-xs px-3 h-7 gap-1.5">
              <Cpu className="h-3 w-3" /> Test LLM
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Microphone / Test Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {transcript.length === 0 && !isRunning ? (
          <>
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center border border-border">
                <Mic className="h-8 w-8 text-muted-foreground" />
              </div>
              {isRunning && (
                <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping" />
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {testMode === "audio"
                ? "Click Run Test to simulate a voice conversation"
                : "Click Run Test to test the LLM response"}
            </p>
          </>
        ) : (
          <div className="w-full space-y-2.5 flex-1 overflow-y-auto">
            {isRunning && transcript.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-4">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">Connecting…</span>
              </div>
            )}
            {transcript.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isRunning && transcript.length > 0 && (
              <div className="flex items-center gap-1.5 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse delay-100" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse delay-200" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Latency Info */}
      {transcript.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Latency</span>
            <Badge variant="outline" className="text-[10px]">~1.1s</Badge>
          </div>
        </div>
      )}

      {/* Run Test Button */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          className="w-full gap-1.5 text-xs"
          size="sm"
          onClick={handleRunTest}
          disabled={isRunning}
        >
          <Play className="h-3.5 w-3.5" />
          {isRunning ? "Running…" : "Run Test"}
        </Button>
      </div>
    </div>
  );
}
