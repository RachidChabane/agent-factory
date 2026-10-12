import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '../ui/components/Toast.tsx';
import { CockpitProvider } from './context.tsx';
import { PageFallback } from './PageFallback.tsx';
import type { CockpitServices } from './services.ts';
import { Shell } from './Shell.tsx';
import type { Theme } from './theme.ts';
import { ThemeProvider } from './ThemeProvider.tsx';

const BoardView = lazy(() => import('../views/board/BoardView.tsx').then((module) => ({ default: module.BoardView })));
const RequestsView = lazy(() => import('../views/requests/RequestsView.tsx').then((module) => ({ default: module.RequestsView })));
const IssuesView = lazy(() => import('../views/issues/IssuesView.tsx').then((module) => ({ default: module.IssuesView })));
const RunsView = lazy(() => import('../views/runs/RunsView.tsx').then((module) => ({ default: module.RunsView })));
const PullRequestsView = lazy(() =>
  import('../views/pull-requests/PullRequestsView.tsx').then((module) => ({ default: module.PullRequestsView })),
);
const DeliveryView = lazy(() => import('../views/delivery/DeliveryView.tsx').then((module) => ({ default: module.DeliveryView })));
const ReleasesView = lazy(() => import('../views/releases/ReleasesView.tsx').then((module) => ({ default: module.ReleasesView })));
const AuditsView = lazy(() => import('../views/audits/AuditsView.tsx').then((module) => ({ default: module.AuditsView })));
const HealthView = lazy(() => import('../views/health/HealthView.tsx').then((module) => ({ default: module.HealthView })));
const CostsView = lazy(() => import('../views/costs/CostsView.tsx').then((module) => ({ default: module.CostsView })));
const KnowledgeView = lazy(() => import('../views/knowledge/KnowledgeView.tsx').then((module) => ({ default: module.KnowledgeView })));
const SettingsView = lazy(() => import('../views/settings/SettingsView.tsx').then((module) => ({ default: module.SettingsView })));
const NotFoundView = lazy(() => import('../views/NotFoundView.tsx').then((module) => ({ default: module.NotFoundView })));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<BoardView />} />
        <Route path="/requests" element={<RequestsView />} />
        <Route path="/requests/:requestId" element={<RequestsView />} />
        <Route path="/issues" element={<IssuesView />} />
        <Route path="/issues/:issueNumber" element={<IssuesView />} />
        <Route path="/runs" element={<RunsView />} />
        <Route path="/runs/:runId" element={<RunsView />} />
        <Route path="/pull-requests" element={<PullRequestsView />} />
        <Route path="/pull-requests/:pullRequestNumber" element={<PullRequestsView />} />
        <Route path="/ci" element={<DeliveryView />} />
        <Route path="/releases" element={<ReleasesView />} />
        <Route path="/releases/:releaseId" element={<ReleasesView />} />
        <Route path="/audits" element={<AuditsView />} />
        <Route path="/audits/:auditId" element={<AuditsView />} />
        <Route path="/health" element={<HealthView />} />
        <Route path="/costs" element={<CostsView />} />
        <Route path="/knowledge" element={<KnowledgeView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </Suspense>
  );
}

interface AppProps {
  readonly services: CockpitServices;
  readonly theme: Theme;
}

export function App({ services, theme }: AppProps) {
  return (
    <ThemeProvider initial={theme}>
      <ToastProvider>
        <CockpitProvider services={services}>
          <BrowserRouter>
            <Shell>
              <AppRoutes />
            </Shell>
          </BrowserRouter>
        </CockpitProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
