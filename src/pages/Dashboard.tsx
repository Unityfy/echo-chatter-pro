import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Phone, LogOut } from "lucide-react";

const Dashboard = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">VoxAgent</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Welcome to your VoxAgent dashboard. Start building your AI voice agents.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { title: "Active Agents", value: "0", desc: "Create your first agent" },
            { title: "Total Calls", value: "0", desc: "No calls yet" },
            { title: "Success Rate", value: "—", desc: "Start making calls" },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className="mt-1 text-3xl font-bold text-foreground">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
