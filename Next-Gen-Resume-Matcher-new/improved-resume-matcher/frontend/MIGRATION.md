# Angular 17 → 19 Migration Guide

## Summary

This frontend has been fully upgraded from **Angular 17** to **Angular 19** (latest stable).
All functionality is preserved. Every file was rewritten to use current Angular best practices.

---

## What Changed

### 1. `package.json` — Dependency Versions

| Package | v17 | v19 |
|---|---|---|
| `@angular/core` (and all `@angular/*`) | `^17.0.0` | `^19.0.0` |
| `@angular-devkit/build-angular` | `^17.0.0` | `^19.0.0` |
| `@angular/cli` | `^17.0.0` | `^19.0.0` |
| `@angular/compiler-cli` | `^17.0.0` | `^19.0.0` |
| `typescript` | `~5.2.2` | `~5.6.0` |
| `zone.js` | `~0.14.2` | `~0.15.0` |
| `tslib` | `^2.3.0` | `^2.8.0` |

---

### 2. `main.ts` — Bootstrap Providers

**Angular 19 additions:**

```ts
// BEFORE (v17)
provideAnimations()

// AFTER (v19)
provideAnimationsAsync()         // Lazy-loads Angular animations module
```

```ts
// BEFORE (v17)
provideRouter(APP_ROUTES)

// AFTER (v19)
provideRouter(
  APP_ROUTES,
  withComponentInputBinding(),   // Route params auto-bind to @Input()
  withViewTransitions()          // Native View Transitions API
)
```

```ts
// BEFORE (v17)
provideHttpClient(withInterceptors([authInterceptor]))

// AFTER (v19)
provideHttpClient(
  withInterceptors([authInterceptor]),
  withFetch()                    // Uses native fetch() instead of XHR
)
```

---

### 3. Built-in Control Flow — All Components

Angular 17 introduced the new built-in control flow syntax. Angular 19 makes it the **only** recommended approach. All structural directives have been replaced.

#### `*ngIf` → `@if / @else`

```html
<!-- BEFORE (v17 — still worked but deprecated path) -->
<div *ngIf="loading"><div class="spinner"></div></div>
<ng-container *ngIf="!loading">...</ng-container>

<!-- AFTER (v19) -->
@if (loading) {
  <div class="spinner"></div>
} @else {
  ...
}
```

#### `*ngFor` → `@for (with mandatory track)`

```html
<!-- BEFORE (v17) -->
<tr *ngFor="let job of jobs">...</tr>

<!-- AFTER (v19) — track is required -->
@for (job of jobs; track job._id) {
  <tr>...</tr>
}
```

`@for` also provides `$index`, `$first`, `$last`, `$even`, `$odd` local variables.

#### `@empty` block (new in v17+)

```html
@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <p>No items found.</p>
}
```

---

### 4. `inject()` — Replaces Constructor Injection

Angular 19 best practice is to use `inject()` at the field level instead of constructor parameters. This works in any injection context (components, directives, pipes, services).

```ts
// BEFORE (v17)
constructor(private api: ApiService, private toast: ToastService) {}

// AFTER (v19)
private readonly api   = inject(ApiService);
private readonly toast = inject(ToastService);
```

Constructor injection still works but `inject()` is now the idiomatic style.

---

### 5. `@Input()` Route Binding — `withComponentInputBinding()`

With `withComponentInputBinding()` enabled in `main.ts`, route parameters are automatically bound to `@Input()` properties. **No more `ActivatedRoute` injection needed in most cases.**

```ts
// BEFORE (v17) — JobDetailComponent
constructor(private route: ActivatedRoute) {}
ngOnInit() {
  const id = this.route.snapshot.params['id'];
  this.api.getJob(id).subscribe(...);
}

// AFTER (v19)
@Input() id!: string;   // Automatically set from ':id' route param
ngOnInit() {
  this.api.getJob(this.id).subscribe(...);
}
```

Applies to:
- `JobDetailComponent` — `@Input() id`
- `ResultsComponent` — `@Input() jobId`

---

### 6. `CommonModule` — Removed from All Components

With built-in `@if` / `@for` control flow, `CommonModule` is no longer needed in standalone components. It has been removed from all `imports: []` arrays.

