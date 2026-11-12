import { Route, Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AuthLayoutComponent } from './layout/auth/auth-layout.component';
import { ShellComponent } from './layout/shell/shell.component';

/**
 * A signed-out page inside the narrow auth frame.
 *
 * The path must be explicit. A parent route with `path: ''` and children also matches the bare URL "/" (children are
 * optional), so a guest guard on it would redirect "/" to "/" forever for a signed-in user.
 */
const authPage = (path: string, titleKey: string, loadComponent: NonNullable<Route['loadComponent']>): Route => ({
  path,
  component: AuthLayoutComponent,
  canActivate: [guestGuard],
  children: [{ path: '', data: { titleKey }, loadComponent }],
});

export const routes: Routes = [
  authPage('login', 'title.login', () =>
    import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  ),
  authPage('register', 'title.register', () =>
    import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  ),
  {
    // Everything behind sign-in. Dashboard, tasks and profile routes are added here in Phase 5.
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { titleKey: 'title.dashboard' },
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'schedule',
        data: { titleKey: 'title.schedule' },
        loadComponent: () => import('./features/schedule/schedule.component').then((m) => m.ScheduleComponent),
      },
      {
        path: 'profile',
        data: { titleKey: 'title.profile' },
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'tasks',
        children: [
          {
            path: '',
            data: { titleKey: 'title.tasks' },
            loadComponent: () => import('./features/tasks/list/task-list.component').then((m) => m.TaskListComponent),
          },
          {
            // Must come before ':id', or "new" would be read as an id.
            path: 'new',
            data: { titleKey: 'title.taskNew' },
            loadComponent: () => import('./features/tasks/create/task-create.component').then((m) => m.TaskCreateComponent),
          },
          {
            path: ':id',
            data: { titleKey: 'title.taskDetail' },
            loadComponent: () => import('./features/tasks/detail/task-detail.component').then((m) => m.TaskDetailComponent),
          },
          {
            path: ':id/edit',
            data: { titleKey: 'title.taskEdit' },
            loadComponent: () => import('./features/tasks/edit/task-edit.component').then((m) => m.TaskEditComponent),
          },
        ],
      },
      {
        path: '**',
        data: { titleKey: 'title.notFound' },
        loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];
