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
  Terminal,
  Copy,
  Check,
  Zap,
  CreditCard,
  Share2,
  Code2,
  Globe,
  Download,
  MessageSquare,
  Mail,
  Repeat,
  ExternalLink
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

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

function buildTermuxScript(serverOrigin: string, token: string, simSlot?: number | null): string {
  const simLine = simSlot != null
    ? `SIM_SLOT=${simSlot}   # 0=SIM1 1=SIM2 — change to override`
    : `SIM_SLOT=""         # empty = use device default SIM`;

  return `#!/data/data/com.termux/files/usr/bin/bash
# ─────────────────────────────────────────────────────────
#  SMS Control — Termux Auto-Send Daemon
#  Sends SMS automatically via your SIM — no tap needed.
#  Requirements: Termux + Termux:API app + jq
#    pkg install termux-api jq
#    termux-setup-storage  (grant SMS permission when asked)
# ─────────────────────────────────────────────────────────

SERVER="${serverOrigin}"
TOKEN="${token}"
POLL_INTERVAL=4   # seconds between polls
${simLine}

echo "🚀 SMS Gateway daemon started"
echo "   Server : \$SERVER"
echo "   SIM    : \${SIM_SLOT:-default}"
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  RESPONSE=\$(curl -sf \\
    -H "Authorization: Bearer \$TOKEN" \\
    "\$SERVER/api/native/v1/messages" 2>/dev/null)

  if [ \$? -ne 0 ]; then
    echo "\$(date '+%H:%M:%S') ⚠ Server unreachable — retrying in \${POLL_INTERVAL}s"
    sleep \$POLL_INTERVAL
    continue
  fi

  COUNT=\$(echo "\$RESPONSE" | jq 'length' 2>/dev/null || echo 0)

  if [ "\$COUNT" -gt 0 ]; then
    echo "\$(date '+%H:%M:%S') 📨 \$COUNT message(s) to send"

    echo "\$RESPONSE" | jq -c '.[]' | while read -r msg; do
      ID=\$(echo "\$msg" | jq -r '.id')
      PHONE=\$(echo "\$msg" | jq -r '.phoneNumber')
      TEXT=\$(echo "\$msg" | jq -r '.messageText')
      MSG_SIM=\$(echo "\$msg" | jq -r '.simSlot // empty')
      ACTIVE_SIM=\${MSG_SIM:-\$SIM_SLOT}

      echo "\$(date '+%H:%M:%S') → Sending to \$PHONE (SIM: \${ACTIVE_SIM:-default}) …"

      SEND_ERR=\$(mktemp)
      if [ -n "\$ACTIVE_SIM" ]; then
        termux-sms-send -s "\$ACTIVE_SIM" -n "\$PHONE" "\$TEXT" 2>"\$SEND_ERR"
      else
        termux-sms-send -n "\$PHONE" "\$TEXT" 2>"\$SEND_ERR"
      fi
      SEND_EXIT=\$?
      rm -f "\$SEND_ERR"

      if [ \$SEND_EXIT -eq 0 ]; then
        STATUS="sent"
        echo "\$(date '+%H:%M:%S') ✓ Sent   #\$ID → \$PHONE"
      else
        STATUS="failed"
        echo "\$(date '+%H:%M:%S') ✗ Failed #\$ID → \$PHONE (exit \$SEND_EXIT)"
      fi

      curl -sf -X PATCH \\
        -H "Authorization: Bearer \$TOKEN" \\
        -H "Content-Type: application/json" \\
        -d "{\\"status\\":\\"\$STATUS\\"}" \\
        "\$SERVER/api/native/v1/messages/\$ID" > /dev/null 2>&1

      sleep 2
    done
  fi

  sleep \$POLL_INTERVAL
done`;
}

