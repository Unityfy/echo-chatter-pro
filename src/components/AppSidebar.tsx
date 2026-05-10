import {
  LayoutDashboard,
  Bot,
  Phone,
  PhoneCall,
  Workflow,
  BarChart3,
  Plug,
  Settings,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useRBAC, Permission } from "@/hooks/useRBAC";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: Permission;
}

const mainItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Agents", url: "/agents", icon: Bot, requiredPermission: "agents.view" },
  { title: "Calls", url: "/calls", icon: PhoneCall, requiredPermission: "calls.view" },
  { title: "Phone Numbers", url: "/phone-numbers", icon: Phone, requiredPermission: "integrations.view" },
  { title: "Workflows", url: "/workflows", icon: Workflow, requiredPermission: "workflows.view" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, requiredPermission: "analytics.view" },
  { title: "Integrations", url: "/integrations", icon: Plug, requiredPermission: "integrations.view" },
  { title: "Knowledge Base", url: "/knowledge", icon: BookOpen, requiredPermission: "agents.view" },
];

const bottomItems: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings, requiredPermission: "settings.view" },
];

const roleLabel: Record<string, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const { role, hasPermission } = useRBAC();

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";

  const visibleMain = mainItems.filter(
    (item) => !item.requiredPermission || hasPermission(item.requiredPermission)
  );
  const visibleBottom = bottomItems.filter(
    (item) => !item.requiredPermission || hasPermission(item.requiredPermission)
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-2 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-foreground">VoxAgent</span>
            )}
          </div>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleBottom.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">
                {user?.email}
              </span>
              {role && (
                <Badge variant="outline" className="mt-0.5 w-fit text-[10px] px-1.5 py-0">
                  {roleLabel[role] || role}
                </Badge>
              )}
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
