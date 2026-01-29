import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Clock, 
  Sun, 
  Moon, 
  Layout, 
  ListTodo,
  StickyNote,
  X
} from 'lucide-react';

const App = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [darkMode, setDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Task State
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Review project requirements', completed: false, priority: 'high' },
    { id: 2, text: 'Draft initial layout', completed: true, priority: 'medium' },
    { id: 3, text: 'Email the team', completed: false, priority: 'low' },
  ]);
  const [newTask, setNewTask] = useState('');

  // Notes State
  const [notes, setNotes] = useState([
    { id: 1, title: 'Meeting Notes', content: 'Discuss Q3 goals and marketing strategy.' },
    { id: 2, title: 'Ideas', content: 'Dark mode implementation for the new dashboard.' },
  ]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Task Handlers
  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setTasks([...tasks, { 
      id: Date.now(), 
      text: newTask, 
      completed: false, 
      priority: 'medium' 
    }]);
    setNewTask('');
  };

  const toggleTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  // Note Handlers
  const addNote = () => {
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return;
    setNotes([...notes, {
      id: Date.now(),
      title: newNoteTitle || 'Untitled',
      content: newNoteContent
    }]);
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsAddingNote(false);
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-800'} font-sans`}>
      {/* Sidebar / Navigation */}
      <nav className={`fixed left-0 top-0 h-full w-20 flex flex-col items-center py-8 z-50 transition-colors ${darkMode ? 'bg-slate-800 border-r border-slate-700' : 'bg-white border-r border-gray-200'} shadow-sm`}>
        <div className="mb-8 p-2 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
          <Layout size={24} />
        </div>

        <div className="flex flex-col gap-6 w-full items-center">
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`p-3 rounded-xl transition-all duration-200 group relative ${activeTab === 'tasks' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
          >
            <ListTodo size={24} />
            <span className="absolute left-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Tasks</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('notes')}
            className={`p-3 rounded-xl transition-all duration-200 group relative ${activeTab === 'notes' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
          >
            <StickyNote size={24} />
            <span className="absolute left-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Notes</span>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`p-3 rounded-xl transition-all ${darkMode ? 'text-yellow-400 hover:bg-slate-700' : 'text-slate-400 hover:bg-gray-100 hover:text-slate-600'}`}
          >
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 min-h-screen">
        <header className="px-8 py-6 flex justify-between items-center max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {activeTab === 'tasks' ? 'My Tasks' : 'Quick Notes'}
            </h1>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Stay organized and focused.
            </p>
          </div>
          
          <div className={`flex items-center gap-3 px-4 py-2 rounded-full ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'} shadow-sm`}>
            <Clock size={16} className="text-indigo-500" />
            <span className="text-sm font-medium tabular-nums">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>|</span>
            <span className="text-sm font-medium">
              {currentTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </header>

        <div className="px-8 pb-12 max-w-5xl mx-auto">
          
          {/* TASKS VIEW */}
          {activeTab === 'tasks' && (
            <div className="space-y-6">
              {/* Input */}
              <form onSubmit={addTask} className="relative group">
                <input
                  type="text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="What needs to be done?"
                  className={`w-full p-4 pl-12 rounded-2xl outline-none border-2 transition-all ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-700 focus:border-indigo-500 text-white placeholder-slate-500' 
                      : 'bg-white border-gray-200 focus:border-indigo-500 text-gray-800 placeholder-gray-400'
                  } shadow-sm focus:shadow-md`}
                />
                <Plus size={24} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <button 
                  type="submit"
                  disabled={!newTask.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </form>

              {/* Task List */}
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className={`text-center py-16 flex flex-col items-center ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    <CheckCircle2 size={48} className="mb-4 opacity-20" />
                    <p>All caught up! No tasks pending.</p>
                  </div>
                ) : (
                  tasks.map(task => (
                    <div 
                      key={task.id}
                      className={`group flex items-center p-4 rounded-xl border transition-all duration-200 ${
                        darkMode 
                          ? 'bg-slate-800 border-slate-700 hover:border-slate-600' 
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      } ${task.completed ? 'opacity-60' : 'opacity-100 shadow-sm'}`}
                    >
                      <button 
                        onClick={() => toggleTask(task.id)}
                        className={`mr-4 p-1 rounded-full border-2 transition-colors ${
                          task.completed 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : `border-gray-300 text-transparent hover:border-indigo-500 ${darkMode ? 'border-slate-500' : ''}`
                        }`}
                      >
                        <CheckCircle2 size={16} fill={task.completed ? "currentColor" : "none"} />
                      </button>
                      
                      <span className={`flex-grow text-base ${task.completed ? 'line-through decoration-gray-400' : ''}`}>
                        {task.text}
                      </span>

                      <span className={`text-xs px-2 py-1 rounded-full mr-3 ${
                        task.priority === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                        task.priority === 'medium' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {task.priority}
                      </span>

                      <button 
                        onClick={() => deleteTask(task.id)}
                        className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                          darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                        }`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* NOTES VIEW */}
          {activeTab === 'notes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Add Note Button */}
              <button 
                onClick={() => setIsAddingNote(true)}
                className={`flex flex-col items-center justify-center p-6 h-64 rounded-2xl border-2 border-dashed transition-all ${
                  darkMode 
                    ? 'border-slate-700 hover:border-indigo-500 hover:bg-slate-800 text-slate-500' 
                    : 'border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-400'
                }`}
              >
                <Plus size={40} className="mb-2" />
                <span className="font-medium">Create New Note</span>
              </button>

              {/* Note Cards */}
              {notes.map(note => (
                <div key={note.id} className={`relative group p-6 h-64 rounded-2xl border shadow-sm flex flex-col ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                  <h3 className="font-bold text-lg mb-2 truncate">{note.title}</h3>
                  <p className={`text-sm flex-grow overflow-hidden ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    {note.content}
                  </p>
                  <div className={`mt-4 pt-4 border-t flex justify-between items-center ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <span className="text-xs text-gray-400">Just now</span>
                    <button 
                      onClick={() => deleteNote(note.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note Modal */}
        {isAddingNote && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">New Note</h2>
                  <button onClick={() => setIsAddingNote(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Title"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className={`w-full mb-4 p-3 rounded-lg border outline-none ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-200'
                  }`}
                  autoFocus
                />
                <textarea
                  placeholder="Write your thoughts..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className={`w-full h-32 p-3 rounded-lg border outline-none resize-none mb-6 ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-200'
                  }`}
                />
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsAddingNote(false)}
                    className={`px-4 py-2 rounded-lg font-medium ${darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addNote}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

// Application entry point - mounts the React app to the DOM
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
