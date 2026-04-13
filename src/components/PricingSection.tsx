import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$0.05",
    unit: "/ minute",
    description: "Perfect for testing and small projects",
    features: ["1,000 free minutes", "1 concurrent agent", "Basic analytics", "Community support", "REST API access"],
    cta: "Start Free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$0.03",
    unit: "/ minute",
    description: "For growing teams and production workloads",
    features: ["10,000 minutes included", "10 concurrent agents", "Advanced analytics", "Priority support", "Custom voices", "Webhook integrations"],
    cta: "Start Building",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "",
    description: "For large-scale deployments with SLA",
    features: ["Unlimited minutes", "Unlimited agents", "Dedicated infrastructure", "24/7 phone support", "Custom model fine-tuning", "SSO & SAML"],
    cta: "Contact Sales",
    featured: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="relative py-24">
      <div className="container mx-auto px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold md:text-5xl">
            Simple, <span className="text-gradient">Transparent</span> Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Pay only for what you use. No hidden fees, no contracts.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl p-8 transition-all duration-300 ${
                plan.featured
                  ? "glass border-primary/40 shadow-glow scale-105"
                  : "glass shadow-card hover:border-primary/20"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground">{plan.unit}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

              <Button
                variant={plan.featured ? "hero" : "hero-outline"}
                className="mt-6 w-full"
              >
                {plan.cta}
              </Button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
