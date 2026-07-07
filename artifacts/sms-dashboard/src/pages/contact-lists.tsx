import { useState } from "react";
import { 
  useListContactLists,
  getListContactListsQueryKey,
  useCreateContactList,
  useDeleteContactList,
  useGetContactList,
  useAddContactToList,
  useRemoveContactFromList,
  useListContacts
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ListOrdered, 
  Plus, 
  Trash2, 
  Users,
  Search,
  UserPlus,
  ArrowLeft,
  UserMinus
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Contact } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const listFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional().nullable()
});

export default function ContactLists() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeListId, setActiveListId] = useState<number | null>(null);

  const { data: lists, isLoading } = useListContactLists({
    query: {
      queryKey: getListContactListsQueryKey()
    }
  });

  const createList = useCreateContactList();
  const deleteList = useDeleteContactList();

  const form = useForm<z.infer<typeof listFormSchema>>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  function onSubmitCreate(values: z.infer<typeof listFormSchema>) {
    createList.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactListsQueryKey() });
        setCreateDialogOpen(false);
        form.reset();
        toast({ title: "List created successfully" });
      },
      onError: () => {
        toast({ title: "Failed to create list", variant: "destructive" });
      }
    });
  }

  function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this list? The contacts inside will not be deleted.")) {
      deleteList.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListContactListsQueryKey() });
          toast({ title: "List deleted" });
          if (activeListId === id) setActiveListId(null);
        },
        onError: () => {
          toast({ title: "Failed to delete list", variant: "destructive" });
        }
      });
    }
  }

  if (activeListId) {
    return <ListDetail listId={activeListId} onBack={() => setActiveListId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Contact Lists</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize recipients into targeted segments.
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create List
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Contact List</DialogTitle>
              <DialogDescription>
                Create a new segment to organize your contacts.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>List Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. VIP Customers Q1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="High value customers engaged in Q1" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createList.isPending}>
                    {createList.isPending ? "Creating..." : "Create List"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-md">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent className="pb-2">
                <Skeleton className="h-8 w-24" />
              </CardContent>
              <CardFooter className="pt-2 border-t mt-4 flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </CardFooter>
            </Card>
          ))
        ) : lists && lists.length > 0 ? (
          lists.map((list) => (
            <Card 
              key={list.id} 
              className="rounded-md hover-elevate cursor-pointer transition-colors border-border/50 hover:border-primary/50"
              onClick={() => setActiveListId(list.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex justify-between items-start">
                  <span className="truncate pr-4">{list.name}</span>
                  <div className="p-1.5 bg-primary/10 rounded-md text-primary shrink-0">
                    <ListOrdered className="w-4 h-4" />
                  </div>
                </CardTitle>
                <CardDescription className="line-clamp-2 h-10 mt-1">
                  {list.description || "No description provided."}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold font-mono tracking-tight leading-none">
                    {list.contactCount}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium mb-1">
                    contacts
                  </span>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t flex justify-between items-center text-xs text-muted-foreground mt-4">
                <span>Created {format(new Date(list.createdAt), 'MMM d, yyyy')}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 -mr-2"
                  onClick={(e) => handleDelete(list.id, e)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/30 border border-dashed rounded-md">
            <ListOrdered className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium text-lg text-foreground">No lists created yet</p>
            <p className="text-sm max-w-sm mt-1 text-center">Group your contacts into segments to target your SMS campaigns more effectively.</p>
            <Button variant="outline" className="mt-6" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First List
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ListDetail({ listId, onBack }: { listId: number, onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: listDetail, isLoading } = useGetContactList(listId, {
    query: {
      enabled: !!listId,
      queryKey: ['contact-list', listId]
    }
  });

  const { data: allContacts, isLoading: contactsLoading } = useListContacts({
    search: search || undefined
  }, {
    query: {
      enabled: addDialogOpen,
      queryKey: ['contacts', { search }]
    }
  });

  const addContact = useAddContactToList();
  const removeContact = useRemoveContactFromList();

  function handleAdd(contactId: number) {
    addContact.mutate({ id: listId, data: { contactId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['contact-list', listId] });
        queryClient.invalidateQueries({ queryKey: getListContactListsQueryKey() });
        toast({ title: "Contact added to list" });
      },
      onError: () => {
        toast({ title: "Failed to add contact", variant: "destructive" });
      }
    });
  }

  function handleRemove(contactId: number) {
    removeContact.mutate({ id: listId, contactId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['contact-list', listId] });
        queryClient.invalidateQueries({ queryKey: getListContactListsQueryKey() });
        toast({ title: "Contact removed from list" });
      },
      onError: () => {
        toast({ title: "Failed to remove contact", variant: "destructive" });
      }
    });
  }

  // Find contacts that are not already in the list
  const availableContacts = allContacts?.filter(
    c => !listDetail?.contacts?.some(lc => lc.id === c.id)
  ) || [];

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-4 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground truncate">
              {isLoading ? <Skeleton className="h-8 w-48" /> : listDetail?.name}
            </h1>
            {!isLoading && listDetail && (
              <Badge variant="secondary" className="font-mono text-sm px-2 py-0.5 shrink-0">
                {listDetail.contactCount} contacts
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm truncate">
            {isLoading ? <Skeleton className="h-4 w-64" /> : listDetail?.description || "No description"}
          </p>
        </div>
        
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <UserPlus className="w-4 h-4" />
              Add Contacts
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>Add Contacts to {listDetail?.name}</DialogTitle>
              <DialogDescription>
                Search and select contacts to add to this list.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search contacts..." 
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden min-h-[300px] border rounded-md">
              <ScrollArea className="h-full">
                {contactsLoading ? (
                  <div className="p-4 space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div>
                        <Skeleton className="h-8 w-16" />
                      </div>
                    ))}
                  </div>
                ) : availableContacts.length > 0 ? (
                  <div className="divide-y">
                    {availableContacts.map(contact => (
                      <div key={contact.id} className="p-3 flex justify-between items-center hover:bg-muted/50 transition-colors">
                        <div>
                          <div className="font-medium text-sm">{contact.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{contact.phoneNumber}</div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleAdd(contact.id)}
                          disabled={addContact.isPending}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
                    <Users className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm">No contacts available to add</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-md flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : listDetail?.contacts && listDetail.contacts.length > 0 ? (
            <div className="divide-y">
              {listDetail.contacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-6 min-w-0">
                    <div className="font-medium text-sm w-48 truncate">{contact.name}</div>
                    <div className="text-sm font-mono text-muted-foreground w-40">{contact.phoneNumber}</div>
                    <div className="flex gap-1 flex-wrap">
                      {contact.tags?.split(',').map((t, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] py-0 h-4 bg-muted/50 border-transparent">
                          {t.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
                    onClick={() => handleRemove(contact.id)}
                    disabled={removeContact.isPending}
                    title="Remove from list"
                  >
                    <UserMinus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground h-full min-h-[300px]">
              <Users className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">List is empty</p>
              <p className="text-sm mt-1 max-w-sm text-center">Add contacts to this list to start sending targeted campaigns.</p>
              <Button variant="outline" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Contacts
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}