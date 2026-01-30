import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCZjBNDClX3g0bXW2uPCpGIgGw32tlgMMI", // Copy from Firebase Console
  authDomain: "gemmy-charmed-app.firebaseapp.com",
  projectId: "gemmy-charmed-app",
  storageBucket: "gemmy-charmed-app.firebasestorage.app",
  messagingSenderId: "948878452999", // From your project number in screenshot
  appId: "1:948878452999:web:51ce7ac345ab9c669f3da2" // Copy from Firebase Console
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export default app;
