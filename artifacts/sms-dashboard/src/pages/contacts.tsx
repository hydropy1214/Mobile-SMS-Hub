import { useState } from "react";
import { 
  useListContacts, 
  getListContactsQueryKey,
  useCreateContact,
  useUpdateContact,
  useDeleteContact
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit,
  Search,
  Hash
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Contact } from "@workspace/api-client-react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phoneNumber: z.string().min(5, "Phone number is required"),
  tags: z.string().optional().nullable()
});

export default function Contacts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");

  // Use debounced search value for the API query
  const { data: contacts, isLoading } = useListContacts({
    search: search || undefined
  }, {
    query: {
      queryKey: ['contacts', { search }]
    }
  });

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      tags: ""
    }
  });

  const editForm = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      tags: ""
    }
  });

  // Effect to reset edit form when editContact changes
  useState(() => {
    if (editContact) {
      editForm.reset({
        name: editContact.name,
        phoneNumber: editContact.phoneNumber,
        tags: editContact.tags || ""
      });
    }
  });

  function openEditDialog(contact: Contact) {
    setEditContact(contact);
    editForm.reset({
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      tags: contact.tags || ""
    });
  }

  function onSubmitCreate(values: z.infer<typeof formSchema>) {
    createContact.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        setCreateDialogOpen(false);
        form.reset();
        toast({ title: "Contact added successfully" });
      },
      onError: () => {
        toast({ title: "Failed to add contact", variant: "destructive" });
      }
    });
  }

  function onSubmitEdit(values: z.infer<typeof formSchema>) {
    if (!editContact) return;
    updateContact.mutate({ id: editContact.id, data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        setEditContact(null);
        toast({ title: "Contact updated successfully" });
      },
      onError: () => {
        toast({ title: "Failed to update contact", variant: "destructive" });
      }
    });
  }

  function handleDelete(id: number) {
    if (confirm("Are you sure you want to delete this contact?")) {
      deleteContact.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
          toast({ title: "Contact deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete contact", variant: "destructive" });
        }
      });
    }
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your recipient database for SMS campaigns.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation('/contact-lists')}>
            Manage Lists
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Contact</DialogTitle>
                <DialogDescription>
                  Enter the details for the new recipient.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+1234567890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags (Comma separated)</FormLabel>
                        <FormControl>
                          <Input placeholder="vip, customer, region-us" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createContact.isPending}>
                      {createContact.isPending ? "Adding..." : "Add Contact"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search contacts by name or phone..." 
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="rounded-md flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur z-10">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : contacts && contacts.length > 0 ? (
                contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                          {contact.name.substring(0, 2)}
                        </div>
                        <span className="font-medium text-sm">{contact.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{contact.phoneNumber}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {contact.tags ? contact.tags.split(',').map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs py-0 h-5 font-mono">
                            <Hash className="w-3 h-3 mr-0.5 opacity-50" />
                            {tag.trim()}
                          </Badge>
                        )) : <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(contact.createdAt), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(contact)}
                        >
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(contact.id)}
                          disabled={deleteContact.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Users className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No contacts found</p>
                      {search ? (
                        <p className="text-sm mt-1">No results match your search.</p>
                      ) : (
                        <p className="text-sm max-w-sm mt-1">Add your first recipient to start building your database.</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editContact} onOpenChange={(open) => !open && setEditContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update information for this recipient.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+1234567890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (Comma separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="vip, customer, region-us" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateContact.isPending}>
                  {updateContact.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}