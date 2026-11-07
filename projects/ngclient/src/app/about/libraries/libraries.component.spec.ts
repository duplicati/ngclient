import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer, LicenseDto } from '../../core/openapi';
import LibrariesComponent from './libraries.component';

const metadata = {
  name: 'package',
  description: 'Useful library',
  link: 'https://example.com/package',
  license: 'MIT',
  notes: 'Copyright notice',
};
function license(Title: string, Jsondata: string | null): LicenseDto {
  return { Title, Jsondata, Url: 'https://example.com/license', License: 'Full license text for ' + Title };
}

describe('Libraries metadata resilience', () => {
  afterEach(() => TestBed.resetTestingModule());
  function render(rows: LicenseDto[]) {
    TestBed.configureTestingModule({
      imports: [LibrariesComponent],
      providers: [{ provide: DuplicatiServer, useValue: { getApiV1Licenses: () => of(rows) } }],
    });
    const fixture = TestBed.createComponent(LibrariesComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
  }

  it('keeps all entries and original notices when one metadata JSON is malformed', () => {
    const rows = [
      license('First', JSON.stringify(metadata)),
      license('Broken', '{invalid'),
      license('Last', JSON.stringify({ description: 'Last description' })),
    ];
    const { component, element } = render(rows);
    expect(element.querySelectorAll('.license')).toHaveLength(3);
    expect(element.textContent).toContain('Useful library');
    expect(element.textContent).toContain('Broken');
    expect(element.textContent).toContain('Last description');
    expect(component.licenses()?.[1].data).toBeNull();
    expect(component.licenses()?.map(({ data: _data, ...entry }) => entry)).toEqual(rows);
  });

  it('preserves recognized valid metadata strings', () => {
    const { component, element } = render([license('Valid', JSON.stringify(metadata))]);
    expect(component.licenses()?.[0].data).toEqual(metadata);
    expect(element.textContent).toContain('MIT');
    expect(element.textContent).toContain('Copyright notice');
  });

  it.each([null, '', 'null', '42', 'true', '"text"', '[]'])('ignores metadata that is not an object: %s', (raw) => {
    const row = license('Still available', raw);
    const { component, element } = render([row]);
    expect(component.licenses()?.[0].data).toBeNull();
    expect(element.querySelectorAll('.license')).toHaveLength(1);
    expect(element.textContent).toContain('Still available');
    expect(component.licenses()?.[0].License).toBe(row.License);
  });

  it('ignores non-string fields while keeping valid fields in the same metadata object', () => {
    const { component, element } = render([
      license(
        'Mixed',
        JSON.stringify({
          name: true,
          description: { toString: null },
          link: [],
          license: 42,
          notes: 'Retained note',
        })
      ),
    ]);
    expect(component.licenses()?.[0].data).toEqual({
      name: '',
      description: '',
      link: '',
      license: '',
      notes: 'Retained note',
    });
    expect(element.textContent).toContain('Retained note');
    expect(element.textContent).not.toContain('[object Object]');
  });

  it('handles metadata objects with no recognized properties', () => {
    const { component } = render([license('Empty metadata', '{}')]);
    expect(component.licenses()?.[0].data).toEqual({ name: '', description: '', link: '', license: '', notes: '' });
  });
});
