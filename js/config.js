// Public settings. The Firebase web config is not a secret: access is
// enforced by the Firestore rules in firebase/firestore.rules.
window.APP_CONFIG = {
  tripId: 'philippines-2026',
  // Paste the config from Firebase console → Project settings → Your apps → Web app.
  firebase: null,
  // Who may create the trip from the admin screen before it exists (must match the rules).
  adminEmails: ['ADMIN_EMAIL@gmail.com'],
};
