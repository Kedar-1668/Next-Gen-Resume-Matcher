import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, AuthService } from '../../core/services/api.service';

interface DashStats { totalJobs?: number; totalResumes?: number; totalMatches?: number; shortlisted?: number; }
interface DashJob   { _id: string; title: string; company: string; totalApplicants?: number; }

/**
 * Dashboard component.
 *
 * Angular 19 upgrades:
 *  - inject() instead of constructor DI.
 *  - @if / @for built-in control flow (no CommonModule needed).
 *  - user read from AuthService signal.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div>
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Welcome back, {{ userName }}. Here's your recruitment overview.</p>
      </div>

      @if (loading) {
        <div class="loading-center"><div class="spinner"></div></div>
      } @else {
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value" style="color:var(--accent)">{{ stats.totalJobs || 0 }}</div>
            <div class="stat-label">Active Jobs</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--green)">{{ stats.totalResumes || 0 }}</div>
            <div class="stat-label">Resumes</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--purple)">{{ stats.totalMatches || 0 }}</div>
            <div class="stat-label">Matches Run</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:var(--yellow)">{{ stats.shortlisted || 0 }}</div>
            <div class="stat-label">Shortlisted</div>
          </div>
        </div>

        <!-- Quick actions -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px">
          <a routerLink="/upload" class="card" style="display:flex;align-items:center;gap:12px;text-decoration:none;transition:border 0.15s;cursor:pointer"
            onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
            <span style="font-size:24px">📄</span>
            <div>
              <div style="font-weight:700;color:var(--text)">Upload Resume</div>
              <div style="font-size:12px;color:var(--text-muted)">Add PDF or DOCX</div>
            </div>
          </a>
          <a routerLink="/jobs" class="card" style="display:flex;align-items:center;gap:12px;text-decoration:none;cursor:pointer"
            onmouseenter="this.style.borderColor='var(--green)'" onmouseleave="this.style.borderColor='var(--border)'">
            <span style="font-size:24px">💼</span>
            <div>
              <div style="font-weight:700;color:var(--text)">Post a Job</div>
              <div style="font-size:12px;color:var(--text-muted)">Create JD & run match</div>
            </div>
          </a>
          <a routerLink="/resumes" class="card" style="display:flex;align-items:center;gap:12px;text-decoration:none;cursor:pointer"
            onmouseenter="this.style.borderColor='var(--purple)'" onmouseleave="this.style.borderColor='var(--border)'">
            <span style="font-size:24px">👥</span>
            <div>
              <div style="font-weight:700;color:var(--text)">View Resumes</div>
              <div style="font-size:12px;color:var(--text-muted)">Manage candidates</div>
            </div>
          </a>
        </div>

        <!-- Recent jobs -->
        @if (recentJobs.length > 0) {
          <div class="card">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">Recent Jobs</div>
            <table class="table">
              <thead><tr>
                <th>Title</th><th>Applicants</th><th>Action</th>
              </tr></thead>
              <tbody>
                @for (job of recentJobs; track job._id) {
                  <tr>
                    <td style="font-weight:600">{{ job.title }}</td>
                    
                    <td><span class="pill pill-blue">{{ job.totalApplicants || 0 }}</span></td>
                    <td><a [routerLink]="['/results', job._id]" style="color:var(--accent);font-size:12px;font-weight:600">View Results →</a></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            <div class="empty-icon">🚀</div>
            <div class="empty-title">Get started</div>
            <p>Upload resumes and create a job to run AI matching.</p>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
              <a routerLink="/upload" class="btn btn-primary">Upload Resume</a>
              <a routerLink="/jobs" class="btn btn-secondary">Create Job</a>
            </div>
          </div>
        }
      }
    </div>
  `
})
export class DashboardComponent implements OnInit {
  stats: DashStats = {};
  recentJobs: DashJob[] = [];
  loading = true;

  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);

  get userName(): string {
    const u = this.auth.user() as { name?: string } | null;
    return u?.name ?? '';
  }

  ngOnInit() {
  this.api.getDashboard().subscribe({
    next: (r: any) => {
  console.log("Dashboard response:", r);

  this.stats = {
    totalJobs: r.data?.totalJobs || 0,
    totalResumes: r.data?.totalResumes || 0,
    totalMatches: r.data?.totalMatches || 0,
    shortlisted: r.data?.shortlisted || 0
  };

  const matches = r.data?.recentMatches || [];

  const uniqueJobsMap = new Map();

  matches.forEach((match: any) => {
    const jobId = match.job?._id;

    if (!uniqueJobsMap.has(jobId)) {
      uniqueJobsMap.set(jobId, {
        _id: jobId,
        title: match.job?.title,
        company: match.job?.company,
        totalApplicants: 1
      });
    } else {
      uniqueJobsMap.get(jobId).totalApplicants++;
    }
  });

  this.recentJobs = Array.from(uniqueJobsMap.values());

  this.loading = false;
},

    error: () => {
      this.api.getJobs({ limit: '5' }).subscribe({
        next: (r: any) => {
          this.recentJobs = r.data || [];
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
    }
  });
}
}
