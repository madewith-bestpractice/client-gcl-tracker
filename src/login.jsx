import React from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase.js';
import { Gem, Sparkles } from 'lucide-react';

export default function Login() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      alert("Failed to log in. Check console for details.");
    }
  };

  return (
    <div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="inline-flex items-center justify-center p-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-2xl shadow-lg shadow-fuchsia-500/30 mb-6">
          <Gem size={48} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent flex items-center justify-center gap-3">
          Gemmy Charmed Life <Sparkles className="text-yellow-400" />
        </h1>
        <p className="text-slate-500">Manifest your productivity, one gem at a time.</p>
      </div>

      <div className="w-full max-w-sm bg-white/80 backdrop-blur-md border border-fuchsia-100 rounded-2xl shadow-xl p-8">
        <button
          onClick={handleLogin}
          className="w-full py-3 px-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm group"
        >
          <img 
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
            alt="Google" 
            className="w-5 h-5 group-hover:scale-110 transition-transform" 
          />
          Sign in with Google
        </button>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">
            By signing in, you agree to manifest only good vibes.
          </p>
        </div>
      </div>
    </div>
  );
}
