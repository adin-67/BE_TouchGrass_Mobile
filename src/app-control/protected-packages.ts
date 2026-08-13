export const PROTECTED_PACKAGES = new Set([
  'com.touchgrassmobile',
  'com.android.settings',
  'com.android.systemui',
  'com.android.launcher',
  'com.android.launcher2',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
  'com.sec.android.app.launcher',
  'com.miui.home',
  'com.google.android.permissioncontroller',
  'com.android.permissioncontroller',
  'com.android.managedprovisioning',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.android.phone',
  'com.android.dialer',
  'com.google.android.dialer',
  'com.android.incallui',
  'com.android.messaging',
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.emergency',
  'com.google.android.gms',
]);

export const isProtectedPackage = (packageName: string): boolean =>
  PROTECTED_PACKAGES.has(packageName.toLowerCase().trim());
