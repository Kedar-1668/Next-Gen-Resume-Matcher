import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, ToastService } from '../../core/services/api.service';

interface UploadedResume { candidateName?: string; fileName?: string; skills?: string[]; }

/**
 * Resume upload page with drag-and-drop.
 *
 * Angular 19 upgrades:
 *  - inject() DI.
 *  - @if / @for built-in control flow.
 *  - No CommonModule import.
 */
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div>
      <div class="page-header">
        <h1 class="page-title">Upload Resumes</h1>
        <p class="page-sub">Upload PDF or DOCX resumes for AI-powered matching</p>
      </div>

      <!-- Drop zone -->
      <div class="card"
        style="text-align:center;padding:48px 24px;border-style:dashed;cursor:pointer;transition:all 0.2s"
        [style.borderColor]="dragOver ? 'var(--accent)' : 'rgba(255,255,255,0.15)'"
        [style.background]="dragOver ? 'rgba(79,158,255,0.05)' : 'transparent'"
        (dragover)="$event.preventDefault(); dragOver=true"
        (dragleave)="dragOver=false"
        (drop)="onDrop($event)"
        (click)="fileInput.click()">
        <div style="font-size:40px;margin-bottom:12px">📁</div>
        <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:6px">
          Drop resumes here or click to browse
        </div>
        <div style="color:var(--text-muted);font-size:13px">PDF, DOCX, DOC, TXT supported · Multiple files allowed</div>
        <input #fileInput type="file" multiple accept=".pdf,.doc,.docx,.txt" style="display:none" (change)="onFileSelect($event)">
      </div>

      <!-- Selected files preview -->
      @if (files.length > 0) {
        <div class="card" style="margin-top:16px">
          <div style="font-weight:700;margin-bottom:12px;font-size:14px">Selected Files ({{ files.length }})</div>
          @for (f of files; track f.name; let i = $index) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:18px">{{ getIcon(f.name) }}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">{{ f.name }}</div>
                <div style="font-size:11px;color:var(--text-muted)">{{ formatSize(f.size) }}</div>
              </div>
              <button class="btn btn-danger" style="font-size:11px;padding:4px 10px" (click)="removeFile(i)">✕</button>
            </div>
          }
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn btn-primary" (click)="upload()" [disabled]="uploading">
              {{ uploading ? '⏳ Uploading…' : '⬆ Upload ' + files.length + ' Resume(s)' }}
            </button>
            <button class="btn btn-secondary" (click)="files=[]">Clear All</button>
          </div>
        </div>
      }

      <!-- Progress -->
      @if (uploading) {
        <div class="card" style="margin-top:16px">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="spinner"></div>
            <div>
              <div style="font-weight:600">Processing resumes…</div>
              <div style="font-size:12px;color:var(--text-muted)">Extracting text and parsing skills</div>
            </div>
          </div>
        </div>
      }

      <!-- Results -->
      @if (uploaded.length > 0) {
        <div class="card" style="margin-top:16px;border-color:rgba(0,229,160,0.3)">
          <div style="font-weight:700;color:var(--green);margin-bottom:12px">✅ {{ uploaded.length }} Resume(s) Uploaded</div>
          @for (r of uploaded; track r.candidateName) {
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
              <span style="color:var(--green)">✓</span>
              <div>
                <span style="font-weight:600">{{ r.candidateName || r.fileName }}</span>
                <span style="color:var(--text-muted);font-size:12px;margin-left:8px">{{ (r.skills||[]).length }} skills extracted</span>
              </div>
            </div>
          }
          <div style="margin-top:14px;display:flex;gap:10px">
            <button class="btn btn-primary"   (click)="router.navigate(['/jobs'])">Go to Jobs → Run Match</button>
            <button class="btn btn-secondary" (click)="router.navigate(['/resumes'])">View All Resumes</button>
            <button class="btn btn-secondary" (click)="uploaded=[];files=[]">Upload More</button>
          </div>
        </div>
      }

      <!-- Tips -->
      <div class="card" style="margin-top:20px;background:rgba(79,158,255,0.04);border-color:rgba(79,158,255,0.15)">
        <div style="font-weight:700;color:var(--accent);margin-bottom:10px;font-size:13px">💡 Tips for Better Matching</div>
        <ul style="list-style:none;display:grid;gap:6px">
          <li style="font-size:12px;color:var(--text-muted)">✅ Resumes with clearly listed skills score higher</li>
          <li style="font-size:12px;color:var(--text-muted)">✅ Include technology names in full (e.g., "Node.js" not just "Node")</li>
          <li style="font-size:12px;color:var(--text-muted)">✅ Text-based PDFs work better than scanned images</li>
          <li style="font-size:12px;color:var(--text-muted)">✅ Each resume uploaded is scored independently — no score drops when adding more</li>
        </ul>
      </div>
    </div>
  `
})
export class UploadComponent {
  files: File[] = [];
  uploading = false;
  uploaded: UploadedResume[] = [];
  dragOver = false;

  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly router        = inject(Router);

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  addFiles(newFiles: File[]) {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    for (const f of newFiles) {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '');
      if (allowed.includes(ext)) this.files.push(f);
      else this.toast.show(`${f.name} — unsupported format`, 'error');
    }
  }

  removeFile(i: number) { this.files.splice(i, 1); }

  upload() {
    if (!this.files.length) { this.toast.show('Please select files first', 'error'); return; }
    this.uploading = true;
    const form = new FormData();
    this.files.forEach(f => form.append('resumes', f));
    this.api.uploadResumes(form).subscribe({
      next: (r) => {
        this.uploaded = (r.data || []) as UploadedResume[];
        this.files = [];
        this.uploading = false;
        this.toast.show(`${this.uploaded.length} resume(s) uploaded successfully!`);
      },
      error: (e) => {
        this.toast.show((e.error as { error?: string })?.error || 'Upload failed', 'error');
        this.uploading = false;
      }
    });
  }

  getIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'pdf' ? '📕' : (ext === 'docx' || ext === 'doc') ? '📘' : '📄';
  }

  formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
