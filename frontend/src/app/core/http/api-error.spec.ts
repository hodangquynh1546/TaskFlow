import { HttpErrorResponse } from '@angular/common/http';

import { ApiError, toApiError } from './api-error';

const http = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body, url: '/api/x' });

describe('toApiError', () => {
  it('returns an existing ApiError untouched', () => {
    const original = new ApiError(409, 'trùng');

    expect(toApiError(original)).toBe(original);
  });

  it('turns a validation problem into field errors keyed like the request body', () => {
    const error = toApiError(http(400, {
      status: 400,
      detail: 'Một hoặc nhiều trường không hợp lệ.',
      traceId: 'abc',
      errors: { title: ['Tiêu đề không được để trống.'], dueDate: ['Sai ngày.', 'Sai nữa.'] },
    }));

    expect(error.status).toBe(400);
    expect(error.message).toBe('Một hoặc nhiều trường không hợp lệ.');
    expect(error.fieldErrors['title']).toEqual(['Tiêu đề không được để trống.']);
    expect(error.fieldErrors['dueDate']).toEqual(['Sai ngày.', 'Sai nữa.']);
    expect(error.traceId).toBe('abc');
  });

  it('uses the server detail for 401, 404 and 409', () => {
    expect(toApiError(http(401, { detail: 'Email hoặc mật khẩu không đúng.' })).message).toBe('Email hoặc mật khẩu không đúng.');
    expect(toApiError(http(404, { detail: 'Không tìm thấy công việc.' })).message).toBe('Không tìm thấy công việc.');
    expect(toApiError(http(409, { detail: 'Email này đã được sử dụng.', errors: { email: ['Email này đã được sử dụng.'] } })).fieldErrors['email']).toEqual(['Email này đã được sử dụng.']);
  });

  it('falls back to a Vietnamese message when the body carries no detail', () => {
    expect(toApiError(http(401, null)).message).toContain('hết hạn');
    expect(toApiError(http(404, '')).message).toContain('Không tìm thấy');
    expect(toApiError(http(400, { detail: '   ' })).message).toContain('chưa hợp lệ');
    expect(toApiError(http(418, undefined)).message).toBe('Yêu cầu không thành công. Thử lại sau.');
  });

  it('never exposes server error details, only a reference code', () => {
    const error = toApiError(http(500, { detail: 'NullReferenceException at Foo.Bar', traceId: '00-trace-01' }));

    expect(error.message).toBe('Có lỗi từ máy chủ. Thử lại sau ít phút. Mã tham chiếu: 00-trace-01');
    expect(error.message).not.toContain('NullReference');
  });

  it('handles a 5xx from a proxy that returns HTML', () => {
    const error = toApiError(http(502, '<html>Bad gateway</html>'));

    expect(error.message).toBe('Có lỗi từ máy chủ. Thử lại sau ít phút.');
    expect(error.traceId).toBeUndefined();
  });

  it('describes a network failure and flags it', () => {
    const error = toApiError(http(0, new ProgressEvent('error')));

    expect(error.isNetworkError).toBe(true);
    expect(error.message).toContain('Không kết nối được máy chủ');
  });

  it('explains rate limiting', () => {
    expect(toApiError(http(429, { detail: 'x' })).message).toContain('quá nhanh');
  });

  it('copes with anything that is not an HttpErrorResponse', () => {
    for (const thing of [new Error('boom'), 'text', null, undefined, 42]) {
      const error = toApiError(thing);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(0);
      expect(error.message).not.toContain('boom');
    }
  });

  it('ignores a malformed errors field', () => {
    expect(toApiError(http(400, { errors: 'nope' })).fieldErrors).toEqual({});
  });
});
