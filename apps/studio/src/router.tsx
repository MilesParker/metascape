// SPDX-License-Identifier: EPL-2.0
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router';
import { modelById } from './catalog';
import { loadFamily } from './catalog/loaders';
import { LabPage } from './library/LabPage';
import { LibraryPage } from './library/LibraryPage';
import { NotFound } from './library/NotFound';
import { validateLibrarySearch, validateWorkbenchSearch } from './lib/url-state';
import { AppShell } from './shell/AppShell';
import { WorkbenchError, WorkbenchPending } from './workbench/WorkbenchPending';

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound });

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateLibrarySearch,
  component: LibraryPage,
});

export const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models/$modelId',
  validateSearch: validateWorkbenchSearch,
  loader: async ({ params }) => {
    const entry = modelById(params.modelId);
    if (!entry) throw notFound();
    const models = await loadFamily(entry.familyId);
    const model = models.get(entry.id);
    if (!model) throw notFound();
    return { entry, model };
  },
  // The model code stays loaded; only the family module is fetched, once.
  staleTime: Infinity,
  pendingMs: 120,
  pendingComponent: WorkbenchPending,
  errorComponent: WorkbenchError,
  // The Workbench and its libraries load with the first model opened.
  component: lazyRouteComponent(() => import('./workbench/WorkbenchPage'), 'WorkbenchPage'),
});

const labRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lab', component: LabPage });

/**
 * Addresses live after the `#`, so the Studio works from any static host.
 * The first Studio addressed a model as `#name`; those links still work.
 */
function upgradeLegacyAddress(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  if (hash.length > 1 && !hash.startsWith('#/')) {
    const id = decodeURIComponent(hash.slice(1)).toLowerCase();
    window.history.replaceState(null, '', `${window.location.pathname}#/models/${id}`);
  }
}

upgradeLegacyAddress();

export const router = createRouter({
  routeTree: rootRoute.addChildren([libraryRoute, modelRoute, labRoute]),
  history: createHashHistory(),
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
