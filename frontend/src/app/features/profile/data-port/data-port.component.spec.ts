import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../../core/http/api-error';
import { NotifyService } from '../../../core/notify/notify.service';
import { UI_TEST_PROVIDERS } from '../../tasks/test-support';
import { DataPortComponent } from './data-port.component';
import { DataPortService } from './data-port.service';

function setup() {
  const data = { export: vi.fn(), import: vi.fn() };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    providers: [...UI_TEST_PROVIDERS, { provide: DataPortService, useValue: data }, { provide: NotifyService, useValue: notify }],
  });
  const fixture = TestBed.createComponent(DataPortComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes(label))!;
  const choose = async (file: File) => {
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(data.import.mock.calls.length + (el.querySelector('.problem') ? 1 : 0)).toBeGreaterThan(0));
    await settle();
  };
  return { fixture, el, data, notify, settle, button, choose };
}

describe('DataPortComponent', () => {
  let click: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('downloads the chosen format, hands the browser the file under the server\'s name and says so', async () => {
    const { data, button, settle, notify } = setup();
    data.export.mockReturnValue(of({ filename: 'taskflow-1.json', blob: new Blob(['{}']) }));
    const names: string[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    button('JSON').click();
    await settle();

    expect(data.export).toHaveBeenCalledWith('json');
    expect(names).toEqual(['taskflow-1.json']);
    expect(notify.success).toHaveBeenCalledWith('Đã tải tệp về');
  });

  it('locks both download buttons while one file is being prepared', async () => {
    const { data, button, settle } = setup();
    data.export.mockReturnValue(new Subject());

    button('CSV').click();
    await settle();

    expect(button('JSON').disabled).toBe(true);
    expect(button('CSV').disabled).toBe(true);
  });

  it('a failed download shows the server\'s message', async () => {
    const { data, button, settle, el } = setup();
    data.export.mockReturnValue(throwError(() => new ApiError(500, 'Máy chủ gặp sự cố.')));

    button('JSON').click();
    await settle();

    expect(el.querySelector('.problem')!.textContent).toContain('Máy chủ gặp sự cố.');
  });

  it('reads the chosen file as text, sends it in its format and reports what happened', async () => {
    const { data, choose, el, notify } = setup();
    data.import.mockReturnValue(
      of({ imported: 3, duplicates: 2, failed: 1, errors: [{ row: 4, field: 'status', message: 'Trạng thái không hợp lệ.' }] }),
    );

    await choose(new File(['title\r\nA'], 'cong-viec.csv'));

    expect(data.import).toHaveBeenCalledWith('csv', 'title\r\nA');
    const text = el.querySelector('.result')!.textContent!;
    expect(text).toContain('Đã nhập 3 công việc.');
    expect(text).toContain('Bỏ qua 2 việc đã có.');
    expect(text).toContain('1 dòng không nhập được');
    expect(text).toContain('Dòng 4 (status): Trạng thái không hợp lệ.');
    expect(notify.success).toHaveBeenCalledWith('Đã nhập 3 công việc.');
  });

  it('says nothing about duplicates or failures when there were none', async () => {
    const { data, choose, el } = setup();
    data.import.mockReturnValue(of({ imported: 1, duplicates: 0, failed: 0, errors: [] }));

    await choose(new File(['[]'], 'a.json'));

    const text = el.querySelector('.result')!.textContent!;
    expect(text).not.toContain('Bỏ qua');
    expect(text).not.toContain('không nhập được');
  });

  it('refuses a file that is neither JSON nor CSV without sending anything', async () => {
    const { data, choose, el } = setup();

    await choose(new File(['x'], 'anh.png'));

    expect(data.import).not.toHaveBeenCalled();
    expect(el.querySelector('.problem')!.textContent).toContain('Chỉ nhận tệp .json hoặc .csv.');
  });

  it('a file the server cannot read shows the reason it gave', async () => {
    const { data, choose, el } = setup();
    data.import.mockReturnValue(throwError(() => new ApiError(400, 'x', { content: ['Tệp nhập không đọc được.'] })));

    await choose(new File(['không phải json'], 'a.json'));

    expect(el.querySelector('.problem')!.textContent).toContain('Tệp nhập không đọc được.');
  });
});
