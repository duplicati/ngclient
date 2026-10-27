import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDropTextareaComponent } from './file-drop-textarea.component';

class Reader {
  static instances: Reader[] = [];
  result: string | null = null;
  onload: (() => void) | null = null;
  readAsText = vi.fn();
  constructor() {
    Reader.instances.push(this);
  }
  finish(text: string) {
    this.result = text;
    this.onload?.();
  }
}

describe('disabled file-drop form control', () => {
  let fixture: ComponentFixture<FileDropTextareaComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  async function setup(disabled = false) {
    Reader.instances = [];
    vi.stubGlobal('FileReader', Reader);
    TestBed.configureTestingModule({ imports: [FileDropTextareaComponent] });
    fixture = TestBed.createComponent(FileDropTextareaComponent);
    const component = fixture.componentInstance;
    component.writeValue('Original configuration');
    component.setDisabledState!(disabled);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const changed = vi.fn();
    component.registerOnChange(changed);
    return { component, changed };
  }
  const file = () => new File(['Replacement configuration'], 'backup.json', { type: 'application/json' });
  function select(component: FileDropTextareaComponent) {
    component.onFileSelected({ target: { files: [file()] } } as unknown as Event);
  }
  function drop(component: FileDropTextareaComponent) {
    const preventDefault = vi.fn();
    component.onFileDrop({ preventDefault, dataTransfer: { files: [file()] } } as unknown as DragEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  }
  it('disables the browse button, native file input and textarea together', async () => {
    await setup(true);
    expect(fixture.nativeElement.querySelector('textarea').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('input[type=file]').disabled).toBe(true);
  });
  it.each(['selection', 'drop'])('ignores %s while disabled without reading a file', async (source) => {
    const { component, changed } = await setup(true);
    if (source === 'selection') select(component);
    else drop(component);
    expect(Reader.instances).toHaveLength(0);
    expect(component.content()).toBe('Original configuration');
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not open the picker when the browse handler is invoked while disabled', async () => {
    const { component } = await setup(true);
    const click = vi.spyOn(fixture.nativeElement.querySelector('input[type=file]'), 'click');
    expect(component.triggerBrowse()).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('does not apply an in-flight read if the control has since been disabled', async () => {
    const { component, changed } = await setup();
    select(component);
    expect(Reader.instances).toHaveLength(1);
    component.setDisabledState!(true);
    Reader.instances[0].finish('Late configuration');
    fixture.detectChanges();
    expect(component.content()).toBe('Original configuration');
    expect(changed).not.toHaveBeenCalled();
  });
  it('still reads a dropped file and propagates its text when enabled', async () => {
    const { component, changed } = await setup();
    drop(component);
    expect(Reader.instances[0].readAsText).toHaveBeenCalledWith(expect.any(File));
    expect(component.content()).toBe('Original configuration');
    Reader.instances[0].finish('New configuration');
    fixture.detectChanges();
    expect(component.content()).toBe('New configuration');
    expect(changed).toHaveBeenCalledExactlyOnceWith('New configuration');
  });
  it('allows file selection again after the control is re-enabled', async () => {
    const { component, changed } = await setup(true);
    select(component);
    component.setDisabledState!(false);
    fixture.detectChanges();
    select(component);
    expect(Reader.instances).toHaveLength(1);
    Reader.instances[0].finish('Enabled configuration');
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledExactlyOnceWith('Enabled configuration');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });
});
