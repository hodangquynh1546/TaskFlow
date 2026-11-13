import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { BrowseMemory, classifyBrowse } from './browse-memory';

describe('classifyBrowse', () => {
  it.each([
    ['/tasks', { kind: 'list', url: '/tasks' }],
    ['/tasks?status=InProgress&sortBy=priority', { kind: 'list', url: '/tasks?status=InProgress&sortBy=priority' }],
    ['/schedule?date=2026-11-12', { kind: 'schedule', url: '/schedule?date=2026-11-12' }],
    ['/schedule', { kind: 'schedule', url: '/schedule' }],
  ])('%s is remembered as it is', (url, expected) => {
    expect(classifyBrowse(url)).toEqual(expected);
  });

  it('forgets the one-time highlight but keeps everything else', () => {
    expect(classifyBrowse('/tasks?status=Todo&highlight=abc&page=2')).toEqual({ kind: 'list', url: '/tasks?status=Todo&page=2' });
    expect(classifyBrowse('/tasks?highlight=abc')).toEqual({ kind: 'list', url: '/tasks' });
  });

  it.each([['/tasks/42'], ['/tasks/42/edit'], ['/tasks/new'], ['/tasks/new?date=2026-11-12']])('%s says nothing, so the memory survives it', (url) => {
    expect(classifyBrowse(url)).toBeNull();
  });

  it.each([['/dashboard'], ['/'], ['/profile'], ['/login']])('%s resets to "no particular place"', (url) => {
    expect(classifyBrowse(url)).toEqual({ kind: 'other' });
  });
});

describe('BrowseMemory', () => {
  it('follows navigation: the list with filters, then through a task page and back to where it was', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'tasks', children: [{ path: '', children: [] }, { path: ':id', children: [] }] }, { path: 'dashboard', children: [] }])],
    });
    const memory = TestBed.inject(BrowseMemory);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/tasks?status=InProgress');
    expect(memory.last()).toEqual({ kind: 'list', url: '/tasks?status=InProgress' });

    await router.navigateByUrl('/tasks/42');
    expect(memory.last()).toEqual({ kind: 'list', url: '/tasks?status=InProgress' });

    await router.navigateByUrl('/dashboard');
    expect(memory.last()).toEqual({ kind: 'other' });
  });
});
