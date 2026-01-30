import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut 
} from 'firebase/auth';
import { 
  Gem, 
  Sparkles, 
  LogOut, 
  AlertCircle,
  ListTodo,
  StickyNote,
  Plus,
  Trash2,
  Clock,
  Sun,
  Moon,
  X
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// IMPORTANT: You MUST replace these placeholders with your actual keys from the Firebase Console.
const firebaseConfig = {
  apiKey: "AIzaSyCZjBNDClX3g0bXW2uPCpGIgGw32tlgMMI", 
  authDomain: "gemmy-charmed-app.firebaseapp.com",
  projectId: "gemmy-charmed-app",
  storageBucket: "gemmy-charmed-app.firebasestorage.app",
  messagingSenderId: "948878452999",
  appId: "1:948878452999:web:51ce7ac345ab9c669f3da2"
};

// --- INITIALIZATION ---
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let auth;
let googleProvider;

if (isConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error("Firebase init failed:", error);
  }
}

// --- AUTHENTICATION ---
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    // Return a default state to prevent errors if component renders before context is ready
    return { currentUser: null, isOutside: true };
  }
  return context;
};

// --- UI COMPONENTS ---

const ConfigurationWarning = () => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
    <div className="max-w-md bg-slate-800 border border-amber-500/50 rounded-2xl p-8 shadow-2xl">
      <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-white mb-2">Configuration Required</h2>
      <p className="text-slate-400 mb-6 text-sm leading-relaxed text-balance">
        Firebase keys are missing in <code className="bg-slate-700 px-1 rounded text-pink-400 font-mono">src/main.jsx</code>.
        Please update the <code className="text-indigo-400 font-mono">firebaseConfig</code> object with your keys.
      </p>
    </div>
  </div>
);

const Login = () => {
  const handleLogin = async () => {
    if (!auth || !googleProvider) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-2xl shadow-lg mb-6 text-white">
          <Gem size={48} />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent flex items-center justify-center gap-3">
          Gemmy Charmed Life <Sparkles className="text-yellow-400" />
        </h1>
        <p className="text-slate-500 italic">Manifest your productivity, one gem at a time.</p>
      </div>
      <div className="w-full max-w-sm bg-white border border-fuchsia-100 rounded-3xl shadow-xl p-8">
        <button
          onClick={handleLogin}
          className="w-full py-4 px-4 bg-white border border-slate-200 hover:border-fuchsia-300 hover:bg-fuchsia-50 text-slate-700 font-semibold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('tasks');
  const [darkMode, setDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [tasks, setTasks] = useState([{ id: 1, text: 'Review gem inventory', completed: false }]);
  const [newTask, setNewTask] = useState('');
  const [notes, setNotes] = useState([{ id: 1, title: 'Affirmation', content: 'Today is full of light.' }]);
  const [isAddingNote, setIsAddingNote] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => auth && signOut(auth);

  return (
    <div className={`min-h-screen transition-all duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-fuchsia-50 text-slate-800'} font-sans`}>
      <nav className={`fixed left-0 top-0 h-full w-20 flex flex-col items-center py-8 z-50 border-r ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-fuchsia-100'}`}>
        <div className="mb-8 p-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg"><Gem size={24} /></div>
        <button 
          onClick={() => setActiveTab('tasks')} 
          className={`p-3 mb-4 rounded-xl transition-colors ${activeTab === 'tasks' ? 'text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20' : 'text-slate-400 hover:text-fuchsia-400'}`}
        >
          <ListTodo size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('notes')} 
          className={`p-3 rounded-xl transition-colors ${activeTab === 'notes' ? 'text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20' : 'text-slate-400 hover:text-fuchsia-400'}`}
        >
          <StickyNote size={24} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button onClick={() => setDarkMode(!darkMode)} className="p-3 text-slate-400 hover:text-fuchsia-400 transition-colors">
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button onClick={handleLogout} className="p-3 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut size={24} />
          </button>
        </div>
      </nav>
      <main className="pl-20 max-w-5xl mx-auto p-8">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent">
              {activeTab === 'tasks' ? 'Tasks' : 'Notes'}
            </h1>
            <p className="text-xs text-slate-500 font-medium">Shining bright, {currentUser?.displayName?.split(' ')[0] || 'Friend'}</p>
          </div>
          <div className="flex items-center gap-2 font-bold px-4 py-2 bg-white dark:bg-slate-800 rounded-full border border-fuchsia-100 dark:border-slate-700 shadow-sm transition-colors">
            <Clock size={16} className="text-fuchsia-500" />
            <span className="tabular-nums">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </header>
        {activeTab === 'tasks' ? (
          <div className="space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if(newTask.trim()) setTasks([{id: Date.now(), text: newTask, completed: false}, ...tasks]); setNewTask(''); }} className="relative">
              <input 
                type="text" 
                value={newTask} 
                onChange={(e) => setNewTask(e.target.value)} 
                placeholder="Add a new gem task..." 
                className="w-full p-5 pl-14 rounded-2xl border-2 dark:bg-slate-800 dark:border-slate-700 focus:border-fuchsia-400 outline-none transition-all" 
              />
              <Plus className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
            </form>
            {tasks.map(t => (
              <div key={t.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 flex items-center justify-between shadow-sm transition-colors">
                <span className={t.completed ? 'line-through text-slate-400' : ''}>{t.text}</span>
                <button onClick={() => setTasks(tasks.filter(x => x.id !== t.id))} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => setIsAddingNote(true)} 
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-fuchsia-200 dark:border-slate-700 rounded-3xl text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-slate-800 transition-all"
            >
              <Plus size={32} className="mb-2" />
              <span className="font-bold">New Note</span>
            </button>
            {notes.map(n => (
              <div key={n.id} className="bg-white dark:bg-slate-800 p-8 rounded-3xl border dark:border-slate-700 shadow-sm transition-colors">
                <h3 className="font-bold text-xl text-fuchsia-600 dark:text-fuchsia-400 mb-2">{n.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// --- CONTENT CONTROLLER ---
const AppContent = () => {
  if (!isConfigured) return <ConfigurationWarning />;
  const authContext = useAuth();
  
  if (authContext.isOutside) return null;

  return authContext.currentUser ? <Dashboard /> : <Login />;
};

// --- ROOT APP ---
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
