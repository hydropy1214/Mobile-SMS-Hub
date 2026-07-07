import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  campaignsTable,
  devicesTable,
  contactListsTable,
  messagesTable,
  contactListContactsTable,
  contactsTable,
  activityLogTable,
} from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  DeleteCampaignParams,
  SendCampaignParams,
  PauseCampaignParams,
  CancelCampaignParams,
} from "@workspace/api-zod";
import { broadcast } from "../lib/ws-server";

const router = Router();

async function enrichCampaign(c: typeof campaignsTable.$inferSelect) {
  let deviceName: string | null = null;
  let contactListName: string | null = null;

  if (c.deviceId) {
    const [d] = await db.select({ name: devicesTable.name }).from(devicesTable).where(eq(devicesTable.id, c.deviceId));
    deviceName = d?.name ?? null;
  }
  if (c.contactListId) {
    const [l] = await db.select({ name: contactListsTable.name }).from(contactListsTable).where(eq(contactListsTable.id, c.contactListId));
    contactListName = l?.name ?? null;
  }

  return {
    ...c,
    deviceName,
    contactListName,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/campaigns", async (_req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);
  const enriched = await Promise.all(campaigns.map(enrichCampaign));
  res.json(enriched);
});

router.post("/campaigns", async (req, res) => {
  const body = CreateCampaignBody.parse(req.body);

  let totalCount = 0;
  if (body.contactListId) {
    const members = await db
      .select()
      .from(contactListContactsTable)
      .where(eq(contactListContactsTable.listId, body.contactListId));
    totalCount = members.length;
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      name: body.name,
      message: body.message,
      deviceId: body.deviceId ?? null,
      contactListId: body.contactListId ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      totalCount,
      status: "draft",
    })
    .returning();

  res.status(201).json(await enrichCampaign(campaign));
});

router.get("/campaigns/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(await enrichCampaign(campaign));
});

router.delete("/campaigns/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse({ id: Number(req.params.id) });
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  res.status(204).send();
});

router.patch("/campaigns/:id/send", async (req, res) => {
  const { id } = SendCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  // Only allow valid transitions: draft → sending or paused → sending
  if (campaign.status !== "draft" && campaign.status !== "paused") {
    res.status(400).json({ error: `Cannot start a campaign with status "${campaign.status}"` });
    return;
  }

  const isResume = campaign.status === "paused";

  const updated = await db.transaction(async (tx) => {
    let totalCount = campaign.totalCount;

    if (isResume) {
      // ── Resume: just flip status back to sending.
      // Preserve all existing messages (sent, failed, queued) — don't re-send to already-contacted people.
      // Re-mark any "dispatched" messages back to "queued" so the processor re-dispatches them.
      await tx
        .update(messagesTable)
        .set({ status: "queued" })
        .where(and(eq(messagesTable.campaignId, id), eq(messagesTable.status, "dispatched")));

    } else {
      // ── Fresh start (draft → sending): build the message queue from the contact list.
      if (campaign.contactListId) {
        const members = await tx
          .select({ contactId: contactListContactsTable.contactId })
          .from(contactListContactsTable)
          .where(eq(contactListContactsTable.listId, campaign.contactListId));

        // Remove any leftover messages from a previous aborted attempt
        await tx
          .delete(messagesTable)
          .where(and(eq(messagesTable.campaignId, id)));

        for (const member of members) {
          const [contact] = await tx.select().from(contactsTable).where(eq(contactsTable.id, member.contactId));
          if (contact) {
            await tx.insert(messagesTable).values({
              campaignId: id,
              contactId: contact.id,
              deviceId: campaign.deviceId,
              phoneNumber: contact.phoneNumber,
              messageText: campaign.message,
              status: "queued",
            });
          }
        }

        totalCount = (await tx.select().from(messagesTable).where(eq(messagesTable.campaignId, id))).length;
      }
    }

    const [updated] = await tx
      .update(campaignsTable)
      .set({
        status: "sending",
        startedAt: campaign.startedAt ?? new Date(),
        ...(isResume ? {} : { sentCount: 0, failedCount: 0, totalCount }),
      })
      .where(eq(campaignsTable.id, id))
      .returning();

    await tx.insert(activityLogTable).values({
      type: "campaign_started",
      description: isResume
        ? `Campaign "${campaign.name}" resumed`
        : `Campaign "${campaign.name}" started`,
      relatedId: id,
    });

    return updated;
  });

  broadcast("campaign:started", {
    campaignId: id,
    name: campaign.name,
    totalCount: updated.totalCount,
  });

  res.json(await enrichCampaign(updated));
});

router.patch("/campaigns/:id/pause", async (req, res) => {
  const { id } = PauseCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "paused" })
    .where(eq(campaignsTable.id, id))
    .returning();

  broadcast("campaign:paused", { campaignId: id, name: campaign.name });
  res.json(await enrichCampaign(updated));
});

router.patch("/campaigns/:id/cancel", async (req, res) => {
  const { id } = CancelCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  // Mark queued AND dispatched messages as failed — preserve sent/delivered history.
  // Dispatched messages must also be cancelled so the mobile device stops processing them.
  await db
    .update(messagesTable)
    .set({ status: "failed" })
    .where(and(
      eq(messagesTable.campaignId, id),
      inArray(messagesTable.status, ["queued", "dispatched"]),
    ));

  // Recompute accurate counts after cancellation
  const allMsgs = await db.select().from(messagesTable).where(eq(messagesTable.campaignId, id));
  const sentCount = allMsgs.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const failedCount = allMsgs.filter((m) => m.status === "failed").length;

  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "cancelled", completedAt: new Date(), sentCount, failedCount })
    .where(eq(campaignsTable.id, id))
    .returning();

  broadcast("campaign:cancelled", { campaignId: id, name: campaign.name });
  res.json(await enrichCampaign(updated));
});

export default router;
