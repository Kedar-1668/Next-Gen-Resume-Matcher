import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

/**
 * Application routes.
 *
 * Angular 19 upgrades used:
 *  - withComponentInputBinding() (registered in main.ts) lets routed components
 *    receive route params/query-params as @Input() properties automatically.
 *  - withViewTransitions() (registered in main.ts) enables View Transitions API.
 *  - Lazy-loaded standalone components (same pattern as v17, still the canonical v19 approach).
 */
export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '',                   redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',          loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'jobs',               loadComponent: () => import('./features/jobs/jobs.component').then(m => m.JobsComponent) },
      { path: 'jobs/:id',           loadComponent: () => import('./features/jobs/job-detail.component').then(m => m.JobDetailComponent) },
      { path: 'resumes',            loadComponent: () => import('./features/resumes/resumes.component').then(m => m.ResumesComponent) },
      { path: 'upload',             loadComponent: () => import('./features/upload/upload.component').then(m => m.UploadComponent) },
      { path: 'results/:jobId',     loadComponent: () => import('./features/results/results.component').then(m => m.ResultsComponent) },
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