```ts
// BEFORE (v17)
imports: [CommonModule, FormsModule, RouterLink]

// AFTER (v19)
imports: [FormsModule, RouterLink]   // CommonModule gone
```

---

### 7. `AuthService` — Signal-Based Reactive State

The `AuthService` now uses Angular Signals (stable since v17, idiomatic in v19) for reactive user/token state.

```ts
// BEFORE (v17)
get user() { return JSON.parse(localStorage.getItem('user') || 'null'); }
get isLoggedIn() { return !!this.token; }

// AFTER (v19) — reactive signals
private readonly _token = signal<string | null>(localStorage.getItem('token'));
private readonly _user  = signal<unknown>(this.parseUser());

readonly isLoggedIn = computed(() => !!this._token());
readonly token      = this._token.asReadonly();
readonly user       = this._user.asReadonly();
```

`setSession()` and `logout()` now call `signal.set()` so any component reading `auth.user()` or `auth.isLoggedIn()` automatically updates.

---

### 8. `provideAnimationsAsync()` vs `provideAnimations()`

```ts
// BEFORE (v17)
import { provideAnimations } from '@angular/platform-browser/animations';
provideAnimations()

// AFTER (v19)
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
provideAnimationsAsync()
```

`provideAnimationsAsync()` defers loading the animations engine until first use — smaller initial bundle.

---

### 9. `angular.json` — Build Configuration

- Added `assets` array pointing to the `public/` folder (Angular 19 convention).
- Added explicit `production` / `development` build configurations with budget limits.
- `defaultConfiguration` for `serve` is now explicitly `"development"`.

---

### 10. TypeScript Strictness Improvements

- Replaced `any` with precise `unknown` types in models and service returns.
- All `Record<string, unknown>` casts have explanatory comments.
- Non-null assertions (`!`) are minimal and documented.
- `model/index.ts` uses `unknown` instead of `any` for generic fields.

---

## Files Changed

| File | Change |
|---|---|
| `package.json` | Bumped all Angular packages to v19 |
| `tsconfig.json` | TypeScript ~5.6, same compiler options |
| `angular.json` | Added assets, build configurations |
| `src/main.ts` | `provideAnimationsAsync`, `withComponentInputBinding`, `withFetch`, `withViewTransitions` |
| `src/app/app.component.ts` | `inject()`, `@if`, removed `CommonModule` |
| `src/app/app.routes.ts` | Comments documenting v19 router features |
| `src/app/core/services/api.service.ts` | `inject()`, signal-based `AuthService` |
| `src/app/core/interceptors/auth.interceptor.ts` | No functional change (already functional in v17) |
| `src/app/core/guards/auth.guard.ts` | No functional change (already functional in v17) |
| `src/app/core/models/index.ts` | `any` → `unknown` |
| `src/app/features/auth/login.component.ts` | `inject()`, `@if`, removed `CommonModule` |
| `src/app/features/auth/register.component.ts` | `inject()`, `@if`, removed `CommonModule` |
| `src/app/features/dashboard/dashboard.component.ts` | `inject()`, `@if/@for`, signal user, removed `CommonModule` |
| `src/app/features/jobs/jobs.component.ts` | `inject()`, `@if/@for`, removed `CommonModule` |
| `src/app/features/jobs/job-detail.component.ts` | `@Input() id` from route, `inject()`, `@if/@for`, removed `CommonModule`+`ActivatedRoute` |
| `src/app/features/resumes/resumes.component.ts` | `inject()`, `@if/@for`, removed `CommonModule` |
| `src/app/features/upload/upload.component.ts` | `inject()`, `@if/@for`, `let i = $index`, removed `CommonModule` |
| `src/app/features/results/results.component.ts` | `@Input() jobId` from route, `inject()`, `@if/@for`, removed `CommonModule`+`ActivatedRoute` |

---

## Installation

```bash
cd frontend-angular
npm install
npm run dev        # http://localhost:4200 (proxied to :5000)
npm run build      # Production build → dist/resume-matcher/
```

## Angular Version Compatibility

This codebase targets **Angular 19.x** and is **not** backwards-compatible with Angular 17 or 18 due to:
- `provideAnimationsAsync` (v17.1+, recommended v19)
- `withFetch()` for HttpClient (v18+)
- `withViewTransitions()` (v17.2+)
- Signal-based APIs used throughout (stable v17+, idiomatic v19)
