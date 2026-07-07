import { useState, useCallback, useRef } from "react";
import { 
  useListDevices, 
  getListDevicesQueryKey,
  useCreateDevice,
  useDeleteDevice,
  useGetDeviceConnect
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Smartphone, 
  Plus, 
  Trash2, 
  Battery, 
  BatteryMedium, 
  BatteryFull, 
  Signal, 
  SignalHigh, 
  SignalMedium, 
  SignalLow,
  QrCode,
  AlertTriangle,
  Copy,
  Check,
  CreditCard,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phoneNumber: z.string().min(5, "Phone number is required"),
  simSlot: z.enum(["default", "0", "1"]).optional(),
});

export default function Devices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [connectDeviceId, setConnectDeviceId] = useState<number | null>(null);

  const { data: devices, isLoading } = useListDevices({
    query: {
      queryKey: getListDevicesQueryKey()
    }
  });

  const createDevice = useCreateDevice();
  const deleteDevice = useDeleteDevice();

  // Real-time: refresh device list on status / registration events
  const invalidateDevices = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
  }, [queryClient]);
  useWebSocket("device:status",     invalidateDevices);
  useWebSocket("device:registered", invalidateDevices);
  useWebSocket("device:removed",    invalidateDevices);
  useWebSocket("device:offline",    invalidateDevices);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      simSlot: "default",
    }
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    const simSlot = values.simSlot === "0" ? 0 : values.simSlot === "1" ? 1 : null;
    createDevice.mutate({ data: { name: values.name, phoneNumber: values.phoneNumber, simSlot } }, {
      onSuccess: (newDevice) => {
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setCreateDialogOpen(false);
        form.reset();
        toast({ title: "Device registered successfully" });
        setConnectDeviceId(newDevice.id);
      },
      onError: () => {
        toast({ title: "Failed to register device", variant: "destructive" });
      }
    });
  }

  function handleDelete(id: number) {
    if (confirm("Are you sure you want to remove this device? This will break any running campaigns using it.")) {
      deleteDevice.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          toast({ title: "Device removed" });
        },
        onError: () => {
          toast({ title: "Failed to remove device", variant: "destructive" });
        }
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Devices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your connected Android devices to be used as SMS gateways.
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Register Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Device</DialogTitle>
              <DialogDescription>
                Add a new Android phone to your SMS gateway cluster. You will be provided with a connection QR code after registration.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Galaxy S21 - Carrier A" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+917207860240" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="simSlot"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        SIM Card (for dual-SIM phones)
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Use device default SIM" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="default">Use device default SIM</SelectItem>
                          <SelectItem value="0">SIM 1 — slot 0</SelectItem>
                          <SelectItem value="1">SIM 2 — slot 1</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createDevice.isPending}>
                    {createDevice.isPending ? "Registering..." : "Register Device"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[280px]">Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SIM</TableHead>
                <TableHead>Battery & Signal</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : devices && devices.length > 0 ? (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{device.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{device.phoneNumber}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DeviceStatusBadge status={device.status} />
                    </TableCell>
                    <TableCell>
                      {(device as unknown as { simSlot?: number | null }).simSlot != null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2 py-0.5 rounded-md">
                          <CreditCard className="w-3 h-3" />
                          SIM {((device as unknown as { simSlot: number }).simSlot) + 1}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">default</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5" title="Battery">
                          <BatteryIcon level={device.batteryLevel} />
                          <span className="text-sm font-mono">{device.batteryLevel ? `${device.batteryLevel}%` : '--'}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Signal">
                          <SignalIcon level={device.signalStrength} />
                          <span className="text-sm font-mono">{device.signalStrength ?? '--'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true }) : 'Never'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => setConnectDeviceId(device.id)}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          Connect
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(device.id)}
                          disabled={deleteDevice.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Smartphone className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No devices registered</p>
                      <p className="text-sm max-w-sm mt-1">Register an Android device to start using it as an SMS gateway for your campaigns.</p>
                      <Button variant="outline" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Register Device
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Connection Dialog */}
      <ConnectDialog 
        deviceId={connectDeviceId} 
        onClose={() => setConnectDeviceId(null)} 
      />
    </div>
  );
}


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5 shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

