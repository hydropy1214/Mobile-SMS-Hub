import { Link, useLocation } from 'wouter';
import { useCallback } from 'react';
import { 
  Activity, 
  Smartphone, 
  Users, 
  ListOrdered, 
  Megaphone, 
  MessageSquare,
  Signal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useListDevices, getListDevicesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/use-websocket';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: devices } = useListDevices({
    query: { queryKey: getListDevicesQueryKey(), staleTime: 10_000 }
  });

  const invalidateDevices = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
  }, [queryClient]);
  useWebSocket('device:status',     invalidateDevices);
  useWebSocket('device:registered', invalidateDevices);
  useWebSocket('device:removed',    invalidateDevices);
  useWebSocket('device:offline',    invalidateDevices);

  const onlineCount = devices?.filter(d => d.status === 'online').length ?? 0;

  const navItems = [
    { href: '/', label: 'Dashboard', icon: Activity },
    { href: '/devices', label: 'Devices', icon: Smartphone, badge: onlineCount > 0 ? onlineCount : null },
    { href: '/contacts', label: 'Contacts', icon: Users },
    { href: '/contact-lists', label: 'Lists', icon: ListOrdered },
    { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border gap-3">
          <div className="bg-primary/20 p-2 rounded-md">
            <Signal className="w-5 h-5 text-primary" />
          </div>
          <span className="font-semibold text-lg tracking-tight">SMS Control</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {'badge' in item && item.badge ? (
                  <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium">
              OP
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Operator</span>
              <span className="text-xs text-sidebar-foreground/50">Mission Control</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}