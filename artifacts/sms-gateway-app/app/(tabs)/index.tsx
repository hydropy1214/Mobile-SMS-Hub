import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useGateway, type ActivityEntry } from '@/context/GatewayContext';

// ── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen() {
  const colors = useColors();
  const { connect, connectManual, status, errorMessage } = useGateway();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [url, setUrl] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [token, setToken] = useState('');

  const isConnecting = status === 'connecting';

  const handleConnect = () => {
    if (showManual) {
      connectManual(serverUrl, deviceId, token);
    } else {
      connect(url);
    }
  };

  const s = styles(colors);

  return (
    <ScrollView
      contentContainerStyle={[
        s.setupContainer,
        {
          paddingTop: isWeb ? 67 + 32 : insets.top + 32,
          paddingBottom: isWeb ? 34 + 32 : insets.bottom + 32,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Logo */}
      <View style={s.logoArea}>
        <View style={s.logoIcon}>
          <Feather name="radio" size={38} color={colors.primary} />
        </View>
        <Text style={s.logoTitle}>SMS Gateway</Text>
        <Text style={s.logoSub}>
          Connect your Android device and start dispatching messages automatically
        </Text>
      </View>

      {/* URL paste card */}
      <View style={s.card}>
        {!showManual ? (
          <>
            <Text style={s.label}>Connect URL</Text>
            <Text style={s.hint}>
              Go to your dashboard → Devices → tap a device → copy the connect URL
            </Text>
            <TextInput
              style={s.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://your-server/mobile?deviceId=…&token=…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
            />
          </>
        ) : (
          <>
            <Text style={s.label}>Server URL</Text>
            <TextInput
              style={[s.input, s.inputSingle]}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://your-server.replit.dev"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[s.label, { marginTop: 16 }]}>Device ID</Text>
            <TextInput
              style={[s.input, s.inputSingle]}
              value={deviceId}
              onChangeText={setDeviceId}
              placeholder="e.g. 3"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
            <Text style={[s.label, { marginTop: 16 }]}>Device Token</Text>
            <TextInput
              style={[s.input, s.inputSingle]}
              value={token}
              onChangeText={setToken}
              placeholder="Paste token here"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </>
        )}

        {errorMessage ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={s.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [s.connectBtn, pressed && s.btnPressed, isConnecting && s.btnDisabled]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={s.connectBtnText}>Connect</Text>
          )}
        </Pressable>

        <Pressable style={s.manualToggle} onPress={() => setShowManual((v) => !v)}>
          <Text style={s.manualToggleText}>
            {showManual ? '← Paste URL instead' : 'Enter details manually'}
          </Text>
        </Pressable>
      </View>

      {/* Instructions */}
      <View style={s.steps}>
        {['Open your SMS Control dashboard', 'Go to Devices and tap a device', 'Copy the connect URL and paste above'].map(
          (step, i) => (
            <View key={i} style={s.step}>
              <View style={s.stepNum}>
                <Text style={s.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          )
        )}
      </View>
    </ScrollView>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ item, colors }: { item: ActivityEntry; colors: ReturnType<typeof useColors> }) {
  const s = styles(colors);
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const iconName =
    item.status === 'sent' ? 'check-circle' : item.status === 'failed' ? 'x-circle' : 'loader';
  const iconColor =
    item.status === 'sent' ? colors.primary : item.status === 'failed' ? colors.destructive : colors.warning;

  return (
    <View style={s.activityRow}>
      <Feather name={iconName as any} size={16} color={iconColor} style={{ marginTop: 2 }} />
      <View style={s.activityContent}>
        <Text style={s.activityPhone}>{item.phone}</Text>
        <Text style={s.activityText} numberOfLines={1}>{item.text}</Text>
      </View>
      <Text style={s.activityTime}>{time}</Text>
    </View>
  );
}

// ── Gateway screen ────────────────────────────────────────────────────────────

function GatewayScreen() {
  const colors = useColors();
  const { connectionDetails, status, stats, activity, disconnect } = useGateway();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const s = styles(colors);

  const host = connectionDetails?.serverUrl.replace(/^https?:\/\//, '') ?? '';

  return (
    <View
      style={[
        s.gatewayContainer,
        {
          paddingTop: isWeb ? 67 : insets.top,
          paddingBottom: isWeb ? 34 : insets.bottom,
        },
      ]}
    >
      {/* Header */}
      <View style={s.gatewayHeader}>
        <View style={s.statusPill}>
          <View style={[s.statusDot, status === 'connected' && s.statusDotLive]} />
          <Text style={s.statusText}>{status === 'connected' ? 'Connected' : 'Connecting…'}</Text>
        </View>
        <Text style={s.serverHost} numberOfLines={1}>{host}</Text>
        <Pressable style={({ pressed }) => [s.disconnectBtn, pressed && s.btnPressed]} onPress={disconnect}>
          <Feather name="power" size={18} color={colors.destructive} />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { borderColor: colors.primary + '44' }]}>
          <Text style={[s.statNumber, { color: colors.primary }]}>{stats.sent}</Text>
          <Text style={s.statLabel}>Sent</Text>
        </View>
        <View style={[s.statCard, { borderColor: colors.warning + '44' }]}>
          <Text style={[s.statNumber, { color: colors.warning }]}>{stats.pending}</Text>
          <Text style={s.statLabel}>Pending</Text>
        </View>
        <View style={[s.statCard, { borderColor: colors.destructive + '44' }]}>
          <Text style={[s.statNumber, { color: colors.destructive }]}>{stats.failed}</Text>
          <Text style={s.statLabel}>Failed</Text>
        </View>
      </View>

      {/* Activity log */}
      <View style={s.activitySection}>
        <Text style={s.sectionTitle}>Activity</Text>
        <FlatList<ActivityEntry>
          data={activity}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ActivityRow item={item} colors={colors} />}
          scrollEnabled={!!activity.length}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Waiting for messages…</Text>
              <Text style={s.emptySubText}>Start a campaign from your dashboard</Text>
            </View>
          }
          contentContainerStyle={activity.length === 0 ? { flex: 1 } : undefined}
        />
      </View>
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { status, connectionDetails } = useGateway();
  const isConnected = status === 'connected' && connectionDetails != null;
  return isConnected ? <GatewayScreen /> : <SetupScreen />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

function styles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    // Setup
    setupContainer: {
      flexGrow: 1,
      paddingHorizontal: 20,
      backgroundColor: c.background,
    },
    logoArea: {
      alignItems: 'center',
      marginBottom: 32,
    },
    logoIcon: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    logoTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      color: c.foreground,
      marginBottom: 8,
    },
    logoSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: c.mutedForeground,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 280,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      marginBottom: 24,
    },
    label: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: c.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    hint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: c.mutedForeground,
      marginBottom: 10,
      lineHeight: 18,
    },
    input: {
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.input,
      borderRadius: c.radius - 2,
      padding: 12,
      color: c.foreground,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    inputSingle: {
      minHeight: 44,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 10,
      backgroundColor: c.destructive + '18',
      borderRadius: c.radius - 4,
      borderWidth: 1,
      borderColor: c.destructive + '44',
    },
    errorText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: c.destructive,
      flex: 1,
      lineHeight: 18,
    },
    connectBtn: {
      marginTop: 16,
      backgroundColor: c.primary,
      borderRadius: c.radius - 2,
      paddingVertical: 14,
      alignItems: 'center',
    },
    connectBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: c.primaryForeground,
    },
    btnPressed: { opacity: 0.75 },
    btnDisabled: { opacity: 0.5 },
    manualToggle: {
      marginTop: 12,
      alignItems: 'center',
      padding: 4,
    },
    manualToggleText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: c.mutedForeground,
    },
    steps: {
      gap: 16,
    },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    stepNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.secondary,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: c.mutedForeground,
    },
    stepText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: c.mutedForeground,
      flex: 1,
    },

    // Gateway
    gatewayContainer: {
      flex: 1,
      backgroundColor: c.background,
    },
    gatewayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 10,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.secondary,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.mutedForeground,
    },
    statusDotLive: {
      backgroundColor: c.primary,
    },
    statusText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: c.foreground,
    },
    serverHost: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: c.mutedForeground,
    },
    disconnectBtn: {
      padding: 8,
    },
    statsRow: {
      flexDirection: 'row',
      padding: 16,
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: c.radius,
      borderWidth: 1,
      padding: 14,
      alignItems: 'center',
    },
    statNumber: {
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
    },
    statLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: c.mutedForeground,
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    activitySection: {
      flex: 1,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: c.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    activityContent: {
      flex: 1,
    },
    activityPhone: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: c.foreground,
    },
    activityText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: c.mutedForeground,
      marginTop: 1,
    },
    activityTime: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: c.mutedForeground,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 60,
    },
    emptyText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 16,
      color: c.mutedForeground,
    },
    emptySubText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: c.mutedForeground,
    },
  });
}
