import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"),
  contactId: integer("contact_id"),
  deviceId: integer("device_id"),
  phoneNumber: text("phone_number").notNull(),
  messageText: text("message_text"),
  status: text("status").notNull().default("queued"), // queued | sent | failed | delivered
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
