import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ToastService } from '../../core/services/api.service';

interface Resume {
  _id: string; candidateName: string; email: string;
  skills: string[]; source: string; createdAt: string;
}

/**
 * Resumes list page.
 *
 * Angular 19 upgrades:
 *  - inject() DI.
 *  - @if / @for built-in control flow.
 *  - No CommonModule import.
 */
@Component({
  selector: 'app-resumes',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div>
      <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <h1 class="page-title">Resumes</h1>
          <p class="page-sub">{{ resumes.length }} resume(s) in your pool</p>
        </div>
        <a routerLink="/upload" class="btn btn-primary">+ Upload Resumes</a>
      </div>

      @if (loading) {
        <div class="loading-center"><div class="spinner"></div></div>
      }

      @if (!loading && resumes.length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No resumes yet</div>
          <p>Upload PDF or DOCX resumes to start matching.</p>
          <a routerLink="/upload" class="btn btn-primary" style="margin-top:16px;display:inline-flex">Upload Now</a>
        </div>
      }

      @if (!loading && resumes.length > 0) {
        <table class="table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Email</th>
              <th>Skills</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of resumes; track r._id) {
              <tr>
                <td>
                  <div style="font-weight:600;color:var(--text)">{{ r.candidateName || 'Unknown' }}</div>
                  <div style="font-size:11px;color:var(--text-muted)">{{ r.source || 'upload' }}</div>
                </td>
                <td style="color:var(--text-muted)">{{ r.email || '—' }}</td>
                <td>
                  @for (s of (r.skills||[]).slice(0,4); track s) {
                    <span class="pill pill-blue">{{ s }}</span>
                  }
                  @if ((r.skills||[]).length > 4) {
                    <span style="font-size:11px;color:var(--text-muted)">+{{ (r.skills||[]).length - 4 }}</span>
                  }
                </td>
                <td style="color:var(--text-muted);font-size:12px">{{ formatDate(r.createdAt) }}</td>
                <td>
                  <button class="btn btn-danger" style="font-size:11px;padding:4px 10px" (click)="delete(r._id)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `
})
export class ResumesComponent implements OnInit {
  resumes: Resume[] = [];
  loading = false;

  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);

  ngOnInit() {
    this.loading = true;
    this.api.getResumes().subscribe({
      next: (r) => { this.resumes = (r.data || []) as Resume[]; this.loading = false; },
      error: () => (this.loading = false)
    });
  }

  delete(id: string) {
    if (!confirm('Delete this resume?')) return;
    this.api.deleteResume(id).subscribe({
      next: () => { this.resumes = this.resumes.filter(r => r._id !== id); this.toast.show('Resume deleted'); },
      error: () => this.toast.show('Failed to delete', 'error')
    });
  }

  formatDate(d: string) { return d ? new Date(d).toLocaleDateString() : '—'; }
}
