import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  campaignsTable,
  messagesTable,
  devicesTable,
  contactListContactsTable,
  contactsTable,
  activityLogTable,
} from "@workspace/db";
import { broadcast, sendToDevice } from "./ws-server";
import { logger } from "./logger";

const BATCH_SIZE = 10;
const TICK_MS = 3000;
/** A device that hasn't sent a heartbeat in this many ms is considered truly offline */
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isDeviceOffline(device: { status: string; lastSeen: Date | null } | undefined): boolean {
  if (!device) return true;
  if (device.status === "offline") return true;
  if (!device.lastSeen) return true;
  return Date.now() - device.lastSeen.getTime() > OFFLINE_THRESHOLD_MS;
}

async function completeCampaign(campaign: typeof campaignsTable.$inferSelect) {
  const allMsgs = await db.select().from(messagesTable).where(eq(messagesTable.campaignId, campaign.id));
  const sentCount = allMsgs.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const failedCount = allMsgs.filter((m) => m.status === "failed").length;

  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "completed", completedAt: new Date(), sentCount, failedCount })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();

  await db.insert(activityLogTable).values({
    type: "campaign_completed",
    description: `Campaign "${campaign.name}" completed — ${sentCount}/${updated.totalCount} messages sent`,
    relatedId: campaign.id,
  });

  broadcast("campaign:completed", {
    campaignId: campaign.id,
    name: campaign.name,
    sentCount,
    failedCount,
    totalCount: updated.totalCount,
  });
  logger.info({ campaignId: campaign.id, sentCount, failedCount }, "Campaign completed");
}

async function processCampaign(campaign: typeof campaignsTable.$inferSelect) {
  // ── Step 1: Check if there are any queued messages left to claim ────────
  const candidates = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(eq(messagesTable.campaignId, campaign.id), eq(messagesTable.status, "queued")))
    .limit(BATCH_SIZE);

  if (candidates.length === 0) {
    // No queued messages. Check if any "dispatched" messages are still awaiting device confirmation.
    const [stillPending] = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.campaignId, campaign.id),
        inArray(messagesTable.status, ["queued", "dispatched"]),
      ))
      .limit(1);

    if (!stillPending) {
      // Every message is resolved (sent | delivered | failed) — campaign complete.
      await completeCampaign(campaign);
    }
    // else: still waiting for device confirmations → try again next tick
    return;
  }

  // ── Step 2: Atomically claim candidates queued → dispatched ─────────────
  // Using inArray + status guard ensures only one concurrent caller wins each row.
  const ids = candidates.map((c) => c.id);
  const claimed = await db
    .update(messagesTable)
    .set({ status: "dispatched" })
    .where(and(inArray(messagesTable.id, ids), eq(messagesTable.status, "queued")))
    .returning();

  if (claimed.length === 0) return; // lost the race, retry next tick

  // ── Step 3: Resolve device status ───────────────────────────────────────
  let deviceRow: { status: string; lastSeen: Date | null } | undefined;
  if (campaign.deviceId) {
    const [d] = await db
      .select({ status: devicesTable.status, lastSeen: devicesTable.lastSeen })
      .from(devicesTable)
      .where(eq(devicesTable.id, campaign.deviceId));
    deviceRow = d;
  }
  const deviceOffline = !campaign.deviceId || isDeviceOffline(deviceRow);
  const now = new Date();
  const failIds: number[] = [];
  const revertIds: number[] = [];

  // ── Step 4: Try WS fast-path for each claimed message ───────────────────
  for (const msg of claimed) {
    if (!campaign.deviceId) {
      failIds.push(msg.id);
      await db.insert(activityLogTable).values({
        type: "message_failed",
        description: `Message to ${msg.phoneNumber} failed — no device assigned to "${campaign.name}"`,
        relatedId: campaign.id,
      });
      continue;
    }

    const pushed = sendToDevice(campaign.deviceId, "sms:dispatch", {
      messageId: msg.id,
      campaignId: campaign.id,
      phoneNumber: msg.phoneNumber,
      messageText: msg.messageText ?? "",
    });

    if (pushed) {
      // Message delivered to device WS; status stays "dispatched" until device confirms.
      logger.debug({ messageId: msg.id, deviceId: campaign.deviceId }, "SMS dispatched via WS");
    } else if (deviceOffline) {
      // Device truly offline → fail immediately
      failIds.push(msg.id);
      await db.insert(activityLogTable).values({
        type: "message_failed",
        description: `Message to ${msg.phoneNumber} failed — device offline in "${campaign.name}"`,
        relatedId: campaign.id,
      });
      logger.warn({ messageId: msg.id, deviceId: campaign.deviceId }, "Device offline, message failed");
    } else {
      // Device is alive (heartbeat OK) but WS socket not yet open.
      // Revert to "queued" so the mobile page can pick it up via polling,
      // and the next processor tick or WS reconnect can retry.
      revertIds.push(msg.id);
      logger.debug({ messageId: msg.id, deviceId: campaign.deviceId }, "Device online but WS not connected; reverting to queued");
    }
  }

  // ── Step 5: Batch-persist outcomes ──────────────────────────────────────
  if (failIds.length) {
    await db
      .update(messagesTable)
      .set({ status: "failed", sentAt: now })
      .where(inArray(messagesTable.id, failIds));
  }
  if (revertIds.length) {
    await db
      .update(messagesTable)
      .set({ status: "queued" })
      .where(inArray(messagesTable.id, revertIds));
  }

  // ── Step 6: Broadcast progress ──────────────────────────────────────────
  const allMsgs = await db.select().from(messagesTable).where(eq(messagesTable.campaignId, campaign.id));
  const sentCount = allMsgs.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const failedCount = allMsgs.filter((m) => m.status === "failed").length;
  const queuedLeft = allMsgs.filter((m) => m.status === "queued" || m.status === "dispatched").length;

  await db.update(campaignsTable).set({ sentCount, failedCount }).where(eq(campaignsTable.id, campaign.id));

  broadcast("campaign:progress", {
    campaignId: campaign.id,
    name: campaign.name,
    sentCount,
    failedCount,
    totalCount: campaign.totalCount,
    queuedLeft,
  });
}

