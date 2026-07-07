import { Router as WouterRouter, Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import Contacts from "@/pages/contacts";
import ContactLists from "@/pages/contact-lists";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Messages from "@/pages/messages";
import MobilePage from "@/pages/mobile";
import SetupPage from "@/pages/setup";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Full-screen pages — no dashboard chrome */}
      <Route path="/mobile" component={MobilePage} />
      <Route path="/setup" component={SetupPage} />

      {/* Dashboard routes — wrapped in sidebar layout */}
      <Route>
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
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
