import { useCallback } from "react";
import { 
  useGetDashboardStats, 
  getGetDashboardStatsQueryKey,
  useGetDashboardActivity,
  getGetDashboardActivityQueryKey,
  useListDevices,
  getListDevicesQueryKey,
} from "@workspace/api-client-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Activity, 
  Smartphone, 
  Megaphone, 
  CheckCircle2, 
  XCircle,
  Clock,
  Battery,
  BatteryFull,
  BatteryMedium,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  WifiOff
} from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  const { data: activities, isLoading: activitiesLoading } = useGetDashboardActivity({
    query: { queryKey: getGetDashboardActivityQueryKey() }
  });

  const { data: allDevices, isLoading: devicesLoading } = useListDevices({
    query: { queryKey: getListDevicesQueryKey() }
  });

  const onlineDevices = allDevices?.filter(d => d.status === "online") ?? [];

  // Real-time: refresh on any meaningful event
  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
  }, [queryClient]);
  useWebSocket("campaign:progress",   refreshAll);
  useWebSocket("campaign:completed",  refreshAll);
  useWebSocket("campaign:started",    refreshAll);
  useWebSocket("campaign:paused",     refreshAll);
  useWebSocket("campaign:cancelled",  refreshAll);
  useWebSocket("device:status",       refreshAll);
  useWebSocket("device:registered",   refreshAll);
  useWebSocket("device:removed",      refreshAll);
  useWebSocket("device:offline",      refreshAll);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Mission Control</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          System Operational
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Messages Today" 
          value={stats?.messagesToday} 
          icon={<Activity className="w-4 h-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard 
          title="Success Rate" 
          value={stats ? `${stats.successRateToday.toFixed(1)}%` : null} 
          icon={<CheckCircle2 className="w-4 h-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard 
          title="Active Campaigns" 
          value={stats?.activeCampaigns} 
          icon={<Megaphone className="w-4 h-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard 
          title="Devices Online" 
          value={stats ? `${stats.devicesOnline} / ${stats.devicesTotal}` : null} 
          icon={<Smartphone className="w-4 h-4 text-muted-foreground" />}
          loading={statsLoading}
        />
      </div>

      {/* Connected Devices Panel */}
      <Card className="rounded-md border-border/50">
        <CardHeader className="bg-muted/30 border-b pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Connected Devices — Auto-Sending
          </CardTitle>
          {!devicesLoading && (
            <Badge variant="outline" className={
              onlineDevices.length > 0
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono"
                : "bg-muted text-muted-foreground font-mono"
            }>
              {onlineDevices.length > 0 ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5 inline-block" />{onlineDevices.length} of {allDevices?.length ?? 0} online</>
              ) : `0 of ${allDevices?.length ?? 0} online`}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {devicesLoading ? (
            <div className="p-4 space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            </div>
          ) : onlineDevices.length > 0 ? (
            <div className="divide-y">
              {onlineDevices.map((device) => {
                const d = device as typeof device & { simSlot?: number | null; batteryLevel?: number | null; signalStrength?: number | null; lastSeen?: string | null };
                return (
                  <div key={device.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{device.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {device.phoneNumber}
                        {d.simSlot != null ? ` · SIM ${d.simSlot + 1}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                      <span className="flex items-center gap-1.5">
                        <DeviceBatteryIcon level={d.batteryLevel ?? null} />
                        <span className="font-mono">{d.batteryLevel != null ? `${d.batteryLevel}%` : "—"}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <DeviceSignalIcon level={d.signalStrength ?? null} />
                        <span className="font-mono">{d.signalStrength != null ? `${d.signalStrength}/4` : "—"}</span>
                      </span>
                      {d.lastSeen && (
                        <span className="hidden sm:flex items-center gap-1 text-muted-foreground/60">
                          <Clock className="w-3 h-3" />
                          {format(new Date(d.lastSeen), 'HH:mm:ss')}
                        </span>
                      )}
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1 inline-block" />
                        Live
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <WifiOff className="w-8 h-8 opacity-20" />
              <p className="text-sm font-medium">No devices online right now</p>
              <p className="text-xs text-center max-w-xs">
                Go to <strong>Devices</strong>, register a phone and scan the QR code to start the Termux daemon — it sends SMS automatically, no tapping needed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <Card className="lg:col-span-2 rounded-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Message Volume (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[300px] w-full">
              {statsLoading ? (
                <Skeleton className="w-full h-full" />
              ) : stats?.messagesSentThisWeek && stats.messagesSentThisWeek.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.messagesSentThisWeek} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(new Date(val), 'MMM d')}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.25rem',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                      labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))" 
                      radius={[2, 2, 0, 0]} 
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground flex-col gap-2">
                  <Activity className="w-8 h-8 opacity-20" />
                  <p>No volume data available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="rounded-md overflow-hidden flex flex-col">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {activitiesLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="divide-y">
                {activities.map((activity) => (
                  <div key={activity.id} className="p-4 flex gap-3 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5 flex-shrink-0">
                      <ActivityIcon type={activity.type} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{activity.description}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {format(new Date(activity.createdAt), 'MMM d, HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center p-8 text-muted-foreground flex-col gap-2 h-full">
                <Clock className="w-8 h-8 opacity-20" />
                <p>No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface OnlineDevice {
  id: number;
  name: string;
  phoneNumber: string;
  batteryLevel: number | null;
  signalStrength: number | null;
  simSlot: number | null;
  lastSeen: string | null;
}

function DeviceBatteryIcon({ level }: { level: number | null }) {
  if (level == null) return <Battery className="w-3.5 h-3.5 opacity-30" />;
  if (level > 80) return <BatteryFull className="w-3.5 h-3.5 text-emerald-500" />;
  if (level > 30) return <BatteryMedium className="w-3.5 h-3.5 text-primary" />;
  return <Battery className="w-3.5 h-3.5 text-destructive" />;
}

function DeviceSignalIcon({ level }: { level: number | null }) {
  if (level == null) return <Signal className="w-3.5 h-3.5 opacity-30" />;
  if (level > 3) return <SignalHigh className="w-3.5 h-3.5 text-emerald-500" />;
  if (level > 1) return <SignalMedium className="w-3.5 h-3.5 text-primary" />;
  return <SignalLow className="w-3.5 h-3.5 text-destructive" />;
}

function StatCard({ title, value, icon, loading }: { title: string, value: React.ReactNode, icon: React.ReactNode, loading: boolean }) {
  return (
    <Card className="rounded-md border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value ?? '0'}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'device_connected':
      return <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><Smartphone className="w-4 h-4" /></div>;
    case 'device_disconnected':
      return <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center"><Smartphone className="w-4 h-4" /></div>;
    case 'campaign_started':
      return <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Megaphone className="w-4 h-4" /></div>;
    case 'campaign_completed':
      return <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>;
    case 'campaign_failed':
      return <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center"><XCircle className="w-4 h-4" /></div>;
    default:
      return <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center"><Activity className="w-4 h-4" /></div>;
  }
}