async function tick() {
  try {
    const sending = await db.select().from(campaignsTable).where(eq(campaignsTable.status, "sending"));
    for (const campaign of sending) {
      await processCampaign(campaign);
    }

    // Auto-start scheduled campaigns
    const now = new Date();
    const drafts = await db.select().from(campaignsTable).where(eq(campaignsTable.status, "draft"));
    for (const c of drafts) {
      if (c.scheduledAt && c.scheduledAt <= now && c.contactListId) {
        const members = await db
          .select({ contactId: contactListContactsTable.contactId })
          .from(contactListContactsTable)
          .where(eq(contactListContactsTable.listId, c.contactListId));

        for (const member of members) {
          const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, member.contactId));
          if (contact) {
            await db.insert(messagesTable).values({
              campaignId: c.id,
              contactId: contact.id,
              deviceId: c.deviceId,
              phoneNumber: contact.phoneNumber,
              messageText: c.message,
              status: "queued",
            });
          }
        }

        const [updated] = await db
          .update(campaignsTable)
          .set({ status: "sending", startedAt: now, totalCount: members.length })
          .where(eq(campaignsTable.id, c.id))
          .returning();

        await db.insert(activityLogTable).values({
          type: "campaign_started",
          description: `Campaign "${c.name}" auto-started (scheduled)`,
          relatedId: c.id,
        });
        broadcast("campaign:started", { campaignId: c.id, name: c.name, totalCount: updated.totalCount });
        logger.info({ campaignId: c.id }, "Scheduled campaign auto-started");
      }
    }
  } catch (err) {
    logger.error({ err }, "Campaign processor tick error");
  }
}

export function startCampaignProcessor(): void {
  setInterval(() => void tick(), TICK_MS);
  logger.info({ tickMs: TICK_MS }, "Campaign processor started");
}
