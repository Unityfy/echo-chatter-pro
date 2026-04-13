import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="relative py-24">
      <div className="container mx-auto px-6">
        <div className="relative overflow-hidden rounded-2xl glass p-12 text-center shadow-glow md:p-20">
          <div className="absolute inset-0 bg-glow opacity-50" />
          <div className="relative z-10">
            <h2 className="text-3xl font-bold md:text-5xl">
              Ready to <span className="text-gradient">Automate</span> Your Calls?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join thousands of companies using VoxAgent to scale their voice operations with AI.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button variant="hero" size="lg" className="text-base px-8 py-6">
                Get Started Free
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button variant="hero-outline" size="lg" className="text-base px-8 py-6">
                Talk to Sales
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
