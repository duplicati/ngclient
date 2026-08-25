import { Injectable } from '@angular/core';
import { localStorageSignal } from '../functions/localstorage-signal';

const LOCALSTORAGE_FILE_TREE_FOLDERS_FIRST = 'fileTreeFoldersFirst';
const LOCALSTORAGE_FILE_TREE_CASE_SENSITIVE = 'fileTreeCaseSensitiveSort';

@Injectable({
  providedIn: 'root',
})
export class FileTreeState {
  #foldersFirst = localStorageSignal<boolean>(LOCALSTORAGE_FILE_TREE_FOLDERS_FIRST, true);
  #caseSensitiveSort = localStorageSignal<boolean>(LOCALSTORAGE_FILE_TREE_CASE_SENSITIVE, false);

  foldersFirst = this.#foldersFirst.asReadonly();
  caseSensitiveSort = this.#caseSensitiveSort.asReadonly();

  setFoldersFirst(foldersFirst: boolean) {
    this.#foldersFirst.set(foldersFirst);
  }

  setCaseSensitiveSort(caseSensitiveSort: boolean) {
    this.#caseSensitiveSort.set(caseSensitiveSort);
  }
}
