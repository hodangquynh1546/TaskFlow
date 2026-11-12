import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyStoredTheme } from './app/core/theme/theme.service';

// Before the first render: a dark-mode user never sees a light flash.
applyStoredTheme(document, window);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
