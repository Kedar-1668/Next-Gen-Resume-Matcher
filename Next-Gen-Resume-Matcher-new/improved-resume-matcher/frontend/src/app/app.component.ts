import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './core/services/api.service';

/**
 * Root shell component — sidebar layout.
 *
 * Angular 19 upgrades:
 *  - Removed CommonModule import (no longer needed when using built-in control flow @if / @for).
 *  - inject() instead of constructor injection.
 *  - user is now read from the AuthService signal (reactive).
 *  - Template uses Angular 17+ built-in control flow (@if) — no *ngIf directives.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-logo">
          Next-Gen<br>Resume Matcher
          <span>AI RECRUITMENT ENGINE</span>
        </div>

        <nav style="flex:1">
          <button class="nav-link" routerLink="/dashboard" routerLinkActive="active">
            <span class="nav-icon">◆</span> Dashboard
          </button>
          <button class="nav-link" routerLink="/jobs" routerLinkActive="active">
            <span class="nav-icon">⊕</span> Jobs
          </button>
          <button class="nav-link" routerLink="/resumes" routerLinkActive="active">
            <span class="nav-icon">☉</span> Resumes
          </button>
          <button class="nav-link" routerLink="/upload" routerLinkActive="active">
            <span class="nav-icon">↑</span> Upload
          </button>
        </nav>

        <div class="sidebar-bottom">
          @if (currentUser) {
            <div class="user-info">
              <div class="avatar">{{ (asUser(currentUser).name)?.[0]?.toUpperCase() || 'U' }}</div>
              <div>
                <div style="font-size:13px;font-weight:600">{{ asUser(currentUser).name }}</div>
                <div style="font-size:11px;color:var(--text-muted)">{{ asUser(currentUser).role }}</div>
              </div>
            </div>
          }
          <button class="btn btn-secondary" style="width:100%;justify-content:center" (click)="logout()">
            Sign Out
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Read from the signal on each change-detection pass
  get currentUser() { return this.auth.user(); }

  ngOnInit() { /* user is reactive via signal — no manual fetch needed */ }

  /** Type-cast helper for template to avoid `any` property access warnings. */
  asUser(u: unknown): { name: string; role: string } {
    return u as { name: string; role: string };
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
