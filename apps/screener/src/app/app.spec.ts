import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('mounts the toast outlet with its live regions', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('dh-toast-outlet [aria-live="polite"]'),
    ).not.toBeNull();
  });

  it('renders a skip link that targets the main landmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const skip = el.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skip?.getAttribute('href')).toBe('#main');
    expect(el.querySelector('main#main')).not.toBeNull();
  });
});
