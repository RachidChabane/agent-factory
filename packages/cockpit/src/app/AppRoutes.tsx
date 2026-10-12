import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { ROUTE_PATTERNS } from '../model/routes.ts';
import { NotFoundView } from '../views/NotFoundView.tsx';
import { PageFallback } from './PageFallback.tsx';
import { ProjectRoute } from './ProjectRoute.tsx';
import { ViewErrorBoundary } from './ViewErrorBoundary.tsx';

const BoardView = lazy(() => import('../views/board/BoardView.tsx').then((module) => ({ default: module.BoardView })));
const ProjectOverview = lazy(() => import('../views/overview/ProjectOverview.tsx').then((module) => ({ default: module.ProjectOverview })));
const RequestsView = lazy(() => import('../views/requests/RequestsView.tsx').then((module) => ({ default: module.RequestsView })));
const IssuesView = lazy(() => import('../views/issues/IssuesView.tsx').then((module) => ({ default: module.IssuesView })));
const PullRequestsView = lazy(() => import('../views/pull-requests/PullRequestsView.tsx').then((module) => ({ default: module.PullRequestsView })));
const DeliveryView = lazy(() => import('../views/delivery/DeliveryView.tsx').then((module) => ({ default: module.DeliveryView })));
const ReleasesView = lazy(() => import('../views/releases/ReleasesView.tsx').then((module) => ({ default: module.ReleasesView })));
const AuditsView = lazy(() => import('../views/audits/AuditsView.tsx').then((module) => ({ default: module.AuditsView })));
const KnowledgeView = lazy(() => import('../views/knowledge/KnowledgeView.tsx').then((module) => ({ default: module.KnowledgeView })));
const ProjectSettingsView = lazy(() => import('../views/settings/ProjectSettingsView.tsx').then((module) => ({ default: module.ProjectSettingsView })));
const InstallationSettingsView = lazy(() =>
  import('../views/settings/InstallationSettingsView.tsx').then((module) => ({ default: module.InstallationSettingsView })),
);
const RunsView = lazy(() => import('../views/runs/RunsView.tsx').then((module) => ({ default: module.RunsView })));
const UsageView = lazy(() => import('../views/usage/UsageView.tsx').then((module) => ({ default: module.UsageView })));

export function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <ViewErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path={ROUTE_PATTERNS.board} element={<BoardView />} />
          <Route path={ROUTE_PATTERNS.project} element={<ProjectRoute />}>
            <Route index element={<ProjectOverview />} />
            <Route path={ROUTE_PATTERNS.requests} element={<RequestsView />} />
            <Route path={ROUTE_PATTERNS.request} element={<RequestsView />} />
            <Route path={ROUTE_PATTERNS.issues} element={<IssuesView />} />
            <Route path={ROUTE_PATTERNS.issue} element={<IssuesView />} />
            <Route path={ROUTE_PATTERNS.pullRequests} element={<PullRequestsView />} />
            <Route path={ROUTE_PATTERNS.pullRequest} element={<PullRequestsView />} />
            <Route path={ROUTE_PATTERNS.delivery} element={<DeliveryView />} />
            <Route path={ROUTE_PATTERNS.releases} element={<ReleasesView />} />
            <Route path={ROUTE_PATTERNS.release} element={<ReleasesView />} />
            <Route path={ROUTE_PATTERNS.audits} element={<AuditsView />} />
            <Route path={ROUTE_PATTERNS.audit} element={<AuditsView />} />
            <Route path={ROUTE_PATTERNS.knowledge} element={<KnowledgeView />} />
            <Route path={ROUTE_PATTERNS.projectSettings} element={<ProjectSettingsView />} />
            <Route path="*" element={<NotFoundView />} />
          </Route>
          <Route path={ROUTE_PATTERNS.runs} element={<RunsView />} />
          <Route path={ROUTE_PATTERNS.run} element={<RunsView />} />
          <Route path={ROUTE_PATTERNS.usage} element={<UsageView />} />
          <Route path={ROUTE_PATTERNS.settings} element={<InstallationSettingsView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </Suspense>
    </ViewErrorBoundary>
  );
}
