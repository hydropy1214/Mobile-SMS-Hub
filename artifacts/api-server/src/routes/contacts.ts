import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";
import {
  CreateContactBody,
  UpdateContactBody,
  UpdateContactParams,
  DeleteContactParams,
  ListContactsQueryParams,
} from "@workspace/api-zod";

const router = Router();

const fmt = (c: typeof contactsTable.$inferSelect) => ({
  ...c,
  createdAt: c.createdAt.toISOString(),
});

// List contacts
router.get("/contacts", async (req, res) => {
  const query = ListContactsQueryParams.parse({
    listId: req.query.listId ? Number(req.query.listId) : undefined,
    search: req.query.search ?? undefined,
  });

  let rows = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);

  // Filter by contact list membership if listId is provided
  if (query.listId) {
    const { contactListContactsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const memberships = await db
      .select({ contactId: contactListContactsTable.contactId })
      .from(contactListContactsTable)
      .where(eq(contactListContactsTable.listId, query.listId));
    const ids = memberships.map((m) => m.contactId);
    rows = rows.filter((c) => ids.includes(c.id));
  }

  if (query.search) {
    const s = query.search.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.phoneNumber.includes(s)
    );
  }

  res.json(rows.map(fmt));
});

// Create contact
router.post("/contacts", async (req, res) => {
  const body = CreateContactBody.parse(req.body);
  const [contact] = await db.insert(contactsTable).values(body).returning();
  res.status(201).json(fmt(contact));
});

// Update contact
router.patch("/contacts/:id", async (req, res) => {
  const { id } = UpdateContactParams.parse({ id: Number(req.params.id) });
  const body = UpdateContactBody.parse(req.body);
  const update: Record<string, unknown> = {};
  if (body.name != null) update.name = body.name;
  if (body.phoneNumber != null) update.phoneNumber = body.phoneNumber;
  if (body.tags !== undefined) update.tags = body.tags;
  const [contact] = await db.update(contactsTable).set(update).where(eq(contactsTable.id, id)).returning();
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.json(fmt(contact));
});

// Delete contact
router.delete("/contacts/:id", async (req, res) => {
  const { id } = DeleteContactParams.parse({ id: Number(req.params.id) });
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.status(204).send();
});

export default router;
