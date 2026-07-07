import { eq, and } from "drizzle-orm";
import {
  db,
  campaignsTable,
  messagesTable,
  contactListContactsTable,
  contactsTable,
  activityLogTable,
} from "@workspace/db";
import { broadcast, sendToDevice } from "./ws-server";
import { logger } from "./logger";

const BATCH_SIZE = 5; // messages to dispatch per tick per campaign
const TICK_MS = 3000; // process every 3 seconds

async function processCampaign(campaign: typeof campaignsTable.$inferSelect) {
  // Find queued messages for this campaign
  const queued = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.campaignId, campaign.id), eq(messagesTable.status, "queued")))
    .limit(BATCH_SIZE);

  if (queued.length === 0) {
    // No queued messages left — mark completed
    const [updated] = await db
      .update(campaignsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(campaignsTable.id, campaign.id))
      .returning();

    await db.insert(activityLogTable).values({
      type: "campaign_completed",
      description: `Campaign "${campaign.name}" completed — ${campaign.sentCount}/${campaign.totalCount} messages sent`,
      relatedId: campaign.id,
    });

    broadcast("campaign:completed", {
      campaignId: campaign.id,
      name: campaign.name,
      sentCount: updated.sentCount,
      failedCount: updated.failedCount,
      totalCount: campaign.totalCount,
    });
    return;
  }

  const now = new Date();

  for (const msg of queued) {
    let status: "sent" | "failed" = "failed";

    if (campaign.deviceId) {
      // Push message to the physical device via WebSocket.
      // The device's mobile page will open the SMS app for each dispatched message.
      const dispatched = sendToDevice(campaign.deviceId, "sms:dispatch", {
        messageId: msg.id,
        campaignId: campaign.id,
        phoneNumber: msg.phoneNumber,
        messageText: msg.messageText ?? "",
      });

      if (dispatched) {
        status = "sent"; // dispatched to device successfully
      } else {
        // Device is not connected — fail this message
        status = "failed";
        await db.insert(activityLogTable).values({
          type: "message_failed",
          description: `Message to ${msg.phoneNumber} failed — device offline in "${campaign.name}"`,
          relatedId: campaign.id,
        });
        logger.warn({ messageId: msg.id, deviceId: campaign.deviceId }, "Device not connected, message failed");
      }
    } else {
      // No device assigned — fail
      await db.insert(activityLogTable).values({
        type: "message_failed",
        description: `Message to ${msg.phoneNumber} failed — no device assigned to "${campaign.name}"`,
        relatedId: campaign.id,
      });
    }

    await db
      .update(messagesTable)
      .set({ status, sentAt: now })
      .where(eq(messagesTable.id, msg.id));
  }

  // Recount
  const allMsgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.campaignId, campaign.id));
  const sentCount = allMsgs.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const failedCount = allMsgs.filter((m) => m.status === "failed").length;

  await db
    .update(campaignsTable)
    .set({ sentCount, failedCount })
    .where(eq(campaignsTable.id, campaign.id));

  broadcast("campaign:progress", {
    campaignId: campaign.id,
    name: campaign.name,
    sentCount,
    failedCount,
    totalCount: campaign.totalCount,
    queuedLeft: allMsgs.filter((m) => m.status === "queued").length,
  });
}

async function tick() {
  try {
    const sending = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.status, "sending"));

    for (const campaign of sending) {
      await processCampaign(campaign);
    }

    // Check for scheduled campaigns that should start now
    const now = new Date();
    const drafts = await db.select().from(campaignsTable).where(eq(campaignsTable.status, "draft"));
    for (const c of drafts) {
      if (c.scheduledAt && c.scheduledAt <= now && c.contactListId) {
        const members = await db
          .select({ contactId: contactListContactsTable.contactId })
          .from(contactListContactsTable)
          .where(eq(contactListContactsTable.listId, c.contactListId));

        for (const member of members) {
          const [contact] = await db
            .select()
            .from(contactsTable)
            .where(eq(contactsTable.id, member.contactId));
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

        broadcast("campaign:started", {
          campaignId: c.id,
          name: c.name,
          totalCount: updated.totalCount,
        });
        logger.info({ campaignId: c.id }, "Scheduled campaign auto-started");
      }
    }
  } catch (err) {
    logger.error({ err }, "Campaign processor error");
  }
}

export function startCampaignProcessor(): void {
  setInterval(() => {
    void tick();
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, "Campaign processor started");
}
