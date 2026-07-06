import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, contactListsTable, contactListContactsTable, contactsTable } from "@workspace/db";
import {
  CreateContactListBody,
  GetContactListParams,
  DeleteContactListParams,
  AddContactToListBody,
  AddContactToListParams,
  RemoveContactFromListParams,
} from "@workspace/api-zod";

const router = Router();

const fmtList = (l: typeof contactListsTable.$inferSelect) => ({
  ...l,
  createdAt: l.createdAt.toISOString(),
});

// List contact lists
router.get("/contact-lists", async (req, res) => {
  const lists = await db.select().from(contactListsTable).orderBy(contactListsTable.createdAt);
  res.json(lists.map(fmtList));
});

// Create contact list
router.post("/contact-lists", async (req, res) => {
  const body = CreateContactListBody.parse(req.body);
  const [list] = await db.insert(contactListsTable).values({ name: body.name, description: body.description ?? null }).returning();
  res.status(201).json(fmtList(list));
});

// Get contact list with contacts
router.get("/contact-lists/:id", async (req, res) => {
  const { id } = GetContactListParams.parse({ id: Number(req.params.id) });
  const [list] = await db.select().from(contactListsTable).where(eq(contactListsTable.id, id));
  if (!list) {
    res.status(404).json({ error: "Contact list not found" });
    return;
  }

  const memberships = await db
    .select({ contactId: contactListContactsTable.contactId })
    .from(contactListContactsTable)
    .where(eq(contactListContactsTable.listId, id));

  const contactIds = memberships.map((m) => m.contactId);
  let contacts: typeof contactsTable.$inferSelect[] = [];
  if (contactIds.length > 0) {
    const allContacts = await db.select().from(contactsTable);
    contacts = allContacts.filter((c) => contactIds.includes(c.id));
  }

  res.json({
    ...fmtList(list),
    contacts: contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  });
});

// Delete contact list
router.delete("/contact-lists/:id", async (req, res) => {
  const { id } = DeleteContactListParams.parse({ id: Number(req.params.id) });
  await db.delete(contactListsTable).where(eq(contactListsTable.id, id));
  res.status(204).send();
});

// Add contact to list
router.post("/contact-lists/:id/contacts", async (req, res) => {
  const { id } = AddContactToListParams.parse({ id: Number(req.params.id) });
  const body = AddContactToListBody.parse(req.body);

  await db.insert(contactListContactsTable).values({ listId: id, contactId: body.contactId }).onConflictDoNothing();

  const count = await db
    .select()
    .from(contactListContactsTable)
    .where(eq(contactListContactsTable.listId, id));
  await db.update(contactListsTable).set({ contactCount: count.length }).where(eq(contactListsTable.id, id));

  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, body.contactId));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.status(201).json({ ...contact, createdAt: contact.createdAt.toISOString() });
});

// Remove contact from list
router.delete("/contact-lists/:id/contacts/:contactId", async (req, res) => {
  const { id, contactId } = RemoveContactFromListParams.parse({
    id: Number(req.params.id),
    contactId: Number(req.params.contactId),
  });

  await db
    .delete(contactListContactsTable)
    .where(and(eq(contactListContactsTable.listId, id), eq(contactListContactsTable.contactId, contactId)));

  const count = await db
    .select()
    .from(contactListContactsTable)
    .where(eq(contactListContactsTable.listId, id));
  await db.update(contactListsTable).set({ contactCount: count.length }).where(eq(contactListsTable.id, id));

  res.status(204).send();
});

export default router;
