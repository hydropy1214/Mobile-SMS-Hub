import { 
  useGetDashboardStats, 
  getGetDashboardStatsQueryKey,
  useGetDashboardActivity,
  getGetDashboardActivityQueryKey
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  Users, 
  CheckCircle2, 
  XCircle,
  Clock
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey()
    }
  });

  const { data: activities, isLoading: activitiesLoading } = useGetDashboardActivity({
    query: {
      queryKey: getGetDashboardActivityQueryKey()
    }
  });

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
          title="Devices Online" 
          value={stats ? `${stats.devicesOnline} / ${stats.devicesTotal}` : null} 
          icon={<Smartphone className="w-4 h-4 text-muted-foreground" />}
          loading={statsLoading}
        />
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
      </div>

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
