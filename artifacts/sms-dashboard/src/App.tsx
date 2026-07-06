import { Router as WouterRouter, Route, Switch } from "wouter";
import { Layout } from "@/components/layout";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import Contacts from "@/pages/contacts";
import ContactLists from "@/pages/contact-lists";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Messages from "@/pages/messages";
import NotFound from "@/pages/not-found";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices" component={Devices} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/contact-lists" component={ContactLists} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/campaigns/:id" component={CampaignDetail} />
        <Route path="/messages" component={Messages} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* @ts-ignore */}
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
