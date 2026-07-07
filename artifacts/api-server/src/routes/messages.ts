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

/**
 * Called by the mobile page after the SMS app was opened for a message.
 * Requires the device token via Authorization header so only the owning
 * device can confirm its own messages.
 */
router.patch("/messages/:id/confirm", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid message id" }); return; }

  const { status } = req.body as { status?: unknown };
  if (!status || !["sent", "delivered", "failed"].includes(status as string)) {
    res.status(400).json({ error: "status must be one of: sent, delivered, failed" });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, id));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

  // Authenticate: device token required when the message has a device
  if (msg.deviceId) {
    const providedToken =
      (req.query["token"] as string | undefined) ??
      req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const [device] = await db
      .select({ token: devicesTable.token })
      .from(devicesTable)
      .where(eq(devicesTable.id, msg.deviceId));
    if (!device || !providedToken || device.token !== providedToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ status: status as string, sentAt: new Date() })
    .where(eq(messagesTable.id, id))
    .returning();

  res.json({ ...updated, sentAt: updated.sentAt?.toISOString() ?? null, createdAt: updated.createdAt.toISOString() });
});

export default router;
