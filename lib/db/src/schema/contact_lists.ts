import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactsTable } from "./contacts";

export const contactListsTable = pgTable("contact_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  contactCount: integer("contact_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contactListContactsTable = pgTable("contact_list_contacts", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => contactListsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContactListSchema = createInsertSchema(contactListsTable).omit({ id: true, createdAt: true, contactCount: true });
export type InsertContactList = z.infer<typeof insertContactListSchema>;
export type ContactList = typeof contactListsTable.$inferSelect;
