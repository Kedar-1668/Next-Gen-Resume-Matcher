import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

/**
 * Functional route guard (Angular 14+ style).
 * Redirects unauthenticated users to /login.
 */
export const authGuard: CanActivateFn = () => {
  if (localStorage.getItem('token')) return true;
  inject(Router).navigate(['/login']);
  return false;
};
