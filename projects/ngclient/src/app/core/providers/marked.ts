import { InjectionToken, Provider } from '@angular/core';
import { marked } from 'marked';

export const Marked = new InjectionToken<typeof marked>('Marked');

export const MarkedProvider: Provider = {
  provide: Marked,
  useFactory: () => marked,
};

// marked.parse(
//   contents.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"")
// )
