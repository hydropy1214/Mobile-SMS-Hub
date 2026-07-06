import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, messagesTable, campaignsTable, contactsTable, devicesTable } from "@workspace/db";
import { ListMessagesQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/messages", async (req, res) => {
  const params = ListMessagesQueryParams.parse({
    campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
    status: req.query.status ?? undefined,
  });

  let rows = await db.select().from(messagesTable).orderBy(messagesTable.createdAt);

  if (params.campaignId) {
    rows = rows.filter((m) => m.campaignId === params.campaignId);
  }
  if (params.status) {
    rows = rows.filter((m) => m.status === params.status);
  }

  // Enrich with names
  const campaigns = await db.select({ id: campaignsTable.id, name: campaignsTable.name }).from(campaignsTable);
  const contacts = await db.select({ id: contactsTable.id, name: contactsTable.name }).from(contactsTable);
  const devices = await db.select({ id: devicesTable.id, name: devicesTable.name }).from(devicesTable);

  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const deviceMap = Object.fromEntries(devices.map((d) => [d.id, d.name]));

  const result = rows.map((m) => ({
    ...m,
    campaignName: m.campaignId ? (campaignMap[m.campaignId] ?? null) : null,
    contactName: m.contactId ? (contactMap[m.contactId] ?? null) : null,
    deviceName: m.deviceId ? (deviceMap[m.deviceId] ?? null) : null,
    sentAt: m.sentAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }));

  res.json(result);
});

export default router;
