import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { RemoteLogComponent } from './remote-log.component';

type Row = { ID: number; Operation: string; Path: string; Data: string | null };
let originalClipboard: PropertyDescriptor | undefined;
let clipboardChanged = false;
afterEach(() => {
  TestBed.resetTestingModule();
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  if (clipboardChanged) {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    clipboardChanged = false;
  }
});
async function render(rows: Row[]) {
  TestBed.configureTestingModule({
    imports: [RemoteLogComponent],
    providers: [
      {
        provide: DuplicatiServer,
        useValue: {
          getApiV1BackupByIdRemotelog: () =>
            Promise.resolve(
              rows.map((row) => ({
                Timestamp: 1700000000,
                OperationID: 7,
                ...row,
              }))
            ),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(RemoteLogComponent);
  fixture.componentRef.setInput('backupId', '42');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}
function open(fixture: ComponentFixture<RemoteLogComponent>, id: number) {
  fixture.componentInstance.toggleOpenEntry(id);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.log-content code') as HTMLElement;
}
function clipboard() {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  clipboardChanged = true;
  return writeText;
}
describe('remote operation log mixed data', () => {
  it('keeps all rows visible when a failed delete has a plain exception string', async () => {
    const raw = 'System.IO.IOException: Access denied\n at DeleteAsync() <script>throw 1</script>';
    const fixture = await render([
      { ID: 1, Operation: 'put', Path: 'first.aes', Data: '{"Size":10,"Hash":"abc"}' },
      { ID: 2, Operation: 'delete', Path: 'broken.aes', Data: raw },
      { ID: 3, Operation: 'list', Path: '', Data: '[{"Name":"last.aes"}]' },
    ]);
    expect(fixture.componentInstance.resource.error()).toBeUndefined();
    expect(fixture.nativeElement.querySelectorAll('article.log-entry')).toHaveLength(3);
    expect(open(fixture, 2).textContent).toBe(raw);
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(open(fixture, 1).textContent).toBe(JSON.stringify({ Size: 10, Hash: 'abc' }, null, 2));
    expect(open(fixture, 3).textContent).toBe(JSON.stringify([{ Name: 'last.aes' }], null, 2));
  });
  it.each(['', '{"incomplete":', '  Unstructured error\nwith whitespace  '])(
    'preserves raw data verbatim: %j',
    async (Data) => {
      const fixture = await render([{ ID: 1, Operation: 'delete', Path: 'failed.aes', Data }]);
      expect(fixture.componentInstance.resource.error()).toBeUndefined();
      expect(open(fixture, 1).textContent).toBe(Data);
    }
  );
  it.each(['{"Size":10,"Hash":"abc"}', '[{"Name":"one.aes"}]', 'null', '"text"', '42', 'true'])(
    'retains JSON formatting for %s',
    async (Data) => {
      const fixture = await render([{ ID: 1, Operation: 'list', Path: '', Data }]);
      expect(open(fixture, 1).textContent).toBe(JSON.stringify(JSON.parse(Data), null, 2));
    }
  );
  it('retains the existing null-data display', async () => {
    const fixture = await render([{ ID: 1, Operation: 'delete', Path: 'deleted.aes', Data: null }]);
    expect(open(fixture, 1).textContent).toBe('null');
  });
  it.each([
    ['System.IO.IOException: Failed\n at DeleteAsync()', 'System.IO.IOException: Failed\n at DeleteAsync()'],
    ['{"Size":10}', '{\n  "Size": 10\n}'],
    ['"JSON string"', '"JSON string"'],
    ['', ''],
  ])('copies the displayed data without double encoding: %j', async (Data, expected) => {
    const fixture = await render([{ ID: 1, Operation: 'delete', Path: 'file.aes', Data }]);
    open(fixture, 1);
    const write = clipboard();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(write).toHaveBeenCalledExactlyOnceWith(expected);
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Copied');
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(fixture.componentInstance.copiedFromIndex()).toBeNull();
  });
});
