import { Router } from "express";
import { eq } from "drizzle-orm";
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

  // Queue messages for processing by the campaign processor background job
  if (campaign.contactListId) {
    const members = await db
      .select({ contactId: contactListContactsTable.contactId })
      .from(contactListContactsTable)
      .where(eq(contactListContactsTable.listId, campaign.contactListId));

    // Remove any existing queued/failed messages from previous send attempts
    await db
      .delete(messagesTable)
      .where(eq(messagesTable.campaignId, id));

    for (const member of members) {
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, member.contactId));
      if (contact) {
        await db.insert(messagesTable).values({
          campaignId: id,
          contactId: contact.id,
          deviceId: campaign.deviceId,
          phoneNumber: contact.phoneNumber,
          messageText: campaign.message,
          status: "queued", // Will be processed by campaign-processor
        });
      }
    }
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({
      status: "sending",
      startedAt: new Date(),
      sentCount: 0,
      failedCount: 0,
      totalCount: campaign.contactListId
        ? (await db.select().from(messagesTable).where(eq(messagesTable.campaignId, id))).length
        : campaign.totalCount,
    })
    .where(eq(campaignsTable.id, id))
    .returning();

  await db.insert(activityLogTable).values({
    type: "campaign_started",
    description: `Campaign "${campaign.name}" started`,
    relatedId: id,
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

  // Mark all queued messages as failed
  await db
    .update(messagesTable)
    .set({ status: "failed" })
    .where(eq(messagesTable.campaignId, id));

  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(campaignsTable.id, id))
    .returning();

  broadcast("campaign:cancelled", { campaignId: id, name: campaign.name });
  res.json(await enrichCampaign(updated));
});

export default router;
