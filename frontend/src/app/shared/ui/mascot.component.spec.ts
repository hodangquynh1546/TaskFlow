import { TestBed } from '@angular/core/testing';

import { MascotComponent, MascotMood } from './mascot.component';

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(MascotComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('svg') as SVGElement;
}

describe('MascotComponent', () => {
  it('is decoration by default: hidden from assistive technology', () => {
    const svg = render();

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('becomes an image with a name when it says something', () => {
    const svg = render({ label: 'Tí đang vẫy tay' });

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Tí đang vẫy tay');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it.each<MascotMood>(['happy', 'wave', 'cheer', 'worried', 'sleepy'])('draws the %s mood with its own class', (mood) => {
    expect(render({ mood }).classList.contains('ti--' + mood)).toBe(true);
  });

  it('only moves when asked to, so a list of them never bobs at once', () => {
    expect(render().classList.contains('ti--float')).toBe(false);
    expect(render({ animated: true }).classList.contains('ti--float')).toBe(true);
  });

  it('each mood changes the picture (worried has a sweat drop, sleepy has z marks, cheer raises both arms)', () => {
    expect(render({ mood: 'worried' }).querySelector('.sweat')).not.toBeNull();
    expect(render({ mood: 'sleepy' }).querySelectorAll('.zzz').length).toBe(2);
    expect(render({ mood: 'wave' }).querySelector('.arm-wave')).not.toBeNull();
    expect(render({ mood: 'happy' }).querySelector('.arm-wave')).toBeNull();
  });
});
