import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// تهيئة Firebase باستخدام متغيرات البيئة لضمان أمان المفاتيح
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// إجبار فايربيس على استخدام Long Polling لتخطي حظر مزود الإنترنت
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

// تفعيل وتصدير نظام المصادقة لتسجيل الدخول
export const auth = getAuth(app);

// الدوال السحابية (كل عمليات الحفظ بتمر منها)
export const functions = getFunctions(app, "us-central1");
