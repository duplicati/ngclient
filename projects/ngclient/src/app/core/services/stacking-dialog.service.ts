import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  DOCUMENT,
  EmbeddedViewRef,
  inject,
  Injectable,
  isSignal,
  OutputEmitterRef,
  OutputRefSubscription,
  TemplateRef,
  Type,
} from '@angular/core';
import {
  ShipDialog,
  ShipDialogInstance,
  ShipDialogOptions,
  ShipDialogService,
  ShipDialogServiceOptions,
  ShipDialogTemplateInstance,
} from '@ship-ui/core/ship-dialog';

type OpenDialog = {
  hostEl: HTMLElement;
  dialogRef: ComponentRef<ShipDialog>;
  componentRef: ComponentRef<unknown> | null;
  templateRef: EmbeddedViewRef<unknown> | null;
  subscriptions: OutputRefSubscription[];
  /** The options the caller asked for; re-applied whenever the dialog is the topmost one. */
  options: Partial<ShipDialogOptions>;
  closing: boolean;
  destroyed: boolean;
  close: (res?: unknown) => void;
};

/**
 * Drop-in replacement for `ShipDialogService` that supports nested (stacked) dialogs.
 *
 * `ShipDialogService` keeps a single dialog host: opening a dialog while another one is
 * open wipes the first dialog's DOM, leaks its component and loses whatever the user had
 * entered in it. That breaks every flow where a dialog opens another dialog, e.g. the
 * "Remote source" dialog on the source page opening the "Browse" dialog.
 *
 * This service gives every dialog its own host element, so a dialog opened while another
 * one is open is shown on top of it (the browser's top layer makes the parent inert until
 * the child closes) and the parent keeps its state. It also:
 *  - disables Escape handling on dialogs that are not topmost, so Escape only closes the
 *    topmost dialog instead of all of them,
 *  - actually destroys closed dialogs and their host elements (the library never destroyed
 *    the dialog it replaced),
 *  - notifies `closed` callbacks, `dialogRef.closed` and the dialog component's `closed`
 *    output consistently, regardless of how the dialog was closed.
 *
 * It is registered in `app.config.ts` as the implementation behind the `ShipDialogService`
 * token, so all `inject(ShipDialogService)` callers (and library components such as the
 * spotlight) get stacking support without changes. The public API is identical to the
 * library service, so callers can keep using `open`, the returned handle and the `closed`
 * option exactly as documented by ShipUI.
 */
@Injectable()
export class StackingDialogService implements Pick<ShipDialogService, 'open' | 'ngOnDestroy'> {
  readonly #document = inject(DOCUMENT);
  readonly #appRef = inject(ApplicationRef);
  readonly #stack: OpenDialog[] = [];

  /** Number of dialogs that are currently open. */
  get openCount(): number {
    return this.#stack.length;
  }

