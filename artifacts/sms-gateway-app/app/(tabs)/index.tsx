/**
 * Main screen — three states:
 *   idle / error   →  ScannerScreen  (QR scan + paste fallback)
 *   connecting     →  ConnectingScreen
 *   connected      →  GatewayScreen
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { QRScannerView, useCameraPermissions } from '@/components/QRScannerView';
import {
  useGateway,
  type ActivityEntry,
  type SimLabel,
} from '@/context/GatewayContext';

const IS_WEB = Platform.OS === 'web';

// ─── Sim badge ────────────────────────────────────────────────────────────────

function SimBadge({ label, colors }: { label: SimLabel; colors: ReturnType<typeof useColors> }) {
  const color =
    label === 'SIM 1' ? '#3b82f6' :
    label === 'SIM 2' ? '#a855f7' :
    colors.mutedForeground;

  return (
    <View style={[simBadgeS.pill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[simBadgeS.text, { color }]}>{label}</Text>
    </View>
  );
}

const simBadgeS = StyleSheet.create({
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 },
});

// ─── Scanner screen ───────────────────────────────────────────────────────────

function ScannerScreen() {
  const colors = useColors();
  const { connect, status, errorMessage } = useGateway();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const [showPaste, setShowPaste] = useState(IS_WEB);
  const [pasteUrl, setPasteUrl] = useState('');
  const isError = status === 'error';

  const handleScan = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    connect(data).finally(() => { scannedRef.current = false; });
  };

  const handlePasteConnect = () => {
    Keyboard.dismiss();
    if (!pasteUrl.trim()) return;
    connect(pasteUrl);
  };

  // On web — skip camera entirely, show paste input
  if (IS_WEB) {
    return (
      <View style={[scanS.container, { paddingTop: 67 + insets.top, paddingBottom: 34 }]}>
        <PasteFallback
          colors={colors}
          value={pasteUrl}
          onChange={setPasteUrl}
          onConnect={handlePasteConnect}
          errorMessage={isError ? errorMessage : null}
        />
      </View>
    );
  }

  // Camera permission not yet determined
  if (!permission) {
    return <View style={[scanS.container, { justifyContent: 'center', alignItems: 'center' }]} />;
  }

  // Camera permission denied
  if (!permission.granted) {
    return (
      <View style={[scanS.container, { paddingTop: insets.top + 24, paddingHorizontal: 28 }]}>
        <View style={scanS.permDenied}>
          <Feather name="camera-off" size={40} color={colors.mutedForeground} />
          <Text style={[scanS.permTitle, { color: colors.foreground }]}>Camera access needed</Text>
          <Text style={[scanS.permSub, { color: colors.mutedForeground }]}>
            SMS Gateway needs the camera to scan the QR code from your dashboard.
          </Text>
          <Pressable
            style={({ pressed }) => [scanS.permBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
            onPress={requestPermission}
          >
            <Text style={[scanS.permBtnText, { color: colors.primaryForeground }]}>Allow Camera</Text>
          </Pressable>
          <Pressable style={scanS.pasteToggle} onPress={() => setShowPaste(true)}>
            <Text style={[scanS.pasteToggleText, { color: colors.mutedForeground }]}>Paste URL instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={scanS.container}>
      {/* Camera fills the screen */}
      {!showPaste ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScan}
        />
      ) : null}

      {/* Dark overlay at top */}
      <View
        style={[
          scanS.topOverlay,
          { paddingTop: insets.top + 16, backgroundColor: showPaste ? colors.background : 'rgba(0,0,0,0.72)' },
        ]}
      >
        <View style={scanS.logoRow}>
          <Feather name="radio" size={20} color={colors.primary} />
          <Text style={scanS.logoText}>SMS Gateway</Text>
        </View>
        {!showPaste && (
          <Text style={scanS.scanInstruction}>
            Point at the QR code on the{'\n'}Devices page of your dashboard
          </Text>
        )}
      </View>

      {/* Scan frame (native camera view only) */}
      {!showPaste && (
        <View style={scanS.frameWrapper} pointerEvents="none">
          <View style={scanS.frame}>
            {/* Four corner markers */}
            {(['TL', 'TR', 'BL', 'BR'] as const).map(pos => (
              <View
                key={pos}
                style={[
                  scanS.corner,
                  pos.includes('T') ? { top: -2 } : { bottom: -2 },
                  pos.includes('L') ? { left: -2 } : { right: -2 },
                  pos === 'TL' && { borderRightWidth: 0, borderBottomWidth: 0 },
                  pos === 'TR' && { borderLeftWidth: 0, borderBottomWidth: 0 },
                  pos === 'BL' && { borderRightWidth: 0, borderTopWidth: 0 },
                  pos === 'BR' && { borderLeftWidth: 0, borderTopWidth: 0 },
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Error banner */}
      {isError && errorMessage ? (
        <View style={[scanS.errorBanner, { backgroundColor: '#f85149ee' }]}>
          <Feather name="alert-circle" size={14} color="#fff" />
          <Text style={scanS.errorBannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Bottom bar */}
      <View
        style={[
          scanS.bottomBar,
          {
            paddingBottom: insets.bottom + 24,
            backgroundColor: showPaste ? colors.background : 'rgba(0,0,0,0.72)',
          },
        ]}
      >
        {showPaste ? (
          <PasteFallback
            colors={colors}
            value={pasteUrl}
            onChange={setPasteUrl}
            onConnect={handlePasteConnect}
            errorMessage={null}
          />
        ) : (
          <Pressable style={scanS.pasteToggle} onPress={() => setShowPaste(true)}>
            <Feather name="link" size={14} color="rgba(255,255,255,0.6)" />
            <Text style={[scanS.pasteToggleText, { color: 'rgba(255,255,255,0.6)' }]}>
              Paste URL instead
            </Text>
          </Pressable>
        )}

        {showPaste && !IS_WEB && (
          <Pressable style={scanS.backToScan} onPress={() => { setShowPaste(false); setPasteUrl(''); }}>
            <Feather name="camera" size={14} color={colors.mutedForeground} />
            <Text style={[scanS.pasteToggleText, { color: colors.mutedForeground }]}>Scan QR instead</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PasteFallback({
  colors,
  value,
  onChange,
  onConnect,
  errorMessage,
}: {
  colors: ReturnType<typeof useColors>;
  value: string;
  onChange: (v: string) => void;
  onConnect: () => void;
  errorMessage: string | null;
}) {
  return (
    <View style={pasteS.container}>
      <View style={pasteS.logoArea}>
        <View style={[pasteS.icon, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="radio" size={32} color={colors.primary} />
        </View>
        <Text style={[pasteS.title, { color: colors.foreground }]}>SMS Gateway</Text>
        <Text style={[pasteS.sub, { color: colors.mutedForeground }]}>
          Paste the connect URL from your dashboard
        </Text>
      </View>

      <View style={[pasteS.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[pasteS.label, { color: colors.mutedForeground }]}>CONNECT URL</Text>
        <TextInput
          style={[pasteS.input, { backgroundColor: colors.inputBackground, borderColor: colors.input, color: colors.foreground }]}
          value={value}
          onChangeText={onChange}
          placeholder="https://your-server/mobile?deviceId=…&token=…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        {errorMessage ? (
          <View style={[pasteS.errBox, { backgroundColor: '#f8514920', borderColor: '#f8514944' }]}>
            <Feather name="alert-circle" size={13} color="#f85149" />
            <Text style={pasteS.errText}>{errorMessage}</Text>
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [pasteS.btn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
          onPress={onConnect}
        >
          <Text style={[pasteS.btnText, { color: colors.primaryForeground }]}>Connect</Text>
        </Pressable>
        <Text style={[pasteS.hint, { color: colors.mutedForeground }]}>
          Dashboard → Devices → tap a device → copy the connect URL
        </Text>
      </View>
    </View>
  );
}

// ─── Connecting screen ────────────────────────────────────────────────────────

function ConnectingScreen() {
  const colors = useColors();
  const { connectionDetails, disconnect } = useGateway();
  const insets = useSafeAreaInsets();
  const host = connectionDetails?.serverUrl.replace(/^https?:\/\//, '') ?? '…';

  return (
    <View style={[connS.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[connS.title, { color: colors.foreground }]}>Connecting</Text>
      <Text style={[connS.sub, { color: colors.mutedForeground }]}>{host}</Text>
      <Pressable style={({ pressed }) => [connS.cancel, pressed && { opacity: 0.7 }]} onPress={disconnect}>
        <Text style={[connS.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

// ─── Gateway screen ───────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityEntry }) {
  const colors = useColors();
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const icon = item.status === 'sent' ? 'check-circle' : item.status === 'failed' ? 'x-circle' : 'loader';
  const iconColor = item.status === 'sent' ? '#22c55e' : item.status === 'failed' ? '#f85149' : '#d29922';

  return (
    <View style={[actS.row, { borderBottomColor: colors.border }]}>
      <Feather name={icon as any} size={15} color={iconColor} style={{ marginTop: 1 }} />
      <View style={actS.content}>
        <View style={actS.topRow}>
          <Text style={[actS.phone, { color: colors.foreground }]}>{item.phone}</Text>
          <SimBadge label={item.simLabel} colors={colors} />
        </View>
        <Text style={[actS.msg, { color: colors.mutedForeground }]} numberOfLines={1}>{item.text}</Text>
      </View>
      <Text style={[actS.time, { color: colors.mutedForeground }]}>{time}</Text>
    </View>
  );
}

function GatewayScreen() {
  const colors = useColors();
  const { connectionDetails, currentMessage, stats, activity, batteryLevel, pollError, disconnect } = useGateway();
  const insets = useSafeAreaInsets();
  const IS_WEB_LOCAL = Platform.OS === 'web';

  const host = connectionDetails?.serverUrl.replace(/^https?:\/\//, '') ?? '';
  const batText = batteryLevel !== null ? `${batteryLevel}%` : null;

  return (
    <View style={[gwS.container, {
      backgroundColor: colors.background,
      paddingTop: IS_WEB_LOCAL ? 67 : insets.top,
      paddingBottom: IS_WEB_LOCAL ? 34 : insets.bottom,
    }]}>

      {/* ── Header ── */}
      <View style={[gwS.header, { borderBottomColor: colors.border }]}>
        <View style={gwS.statusRow}>
          <View style={[gwS.dot, { backgroundColor: pollError ? '#d29922' : '#22c55e' }]} />
          <Text style={[gwS.statusLabel, { color: colors.foreground }]}>
            {pollError ? 'Reconnecting…' : 'Connected'}
          </Text>
          {pollError && (
            <Feather name="wifi-off" size={13} color="#d29922" style={{ marginLeft: 4 }} />
          )}
        </View>
        <View style={gwS.headerRight}>
          {batText && (
            <View style={[gwS.batPill, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="battery-charging" size={12} color={colors.mutedForeground} />
              <Text style={[gwS.batText, { color: colors.mutedForeground }]}>{batText}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [gwS.disconnectBtn, pressed && { opacity: 0.7 }]}
            onPress={disconnect}
            hitSlop={8}
          >
            <Feather name="power" size={18} color="#f85149" />
          </Pressable>
        </View>
      </View>

      {/* ── Server host ── */}
      <Text style={[gwS.hostText, { color: colors.mutedForeground }]} numberOfLines={1}>{host}</Text>

      {/* ── Current message card ── */}
      {currentMessage ? (
        <View style={[gwS.currentCard, { backgroundColor: colors.card, borderColor: colors.primary + '55' }]}>
          <View style={gwS.currentTop}>
            <View style={[gwS.sendingBadge, { backgroundColor: colors.primary + '22' }]}>
              <View style={[gwS.sendingDot, { backgroundColor: colors.primary }]} />
              <Text style={[gwS.sendingLabel, { color: colors.primary }]}>SENDING NOW</Text>
            </View>
            <SimBadge label={currentMessage.simLabel} colors={colors} />
          </View>
          <Text style={[gwS.currentPhone, { color: colors.foreground }]}>{currentMessage.phone}</Text>
          <Text style={[gwS.currentText, { color: colors.mutedForeground }]} numberOfLines={3}>
            {currentMessage.text}
          </Text>
          {currentMessage.simLabel !== 'Default SIM' && (
            <View style={[gwS.simHint, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="info" size={12} color={colors.mutedForeground} />
              <Text style={[gwS.simHintText, { color: colors.mutedForeground }]}>
                In the SMS app, select {currentMessage.simLabel} before tapping Send
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[gwS.idleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="inbox" size={20} color={colors.mutedForeground} />
          <Text style={[gwS.idleText, { color: colors.mutedForeground }]}>
            Waiting for messages from your campaign…
          </Text>
        </View>
      )}

      {/* ── Stats ── */}
      <View style={gwS.statsRow}>
        {[
          { label: 'Sent',    value: stats.sent,    color: '#22c55e' },
          { label: 'Pending', value: stats.pending, color: '#d29922' },
          { label: 'Failed',  value: stats.failed,  color: '#f85149' },
        ].map(({ label, value, color }) => (
          <View key={label} style={[gwS.statCard, { backgroundColor: colors.card, borderColor: color + '33' }]}>
            <Text style={[gwS.statNum, { color }]}>{value}</Text>
            <Text style={[gwS.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Activity log ── */}
      <Text style={[gwS.sectionTitle, { color: colors.mutedForeground }]}>Activity</Text>
      <FlatList<ActivityEntry>
        data={activity}
        keyExtractor={item => item.uid}
        renderItem={({ item }) => <ActivityRow item={item} />}
        scrollEnabled={activity.length > 0}
        ListEmptyComponent={
          <Text style={[gwS.emptyLog, { color: colors.mutedForeground }]}>No messages sent yet</Text>
        }
      />
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { status } = useGateway();
  if (status === 'connecting') return <ConnectingScreen />;
  if (status === 'connected')  return <GatewayScreen />;
  return <ScannerScreen />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const scanS = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  topOverlay: { paddingHorizontal: 20, paddingBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  logoText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#fff' },
  scanInstruction: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20 },
  frameWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 220, height: 220, position: 'relative' },
  corner: {
    position: 'absolute',
    width: 28, height: 28,
    borderWidth: 3,
    borderColor: '#22c55e',
    borderRadius: 3,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 8,
  },
  errorBannerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#fff', flex: 1, lineHeight: 18 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  pasteToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', padding: 4 },
  pasteToggleText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  backToScan: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', padding: 4 },
  permDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  permTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 20, textAlign: 'center' },
  permSub: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  permBtn: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 32, marginTop: 8 },
  permBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});

const pasteS = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  logoArea: { alignItems: 'center', marginBottom: 28, marginTop: 12 },
  icon: { width: 70, height: 70, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginBottom: 6 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  card: { borderRadius: 12, borderWidth: 1, padding: 18 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  errBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 10, padding: 10, borderRadius: 7, borderWidth: 1 },
  errText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#f85149', flex: 1, lineHeight: 18 },
  btn: { marginTop: 14, borderRadius: 9, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 17 },
});

const connS = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  cancel: { marginTop: 8 },
  cancelText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
});

const gwS = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  statusRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  batPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  batText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  disconnectBtn: { padding: 4 },
  hostText: { fontFamily: 'Inter_400Regular', fontSize: 12, paddingHorizontal: 16, paddingVertical: 4 },
  currentCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1.5, padding: 16, gap: 8 },
  currentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  sendingDot: { width: 6, height: 6, borderRadius: 3 },
  sendingLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.6 },
  currentPhone: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  currentText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  simHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 9, borderRadius: 7, borderWidth: 1, marginTop: 2 },
  simHintText: { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1, lineHeight: 17 },
  idleCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  idleText: { fontFamily: 'Inter_400Regular', fontSize: 14, flex: 1 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 14, gap: 10 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center' },
  statNum: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  emptyLog: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', paddingTop: 24 },
});

const actS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  phone: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  msg: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  time: { fontFamily: 'Inter_400Regular', fontSize: 11 },
});
