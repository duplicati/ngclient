import { signal, Signal } from "@angular/core";
import { finalize, Observable } from "rxjs";

export class LazySignal<T> {
    private readonly _data = signal<T | undefined>(undefined);
    private _isLoading = false;
    private _loaded = false;
  
    constructor(
      private loader: () => Observable<T>
    ) {}
  
    load(): Signal<T | undefined> {
      if (!this._loaded && !this._isLoading) {
        this._isLoading = true;
        this.loader()
          .pipe(finalize(() => this._isLoading = false))
          .subscribe(value => {
            this._data.set(value);
            this._loaded = true;
          });
      }
  
      return this._data.asReadonly();
    }
  
    value(): Signal<T | undefined> {
      return this._data.asReadonly();
    }
  
    isLoading(): boolean {
      return this._isLoading;
    }
  
    isLoaded(): boolean {
      return this._loaded;
    }
  
    reset(): void {
      this._data.set(undefined);
      this._loaded = false;
    }
  }