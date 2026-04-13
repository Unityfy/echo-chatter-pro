import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
            <Phone className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">VoxAgent</span>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          <a href="#demo" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Demo</a>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/login">Log in</Link></Button>
          <Button variant="hero" size="sm" asChild><Link to="/signup">Get Started</Link></Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
