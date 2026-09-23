import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { APP_ROUTES } from './app/app.routes';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      APP_ROUTES,
      withComponentInputBinding()  // Angular 19: bind route params to component @Input()        // Angular 19: View Transitions API
    ),
    provideHttpClient(
      withInterceptors([authInterceptor]),
      withFetch()                    // Angular 19: use native fetch instead of XHR
    ),
    provideAnimationsAsync(),        // Angular 19: lazy-load animations
  ]
}).catch(err => console.error(err));
