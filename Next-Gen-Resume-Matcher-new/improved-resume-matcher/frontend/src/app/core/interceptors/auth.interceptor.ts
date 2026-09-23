import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Functional HTTP interceptor (Angular 14+ style, fully compatible with Angular 19).
 * Reads the JWT from localStorage and attaches it as a Bearer token to every outgoing request.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
