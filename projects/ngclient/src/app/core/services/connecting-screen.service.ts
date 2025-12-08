import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConnectingScreenService {
  #document = inject(DOCUMENT);

  showError(message: string) {
    const loadingElement = this.#document.querySelector<HTMLDivElement>('body > .loading');

    if (!loadingElement) return;

    loadingElement.classList.add('has-error');
    loadingElement.innerHTML = '';

    const title = this.#document.createElement('div');
    title.classList.add('loading-title');
    title.textContent = 'Unable to connect';

    const error = this.#document.createElement('div');
    error.classList.add('loading-error');
    error.textContent = message || 'Unknown error';

    const retryButton = this.#document.createElement('button');
    retryButton.type = 'button';
    retryButton.classList.add('retry-button');
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => {
      this.#document.defaultView?.location.reload();
    });

    loadingElement.append(title, error, retryButton);
  }
}
