import { Router } from "express";
import { db, devicesTable, messagesTable, campaignsTable, contactsTable, activityLogTable } from "@workspace/db";
import { eq, gte, and } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const devices = await db.select().from(devicesTable);
  const devicesOnline = devices.filter((d) => d.status === "online").length;
  const devicesTotal = devices.length;

  const allMessages = await db.select().from(messagesTable);
  const todayMessages = allMessages.filter((m) => m.createdAt >= startOfDay);
  const messagesToday = todayMessages.length;
  const successToday = todayMessages.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const successRateToday = messagesToday > 0 ? Math.round((successToday / messagesToday) * 100) : 0;

  const campaigns = await db.select().from(campaignsTable);
  const activeCampaigns = campaigns.filter((c) => c.status === "sending" || c.status === "paused").length;

  const contacts = await db.select().from(contactsTable);
  const totalContacts = contacts.length;

  // Weekly message counts (last 7 days)
  const messagesSentThisWeek: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const nextDay = new Date(day.getTime() + 86400000);
    const count = allMessages.filter((m) => m.createdAt >= day && m.createdAt < nextDay).length;
    messagesSentThisWeek.push({
      date: day.toISOString().split("T")[0],
      count,
    });
  }

  res.json({
    devicesOnline,
    devicesTotal,
    messagesToday,
    successRateToday,
    activeCampaigns,
    totalContacts,
    messagesSentThisWeek,
  });
});

router.get("/dashboard/activity", async (req, res) => {
  const activity = await db
    .select()
    .from(activityLogTable)
    .orderBy(activityLogTable.createdAt);

  // Return last 20, most recent first
  const sorted = [...activity].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);

  res.json(sorted.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

export default router;
