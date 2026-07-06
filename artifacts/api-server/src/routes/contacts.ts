import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, contactsTable, contactListContactsTable } from "@workspace/db";
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

router.get("/contacts", async (req, res) => {
  const query = ListContactsQueryParams.parse({
    listId: req.query.listId ? Number(req.query.listId) : undefined,
    search: req.query.search ?? undefined,
  });

  let rows = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);

  if (query.listId) {
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
      (c) => c.name.toLowerCase().includes(s) || c.phoneNumber.includes(s),
    );
  }

  res.json(rows.map(fmt));
});

router.post("/contacts", async (req, res) => {
  const body = CreateContactBody.parse(req.body);
  const [contact] = await db.insert(contactsTable).values(body).returning();
  res.status(201).json(fmt(contact));
});

router.patch("/contacts/:id", async (req, res) => {
  const { id } = UpdateContactParams.parse({ id: Number(req.params.id) });
  const body = UpdateContactBody.parse(req.body);
  const update: Record<string, unknown> = {};
  if (body.name != null) update.name = body.name;
  if (body.phoneNumber != null) update.phoneNumber = body.phoneNumber;
  if (body.tags !== undefined) update.tags = body.tags;
  const [contact] = await db.update(contactsTable).set(update).where(eq(contactsTable.id, id)).returning();
  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json(fmt(contact));
});

router.delete("/contacts/:id", async (req, res) => {
  const { id } = DeleteContactParams.parse({ id: Number(req.params.id) });
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.status(204).send();
});

/**
 * Bulk CSV import. Accepts text/csv body.
 * Expected format: one contact per line, columns: name,phone[,tags]
 * First line may be a header (skipped if it contains "name" or "phone").
 */
router.post("/contacts/import", async (req, res) => {
  const csvText = req.body as string;
  if (!csvText || typeof csvText !== "string") {
    res.status(400).json({ error: "Request body must be text/csv" });
    return;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip header row
    if (i === 0 && /^(name|phone|contact)/i.test(line)) { skipped++; continue; }

    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const [name, phoneNumber, tags] = cols;

    if (!name || !phoneNumber) {
      errors.push(`Line ${i + 1}: missing name or phone`);
      skipped++;
      continue;
    }

    // Basic phone normalisation
    const phone = phoneNumber.replace(/[\s\-().]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(phone)) {
      errors.push(`Line ${i + 1}: invalid phone "${phoneNumber}"`);
      skipped++;
      continue;
    }

    try {
      await db.insert(contactsTable).values({ name, phoneNumber: phone, tags: tags ?? null });
      imported++;
    } catch {
      errors.push(`Line ${i + 1}: duplicate or DB error`);
      skipped++;
    }
  }

  res.json({ imported, skipped, errors: errors.slice(0, 20) });
});

export default router;
