import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/internal/operators/tap';

/**
 * Core HTTP service for all API calls.
 * Angular 19: Uses inject() for dependency injection (tree-shakable, no constructor needed).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = 'http://localhost:5000/api';

  // ── Auth ──────────────────────────────────────────────────────────────────
 login(body: unknown) {
  return this.http.post<any>(
    `${this.base}/auth/login`,
    body
  );
}
  register(body: unknown) { return this.http.post<{ data?: { token: string; user: unknown }; token?: string; user?: unknown }>(`${this.base}/auth/register`, body); }
  getMe()                 { return this.http.get<{ data: unknown }>(`${this.base}/auth/me`); }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  getJobs(params?: Record<string, unknown>)  { return this.http.get<{ data: unknown[] }>(`${this.base}/jobs`, { params: params as Record<string, string> }); }
  getJob(id: string)                         { return this.http.get<{ data: unknown }>(`${this.base}/jobs/${id}`); }
  createJob(body: unknown)                   { return this.http.post<{ data: unknown }>(`${this.base}/jobs`, body); }
  updateJob(id: string, body: unknown)       { return this.http.put<{ data: unknown }>(`${this.base}/jobs/${id}`, body); }
  deleteJob(id: string)                      { return this.http.delete<{ data: unknown }>(`${this.base}/jobs/${id}`); }

  // ── Resumes ───────────────────────────────────────────────────────────────
  getResumes(params?: Record<string, unknown>) { return this.http.get<{ data: unknown[] }>(`${this.base}/resumes`, { params: params as Record<string, string> }); }
  uploadResumes(form: FormData)                { return this.http.post<{ data: unknown[] }>(`${this.base}/resumes/upload`, form); }
  createManualResume(body: unknown)            { return this.http.post<{ data: unknown }>(`${this.base}/resumes/manual`, body); }
  deleteResume(id: string)                     { return this.http.delete<{ data: unknown }>(`${this.base}/resumes/${id}`); }

  // ── Matches ───────────────────────────────────────────────────────────────
  runMatching(jobId: string, body: unknown)   { return this.http.post<{ data: unknown[] }>(`${this.base}/matches/run/${jobId}`, body); }
  getJobMatches(jobId: string)                { return this.http.get<{ data: unknown[] }>(`${this.base}/matches/job/${jobId}`); }
  updateMatchStatus(id: string, body: unknown){ return this.http.put<{ data: unknown }>(`${this.base}/matches/${id}/status`, body); }

  // ── Analytics ─────────────────────────────────────────────────────────────
  getDashboard() { return this.http.get<{ data: { stats: unknown; recentJobs: unknown[] }; stats?: unknown; recentJobs?: unknown[] }>(`${this.base}/analytics/dashboard`); }
  generateReport(data: any) {
  return this.http.post(
    `${this.base}/report/generate-report`,
    data,
    {
      responseType: 'blob'
    }
  );
}
  // ── NLP ───────────────────────────────────────────────────────────────────
  nlpHealth()             { return this.http.get<unknown>(`${this.base}/nlp/health`); }
  nlpScore(body: unknown) { return this.http.post<unknown>(`${this.base}/nlp/score`, body); }
  nlpExplain(body: unknown)      { return this.http.post<unknown>(`${this.base}/nlp/explain`, body); }
  nlpExtractSkills(body: unknown){ return this.http.post<unknown>(`${this.base}/nlp/skills/extract`, body); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth service — Angular 19: signal-based reactive user/token state
// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  /** Reactive signal holding the current token (null when logged out). */
  private readonly _token = signal<string | null>(localStorage.getItem('token'));

  /** Reactive signal holding the current user object. */
  private readonly _user = signal<unknown>(this.parseUser());

  /** Computed signal: true when a token exists. */
  readonly isLoggedIn = computed(() => !!this._token());

  /** Read-only token signal. */
  readonly token = this._token.asReadonly();

  /** Read-only user signal. */
  readonly user = this._user.asReadonly();

  /** @deprecated Use the user signal: authService.user() */
  get userSnapshot() { return this._user(); }

 login(data: unknown) {
  return this.api.login(data).pipe(
    tap((res: any) => {
      console.log("FULL RESPONSE:", res);
      console.log("res.data:", res.data);
      console.log("res.token:", res.token);

      const token = res.token;
      const user = res.data;

      console.log("FINAL USER:", user);

      if (token && user) {
        this.setSession(token, user);
      }
    })
  );
 }
  register(data: unknown) { return this.api.register(data); }

  setSession(token: string, user: unknown) {
  console.log("Saving token:", token);
  console.log("Saving user:", user);

  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));

  console.log("Stored user:", localStorage.getItem('user'));

  this._token.set(token);
  this._user.set(user);

  console.log("Signal user:", this._user());
 }
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this._token.set(null);
    this._user.set(null);
  }

  private parseUser(): unknown {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast service — lightweight imperative notifications
// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastEl: HTMLElement | null = null;

  show(message: string, type: 'success' | 'error' = 'success') {
    if (this.toastEl?.parentNode) this.toastEl.parentNode.removeChild(this.toastEl);
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    this.toastEl = el;
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
  }
}
