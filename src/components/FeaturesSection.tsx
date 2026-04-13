import { Bot, Zap, Globe, Shield, BarChart3, Webhook } from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Natural Conversations",
    description: "Advanced LLM-powered agents that handle interruptions, pauses, and complex dialogue naturally.",
  },
  {
    icon: Zap,
    title: "Sub-300ms Latency",
    description: "Ultra-fast response times that make conversations feel instant and lifelike.",
  },
  {
    icon: Globe,
    title: "30+ Languages",
    description: "Deploy multilingual agents that seamlessly switch between languages mid-conversation.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "SOC 2 compliant with end-to-end encryption, HIPAA-ready for healthcare use cases.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Monitor call sentiment, conversion rates, and agent performance with live dashboards.",
  },
  {
    icon: Webhook,
    title: "API-First Platform",
    description: "Integrate with your CRM, calendar, and tools via REST APIs and webhooks.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="relative py-24">
      <div className="container mx-auto px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold md:text-5xl">
            Everything You Need to{" "}
            <span className="text-gradient">Scale Voice AI</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            From prototyping to production, VoxAgent gives you the tools to build, deploy, and manage voice agents at any scale.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group glass rounded-xl p-6 shadow-card transition-all duration-300 hover:border-primary/30 hover:shadow-glow"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
