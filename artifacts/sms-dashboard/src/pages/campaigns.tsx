import { useState } from "react";
import { 
  useListCampaigns,
  getListCampaignsQueryKey,
  useCreateCampaign,
  useDeleteCampaign,
  useSendCampaign,
  usePauseCampaign,
  useCancelCampaign,
  useListDevices,
  useListContactLists
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Play,
  Pause,
  XCircle,
  Eye,
  CheckCircle2,
  Clock,
  Smartphone,
  Users
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const campaignFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  message: z.string().min(1, "Message content is required").max(1600, "Message too long"),
  deviceId: z.coerce.number().min(1, "Please select a device"),
  contactListId: z.coerce.number().min(1, "Please select a contact list")
});

export default function Campaigns() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: campaigns, isLoading } = useListCampaigns({
    query: {
      queryKey: getListCampaignsQueryKey()
    }
  });

  const { data: devices } = useListDevices({ query: { queryKey: ['devices'] } });
  const { data: lists } = useListContactLists({ query: { queryKey: ['contact-lists'] } });

  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const sendCampaign = useSendCampaign();
  const pauseCampaign = usePauseCampaign();
  const cancelCampaign = useCancelCampaign();

  const form = useForm<z.infer<typeof campaignFormSchema>>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      message: "",
      deviceId: 0,
      contactListId: 0
    }
  });

  function onSubmitCreate(values: z.infer<typeof campaignFormSchema>) {
    createCampaign.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        setCreateDialogOpen(false);
        form.reset();
        toast({ title: "Campaign created successfully" });
      },
      onError: () => {
        toast({ title: "Failed to create campaign", variant: "destructive" });
      }
    });
  }

  function handleDelete(id: number) {
    if (confirm("Are you sure you want to delete this campaign? It will be removed from history.")) {
      deleteCampaign.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: "Campaign deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete campaign", variant: "destructive" });
        }
      });
    }
  }

  function handleAction(action: 'send' | 'pause' | 'cancel', id: number) {
    const mutator = action === 'send' ? sendCampaign : action === 'pause' ? pauseCampaign : cancelCampaign;
    const actionName = action === 'send' ? 'started' : action === 'pause' ? 'paused' : 'cancelled';
    
    if (action === 'cancel' && !confirm("Are you sure you want to cancel this campaign? It cannot be resumed.")) {
      return;
    }

    mutator.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        toast({ title: `Campaign ${actionName}` });
      },
      onError: () => {
        toast({ title: `Failed to ${action} campaign`, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create, monitor, and manage your bulk SMS blasts.
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create SMS Campaign</DialogTitle>
              <DialogDescription>
                Set up a new bulk message blast to a contact list via a connected device.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Campaign Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Black Friday Promo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="contactListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target List</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value ? String(field.value) : undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a list" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {lists?.map(list => (
                              <SelectItem key={list.id} value={String(list.id)}>
                                {list.name} ({list.contactCount} contacts)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gateway Device</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value ? String(field.value) : undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a device" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {devices?.map(device => (
                              <SelectItem key={device.id} value={String(device.id)} disabled={device.status !== 'online' && device.status !== 'idle'}>
                                {device.name} {device.status === 'offline' ? '(Offline)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex justify-between">
                        <span>Message Template</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          {field.value?.length || 0}/160 chars (approx. {Math.ceil((field.value?.length || 1) / 160)} segment)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Write your SMS content here..." 
                          className="min-h-[120px] font-mono text-sm resize-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={createCampaign.isPending}>
                    {createCampaign.isPending ? "Creating..." : "Save Draft"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-md flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur z-10">
              <TableRow>
                <TableHead className="w-[250px]">Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[300px]">Progress</TableHead>
                <TableHead>Routing</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-32 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : campaigns && campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="group hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <div className="font-semibold text-sm">{campaign.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[200px]" title={campaign.message}>
                          {campaign.message}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted-foreground">{campaign.sentCount} / {campaign.totalCount} sent</span>
                          <span className="font-medium text-foreground">
                            {campaign.totalCount > 0 ? Math.round((campaign.sentCount / campaign.totalCount) * 100) : 0}%
                          </span>
                        </div>
                        <Progress 
                          value={campaign.totalCount > 0 ? (campaign.sentCount / campaign.totalCount) * 100 : 0} 
                          className="h-2"
                        />
                        {campaign.failedCount > 0 && (
                          <div className="text-[10px] text-destructive flex items-center gap-1 font-mono">
                            <XCircle className="w-3 h-3" /> {campaign.failedCount} failures
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[120px]" title={campaign.contactListName || ''}>
                            {campaign.contactListName || 'Unknown List'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[120px] font-mono" title={campaign.deviceName || ''}>
                            {campaign.deviceName || 'Unknown Device'}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        {campaign.status === 'draft' && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 px-2 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => handleAction('send', campaign.id)}
                            disabled={sendCampaign.isPending}
                          >
                            <Play className="w-3.5 h-3.5" /> Start
                          </Button>
                        )}
                        {campaign.status === 'paused' && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 px-2 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => handleAction('send', campaign.id)}
                            disabled={sendCampaign.isPending}
                          >
                            <Play className="w-3.5 h-3.5" /> Resume
                          </Button>
                        )}
                        {campaign.status === 'sending' && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 px-2 gap-1 bg-amber-500 text-white hover:bg-amber-600"
                            onClick={() => handleAction('pause', campaign.id)}
                            disabled={pauseCampaign.isPending}
                          >
                            <Pause className="w-3.5 h-3.5" /> Pause
                          </Button>
                        )}
                        {(campaign.status === 'sending' || campaign.status === 'paused') && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2 gap-1 text-destructive hover:bg-destructive/10"
                            onClick={() => handleAction('cancel', campaign.id)}
                            disabled={cancelCampaign.isPending}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => setLocation(`/campaigns/${campaign.id}`)}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </Button>

                        {(campaign.status === 'draft' || campaign.status === 'completed' || campaign.status === 'cancelled') && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(campaign.id)}
                            disabled={deleteCampaign.isPending}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Megaphone className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No campaigns found</p>
                      <p className="text-sm max-w-sm mt-1">Create a campaign to start sending your bulk SMS messages.</p>
                      <Button variant="outline" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Campaign
                      </Button>
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

function CampaignStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'sending':
      return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-mono"><Play className="w-3 h-3 mr-1" /> Sending</Badge>;
    case 'paused':
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-mono"><Pause className="w-3 h-3 mr-1" /> Paused</Badge>;
    case 'completed':
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
    case 'draft':
    default:
      return <Badge variant="outline" className="font-mono bg-muted"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
  }
}