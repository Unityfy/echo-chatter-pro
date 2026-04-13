import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

const WaveformVisualizer = () => {
  const bars = 32;
  return (
    <div className="flex items-center justify-center gap-[3px] h-24">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-gradient-primary opacity-60"
          style={{
            animation: `waveform 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
            height: "20%",
          }}
        />
      ))}
    </div>
  );
};

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background glow */}
      <div className="absolute inset-0 bg-glow animate-pulse-glow" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl animate-float" />

      <div className="container relative z-10 mx-auto px-6 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Now with GPT-5 powered conversations
        </div>

        <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          AI Voice Agents That{" "}
          <span className="text-gradient">Sound Human</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Deploy intelligent voice agents that make and receive calls at scale. 
          Automate sales, support, and scheduling with conversations 
          indistinguishable from real humans.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="hero" size="lg" className="text-base px-8 py-6">
            Start Building Free
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button variant="hero-outline" size="lg" className="text-base px-8 py-6">
            <Play className="mr-1 h-4 w-4" />
            Watch Demo
          </Button>
        </div>

        {/* Waveform */}
        <div className="mt-16">
          <WaveformVisualizer />
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-3 gap-8 mx-auto max-w-lg">
          {[
            { value: "10M+", label: "Calls Made" },
            { value: "99.7%", label: "Uptime" },
            { value: "<300ms", label: "Latency" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-gradient md:text-3xl">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
