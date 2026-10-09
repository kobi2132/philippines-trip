// Public settings. The Firebase web config is not a secret: access is
// enforced by the Firestore rules in firebase/firestore.rules.
window.APP_CONFIG = {
  tripId: 'philippines-2026',
  // Paste the config from Firebase console → Project settings → Your apps → Web app.
  firebase: {
    apiKey: 'AIzaSyC8sEyLeELOn_zfmHSAlxAiiyQqpXCcaqU',
    authDomain: 'philippines-trip-8eb57.firebaseapp.com',
    projectId: 'philippines-trip-8eb57',
    storageBucket: 'philippines-trip-8eb57.firebasestorage.app',
    messagingSenderId: '1008578466900',
    appId: '1:1008578466900:web:a6c16ad23596738d8a49c1',
  },
  // Who may create the trip from the admin screen before it exists (must match the rules).
  adminEmails: ['kobi2132@gmail.com'],
};
