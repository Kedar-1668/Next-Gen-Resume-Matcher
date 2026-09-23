import { Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { ApiService, ToastService } from "../../core/services/api.service";

interface Job {
  _id: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  totalApplicants?: number;
  requiredSkills?: string[];
  description: string;
  educationalRequirements: string;
  experienceRequirement: string;
}

interface JobForm {
  title: string;
  location: string;
  jobType: string;
  description: string;
  educationalRequirements: string;
  experienceRequirement: string;
}

/**
 * Jobs list & creation page.
 *
 * Angular 19 upgrades:
 *  - inject() DI.
 *  - @if / @for built-in control flow.
 *  - No CommonModule import.
 */
@Component({
  selector: "app-jobs",
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div>
      <div
        class="page-header"
        style="display:flex;align-items:flex-start;justify-content:space-between"
      >
        <div>
          <h1 class="page-title">Jobs</h1>
          <p class="page-sub">Manage job descriptions and run AI matching</p>
        </div>
        @if (!showForm) {
          <button class="btn btn-primary" (click)="showForm = true">
            + New Job
          </button>
        }
      </div>

      <!-- Create / Edit form -->
      @if (showForm) {
        <div class="card" style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;margin-bottom:16px">
            {{ editId ? "Edit Job" : "Create New Job" }}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="form-group">
              <label class="form-label">Job Title *</label>
              <input
                class="form-input"
                [(ngModel)]="form.title"
                placeholder="e.g. MERN Stack Developer"
              />
            </div>
            <!--    <div class="form-group">
              <label class="form-label">Company *</label>
              <input class="form-input" [(ngModel)]="form.company" placeholder="Company name">
            </div>  -->
            <div class="form-group">
              <label class="form-label">Location</label>
              <input
                class="form-input"
                [(ngModel)]="form.location"
                placeholder="City or Remote"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Job Type</label>
              <select class="form-input" [(ngModel)]="form.jobType">
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Education Requirement</label>
              <input
                class="form-input"
                [(ngModel)]="form.educationalRequirements"
                placeholder="e.g. B.Tech, Bachelor"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Experience (years)</label>
              <input
                class="form-input"
                [(ngModel)]="form.experienceRequirement"
                placeholder="e.g. 2"
              />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Job Description *</label>
            <textarea
              class="form-input"
              [(ngModel)]="form.description"
              rows="5"
              placeholder="Full job description..."
            ></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Required Skills (comma-separated)</label>
            <input
              class="form-input"
              [(ngModel)]="skillsInput"
              placeholder="React, Node.js, MongoDB, Express.js"
            />
          </div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button
              class="btn btn-primary"
              (click)="save()"
              [disabled]="saving"
            >
              {{ saving ? "Saving…" : editId ? "Update" : "Create Job" }}
            </button>
            <button class="btn btn-secondary" (click)="cancelForm()">
              Cancel
            </button>
          </div>
        </div>
      }

      <!-- Loading -->
      @if (loading) {
        <div class="loading-center"><div class="spinner"></div></div>
      }

      <!-- Empty state -->
      @if (!loading && jobs.length === 0 && !showForm) {
        <div class="empty-state">
          <div class="empty-icon">💼</div>
          <div class="empty-title">No jobs yet</div>
          <p>Create your first job to start matching resumes.</p>
          <button
            class="btn btn-primary"
            style="margin-top:16px"
            (click)="showForm = true"
          >
            Create First Job
          </button>
        </div>
      }

      <!-- Job cards -->
      @for (job of jobs; track job._id) {
        <div
          style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:12px"
        >
          <div style="display:flex;align-items:center;gap:12px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px;color:var(--text)">
                {{ job.title }}
              </div>
              <div
                style="font-size:13px;color:var(--text-muted);margin-top:2px"
              >
                {{ job.location || "Remote" }} ·
                {{ job.jobType || "full-time" }}
              </div>
              <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
                @for (s of (job.requiredSkills || []).slice(0, 5); track s) {
                  <span class="pill pill-blue">{{ s }}</span>
                }
                @if ((job.requiredSkills || []).length > 5) {
                  <span
                    class="pill"
                    style="background:rgba(255,255,255,0.05);color:var(--text-muted)"
                  >
                    +{{ (job.requiredSkills || []).length - 5 }}
                  </span>
                }
              </div>
            </div>
            <div
              style="display:flex;flex-direction:column;align-items:flex-end;gap:8px"
            >
              <span class="pill pill-blue"
                >{{ job.totalApplicants || 0 }} matched</span
              >
              <div style="display:flex;gap:6px">
                <button
                  class="btn btn-primary"
                  style="font-size:12px;padding:6px 12px"
                  (click)="runMatch(job._id)"
                >
                  ⚡ Run Match
                </button>
                <button
                  class="btn btn-secondary"
                  style="font-size:12px;padding:6px 12px"
                  (click)="edit(job)"
                >
                  Edit
                </button>
                <button
                  class="btn btn-danger"
                  style="font-size:12px;padding:6px 12px"
                  (click)="deleteJob(job._id)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class JobsComponent implements OnInit {
  jobs: Job[] = [];
  loading = false;
  showForm = false;
  saving = false;
  editId: string | null = null;
  skillsInput = "";
  form: JobForm = {
    title: "",
    location: "",
    jobType: "full-time",
    description: "",
    educationalRequirements: "",
    experienceRequirement: "",
  };

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.getJobs().subscribe({
      next: (r) => {
        this.jobs = (r.data || []) as Job[];
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  save() {
    if (!this.form.title || !this.form.location) {
      this.toast.show("Title and Location are required", "error");
      return;
    }
    this.saving = true;
    const body = {
      ...this.form,
      requiredSkills: this.skillsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const call = this.editId
      ? this.api.updateJob(this.editId, body)
      : this.api.createJob(body);
    call.subscribe({
      next: () => {
        this.toast.show(this.editId ? "Job updated!" : "Job created!");
        this.cancelForm();
        this.load();
        this.saving = false;
      },
      error: (e) => {
        this.toast.show(
          (e.error as { error?: string })?.error || "Failed",
          "error",
        );
        this.saving = false;
      },
    });
  }

  edit(job: Job) {
    this.editId = job._id;
    this.form = {
      title: job.title,
      location: job.location,
      jobType: job.jobType,
      description: job.description,
      educationalRequirements: job.educationalRequirements,
      experienceRequirement: job.experienceRequirement,
    };
    this.skillsInput = (job.requiredSkills || []).join(", ");
    this.showForm = true;
  }

  cancelForm() {
    this.showForm = false;
    this.editId = null;
    this.skillsInput = "";
    this.form = {
      title: "",
      location: "",
      jobType: "full-time",
      description: "",
      educationalRequirements: "",
      experienceRequirement: "",
    };
  }

  deleteJob(id: string) {
    if (!confirm("Delete this job?")) return;
    this.api.deleteJob(id).subscribe({
      next: () => {
        this.toast.show("Deleted");
        this.load();
      },
      error: () => this.toast.show("Failed", "error"),
    });
  }

  runMatch(jobId: string) {
  this.toast.show("Running AI matching...");

  this.api.runMatching(jobId, {}).subscribe({
    next: (res: any) => {
      console.log("Matches Created:", res.data);

      if (!res.data || res.data.length === 0) {
        this.toast.show("No candidates found", "error");
        return;
      }

      this.toast.show("Matching completed!");

  
      // OR if you want angular routing:
      this.router.navigate(['/results', jobId], {
        state: { matches: res.data }
      });
    },

    error: (err) => {
      console.error(err);
      this.toast.show("Matching failed", "error");
    }
  });
}
}