function ConnectDialog({ deviceId, onClose }: { deviceId: number | null; onClose: () => void }) {
  const { data: connectInfo, isLoading } = useGetDeviceConnect(
    deviceId as number,
    { query: { enabled: !!deviceId, queryKey: ['device-connect', deviceId] } }
  );
  const { data: deviceDetail } = useListDevices({
    query: { enabled: !!deviceId, queryKey: ['device-detail', deviceId] },
  });
  const currentDevice = deviceDetail?.find(d => d.id === deviceId);
  const simLabel =
    (currentDevice as unknown as { simSlot?: number | null } | undefined)?.simSlot === 0 ? 'SIM 1' :
    (currentDevice as unknown as { simSlot?: number | null } | undefined)?.simSlot === 1 ? 'SIM 2' :
    null;

  const steps = [
    {
      n: "1",
      title: "Install Expo Go on the Android phone",
      body: (
        <a
          href="https://play.google.com/store/apps/details?id=host.exp.exponent"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
        >
          <Download className="w-3 h-3" />
          Google Play — Expo Go
          <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
    {
      n: "2",
      title: "Open the SMS Gateway app in Expo Go",
      body: (
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          In Replit, click the <span className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">⊙</span> dropdown in the preview bar and select <strong>SMS Gateway App</strong>. Scan the QR code shown there with Expo Go.
        </p>
      ),
    },
    {
      n: "3",
      title: "In the app, point the camera at this QR code",
      body: (
        <p className="text-xs text-muted-foreground mt-1">
          The device connects instantly — no typing, no tokens, nothing else.
        </p>
      ),
    },
  ];

  return (
    <Dialog open={!!deviceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            Connect Device
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with the SMS Gateway app to start dispatching messages through this phone.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Skeleton className="w-52 h-52 rounded-xl" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
        ) : connectInfo ? (
          <div className="space-y-6">

            {/* ── QR code ── */}
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100">
                <QRCodeSVG value={connectInfo.qrData} size={210} level="H" includeMargin={false} />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold">{currentDevice?.name ?? 'Device'}</p>
                <p className="text-xs text-muted-foreground font-mono">{currentDevice?.phoneNumber}</p>
                {simLabel && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2 py-0.5 rounded-full mt-1">
                    {simLabel}
                  </span>
                )}
              </div>
            </div>

            {/* ── Steps ── */}
            <div className="space-y-4">
              {steps.map(({ n, title, body }) => (
                <div key={n} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-bold flex items-center justify-center mt-0.5">
                    {n}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{title}</p>
                    {body}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Manual URL fallback ── */}
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                No camera? Paste this URL in the app instead:
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={connectInfo.connectUrl}
                  className="font-mono text-xs bg-muted h-8"
                />
                <CopyButton text={connectInfo.connectUrl} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-destructive py-10 gap-2">
            <AlertTriangle className="w-10 h-10 opacity-40" />
            <p className="text-sm">Failed to load connection data</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" /> Online</Badge>;
    case 'offline':
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono"><div className="w-1.5 h-1.5 rounded-full bg-destructive mr-1.5" /> Offline</Badge>;
    case 'idle':
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-mono"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" /> Idle</Badge>;
    default:
      return <Badge variant="outline" className="font-mono">{status}</Badge>;
  }
}

function BatteryIcon({ level }: { level?: number | null }) {
  if (level === null || level === undefined) return <Battery className="w-4 h-4 opacity-30" />;
  if (level > 80) return <BatteryFull className="w-4 h-4 text-emerald-500" />;
  if (level > 30) return <BatteryMedium className="w-4 h-4 text-primary" />;
  return <Battery className="w-4 h-4 text-destructive" />;
}

function SignalIcon({ level }: { level?: number | null }) {
  if (level === null || level === undefined) return <Signal className="w-4 h-4 opacity-30" />;
  if (level > 3) return <SignalHigh className="w-4 h-4 text-emerald-500" />;
  if (level > 1) return <SignalMedium className="w-4 h-4 text-primary" />;
  return <SignalLow className="w-4 h-4 text-destructive" />;
}