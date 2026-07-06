import { Link, useLocation } from 'wouter';
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

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: Activity },
    { href: '/devices', label: 'Devices', icon: Smartphone },
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
                {item.label}
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