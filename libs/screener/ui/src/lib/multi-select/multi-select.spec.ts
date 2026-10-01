import { ComboboxHarness } from '@angular/aria/combobox/testing';
import { ListboxHarness } from '@angular/aria/listbox/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MultiSelect, type SelectOption } from './multi-select';

@Component({
  imports: [MultiSelect],
  template: `
    <dh-multi-select
      label="Sector"
      placeholder="Any"
      [options]="options"
      [(value)]="value"
    />
  `,
})
class Host {
  readonly options: SelectOption[] = [
    { value: 'Energy', label: 'Energía' },
    { value: 'Financials', label: 'Finanzas' },
    { value: 'Utilities', label: 'Servicios públicos' },
  ];
  readonly value = signal<readonly string[]>([]);
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    combobox: await loader.getHarness(ComboboxHarness),
    trigger: root.querySelector('[role="combobox"]') as HTMLElement,
    label: root.querySelector('.dh-multi-select__label') as HTMLElement,
    summary: () =>
      (
        root.querySelector('.dh-multi-select__value') as HTMLElement
      ).textContent?.trim(),
  };
}

describe('MultiSelect', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('exposes a combobox labelled by its visible label', async () => {
    const { trigger, label } = await setup();
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-labelledby')).toBe(label.id);
    expect(label.textContent).toBe('Sector');
  });

  it('shows the placeholder when nothing is selected', async () => {
    const { summary, combobox } = await setup();
    expect(summary()).toBe('Any');
    expect(await combobox.isOpen()).toBe(false);
  });

  it('opens a multi-select listbox with every option', async () => {
    const { combobox } = await setup();
    await combobox.open();
    expect(await combobox.isOpen()).toBe(true);

    const listbox = await combobox.getPopupWidget(ListboxHarness);
    expect(await listbox.isMulti()).toBe(true);
    const options = await listbox.getOptions();
    expect(await Promise.all(options.map((o) => o.getText()))).toEqual([
      'Energía',
      'Finanzas',
      'Servicios públicos',
    ]);
  });

  it('toggles options, keeps the popup open and updates the model', async () => {
    const { host, combobox, summary } = await setup();
    await combobox.open();
    const listbox = await combobox.getPopupWidget(ListboxHarness);
    const [energy, , utilities] = await listbox.getOptions();

    await utilities?.click();
    await energy?.click();
    expect(host.value()).toEqual(
      expect.arrayContaining(['Energy', 'Utilities']),
    );
    expect(host.value()).toHaveLength(2);
    expect(await energy?.isSelected()).toBe(true);
    expect(await combobox.isOpen()).toBe(true);
    // Summary follows option order, not click order.
    expect(summary()).toBe('Energía +1');

    await energy?.click();
    expect(host.value()).toEqual(['Utilities']);
    expect(summary()).toBe('Servicios públicos');
  });

  it('reflects a value set from outside (e.g. decoded from the URL)', async () => {
    const { fixture, host, combobox, summary } = await setup();
    host.value.set(['Financials']);
    await fixture.whenStable();
    expect(summary()).toBe('Finanzas');

    await combobox.open();
    const listbox = await combobox.getPopupWidget(ListboxHarness);
    const selected = await listbox.getOptions({ selected: true });
    expect(await Promise.all(selected.map((o) => o.getText()))).toEqual([
      'Finanzas',
    ]);
  });

  it('closes when asked', async () => {
    const { combobox } = await setup();
    await combobox.open();
    await combobox.close();
    expect(await combobox.isOpen()).toBe(false);
  });
});