  // Typed from the library signature: redeclaring its generics (which use defaults) is not
  // accepted by TypeScript as a compatible override, so the implementation is untyped inside.
  readonly open: ShipDialogService['open'] = (componentOrTemplate, options) =>
    this.#open(
      componentOrTemplate as Type<unknown> | TemplateRef<unknown>,
      options as ShipDialogServiceOptions<unknown, unknown> | undefined
    ) as never;

  #open(
    componentOrTemplate: Type<unknown> | TemplateRef<unknown>,
    options?: ShipDialogServiceOptions<unknown, unknown>
  ): ShipDialogInstance<unknown> | ShipDialogTemplateInstance<unknown> {
    const environmentInjector = this.#appRef.injector;
    const { data, closed, ...rest } = options ?? {};

    const entry: OpenDialog = {
      hostEl: this.#document.createElement('sh-dialog-ref'),
      dialogRef: null as unknown as ComponentRef<ShipDialog>,
      componentRef: null,
      templateRef: null,
      subscriptions: [],
      options: rest,
      closing: false,
      destroyed: false,
      close: (res) => finish(res, 'api'),
    };

    let componentClosed: OutputEmitterRef<unknown> | undefined;

    const finish = (arg: unknown, origin: 'component' | 'dialog' | 'api') => {
      if (entry.closing) return;
      entry.closing = true;

      const index = this.#stack.indexOf(entry);
      if (index !== -1) this.#stack.splice(index, 1);
      this.#syncTopmostOptions();

      // Defer the teardown so the handlers below can run to completion first (a handler may
      // open the next dialog, which must not be affected by this one being removed).
      queueMicrotask(() => this.#destroy(entry));

      if (origin !== 'component') componentClosed?.emit(arg);
      closed?.(arg);
      if (origin !== 'dialog') (entry.dialogRef?.instance.closed as OutputEmitterRef<unknown> | undefined)?.emit(arg);
    };

    let projectableNodes: Node[][] = [];

    if (componentOrTemplate instanceof TemplateRef) {
      entry.templateRef = componentOrTemplate.createEmbeddedView({
        $implicit: data,
        close: (res: unknown) => finish(res, 'api'),
      });
      projectableNodes = [entry.templateRef.rootNodes];
    } else {
      entry.componentRef = createComponent(componentOrTemplate, { environmentInjector });
      projectableNodes = [[entry.componentRef.location.nativeElement]];

      const instance = entry.componentRef.instance as { data?: unknown; closed?: unknown };
      if (data !== undefined && data !== null) {
        if (!isSignal(instance.data)) {
          entry.componentRef.destroy();
          throw new Error('data is not an input signal on the passed component');
        }
        entry.componentRef.setInput('data', data);
      }

      if (instance.closed instanceof OutputEmitterRef) {
        componentClosed = instance.closed as OutputEmitterRef<unknown>;
        entry.subscriptions.push(componentClosed.subscribe((arg) => finish(arg, 'component')));
      }
    }

    this.#document.body.appendChild(entry.hostEl);
    entry.dialogRef = createComponent(ShipDialog, {
      hostElement: entry.hostEl,
      environmentInjector,
      projectableNodes,
    });

    if (entry.componentRef) {
      this.#appRef.attachView(entry.componentRef.hostView);
      entry.componentRef.changeDetectorRef.detectChanges();
    }
    if (entry.templateRef) {
      this.#appRef.attachView(entry.templateRef);
      entry.templateRef.detectChanges();
    }

    this.#appRef.attachView(entry.dialogRef.hostView);
    entry.dialogRef.changeDetectorRef.detectChanges();

    this.#stack.push(entry);
    this.#syncTopmostOptions();
    entry.dialogRef.instance.isOpen.set(true);
    entry.subscriptions.push(entry.dialogRef.instance.closed.subscribe(() => finish(undefined, 'dialog')));

    return {
      component: entry.componentRef?.instance,
      close: entry.close,
      closed: entry.dialogRef.instance.closed as OutputEmitterRef<undefined>,
    };
  }

  ngOnDestroy(): void {
    for (const entry of [...this.#stack]) {
      entry.close();
      this.#destroy(entry);
    }
  }

  /**
   * Only the topmost dialog may react to Escape. Every `sh-dialog` listens on the document,
   * so without this a single Escape press would close the whole stack.
   */
  #syncTopmostOptions() {
    this.#stack.forEach((entry, index) => {
      const isTopmost = index === this.#stack.length - 1;
      entry.dialogRef.setInput(
        'options',
        isTopmost ? entry.options : { ...entry.options, closeOnEsc: false, closeOnOutsideClick: false }
      );
    });
  }

  #destroy(entry: OpenDialog) {
    if (entry.destroyed) return;
    entry.destroyed = true;

    entry.subscriptions.forEach((sub) => sub.unsubscribe());

    // Close the native element before destroying it so the browser restores focus to the
    // element that opened the dialog (e.g. the "Browse" button in the parent dialog). The
    // sh-dialog listeners are aborted first so the native close event does not re-enter the
    // closed handlers (the dialog has already been reported as closed).
    entry.dialogRef.instance.abortController?.abort();
    const dialogEl = entry.dialogRef.instance.dialogRef()?.nativeElement;
    if (dialogEl?.open) dialogEl.close();

    if (entry.componentRef) {
      this.#appRef.detachView(entry.componentRef.hostView);
      entry.componentRef.destroy();
    }
    if (entry.templateRef) {
      this.#appRef.detachView(entry.templateRef);
      entry.templateRef.destroy();
    }

    this.#appRef.detachView(entry.dialogRef.hostView);
    entry.dialogRef.destroy();
    entry.hostEl.remove();
  }
}
