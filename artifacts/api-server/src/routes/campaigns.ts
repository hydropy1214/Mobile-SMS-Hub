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

const router = Router();

async function enrichCampaign(c: typeof campaignsTable.$inferSelect) {
  let deviceName: string | null = null;
  let contactListName: string | null = null;

  if (c.deviceId) {
    const [device] = await db.select({ name: devicesTable.name }).from(devicesTable).where(eq(devicesTable.id, c.deviceId));
    deviceName = device?.name ?? null;
  }
  if (c.contactListId) {
    const [list] = await db.select({ name: contactListsTable.name }).from(contactListsTable).where(eq(contactListsTable.id, c.contactListId));
    contactListName = list?.name ?? null;
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

// List campaigns
router.get("/campaigns", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);
  const enriched = await Promise.all(campaigns.map(enrichCampaign));
  res.json(enriched);
});

// Create campaign
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

// Get campaign
router.get("/campaigns/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(await enrichCampaign(campaign));
});

// Delete campaign
router.delete("/campaigns/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse({ id: Number(req.params.id) });
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  res.status(204).send();
});

// Send campaign
router.patch("/campaigns/:id/send", async (req, res) => {
  const { id } = SendCampaignParams.parse({ id: Number(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  if (campaign.contactListId) {
    const members = await db
      .select({ contactId: contactListContactsTable.contactId })
      .from(contactListContactsTable)
      .where(eq(contactListContactsTable.listId, campaign.contactListId));

    for (const member of members) {
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, member.contactId));
      if (contact) {
        await db.insert(messagesTable).values({
          campaignId: id,
          contactId: contact.id,
          deviceId: campaign.deviceId,
          phoneNumber: contact.phoneNumber,
          messageText: campaign.message,
          status: "sent",
          sentAt: new Date(),
        });
      }
    }
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({
      status: "sending",
      startedAt: new Date(),
      totalCount: campaign.totalCount || 0,
      sentCount: campaign.totalCount || 0,
    })
    .where(eq(campaignsTable.id, id))
    .returning();

  await db.insert(activityLogTable).values({
    type: "campaign_started",
    description: `Campaign "${campaign.name}" started`,
    relatedId: id,
  });

  res.json(await enrichCampaign(updated));
});

// Pause campaign
router.patch("/campaigns/:id/pause", async (req, res) => {
  const { id } = PauseCampaignParams.parse({ id: Number(req.params.id) });
  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "paused" })
    .where(eq(campaignsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(await enrichCampaign(updated));
});

// Cancel campaign
router.patch("/campaigns/:id/cancel", async (req, res) => {
  const { id } = CancelCampaignParams.parse({ id: Number(req.params.id) });
  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "cancelled" })
    .where(eq(campaignsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(await enrichCampaign(updated));
});

export default router;
