import { Injectable, signal } from '@angular/core';

type Dictionary = {};

@Injectable({
  providedIn: 'root',
})
export class DictionaryService {
  #activeDictionary = signal(null);

  activeDictionary = this.#activeDictionary.asReadonly();
}
