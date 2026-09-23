import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/api.service';

/**
 * Register page.
 * Angular 19: inject(), @if control flow, no CommonModule.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)">
      <div style="width:380px;padding:40px;background:var(--surface);border:1px solid var(--border);border-radius:16px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:22px;font-weight:800;color:var(--accent)">Create Account</div>
          <div style="font-size:13px;color:var(--text-muted)">Start screening candidates with AI</div>
        </div>

        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" [(ngModel)]="name" placeholder="Jane Smith">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" [(ngModel)]="email" placeholder="jane@company.com">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" type="password" [(ngModel)]="password" placeholder="Min 6 characters">
        </div>

        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px"
          (click)="register()" [disabled]="loading">
          {{ loading ? 'Creating…' : 'Create Account' }}
        </button>

        <div style="text-align:center;margin-top:20px;font-size:13px;color:var(--text-muted)">
          Already have an account? <a routerLink="/login">Sign in</a>
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
export class RegisterComponent {
  name = '';
  email = '';
  password = '';
  loading = false;
  error = '';

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  register() {
    if (!this.name || !this.email || !this.password) { this.error = 'Fill all fields.'; return; }
    this.loading = true;
    this.error = '';
    this.auth.register({ name: this.name, email: this.email, password: this.password }).subscribe({
      next: (res) => {
        const token = (res as { data?: { token: string }; token?: string }).data?.token
                   || (res as { token?: string }).token || '';
        const user  = (res as { data?: { user: unknown }; user?: unknown }).data?.user
                   || (res as { user?: unknown }).user;
        this.auth.setSession(token, user);
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.error = (e.error as { error?: string })?.error || 'Registration failed.';
        this.loading = false;
      }
    });
  }
}
