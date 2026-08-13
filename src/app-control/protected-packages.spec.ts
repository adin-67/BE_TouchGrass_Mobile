import { isProtectedPackage } from './protected-packages';

describe('isProtectedPackage', () => {
  it('protects Touch Grass and critical Android packages', () => {
    expect(isProtectedPackage('com.touchgrassmobile')).toBe(true);
    expect(isProtectedPackage('COM.ANDROID.SETTINGS')).toBe(true);
    expect(isProtectedPackage('com.google.android.gms')).toBe(true);
  });

  it('does not automatically protect a user-selected third-party package', () => {
    expect(isProtectedPackage('com.example.social')).toBe(false);
  });
});
