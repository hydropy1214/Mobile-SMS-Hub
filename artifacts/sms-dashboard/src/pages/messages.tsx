import { useState } from "react";
import { 
  useListMessages,
  getListMessagesQueryKey,
  useListCampaigns
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { 
  MessageSquare, 
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  Megaphone
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Messages() {
  const [filterCampaignId, setFilterCampaignId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: messages, isLoading } = useListMessages({
    campaignId: filterCampaignId !== "all" ? parseInt(filterCampaignId) : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined
  }, {
    query: {
      queryKey: ['messages-history', { campaignId: filterCampaignId, status: filterStatus }]
    }
  });

  const { data: campaigns } = useListCampaigns({
    query: { queryKey: ['campaigns'] }
  });

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Message History</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Complete log of all SMS messages dispatched through the system.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search messages... (UI only)" 
            className="pl-9 bg-background"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={filterCampaignId} onValueChange={setFilterCampaignId}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] bg-background">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="sent">Sent / Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-md flex-1 flex flex-col min-h-0 border-border/50">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur z-10 shadow-sm shadow-border/50">
              <TableRow>
                <TableHead className="w-[180px]">Status</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="w-[30%]">Context</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="text-right w-[150px]">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-full max-w-[200px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : messages && messages.length > 0 ? (
                messages.map((msg) => (
                  <TableRow key={msg.id} className="hover:bg-muted/30">
                    <TableCell>
                      <MessageStatusBadge status={msg.status} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{msg.contactName || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{msg.phoneNumber}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Megaphone className="w-3.5 h-3.5 text-muted-foreground" />
                          {msg.campaignId ? (
                            <Link href={`/campaigns/${msg.campaignId}`} className="hover:underline font-medium text-primary">
                              {msg.campaignName || `Campaign #${msg.campaignId}`}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Direct Message</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span className="truncate font-mono" title={msg.deviceName || ''}>
                            {msg.deviceName || `Device #${msg.deviceId}`}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono text-muted-foreground truncate max-w-[300px]" title={msg.messageText || ''}>
                        {msg.messageText || <span className="opacity-50 italic">Content unavailable</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-xs text-muted-foreground font-mono">
                        {format(new Date(msg.sentAt || msg.createdAt), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {format(new Date(msg.sentAt || msg.createdAt), 'HH:mm:ss')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No messages found</p>
                      <p className="text-sm max-w-sm mt-1">Adjust your filters to see more results.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function MessageStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'sent':
    case 'delivered':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono gap-1">
          <CheckCircle2 className="w-3 h-3" /> Sent
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono gap-1">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
    case 'dispatched':
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 font-mono gap-1">
          <Clock className="w-3 h-3" /> Sending
        </Badge>
      );
    case 'queued':
    default:
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground font-mono gap-1">
          <Clock className="w-3 h-3" /> Queued
        </Badge>
      );
  }
}