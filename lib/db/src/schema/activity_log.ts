import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // device_connected | device_disconnected | campaign_started | campaign_completed | campaign_failed | message_sent | message_failed
  description: text("description").notNull(),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActivityLog = typeof activityLogTable.$inferSelect;