/** Download any text content as a file without hitting the server. */
function downloadBlob(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** One-shot poll script — for Tasker / cron. Exits after one sweep. */
function buildOnceScript(serverOrigin: string, token: string, simSlot?: number | null): string {
  const simLine = simSlot != null ? `SIM_SLOT=${simSlot}` : `SIM_SLOT=""`;
  return `#!/data/data/com.termux/files/usr/bin/bash
# SMS Control — One-Shot Poll (called by Tasker every ~30 sec)
# Place in ~/.termux/tasker/sms-once.sh  then chmod +x it
# Requirements: pkg install termux-api jq -y

SERVER="${serverOrigin}"
TOKEN="${token}"
${simLine}

RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/native/v1/messages" 2>/dev/null)
[ $? -ne 0 ] && exit 1

echo "$RESPONSE" | jq -c '.[]' 2>/dev/null | while read -r msg; do
  ID=$(echo "$msg" | jq -r '.id')
  PHONE=$(echo "$msg" | jq -r '.phoneNumber')
  TEXT=$(echo "$msg" | jq -r '.messageText')
  MSG_SIM=$(echo "$msg" | jq -r '.simSlot // empty')
  ACTIVE_SIM=\${MSG_SIM:-\$SIM_SLOT}

  if [ -n "\$ACTIVE_SIM" ]; then
    termux-sms-send -s "\$ACTIVE_SIM" -n "$PHONE" "$TEXT" 2>/dev/null; RC=$?
  else
    termux-sms-send -n "$PHONE" "$TEXT" 2>/dev/null; RC=$?
  fi

  STATUS=$([ $RC -eq 0 ] && echo sent || echo failed)
  curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
    -d "{\\"status\\":\\"$STATUS\\"}" "$SERVER/api/native/v1/messages/$ID" >/dev/null 2>&1
  sleep 1
done
`;
}

/** Python daemon script — cross-platform, generated client-side (no token in URL). */
function buildPythonScript(serverOrigin: string, token: string, simSlot?: number | null): string {
  const slotVal = simSlot != null ? String(simSlot) : "None";
  return `#!/usr/bin/env python3
"""
SMS Control — Python Daemon
Cross-platform (Windows / macOS / Linux).  Polls for pending messages and
dispatches them through your chosen SMS backend every ${4} seconds.

Requirements:
    pip install requests

IMPORTANT: Edit the send_sms() function below with your real SMS backend
before running. The default stub marks messages FAILED so nothing is lost.
"""

import time, sys, requests

SERVER      = "${serverOrigin}"
TOKEN       = "${token}"
SIM_SLOT    = ${slotVal}        # None = device default; 0 = SIM1, 1 = SIM2
POLL_INTERVAL = 4               # seconds

_headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


# ── Implement your SMS backend here ──────────────────────────────────────────

def send_sms(phone: str, text: str, sim_slot) -> bool:
    """
    Return True if the message was sent, False on failure.
    REPLACE this stub with one of the options below.

    ── Option A: USB / Bluetooth GSM modem (AT commands) ────────────────────
    import serial, time
    try:
        with serial.Serial('/dev/ttyUSB0', 115200, timeout=5) as s:
            s.write(b'AT+CMGF=1\\r'); time.sleep(0.3)
            s.write(f'AT+CMGS="{phone}"\\r'.encode()); time.sleep(0.3)
            s.write(text.encode() + b'\\x1a'); time.sleep(4)
        return True
    except Exception as e:
        print(f"  Modem error: {e}"); return False

    ── Option B: Africa's Talking API ───────────────────────────────────────
    import africastalking
    africastalking.initialize('username', 'api_key')
    africastalking.SMS.send(text, [phone])
    return True

    ── Option C: Twilio ─────────────────────────────────────────────────────
    from twilio.rest import Client
    Client('ACCOUNT_SID', 'AUTH_TOKEN').messages.create(
        body=text, from_='+1234567890', to=phone)
    return True
    """
    # Default stub — returns False so messages stay queued until you configure
    # a real backend.  Change the return value only after wiring up an SMS API.
    print(f"  [NOT CONFIGURED] Would send to {phone}: {text[:60]!r}")
    return False   # ← change to True only after real backend is working


# ── Daemon loop ───────────────────────────────────────────────────────────────

def main():
    print("🚀 SMS Control Python daemon started")
    print(f"   Server  : {SERVER}")
    print(f"   SIM slot: {SIM_SLOT if SIM_SLOT is not None else 'device default'}")
    print("   ⚠  Edit send_sms() before use — default stub marks messages FAILED")
    print("   Press Ctrl+C to stop\\n")

    while True:
        try:
            r = requests.get(f"{SERVER}/api/native/v1/messages", headers=_headers, timeout=15)
            r.raise_for_status()
            messages = r.json()

            if messages:
                print(f"[{time.strftime('%H:%M:%S')}] 📨 {len(messages)} pending")
                for msg in messages:
                    msg_id = msg["id"]
                    phone  = msg["phoneNumber"]
                    text   = msg.get("messageText") or ""
                    slot   = msg.get("simSlot")
                    if slot is None:
                        slot = SIM_SLOT

                    print(f"[{time.strftime('%H:%M:%S')}] → {phone} (SIM: {slot if slot is not None else 'default'})…")
                    try:
                        ok     = send_sms(phone, text, slot)
                        status = "sent" if ok else "failed"
                    except Exception as exc:
                        status = "failed"
                        print(f"  Error: {exc}")

                    try:
                        requests.patch(f"{SERVER}/api/native/v1/messages/{msg_id}",
                                       json={"status": status}, headers=_headers, timeout=10)
                    except Exception:
                        pass

                    print(f"[{time.strftime('%H:%M:%S')}] {'✓' if status == 'sent' else '✗'} {status.capitalize()} #{msg_id}")
                    time.sleep(2)

        except KeyboardInterrupt:
            print("\\nDaemon stopped."); sys.exit(0)
        except requests.exceptions.ConnectionError:
            print(f"[{time.strftime('%H:%M:%S')}] ⚠  Server unreachable — retrying…")
        except Exception as exc:
            print(f"[{time.strftime('%H:%M:%S')}] ⚠  {exc}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
`;
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

function ConnectDialog({ deviceId, onClose }: { deviceId: number | null, onClose: () => void }) {
  const { data: connectInfo, isLoading } = useGetDeviceConnect(
    deviceId as number,
    { query: { enabled: !!deviceId, queryKey: ['device-connect', deviceId] } }
  );

  const serverOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const { data: deviceDetail } = useListDevices({ query: { enabled: !!deviceId, queryKey: ['device-detail', deviceId] } });
  const currentDevice = deviceDetail?.find(d => d.id === deviceId);
  const simSlot = (currentDevice as unknown as { simSlot?: number | null } | undefined)?.simSlot ?? null;

  const termuxScript = connectInfo
    ? buildTermuxScript(serverOrigin, connectInfo.token, simSlot)
    : "";

  const daemonUrl   = connectInfo ? `${serverOrigin}/api/native/v1/daemon/${connectInfo.token}`        : "";
  const onceUrl     = connectInfo ? `${serverOrigin}/api/native/v1/once/${connectInfo.token}`           : "";
  const pythonUrl   = connectInfo ? `${serverOrigin}/api/native/v1/python-daemon/${connectInfo.token}` : "";

  function shareVia(method: "whatsapp" | "telegram" | "email" | "sms" | "native") {
    if (!connectInfo) return;
    const url  = connectInfo.connectUrl;
    const text = `Open this link on the phone to use it as an SMS gateway:\n${url}`;
    let href = "";
    switch (method) {
      case "whatsapp":  href = `https://wa.me/?text=${encodeURIComponent(text)}`; break;
      case "telegram":  href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("SMS gateway link")}`; break;
      case "email":     href = `mailto:?subject=SMS%20Gateway%20Link&body=${encodeURIComponent(text)}`; break;
      case "sms":       href = `sms:?body=${encodeURIComponent(text)}`; break;
      case "native":
        if (typeof navigator !== "undefined" && "share" in navigator) {
          void (navigator as Navigator & { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({ title: "SMS Gateway", text: "Connect your phone as SMS gateway", url });
          return;
        }
        return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={!!deviceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect Device</DialogTitle>
          <DialogDescription>
            Choose how to connect this phone as an SMS gateway.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Skeleton className="w-48 h-48 rounded-md" /></div>
        ) : connectInfo ? (
          <Tabs defaultValue="termux">
            {/* Scrollable tab list so all 6 fit */}
            <div className="overflow-x-auto pb-px">
              <TabsList className="inline-flex w-max gap-0.5 min-w-full">
                <TabsTrigger value="termux"  className="gap-1.5 text-xs px-3"><Zap className="w-3 h-3" />Termux</TabsTrigger>
                <TabsTrigger value="tasker"  className="gap-1.5 text-xs px-3"><Repeat className="w-3 h-3" />Tasker</TabsTrigger>
                <TabsTrigger value="browser" className="gap-1.5 text-xs px-3"><Globe className="w-3 h-3" />Browser</TabsTrigger>
                <TabsTrigger value="share"   className="gap-1.5 text-xs px-3"><Share2 className="w-3 h-3" />Share Link</TabsTrigger>
                <TabsTrigger value="python"  className="gap-1.5 text-xs px-3"><Code2 className="w-3 h-3" />Python</TabsTrigger>
                <TabsTrigger value="api"     className="gap-1.5 text-xs px-3"><Terminal className="w-3 h-3" />API</TabsTrigger>
              </TabsList>
            </div>

            {/* ── Termux ─────────────────────────────────────────── */}
            <TabsContent value="termux" className="space-y-3 mt-4">
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <p className="font-semibold">Fully automatic — no tap needed</p>
                <p className="text-xs opacity-80 mt-0.5">Uses the free Termux terminal + Termux:API to call your SIM directly.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Step 1 — Install both apps (Android):</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[["Termux", "F-Droid or Play Store"], ["Termux:API", "Companion app for SMS access"]].map(([name, desc]) => (
                    <div key={name} className="rounded-md border bg-muted/50 p-2.5">
                      <p className="font-mono font-semibold">{name}</p>
                      <p className="text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Step 2 — Install dependencies (once):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs">pkg install termux-api jq -y</code>
                  <CopyButton text="pkg install termux-api jq -y" />
                </div>
                <p className="text-xs text-muted-foreground">Grant SMS permission to Termux:API when prompted.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Step 3 — Download &amp; start the daemon:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs overflow-x-auto whitespace-nowrap">
                    curl -o ~/sms-daemon.sh '{daemonUrl}' && bash ~/sms-daemon.sh
                  </code>
                  <CopyButton text={`curl -o ~/sms-daemon.sh '${daemonUrl}' && bash ~/sms-daemon.sh`} />
                </div>
              </div>

              <div className="relative">
                <ScrollArea className="h-36 rounded-md border bg-zinc-950">
                  <pre className="p-3 text-[10px] font-mono text-zinc-300 leading-relaxed whitespace-pre">{termuxScript}</pre>
                </ScrollArea>
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <CopyButton text={termuxScript} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">Keep Termux open (use <span className="font-mono">tmux</span> to run in background). The daemon polls every 4 seconds.</p>
            </TabsContent>

            {/* ── Tasker ─────────────────────────────────────────── */}
            <TabsContent value="tasker" className="space-y-3 mt-4">
              <div className="rounded-lg border bg-purple-500/5 border-purple-500/20 p-3 text-sm text-purple-700 dark:text-purple-400">
                <p className="font-semibold">Tasker + Termux:Tasker — fully automatic</p>
                <p className="text-xs opacity-80 mt-0.5">Tasker triggers the SMS script every 30 s via the Termux:Tasker plugin. No daemon loop needed.</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {[["Termux", "F-Droid / Play"], ["Termux:API", "SMS access"], ["Termux:Tasker", "F-Droid / Play"], ["Tasker", "Play Store"], ["termux-api jq", "pkg install …"], ["sms-once.sh", "script below"]].map(([name, desc]) => (
                  <div key={name} className="rounded-md border bg-muted/50 p-2 text-center">
                    <p className="font-mono font-semibold text-[10px] leading-tight">{name}</p>
                    <p className="text-muted-foreground text-[10px]">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Setup steps</p>
                <ol className="space-y-2.5 text-xs text-muted-foreground list-none">
                  {([
                    {
                      label: "In Termux — install dependencies:",
                      code: "pkg install termux-api jq -y",
                    },
                    {
                      label: "Download the one-shot script then move it to the Tasker folder:",
                      extra: (
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs mt-1"
                          onClick={() => downloadBlob(buildOnceScript(serverOrigin, connectInfo.token, simSlot), "sms-once.sh")}>
                          <Download className="w-3 h-3" /> Download sms-once.sh
                        </Button>
                      ),
                      code: "mkdir -p ~/.termux/tasker && mv ~/sms-once.sh ~/.termux/tasker/",
                    },
                    {
                      label: "In Tasker — Profiles → + → Time → set Repeat every 30 sec",
                    },
                    {
                      label: "New Task → + → Action → Plugin → Termux:Tasker",
                    },
                    {
                      label: "Pencil icon → Executable: sms-once.sh  ·  tick Allow External Apps in Termux settings",
                    },
                  ] as Array<{ label: string; code?: string; extra?: React.ReactNode }>).map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/15 text-purple-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      <div className="flex-1">
                        <p>{step.label}</p>
                        {step.extra}
                        {step.code && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <code className="flex-1 rounded bg-muted px-2 py-1 font-mono text-[10px] overflow-x-auto whitespace-nowrap">{step.code}</code>
                            <CopyButton text={step.code} />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p><strong>Pro tip:</strong> Add a second profile — Event → Application → Termux (launched) — pointing to the same task. This re-triggers polling whenever Termux restarts.</p>
              </div>
            </TabsContent>

            {/* ── Browser ────────────────────────────────────────── */}
            <TabsContent value="browser" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-3 text-sm text-blue-700 dark:text-blue-400">
                <p className="font-semibold">Works on Android &amp; iOS — no app install</p>
                <p className="text-xs opacity-80 mt-0.5">Opens the SMS app pre-filled. You tap Send once per batch.</p>
              </div>
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-white p-4 rounded-xl border shadow-sm">
                  <QRCodeSVG value={connectInfo.qrData} size={160} level="H" includeMargin={false} />
                </div>
                <div className="w-full space-y-1.5">
                  <label className="text-sm font-medium">Connection URL</label>
                  <div className="flex gap-2">
                    <Input readOnly value={connectInfo.connectUrl} className="font-mono text-xs bg-muted" />
                    <CopyButton text={connectInfo.connectUrl} />
                  </div>
                  <p className="text-xs text-muted-foreground">Scan the QR code or type the URL in the phone's browser. Tap <strong>Send</strong> in your SMS app each time.</p>
                </div>
              </div>
            </TabsContent>

            {/* ── Share Link ─────────────────────────────────────── */}
            <TabsContent value="share" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-orange-500/5 border-orange-500/20 p-3 text-sm text-orange-700 dark:text-orange-400">
                <p className="font-semibold">No QR scanner needed</p>
                <p className="text-xs opacity-80 mt-0.5">Send the link to the phone via any messaging app and tap it directly.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Connection Link</label>
                <div className="flex gap-2">
                  <Input readOnly value={connectInfo.connectUrl} className="font-mono text-xs bg-muted" />
                  <CopyButton text={connectInfo.connectUrl} />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Send via</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => shareVia("whatsapp")}>
                    <MessageSquare className="w-4 h-4 text-green-500" />
                    WhatsApp
                  </Button>
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => shareVia("telegram")}>
                    <ExternalLink className="w-4 h-4 text-blue-500" />
                    Telegram
                  </Button>
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => shareVia("email")}>
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email
                  </Button>
                  <Button variant="outline" className="gap-2 justify-start" onClick={() => shareVia("sms")}>
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    SMS / iMessage
                  </Button>
                </div>
                {"share" in navigator && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => shareVia("native")}>
                    <Share2 className="w-4 h-4" />
                    Share via System Sheet…
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">The link opens the browser gateway on the phone. Keep the page open so it can check for pending messages.</p>
            </TabsContent>

            {/* ── Python ─────────────────────────────────────────── */}
            <TabsContent value="python" className="space-y-3 mt-4">
              <div className="rounded-lg border bg-sky-500/5 border-sky-500/20 p-3 text-sm text-sky-700 dark:text-sky-400">
                <p className="font-semibold">Works on Windows, macOS &amp; Linux</p>
                <p className="text-xs opacity-80 mt-0.5">Plug in a USB GSM modem, Bluetooth dongle, or any SMS API. Requires Python 3 + <span className="font-mono">pip install requests</span>.</p>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                ⚠ Edit <span className="font-mono">send_sms()</span> in the script with your real SMS backend before running. The default stub marks messages <strong>failed</strong> — no SMS is sent until configured.
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Download the script (generated in-browser — token never touches a URL):</p>
                <Button variant="outline" className="w-full gap-2"
                  onClick={() => downloadBlob(buildPythonScript(serverOrigin, connectInfo.token, simSlot), "sms-daemon.py")}>
                  <Download className="w-4 h-4" />
                  Download sms-daemon.py
                </Button>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Run it:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs">pip install requests &amp;&amp; python3 sms-daemon.py</code>
                  <CopyButton text="pip install requests && python3 sms-daemon.py" />
                </div>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Supported backends (edit <span className="font-mono">send_sms()</span>):</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>USB / Bluetooth GSM modem — AT commands via <span className="font-mono">pyserial</span></li>
                  <li>Gammu / python-gammu</li>
                  <li>Africa's Talking · Twilio · any HTTP SMS API</li>
                </ul>
              </div>
            </TabsContent>

            {/* ── API ────────────────────────────────────────────── */}
            <TabsContent value="api" className="space-y-3 mt-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-semibold">Native REST API</p>
                <p className="text-xs text-muted-foreground mt-0.5">Build your own integration. All endpoints use Bearer token auth.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your token</p>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{connectInfo.token}</code>
                  <CopyButton text={connectInfo.token} />
                </div>
              </div>

              <ScrollArea className="h-56 rounded-md border bg-zinc-950">
                <pre className="p-3 text-[10px] font-mono text-zinc-300 leading-relaxed whitespace-pre">{`# Fetch pending messages
curl -H "Authorization: Bearer ${connectInfo.token}" \\
  ${serverOrigin}/api/native/v1/messages

# Response: [{id, phoneNumber, messageText, simSlot}]

# Mark as sent / failed
curl -X PATCH \\
  -H "Authorization: Bearer ${connectInfo.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"sent"}' \\
  ${serverOrigin}/api/native/v1/messages/{id}

# Heartbeat (device stays Online)
curl -X POST \\
  -H "Authorization: Bearer ${connectInfo.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"online","batteryLevel":85,"signalStrength":3}' \\
  ${serverOrigin}/api/native/v1/heartbeat

# Status values: queued | dispatched | sent | failed | delivered`}</pre>
              </ScrollArea>

              <p className="text-xs text-muted-foreground">Poll <span className="font-mono">/messages</span> every 4–30 seconds. PATCH each message immediately after sending. POST <span className="font-mono">/heartbeat</span> at least once per minute to stay Online.</p>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center text-destructive py-8">
            <AlertTriangle className="w-12 h-12 mb-2 opacity-50" />
            <p>Failed to load connection data</p>
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