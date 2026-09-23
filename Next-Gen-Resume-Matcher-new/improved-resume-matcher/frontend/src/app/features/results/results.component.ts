import { Component, OnInit, Input, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ApiService, ToastService } from "../../core/services/api.service";

/* ---------------- INTERFACES ---------------- */

interface ParsedScores {
  skills: number;
  semantic: number;
  tfidf: number;
  experience: number;
  education: number;
}

interface ParsedSkills {
  matched: string[];
  missing: string[];
  fuzzy: string[];
  coverage: number;
}

interface ResumeData {
  candidateName?: string;
  email?: string;
}

interface ParsedMatch {
  _id: string;
  rank: number;
  status: string;
  score: number;
  scoreBand: string;
  scoringEngine: string;
  recommendation: string;
  resume?: ResumeData;

  componentScores: ParsedScores;
  skillsDetail: ParsedSkills;

  semanticDetail: {
    engine?: string;
    top_sentence_pairs?: {
      resume_sentence?: string;
    }[];
  };

  explanation: {
    action?: string;
    breakdown?: string[];
    weak_categories?: string[];
  };
}

/* ---------------- NORMALIZER ---------------- */

function readMatch(m: any): ParsedMatch {
  const cs = m.componentScores || m.component_scores || {};
  const sd = m.skillsDetail || m.skills_detail || {};
  const sem = m.semanticDetail || m.semantic_detail || {};
  const expl = m.explanation || {};

  return {
    _id: m._id || "",
    rank: m.rank || 0,
    status: m.status || "pending",
    score: Number(m.overallScore || m.overall_score || 0),
    scoreBand: m.scoreBand || m.score_band || "average",
    scoringEngine: m.scoringEngine || "nodejs",
    recommendation: m.recommendation || expl.action || "",
    resume: m.resume || {},

    componentScores: {
      skills: Number(cs.skills_match || m.skillsScore || 0),
      semantic: Number(cs.semantic || m.semanticScore || 0),
      tfidf: Number(cs.tfidf_cosine || m.tfidfScore || 0),
      experience: Number(cs.experience || m.experienceScore || 0),
      education: Number(cs.education || m.educationScore || 0),
    },

    skillsDetail: {
      matched: sd.matched || m.matchedSkills || [],
      missing: sd.missing || m.missingSkills || [],
      fuzzy: sd.fuzzy_matched || [],
      coverage: Number(sd.coverage_pct || m.skillCoverage || 0),
    },

    semanticDetail: sem,
    explanation: expl,
  };
}

/* ---------------- COMPONENT ---------------- */

