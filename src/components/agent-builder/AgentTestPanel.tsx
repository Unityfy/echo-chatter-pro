import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Play, Square, Volume2, Cpu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { streamAgentChat, generateSpeech, transcribeAudio } from "@/services/agentService";
import { toast } from "sonner";

interface AgentTestPanelProps {
  systemPrompt?: string;
  voiceName?: string;
}

type Message = { role: "user" | "assistant"; content: string };

export function AgentTestPanel({ systemPrompt, voiceName }: AgentTestPanelProps) {
  const [testMode, setTestMode] = useState<"audio" | "llm">("llm");
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendToLLM = useCallback(async (userText: string, allMessages: Message[]) => {
    const startTime = Date.now();
    setIsRunning(true);

    const userMsg: Message = { role: "user", content: userText };
    const updatedMessages = [...allMessages, userMsg];
    setMessages(updatedMessages);

    let assistantContent = "";
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAgentChat({
        messages: updatedMessages,
        systemPrompt: systemPrompt || "You are a helpful AI voice agent. Keep responses concise and conversational.",
        onDelta: (chunk) => {
          if (!latency) setLatency(Date.now() - startTime);
          assistantContent += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
            }
            return [...prev, { role: "assistant", content: assistantContent }];
          });
          scrollToBottom();
        },
        onDone: () => {
          setLatency(Date.now() - startTime);
          setIsRunning(false);
        },
        signal: controller.signal,
      });

      // If audio mode, speak the response
      if (testMode === "audio" && assistantContent) {
        setIsSpeaking(true);
        try {
          const audio = await generateSpeech(assistantContent, voiceName);
          audio.onended = () => setIsSpeaking(false);
          await audio.play();
        } catch (e) {
          console.error("TTS error:", e);
          setIsSpeaking(false);
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Chat error:", e);
        toast.error(e.message || "Failed to get response");
      }
      setIsRunning(false);
    }
  }, [systemPrompt, testMode, voiceName, latency]);

  const handleTextSubmit = () => {
    if (!textInput.trim() || isRunning) return;
    const text = textInput.trim();
    setTextInput("");
    sendToLLM(text, messages);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        setIsRunning(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) {
            sendToLLM(text, messages);
          } else {
            toast.error("Could not transcribe audio");
            setIsRunning(false);
          }
        } catch (e) {
          console.error("STT error:", e);
          toast.error("Transcription failed");
          setIsRunning(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleReset = () => {
    handleStop();
    setMessages([]);
    setLatency(null);
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 && !isRunning ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center border border-border">
              {testMode === "audio" ? (
                <Mic className="h-7 w-7 text-muted-foreground" />
              ) : (
                <Cpu className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[200px]">
              {testMode === "audio"
                ? "Hold the mic button to record, or type a message below"
                : "Type a message to test your agent's LLM response"}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isRunning && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex items-center gap-1.5 px-1">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-[11px] text-muted-foreground">Thinking…</span>
              </div>
            )}
            {isSpeaking && (
              <div className="flex items-center gap-1.5 px-1">
                <Volume2 className="h-3 w-3 text-primary animate-pulse" />
                <span className="text-[11px] text-muted-foreground">Speaking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Latency Info */}
      {latency && (
        <div className="px-4 py-1.5 border-t border-border">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Response time</span>
            <Badge variant="outline" className="text-[10px]">
              {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`}
            </Badge>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="px-3 py-2.5 border-t border-border space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
            placeholder="Type a message…"
            className="h-8 text-xs flex-1"
            disabled={isRunning}
          />
          {testMode === "audio" && (
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              className="h-8 w-8 shrink-0"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => isRecording && stopRecording()}
              disabled={isRunning}
            >
              {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" className="flex-1 text-xs h-8 gap-1.5" onClick={handleStop}>
              <Square className="h-3 w-3" /> Stop
            </Button>
          ) : (
            <Button size="sm" className="flex-1 text-xs h-8 gap-1.5" onClick={handleTextSubmit} disabled={!textInput.trim()}>
              <Play className="h-3 w-3" /> Send
            </Button>
          )}
          {messages.length > 0 && (
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={handleReset}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
