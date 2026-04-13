import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const SettingsPage = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Account</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <p className="text-sm text-foreground">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User ID</label>
            <p className="text-sm text-foreground font-mono text-xs">{user?.id}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Preferences</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Dark Mode</p>
            <p className="text-xs text-muted-foreground">Currently always on.</p>
          </div>
          <Button variant="outline" size="sm" disabled>
            Enabled
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
        <p className="text-sm text-muted-foreground">Permanently delete your account and all data.</p>
        <Button variant="destructive" size="sm">
          Delete Account
        </Button>
      </div>
    </div>
  );
};

export default SettingsPage;
