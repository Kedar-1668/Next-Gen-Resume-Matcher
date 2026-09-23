import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, ToastService } from '../../core/services/api.service';

/**
 * Login page.
 *
 * Angular 19 upgrades:
 *  - Removed CommonModule (no longer needed; @if replaces *ngIf).
 *  - inject() replaces constructor injection.
 *  - Built-in @if control flow instead of *ngIf structural directive.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)">
      <div style="width:380px;padding:40px;background:var(--surface);border:1px solid var(--border);border-radius:16px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:22px;font-weight:800;color:var(--accent);margin-bottom:6px">Next-Gen Resume Matcher</div>
          <div style="font-size:13px;color:var(--text-muted)">Sign in to your recruiter account</div>
        </div>

        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" [(ngModel)]="email" placeholder="you@company.com">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" type="password" [(ngModel)]="password" placeholder="••••••••" (keyup.enter)="login()">
        </div>

        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px"
          (click)="login()" [disabled]="loading">
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>

        <div style="text-align:center;margin-top:20px;font-size:13px;color:var(--text-muted)">
          Don't have an account? <a routerLink="/register">Register</a>
        </div>

        @if (error) {
          <div style="margin-top:14px;padding:10px;background:rgba(255,82,82,0.1);border:1px solid rgba(255,82,82,0.3);border-radius:8px;font-size:12px;color:var(--red)">
            {{ error }}
          </div>
        }
      </div>
    </div>
  `
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  error = '';

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  login() {
    if (!this.email || !this.password) { this.error = 'Please fill in all fields.'; return; }
    this.loading = true;
    this.error = '';
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
      this.router.navigate(['/dashboard']);
  },
      error: (e) => {
        this.error = (e.error as { error?: string })?.error || 'Login failed. Please try again.';
        this.loading = false;
      }
    });
  }
}
