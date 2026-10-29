import { describe, expect, it } from 'vitest';
import { logoFileProblem, MAX_LOGO_BYTES } from './logoStore';

describe('logo files', () => {
  it('takes PNG, JPEG and WebP up to 20 MB', () => {
    expect(logoFileProblem({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(logoFileProblem({ name: 'a.webp', type: 'image/webp', size: 1000 })).toBeNull();
    expect(logoFileProblem({ name: 'a.svg', type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG or WebP/);
    expect(logoFileProblem({ name: 'big.png', type: 'image/png', size: MAX_LOGO_BYTES + 1 })).toMatch(/too large/);
  });
});
