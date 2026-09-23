import { Component, OnInit, Input, inject } from "@angular/core";
import { RouterLink, Router } from "@angular/router";
import { ApiService } from "../../core/services/api.service";

interface JobDetail {
  _id: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  description: string;
  requiredSkills: string[];
  educationalRequirements: string;
  experienceRequirement: string;
}

/**
 * Job detail page.
 *
 * Angular 19 upgrades:
 *  - @Input() 'id' is automatically bound from the route parameter ':id'
 *    thanks to withComponentInputBinding() in main.ts — no ActivatedRoute needed.
 *  - inject() DI.
 *  - @if / @for built-in control flow.
 *  - No CommonModule import.
 */
@Component({
  selector: "app-job-detail",
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (job) {
      <div>
        <div class="page-header">
          <button class="back-btn" (click)="router.navigate(['/jobs'])">
            ← Back to Jobs
          </button>
          <div
            style="display:flex;align-items:center;justify-content:space-between"
          >
            <div>
              <h1 class="page-title">{{ job.title }}</h1>
              <p class="page-sub">{{ job.location }} · {{ job.jobType }}</p>
            </div>
            
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
          <div>
            <div class="card" style="margin-bottom:16px">
              <div style="font-weight:700;margin-bottom:10px">
                Job Description
              </div>
              <p style="color:var(--text-muted);line-height:1.7;font-size:13px">
                {{ job.description }}
              </p>
            </div>
            <div class="card">
              <div style="font-weight:700;margin-bottom:10px">
                Required Skills
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                @for (s of job.requiredSkills; track s) {
                  <span class="pill pill-blue">{{ s }}</span>
                }
              </div>
            </div>
          </div>
          <div>
            <div class="card">
              <div style="font-weight:700;margin-bottom:12px">Requirements</div>
              <div style="display:grid;gap:10px">
                <div>
                  <div class="form-label">Education</div>
                  <div style="font-size:13px">
                    {{ job.educationalRequirements || "Not specified" }}
                  </div>
                </div>
                <div>
                  <div class="form-label">Experience</div>
                  <div style="font-size:13px">
                    {{ job.experienceRequirement || "0" }} years
                  </div>
                </div>
                <div>
                  <div class="form-label">Location</div>
                  <div style="font-size:13px">
                    {{ job.location || "Not specified" }}
                  </div>
                </div>
                <div>
                  <div class="form-label">Type</div>
                  <div style="font-size:13px">
                    {{ job.jobType || "full-time" }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="loading-center"><div class="spinner"></div></div>
    }
  `,
})
export class JobDetailComponent implements OnInit {
  /**
   * Angular 19: automatically bound from the ':id' route param
   * when withComponentInputBinding() is enabled in main.ts.
   */
  @Input() id!: string;
  loadingMatch = false;
  job: JobDetail | null = null;
  readonly router = inject(Router);
  private readonly api = inject(ApiService);

  ngOnInit() {
    this.api.getJob(this.id).subscribe({
      next: (r) => (this.job = r.data as JobDetail),
      error: () => this.router.navigate(["/jobs"]),
    });
  }

  
}