@Component({
  selector: "app-results",
  standalone: true,
  imports: [CommonModule, FormsModule],

  template: `
    <div style="max-width:1100px;margin:0 auto">
      <!-- HEADER -->
      <div class="page-header">
        <button class="back-btn" (click)="goBack()">← Back</button>

        <h1 class="page-title">
          {{ job?.title || "Candidates" }}
        </h1>
      </div>

      <!-- STATS -->
      <div class="stat-grid" *ngIf="matches.length">
        <div class="stat-card">
          <div class="stat-value">{{ matches.length }}</div>
          <div class="stat-label">Candidates</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">{{ avgScore }}%</div>
          <div class="stat-label">Avg Score</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">{{ topScore }}%</div>
          <div class="stat-label">Top Score</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">{{ shortlistedCount }}</div>
          <div class="stat-label">Shortlisted</div>
        </div>
      </div>

      <!-- TOOLBAR -->
      <div class="toolbar">
        <select [(ngModel)]="filterBand">
          <option value="all">All</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="average">Average</option>
          <option value="poor">Poor</option>
        </select>

        <select [(ngModel)]="sortBy">
          <option value="rank">Rank</option>
          <option value="score">Score</option>
          <option value="skills">Skills</option>
          <option value="semantic">Semantic</option>
        </select>

        <!-- Generate Report Button -->
        <button
          class="btn-primary"
          *ngIf="matches.length"
          (click)="generateReport()"
        >
          Generate Report
        </button>
      </div>

      <!-- LOADING -->
      <div *ngIf="loading" class="loading-box">Loading candidates...</div>

      <!-- EMPTY -->
      <div *ngIf="!loading && displayed.length === 0" class="loading-box">
        No candidates found
      </div>

      <!-- CANDIDATE CARDS -->
      <div *ngFor="let raw of displayed" class="candidate-card">
        <!-- HEADER -->
        <div class="candidate-header" (click)="toggle(raw._id)">
          <div class="rank-badge">#{{ raw.rank }}</div>

          <div class="candidate-info">
            <h3>{{ raw.resume?.candidateName || "Candidate" }}</h3>
            <p>{{ raw.resume?.email || "No email available" }}</p>
          </div>

          <div class="score-circle" [style.background]="scoreColor(raw.score)">
            {{ round(raw.score) }}%
          </div>
        </div>

        <!-- EXPANDED DETAILS -->
        <div *ngIf="expandedId === raw._id" class="details-section">
          <!-- SCORE BREAKDOWN -->
          <div class="detail-box">
            <h4>Score Breakdown</h4>

            <div *ngFor="let item of scoreBreakdown(raw)">
              <div class="score-row">
                <span>{{ item.label }}</span>
                <span>{{ round(item.val) }}%</span>
              </div>

              <div class="progress-bar">
                <div
                  class="progress-fill"
                  [style.width]="item.val + '%'"
                  [style.background]="item.color"
                ></div>
              </div>
            </div>
          </div>

          <!-- MATCHED SKILLS -->
          <div class="detail-box">
            <h4>Matched Skills</h4>

            <span
              *ngFor="let skill of raw.skillsDetail.matched"
              class="skill-pill green"
            >
              {{ skill }}
            </span>
          </div>

          <!-- MISSING SKILLS -->
          <div class="detail-box">
            <h4>Missing Skills</h4>

            <span
              *ngFor="let skill of raw.skillsDetail.missing"
              class="skill-pill red"
            >
              {{ skill }}
            </span>
          </div>

          <!-- AI ANALYSIS -->
          <div class="detail-box">
            <h4>AI Analysis</h4>

            <div *ngFor="let line of raw.explanation?.breakdown">
              {{ line }}
            </div>
          </div>

          <!-- STATUS -->
          <div class="detail-box">
            <h4>Status</h4>

            <select
              [ngModel]="raw.status"
              (ngModelChange)="updateStatus(raw._id, $event)"
            >
              <option value="pending">Pending</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
              <option value="interviewed">Interviewed</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `,

  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: linear-gradient(135deg, #0f172a, #111827, #1e293b);
        color: white;
        padding: 20px;
        font-family: "Segoe UI", sans-serif;
      }

      /* Header */
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
      }

      .page-title {
        font-size: 30px;
        font-weight: 700;
        color: #f8fafc;
      }

      .back-btn {
        padding: 10px 18px;
        border: none;
        border-radius: 10px;
        background: #1e293b;
        color: white;
        cursor: pointer;
        transition: 0.3s;
      }

      .back-btn:hover {
        background: #334155;
      }

      /* Stats */
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        margin-bottom: 25px;
      }

      .stat-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 22px;
        border-radius: 18px;
        text-align: center;
        transition: 0.3s;
      }

      .stat-card:hover {
        transform: translateY(-4px);
        border-color: #3b82f6;
      }

      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: #60a5fa;
      }

      .stat-label {
        color: #cbd5e1;
        margin-top: 8px;
      }

      /* Toolbar */
      .toolbar {
        display: flex;
        gap: 15px;
        margin-bottom: 25px;
        flex-wrap: wrap;
      }

      .toolbar select {
        padding: 10px;
        border-radius: 10px;
        background: #1e293b;
        color: white;
        border: none;
      }

      .btn-primary {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        transition: 0.3s;
      }

      .btn-primary:hover {
        background: #2563eb;
      }

      /* Candidate Cards */
      .candidate-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 20px;
        margin-bottom: 20px;
        overflow: hidden;
        transition: 0.3s;
      }

      .candidate-card:hover {
        transform: translateY(-3px);
        border-color: #3b82f6;
      }

      .candidate-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px;
        cursor: pointer;
      }

      .rank-badge {
        width: 55px;
        height: 55px;
        border-radius: 50%;
        background: #2563eb;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 18px;
      }

      .candidate-info h3 {
        margin: 0;
        font-size: 20px;
      }

      .candidate-info p {
        margin-top: 5px;
        color: #94a3b8;
      }

      /* Score Circle */
      .score-circle {
        width: 85px;
        height: 85px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 20px;
        font-weight: bold;
        color: white;
        border: 4px solid rgba(255, 255, 255, 0.1);
      }

      /* Details */
      .details-section {
        padding: 25px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .detail-box {
        background: #111827;
        padding: 20px;
        border-radius: 16px;
        margin-bottom: 18px;
      }

      .detail-box h4 {
        margin-bottom: 12px;
        color: #60a5fa;
      }

      /* Progress Bars */
      .score-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
      }

      .progress-bar {
        width: 100%;
        height: 8px;
        background: #1e293b;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 14px;
      }

      .progress-fill {
        height: 100%;
        border-radius: 10px;
      }

      /* Skill pills */
      .skill-pill {
        display: inline-block;
        padding: 7px 14px;
        border-radius: 25px;
        margin: 5px;
        font-size: 12px;
        font-weight: 500;
      }

      .green {
        background: #166534;
      }

      .red {
        background: #991b1b;
      }

      /* Loading */
      .loading-box {
        text-align: center;
        padding: 40px;
        color: #94a3b8;
      }

      /* Responsive */
      @media (max-width: 900px) {
        .stat-grid {
          grid-template-columns: repeat(2, 1fr);
        }

        .candidate-header {
          flex-direction: column;
          gap: 20px;
          text-align: center;
        }
      }

      @media (max-width: 600px) {
        .stat-grid {
          grid-template-columns: 1fr;
        }

        .toolbar {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class ResultsComponent implements OnInit {
  @Input() jobId!: string;

  job: any = null;
  matches: ParsedMatch[] = [];

  loading = false;
  running = false;
  expandedId: string | null = null;

  filterBand = "all";
  sortBy = "rank";

  private router = inject(Router);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  ngOnInit() {
    const navState = history.state;

    if (navState?.matches?.length) {
      console.log("Using fresh matches");

      this.matches = (navState.matches || []).map((m: any) => readMatch(m));

      this.api.getJob(this.jobId).subscribe({
        next: (res: any) => {
          this.job = res.data;
          this.loading = false;
        },
      });

      return;
    }
    this.load();
  }

  load() {
    this.loading = true;

    this.api.getJob(this.jobId).subscribe({
      next: (res) => (this.job = res.data),
    });

    this.api.getJobMatches(this.jobId).subscribe({
      next: (res) => {
        this.matches = (res.data || []).map((m: any) => readMatch(m));
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  runMatch() {
    this.running = true;

    this.api.runMatching(this.jobId, {}).subscribe({
      next: () => {
        this.toast.show("Matching completed");
        this.running = false;
        this.load();
      },
      error: () => {
        this.toast.show("Matching failed", "error");
        this.running = false;
      },
    });
  }

  generateReport() {
    if (!this.matches.length) {
      this.toast.show("No data available for report generation", "error");
      return;
    }

    const payload = {
      data: this.matches,
      jobTitle: this.job?.title
    };

    console.log("Generating report with payload:", payload);

    this.api.generateReport(payload).subscribe({
      next: (response: Blob) => {
        const blob = new Blob([response], {
          type: "application/pdf",
        });

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "AI_Resume_Report.pdf";
        a.click();

        window.URL.revokeObjectURL(url);

        this.toast.show("Report downloaded successfully");
      },

      error: (error) => {
        console.error("Report generation failed", error);
        this.toast.show("Report generation failed", "error");
      },
    });
  }
  updateStatus(id: string, status: string) {
    this.api.updateMatchStatus(id, { status }).subscribe(() => {
      const match = this.matches.find((m) => m._id === id);
      if (match) {
        match.status = status;
      }
    });
  }

  toggle(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  goBack() {
    this.router.navigate(["/jobs"]);
  }

  round(val: number) {
    return Math.round(val);
  }

  scoreColor(score: number) {
    if (score >= 80) return "#22c55e";
    if (score >= 65) return "#3b82f6";
    if (score >= 45) return "#f59e0b";
    return "#ef4444";
  }

  scoreBreakdown(match: ParsedMatch) {
    return [
      { label: "Skills", val: match.componentScores.skills, color: "#22c55e" },
      {
        label: "Semantic",
        val: match.componentScores.semantic,
        color: "#3b82f6",
      },
      { label: "TF-IDF", val: match.componentScores.tfidf, color: "#8b5cf6" },
      {
        label: "Experience",
        val: match.componentScores.experience,
        color: "#f59e0b",
      },
      {
        label: "Education",
        val: match.componentScores.education,
        color: "#ec4899",
      },
    ];
  }

  get displayed(): ParsedMatch[] {
    let filtered = [...this.matches];

    if (this.filterBand !== "all") {
      filtered = filtered.filter((m) => m.scoreBand === this.filterBand);
    }

    filtered.sort((a, b) => {
      if (this.sortBy === "rank") return a.rank - b.rank;
      if (this.sortBy === "score") return b.score - a.score;
      if (this.sortBy === "skills")
        return b.componentScores.skills - a.componentScores.skills;
      if (this.sortBy === "semantic")
        return b.componentScores.semantic - a.componentScores.semantic;
      return 0;
    });

    return filtered;
  }

  get avgScore() {
    if (!this.matches.length) return 0;
    return Math.round(
      this.matches.reduce((s, m) => s + m.score, 0) / this.matches.length,
    );
  }

  get topScore() {
    if (!this.matches.length) return 0;
    return Math.round(Math.max(...this.matches.map((m) => m.score)));
  }

  get shortlistedCount() {
    return this.matches.filter((m) => m.status === "shortlisted").length;
  }
}
