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
  CheckCircle2, 
  Plus, 
  Trash2, 
  Clock, 
  Sun, 
  Moon, 
  ListTodo, 
  StickyNote, 
  X, 
  Gem, 
  Sparkles, 
  LogOut, 
  AlertCircle 
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// Replace placeholders with your actual keys from the Firebase Console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE", 
  authDomain: "gemmy-charmed-app.firebaseapp.com",
  projectId: "gemmy-charmed-app",
  storageBucket: "gemmy-charmed-app.firebasestorage.app",
  messagingSenderId: "948878452999",
  appId: "YOUR_APP_ID_HERE"
};

// --- INITIALIZATION ---
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let auth;
let googleProvider;

if (isConfigured) {
  try {
    // Prevent double initialization
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error("Firebase init failed:", error);
  }
}

// --- AUTHENTICATION CONTEXT ---
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
  if (context === undefined) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

// --- COMPONENTS ---

const ConfigurationWarning = () => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
    <div className="max-w-md bg-slate-800 border border-amber-500/50 rounded-2xl p-8 shadow-2xl">
      <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-white mb-2">Configuration Required</h2>
      <p className="text-slate-400 mb-6 text-sm">
        Firebase keys are missing in <code className="bg-slate-700 px-1 rounded text-pink-400">src/main.jsx</code>. 
      </p>
      <div className="text-xs text-slate-500 bg-slate-900/50 p-3 rounded text-left font-mono leading-relaxed">
        1. Open Firebase Console<br/>
        2. Project Settings {'>'} General<br/>
        3. Copy values into the <code className="text-indigo-400">firebaseConfig</code> object.
      </div>
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
    <div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center p-4 text-slate-800">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-2xl shadow-lg mb-6 text-white">
          <Gem size={48} />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent flex items-center justify-center gap-3">
          Gemmy Charmed Life <Sparkles className="text-yellow-400" />
        </h1>
        <p className="text-slate-500 italic">Manifest your productivity, one gem at a time.</p>
      </div>

      <div className="w-full max-w-sm bg-white/80 backdrop-blur-md border border-fuchsia-100 rounded-2xl shadow-xl p-8">
        <button
          onClick={handleLogin}
          className="w-full py-3 px-4 bg-white border border-slate-200 hover:border-fuchsia-300 hover:bg-fuchsia-50 text-slate-700 font-medium rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm group"
        >
          <img 
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
            alt="Google" 
            className="w-5 h-5 group-hover:scale-110 transition-transform" 
          />
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

  const [tasks, setTasks] = useState([
    { id: 1, text: 'Review gem inventory', completed: false },
    { id: 2, text: 'Cleanse workspaces', completed: true },
  ]);
  const [newTask, setNewTask] = useState('');

  const [notes, setNotes] = useState([
    { id: 1, title: 'Morning Affirmation', content: 'Today I will manifest clarity and focus.' },
  ]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: Date.now(), text: newTask, completed: false }]);
    setNewTask('');
  };

  const handleLogout = () => auth && signOut(auth);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-fuchsia-50 text-slate-800'}`}>
      <nav className={`fixed left-0 top-0 h-full w-20 flex flex-col items-center py-8 z-50 border-r ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-fuchsia-100'}`}>
        <div className="mb-8 p-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg">
          <Gem size={24} />
        </div>
        <div className="flex flex-col gap-6 w-full items-center">
          <button onClick={() => setActiveTab('tasks')} className={`p-3 rounded-xl transition-all ${activeTab === 'tasks' ? 'text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20' : 'text-slate-400'}`}>
            <ListTodo size={24} />
          </button>
          <button onClick={() => setActiveTab('notes')} className={`p-3 rounded-xl transition-all ${activeTab === 'notes' ? 'text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20' : 'text-slate-400'}`}>
            <StickyNote size={24} />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button onClick={() => setDarkMode(!darkMode)} className="p-3 text-slate-400">
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button onClick={handleLogout} className="p-3 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut size={24} />
          </button>
        </div>
      </nav>

      <main className="pl-20 min-h-screen">
        <header className="px-8 py-8 flex justify-between items-center max-w-5xl mx-auto">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              {activeTab === 'tasks' ? 'Crystal Tasks' : 'Gem Notes'} <Sparkles size={20} className="text-yellow-400" />
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manifesting productivity for {currentUser?.displayName?.split(' ')[0] || 'Friend'}.</p>
          </div>
          <div className={`flex items-center gap-3 px-4 py-2 rounded-full border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-fuchsia-100'}`}>
            <Clock size={16} className="text-fuchsia-500" />
            <span className="text-sm font-medium tabular-nums">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </header>

        <div className="px-8 max-w-5xl mx-auto pb-12">
          {activeTab === 'tasks' ? (
            <div className="space-y-6">
              <form onSubmit={addTask} className="relative group">
                <input
                  type="text" 
                  value={newTask} 
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="What gem needs polishing today?"
                  className={`w-full p-4 pl-12 rounded-2xl outline-none border-2 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 focus:border-fuchsia-500' : 'bg-white border-fuchsia-100 focus:border-fuchsia-400'}`}
                />
                <Plus size={24} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </form>
              <div className="space-y-3">
                {tasks.map(task => (
                  <div key={task.id} className={`flex items-center p-4 rounded-xl border transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-fuchsia-100'}`}>
                    <span className={`flex-grow ${task.completed ? 'line-through text-slate-400' : ''}`}>{task.text}</span>
                    <button onClick={() => setTasks(tasks.filter(t => t.id !== task.id))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setIsAddingNote(true)} className={`p-6 h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${darkMode ? 'border-slate-700 text-slate-500 hover:bg-slate-800' : 'border-fuchsia-200 text-fuchsia-300 hover:bg-fuchsia-50'}`}>
                <Plus size={40} className="mb-2" />
                <span className="font-medium">New Gem Note</span>
              </button>
              {notes.map(note => (
                <div key={note.id} className={`p-6 h-48 rounded-2xl border shadow-sm transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-fuchsia-100'}`}>
                  <h3 className="font-bold mb-2 text-fuchsia-700 dark:text-fuchsia-400">{note.title}</h3>
                  <p className="text-sm text-slate-500 overflow-hidden line-clamp-4">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {isAddingNote && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border-2 border-fuchsia-100'}`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 bg-clip-text text-transparent">New Gem Note</h2>
              <button onClick={() => setIsAddingNote(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <input
              type="text" placeholder="Note Title" value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              className={`w-full mb-4 p-3 rounded-lg border outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-fuchsia-100'}`}
            />
            <textarea
              placeholder="Your thoughts..." value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className={`w-full h-32 p-3 rounded-lg border outline-none mb-6 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-fuchsia-100'}`}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  if (newNoteTitle || newNoteContent) {
                    setNotes([...notes, { id: Date.now(), title: newNoteTitle || "Untitled", content: newNoteContent }]);
                    setNewNoteTitle(''); setNewNoteContent('');
                  }
                  setIsAddingNote(false);
                }}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-medium"
              >
                Save Gem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP CONTENT GATEKEEPER ---
const AppContent = () => {
  if (!isConfigured) return <ConfigurationWarning />;
  const authContext = useAuth();
  
  // Guard for initialization
  if (!authContext) return null;

  return authContext.currentUser ? <Dashboard /> : <Login />;
};

// --- MAIN ENTRY POINT ---
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
