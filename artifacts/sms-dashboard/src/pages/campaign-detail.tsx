import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetCampaign, 
  getGetCampaignQueryKey,
  useListMessages,
  useSendCampaign,
  usePauseCampaign,
  useCancelCampaign
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { 
  Card, 
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  CheckCircle2,
  Clock,
  Smartphone,
  Users,
  MessageSquare,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function CampaignDetail() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [messageFilter, setMessageFilter] = useState<string>("all");

  const { data: campaign, isLoading: campaignLoading } = useGetCampaign(id, {
    query: {
      enabled: !!id,
      queryKey: getGetCampaignQueryKey(id)
    }
  });

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useListMessages({
    campaignId: id,
    status: messageFilter === "all" ? undefined : messageFilter
  }, {
    query: {
      enabled: !!id,
      queryKey: ['messages', { campaignId: id, status: messageFilter }]
    }
  });

  const sendCampaign = useSendCampaign();
  const pauseCampaign = usePauseCampaign();
  const cancelCampaign = useCancelCampaign();

  // Real-time updates: invalidate queries whenever the campaign processor
  // broadcasts progress or completion events for this campaign.
  const handleProgress = useCallback((data: unknown) => {
    const ev = data as { campaignId?: number };
    if (ev.campaignId === id) {
      void queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ['messages', { campaignId: id, status: messageFilter }] });
    }
  }, [id, messageFilter, queryClient]);

  const handleCompleted = useCallback((data: unknown) => {
    const ev = data as { campaignId?: number; name?: string };
    if (ev.campaignId === id) {
      void queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ['messages', { campaignId: id, status: messageFilter }] });
      toast({ title: `Campaign "${ev.name ?? ''}" completed` });
    }
  }, [id, messageFilter, queryClient, toast]);

  useWebSocket("campaign:progress", handleProgress);
  useWebSocket("campaign:completed", handleCompleted);

  if (!id) {
    return <div>Invalid campaign ID</div>;
  }

  function handleAction(action: 'send' | 'pause' | 'cancel') {
    const mutator = action === 'send' ? sendCampaign : action === 'pause' ? pauseCampaign : cancelCampaign;
    const actionName = action === 'send' ? 'started' : action === 'pause' ? 'paused' : 'cancelled';
    
    if (action === 'cancel' && !confirm("Are you sure you want to cancel this campaign? It cannot be resumed.")) {
      return;
    }

    mutator.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) });
        toast({ title: `Campaign ${actionName}` });
      },
      onError: () => {
        toast({ title: `Failed to ${action} campaign`, variant: "destructive" });
      }
    });
  }

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'sending':
        return <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-mono"><Play className="w-3.5 h-3.5 mr-1.5" /> Sending</Badge>;
      case 'paused':
        return <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-mono"><Pause className="w-3.5 h-3.5 mr-1.5" /> Paused</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 font-mono"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 font-mono"><XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancelled</Badge>;
      case 'draft':
      default:
        return <Badge className="bg-muted text-muted-foreground hover:bg-muted font-mono"><Clock className="w-3.5 h-3.5 mr-1.5" /> Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/campaigns')} className="shrink-0 text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {campaignLoading ? <Skeleton className="h-8 w-64" /> : campaign?.name}
              </h1>
              {!campaignLoading && renderStatusBadge(campaign?.status)}
            </div>
            <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
              <span className="font-mono text-xs">ID: #{id}</span>
              {campaign?.createdAt && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <span>Created {format(new Date(campaign.createdAt), 'MMM d, yyyy')}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {!campaignLoading && campaign && (
          <div className="flex items-center gap-2">
            {campaign.status === 'draft' && (
              <Button 
                onClick={() => handleAction('send')}
                disabled={sendCampaign.isPending}
                className="gap-2"
              >
                <Play className="w-4 h-4" /> Start Campaign
              </Button>
            )}
            {campaign.status === 'paused' && (
              <Button 
                onClick={() => handleAction('send')}
                disabled={sendCampaign.isPending}
                className="gap-2"
              >
                <Play className="w-4 h-4" /> Resume
              </Button>
            )}
            {campaign.status === 'sending' && (
              <Button 
                variant="outline"
                className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20 gap-2"
                onClick={() => handleAction('pause')}
                disabled={pauseCampaign.isPending}
              >
                <Pause className="w-4 h-4" /> Pause
              </Button>
            )}
            {(campaign.status === 'sending' || campaign.status === 'paused') && (
              <Button 
                variant="outline"
                className="text-destructive border-destructive/20 hover:bg-destructive/10 gap-2"
                onClick={() => handleAction('cancel')}
                disabled={cancelCampaign.isPending}
              >
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-shrink-0">
        <Card>
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Target Audience
            </div>
            {campaignLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex flex-col">
                <span className="text-2xl font-bold font-mono">{campaign?.totalCount}</span>
                <span className="text-xs text-muted-foreground truncate" title={campaign?.contactListName || ''}>
                  List: {campaign?.contactListName || 'Unknown'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <div className="flex justify-between text-sm font-medium text-muted-foreground mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Progress
              </div>
              {!campaignLoading && campaign && (
                <span className="font-mono text-foreground">
                  {campaign.totalCount > 0 ? Math.round((campaign.sentCount / campaign.totalCount) * 100) : 0}%
                </span>
              )}
            </div>
            {campaignLoading ? (
              <Skeleton className="h-4 w-full mb-2" />
            ) : (
              <>
                <Progress 
                  value={campaign && campaign.totalCount > 0 ? (campaign.sentCount / campaign.totalCount) * 100 : 0} 
                  className="h-3 mb-2 bg-muted"
                />
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">
                    <span className="text-emerald-500 font-medium">{campaign?.sentCount}</span> sent
                  </span>
                  <span className="text-muted-foreground">
                    {campaign?.failedCount ? (
                      <span className="text-destructive font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {campaign.failedCount} failed
                      </span>
                    ) : '0 failures'}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Gateway Device
            </div>
            {campaignLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex flex-col">
                <span className="text-sm font-semibold truncate" title={campaign?.deviceName || ''}>
                  {campaign?.deviceName || 'Unknown'}
                </span>
                <span className="text-xs text-muted-foreground font-mono mt-1">
                  ID: {campaign?.deviceId || '--'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Message Template */}
        <Card className="flex flex-col h-full overflow-hidden border-border/50">
          <CardHeader className="bg-muted/30 pb-4 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Message Payload
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 overflow-y-auto bg-muted/10">
            {campaignLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                {campaign?.message}
              </div>
            )}
          </CardContent>
          <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between font-mono">
            <span>{campaign?.message?.length || 0} characters</span>
            <span>{Math.ceil((campaign?.message?.length || 1) / 160)} SMS segment(s)</span>
          </div>
        </Card>

        {/* Message Log */}
        <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden border-border/50">
          <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Dispatch Log
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground"
                onClick={() => refetchMessages()}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <div className="flex bg-muted p-1 rounded-md">
                <FilterButton active={messageFilter === "all"} onClick={() => setMessageFilter("all")}>All</FilterButton>
                <FilterButton active={messageFilter === "sent"} onClick={() => setMessageFilter("sent")}>Sent</FilterButton>
                <FilterButton active={messageFilter === "failed"} onClick={() => setMessageFilter("failed")}>Failed</FilterButton>
              </div>
            </div>
          </CardHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm shadow-border/50">
                <TableRow>
                  <TableHead className="w-[180px]">Recipient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messagesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : messages && messages.length > 0 ? (
                  messages.map(msg => (
                    <TableRow key={msg.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-sm truncate max-w-[180px]">
                        {msg.contactName || 'Unknown'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {msg.phoneNumber}
                      </TableCell>
                      <TableCell>
                        <MessageStatusBadge status={msg.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {msg.sentAt 
                          ? format(new Date(msg.sentAt), 'HH:mm:ss') 
                          : format(new Date(msg.createdAt), 'HH:mm:ss')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No messages found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
        active 
          ? "bg-background text-foreground shadow-sm" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
      }`}
    >
      {children}
    </button>
  );
}

function MessageStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'sent':
    case 'delivered':
      return <Badge variant="outline" className="text-[10px] py-0 h-5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono uppercase tracking-wider">Sent</Badge>;
    case 'failed':
      return <Badge variant="outline" className="text-[10px] py-0 h-5 bg-destructive/10 text-destructive border-destructive/20 font-mono uppercase tracking-wider">Failed</Badge>;
    case 'queued':
    default:
      return <Badge variant="outline" className="text-[10px] py-0 h-5 bg-muted text-muted-foreground font-mono uppercase tracking-wider border-border/50">Queued</Badge>;
  }
}