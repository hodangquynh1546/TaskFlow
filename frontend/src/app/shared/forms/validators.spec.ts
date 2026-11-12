import { FormControl } from '@angular/forms';

import { notBlankValidator } from './validators';

describe('notBlankValidator', () => {
  it.each([['   '], ['\t\n'], [' ']])('rejects whitespace-only %j', (text) => {
    expect(notBlankValidator(new FormControl(text))).toEqual({ blank: true });
  });

  it('accepts real text, with surrounding spaces', () => {
    expect(notBlankValidator(new FormControl(' a '))).toBeNull();
  });

  it('leaves a truly empty value to Validators.required, so there is one message per problem', () => {
    expect(notBlankValidator(new FormControl(''))).toBeNull();
    expect(notBlankValidator(new FormControl(null))).toBeNull();
  });
});
