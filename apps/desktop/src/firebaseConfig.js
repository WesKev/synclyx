// Same PUBLIC client config already used by apps/web/.env.local.
// These are safe to embed directly — they identify the project, not a secret.
// Security is enforced entirely by Firestore Security Rules (uid-scoped).

module.exports = {
  apiKey: 'AIzaSyDBGacqYJ5Aod8LJCWUW5pqIM2oTvGQjsc',
  authDomain: 'synclyx-app.firebaseapp.com',
  projectId: 'synclyx-app',
  storageBucket: 'synclyx-app.firebasestorage.app',
  messagingSenderId: '193657171350',
  appId: '1:193657171350:web:151a8f33e2962aae7041b7',
}
