import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { FormView } from '../../destination/destination.config-utilities';
import { OptionsListComponent } from './options-list.component';

describe('OptionsListComponent option editing', () => {
  let fixture: ComponentFixture<OptionsListComponent>;
  const definitions: FormView[] = [
    { name: 'enabled', type: 'Boolean', defaultValue: 'yes' },
    { name: 'retries', type: 'Integer', defaultValue: '3' },
    { name: 'mode', type: 'Enumeration', options: ['Fast', 'Safe'] },
    { name: 'hidden', type: 'String' },
  ];
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  function setup(options: { Name: string; Value: string }[], freeText = false) {
    TestBed.configureTestingModule({
      imports: [OptionsListComponent],
      providers: [
        {
          provide: SysinfoState,
          useValue: {
            allOptions: signal(definitions),
            allOptionsGrouped: signal([{ displayName: 'Default', options: definitions }]),
          },
        },
      ],
    });
    TestBed.overrideComponent(OptionsListComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(OptionsListComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('hasFreeTextSettings', freeText);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads server strings into typed fields and canonical enumeration choices', () => {
    const component = setup([
      { Name: '--enabled', Value: 'YES' },
      { Name: 'retries', Value: '12' },
      { Name: 'mode', Value: ' safe ' },
    ]);
    expect(component.selectedSettings().map((x) => x.Value())).toEqual([true, 12, 'Safe']);
    expect(component.settingsAsText()).toBe('--enabled=True\nretries=12\nmode=Safe');
  });

  it('serializes edited booleans, integers and enumeration choices for the server', () => {
    const component = setup([
      { Name: 'enabled', Value: 'true' },
      { Name: 'retries', Value: '3' },
      { Name: 'mode', Value: 'Fast' },
    ]);
    const fields = component.selectedSettings();
    component.updateSettingValue(fields[0], false);
    component.updateSettingValue(fields[1], 8);
    component.updateSettingValue(fields[2], ' safe ');
    expect(component.options().map((x) => x.Value)).toEqual(['False', '8', 'Safe']);
  });

  it('excludes hidden and selected options from the add menu without losing stored hidden values', () => {
    const component = setup([
      { Name: '--enabled', Value: 'true' },
      { Name: 'hidden', Value: 'keep' },
    ]);
    fixture.componentRef.setInput('hiddenOptions', ['hidden']);
    expect(component.selectedSettings().map((x) => x.Name)).toEqual(['--enabled']);
    expect(component.nonSelectedOptionsGrouped()[0].options.map((x) => x.name)).toEqual(['retries', 'mode']);
    expect(component.options().find((x) => x.Name === 'hidden')?.Value).toBe('keep');
  });

  it('adds typed defaults and makes removed options available again', () => {
    const component = setup([]);
    component.addSetting(definitions[0]);
    component.addSetting(definitions[1]);
    expect(component.selectedSettings().map((x) => x.Value())).toEqual([true, 3]);
    component.removeSetting(component.selectedSettings()[0]);
    expect(component.options().map((x) => x.Name)).toEqual(['retries']);
    expect(component.nonSelectedOptionsGrouped()[0].options.map((x) => x.name)).toContain('enabled');
  });

  it('keeps unknown options only when free-text editing is enabled', () => {
    const component = setup([{ Name: 'custom-name', Value: 'custom=value' }]);
    expect(component.selectedSettings()).toEqual([]);
    fixture.componentRef.setInput('hasFreeTextSettings', true);
    expect(component.selectedSettings()[0].FormView.type).toBe('FreeText');
    expect(component.settingsAsText()).toBe('custom-name=custom=value');
    component.updateSettingsFromText('custom-name=changed=value');
    expect(component.options()).toEqual([expect.objectContaining({ Name: 'custom-name', Value: 'changed=value' })]);
  });
});
