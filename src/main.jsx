import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  query, 
  addDoc,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Package, StickyNote, Camera, CheckCircle, User, Send, 
  Image as ImageIcon, DollarSign, Truck, ChevronRight, 
  MapPin, Box, ThumbsUp, Copy, ExternalLink, Sparkles, 
  Heart, Gem, Mail, AlertTriangle
} from 'lucide-react';

// --- Global Styles ---
// We inject Tailwind and custom styles here so you don't need a separate CSS file
const GlobalStyles = () => (
  <style>{`
    @tailwind base;
    @tailwind components;
    @tailwind utilities;

    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
  `}</style>
);

// --- Configuration Helper ---
const getFirebaseConfig = () => {
  // 1. Check for Chat Preview Environment
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }

  // 2. Production / Local Development
  // >>> ACTION REQUIRED <<<
  // Remove the /* and */ comments below for your local/Cloudflare app.
  
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

// Initialize Firebase
const firebaseConfig = getFirebaseConfig();
// We only initialize if we have a valid config to prevent crashes
const app = firebaseConfig && firebaseConfig.apiKey ? initializeApp(firebaseConfig) : undefined;
const auth = app ? getAuth(app) : undefined;
const db = app ? getFirestore(app) : undefined;

// --- Constants & Workflow ---

const STATUS_FLOW = [
  { id: 'created', label: 'Order Created', icon: Sparkles, description: 'Waiting for info' },
  { id: 'address_captured', label: 'Address Set', icon: MapPin, description: 'Ready to ship kit' },
  { id: 'kit_shipped', label: 'Kit Shipped', icon: Package, description: 'Kit is on the way' },
  { id: 'kit_delivered', label: 'Kit Delivered', icon: Box, description: 'Customer has kit' },
  { id: 'photos_submitted', label: 'Reviewing', icon: Camera, description: 'Checking mold photos' },
  { id: 'photos_approved', label: 'Approved', icon: CheckCircle, description: 'Send mold back' },
  { id: 'mold_in_transit', label: 'Mold Return', icon: Truck, description: 'Mold on the way back' },
  { id: 'mold_received', label: 'Mold Received', icon: Box, description: 'We have your mold' },
  { id: 'production', label: 'Making Magic', icon: Gem, description: 'Creating your piece' },
  { id: 'product_shipped', label: 'Shipped', icon: Package, description: 'It\'s on the way!' },
  { id: 'product_delivered', label: 'Delivered', icon: User, description: 'You got it!' },
  { id: 'fit_approved', label: 'Fit Check', icon: Heart, description: 'Does it fit?' },
  { id: 'paid_complete', label: 'All Done', icon: DollarSign, description: 'Order Complete' },
];

// --- Helpers ---

const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    };
  });
};

const getTrackingLink = (number) => `https://www.google.com/search?q=${number}`;

// --- Components ---

const ProgressBar = ({ currentStatus }) => {
  const currentIndex = STATUS_FLOW.findIndex(s => s.id === currentStatus);
  const percentage = Math.max(5, ((currentIndex + 1) / STATUS_FLOW.length) * 100);

  return (
    <div className="w-full bg-rose-100 h-2 rounded-full overflow-hidden mt-2">
      <div 
        className="bg-gradient-to-r from-rose-400 to-purple-400 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(251,113,133,0.5)]" 
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const PizzaTracker = ({ currentStatus }) => {
  const currentIndex = STATUS_FLOW.findIndex(s => s.id === currentStatus);
  
  return (
    <div className="w-full py-8 overflow-x-auto scrollbar-hide">
      <div className="flex items-start min-w-[1200px] px-6">
        {STATUS_FLOW.map((step, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;

          return (
            <React.Fragment key={step.id}>
              <div className="relative flex flex-col items-center group w-24">
                <div 
                  className={`w-11 h-11 rounded-full flex items-center justify-center border-2 z-10 transition-all duration-300
                    ${isCompleted ? 'bg-white border-rose-400 text-rose-500 shadow-md' : 'bg-white border-slate-200 text-slate-300'}
                    ${isCurrent ? 'ring-4 ring-rose-200 scale-110 shadow-[0_0_15px_rgba(251,113,133,0.3)]' : ''}
                  `}
                >
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div className={`mt-3 text-center w-28 text-[11px] font-bold uppercase tracking-wider transition-colors duration-300
                  ${isCompleted ? 'text-rose-500' : 'text-slate-400'}
                `}>
                  {step.label}
                </div>
                {isCurrent && (
                  <div className="mt-1 text-[10px] text-purple-500 font-medium text-center w-28 animate-pulse">
                    {step.description}
                  </div>
                )}
              </div>

              {index < STATUS_FLOW.length - 1 && (
                <div className={`flex-1 h-1 mt-5 rounded-full transition-colors duration-500 mx-1
                  ${index < currentIndex ? 'bg-gradient-to-r from-rose-300 to-purple-300' : 'bg-slate-100'}
                `} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const TrackingCard = ({ title, trackingNumber, status, onSimulateUpdate }) => {
  if (!trackingNumber) return null;
  return (
    <div className="bg-white border border-rose-100 p-5 rounded-2xl flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">{title}</span>
        <a 
          href={getTrackingLink(trackingNumber)} 
          target="_blank" 
          rel="noreferrer"
          className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-xs font-medium bg-purple-50 px-2 py-1 rounded-full"
        >
          Track <ExternalLink size={10} />
        </a>
      </div>
      <div className="text-slate-800 font-mono text-sm tracking-wide bg-slate-50 p-2 rounded border border-slate-100 text-center">{trackingNumber}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          Status: <span className="text-slate-700 font-medium capitalize">{status || 'In Transit'}</span>
        </span>
        {/* Simulation Button for Demo */}
        {onSimulateUpdate && status !== 'Delivered' && (
          <button 
            onClick={onSimulateUpdate}
            className="text-[10px] bg-white hover:bg-rose-50 text-rose-500 px-2 py-1 rounded border border-rose-200 transition-colors"
          >
            Simulate Delivery
          </button>
        )}
      </div>
    </div>
  );
};

const NoteEntry = ({ message }) => {
  const isVendor = message.sender === 'vendor';
  return (
    <div className={`p-4 rounded-xl border mb-3 ${
      isVendor 
        ? 'bg-purple-50 border-purple-100' 
        : 'bg-white border-slate-200'
    }`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
          isVendor ? 'text-purple-600' : 'text-slate-600'
        }`}>
          {isVendor ? <Sparkles size={12} /> : <User size={12} />}
          {isVendor ? 'Gemmy Charmed Team' : 'Client'}
        </span>
        <span className="text-[10px] text-slate-400">
          {new Date(message.timestamp).toLocaleDateString()} • {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{message.text}</p>
    </div>
  );
};

// --- Main Application ---

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState('vendor'); 
  const [activeOrder, setActiveOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('dashboard'); 
  
  // Form States
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Specific Form Inputs
  const [clientForm, setClientForm] = useState({ name: '', email: '' });
  const [addressForm, setAddressForm] = useState({ street: '', city: '', state: '', zip: '', note: '' });
  const [shippingForm, setShippingForm] = useState({ outbound: '', return: '' });
  const [finalShippingForm, setFinalShippingForm] = useState('');

  // Auth Init
  useEffect(() => {
    if (!auth) return;
    
    // Simple anonymous auth for initial setup. 
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setLoading(false);
      } else {
        signInAnonymously(auth).catch((error) => console.error("Auth Error:", error));
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user || !db) return;

    // Use root 'orders' collection
    const q = query(collection(db, 'orders'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(fetchedOrders);
      
      if (activeOrder) {
        const updated = fetchedOrders.find(o => o.id === activeOrder.id);
        if (updated) setActiveOrder(updated);
      }
    });

    return () => unsubscribe();
  }, [user, activeOrder?.id]);

  // --- Actions ---

  const createClientRecord = async () => {
    if (!clientForm.name || !db) return;
    try {
      const newOrder = {
        customerName: clientForm.name,
        customerEmail: clientForm.email,
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        photos: [],
        internalNotes: '',
        tracking: {
          kitOutbound: null,
          kitReturn: null,
          productOutbound: null
        },
        address: null,
        fitApproved: false,
        paid: false
      };
      
      const docRef = await addDoc(collection(db, 'orders'), newOrder);
      setClientForm({ name: '', email: '' });
      setActiveOrder({ id: docRef.id, ...newOrder });
      setView('order_detail');
    } catch (e) { console.error(e); }
  };

  const submitAddress = async () => {
    if (!addressForm.street || !db) return;
    try {
      const updates = {
        address: {
          street: addressForm.street,
          city: addressForm.city,
          state: addressForm.state,
          zip: addressForm.zip
        },
        status: 'address_captured',
        updatedAt: new Date().toISOString()
      };

      if (addressForm.note) {
        updates.messages = arrayUnion({
          text: `(Delivery Note) ${addressForm.note}`,
          sender: 'customer',
          timestamp: new Date().toISOString()
        });
      }

      await updateDoc(doc(db, 'orders', activeOrder.id), updates);
    } catch(e) { console.error(e); }
  };

  const submitKitShipping = async () => {
    if ((!shippingForm.outbound || !shippingForm.return) || !db) return;
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        tracking: {
          ...activeOrder.tracking,
          kitOutbound: shippingForm.outbound,
          kitReturn: shippingForm.return,
          kitOutboundStatus: 'In Transit',
          kitReturnStatus: 'Pending'
        },
        status: 'kit_shipped',
        updatedAt: new Date().toISOString()
      });
    } catch(e) { console.error(e); }
  };

  const submitProductShipping = async () => {
    if (!finalShippingForm || !db) return;
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        tracking: {
          ...activeOrder.tracking,
          productOutbound: finalShippingForm,
          productOutboundStatus: 'In Transit'
        },
        status: 'product_shipped',
        updatedAt: new Date().toISOString()
      });
    } catch(e) { console.error(e); }
  };

  const updateStatus = async (newStatus, extraData = {}) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        ...extraData
      });
    } catch (e) { console.error(e); }
  };

  const simulateTrackingUpdate = async (type, newStatus, nextAppStatus) => {
    if (!db) return;
    try {
      const updates = { [`tracking.${type}Status`]: newStatus };
      if (nextAppStatus) updates.status = nextAppStatus;
      updates.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'orders', activeOrder.id), updates);
    } catch(e) { console.error(e); }
  };

  const sendNote = async () => {
    if (!newMessage.trim() || !db) return;
    const msg = {
      text: newMessage,
      sender: activeRole === 'vendor' ? 'vendor' : 'customer',
      timestamp: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        messages: arrayUnion(msg)
      });
      setNewMessage('');
    } catch (e) { console.error(e); }
  };

  const handlePhotoUpload = async (e) => {
    if (!e.target.files[0] || !db) return;
    setIsUploading(true);
    try {
      const base64 = await compressImage(e.target.files[0]);
      const photoData = {
        url: base64,
        uploadedBy: activeRole,
        timestamp: new Date().toISOString(),
        approved: false
      };
      
      const updates = { photos: arrayUnion(photoData) };
      if (activeRole === 'customer' && activeOrder.status === 'kit_delivered') {
        updates.status = 'photos_submitted';
      }
      
      await updateDoc(doc(db, 'orders', activeOrder.id), updates);
    } catch (e) { console.error(e); } finally { setIsUploading(false); }
  };

  const approvePhotos = async () => { await updateStatus('photos_approved'); };
  const confirmFit = async () => { await updateStatus('fit_approved', { fitApproved: true }); };
  const markPaid = async () => { await updateStatus('paid_complete', { paid: true }); };

  // --- Views ---

  if (!app) {
    return (
       <div className="min-h-screen bg-rose-50 text-rose-500 flex flex-col items-center justify-center p-6 text-center">
         <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md border border-rose-100">
           <div className="flex justify-center mb-4 text-amber-500">
              <AlertTriangle size={48} />
           </div>
           <h2 className="text-xl font-bold mb-4 text-slate-800">Deployment Configuration Needed</h2>
           <p className="text-slate-600 mb-6 leading-relaxed">
             You are viewing this in a mode that expects Firebase configuration.
           </p>
           
           <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-200 mb-6">
             <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Instructions for Developer:</p>
             <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
               <li>Open <code>src/main.jsx</code> in your code editor.</li>
               <li>Find the <code>getFirebaseConfig</code> function.</li>
               <li><strong>Uncomment</strong> the code block containing <code>import.meta.env</code>.</li>
               <li><strong>Delete</strong> the <code>return null;</code> line.</li>
               <li>Ensure your <code>.env</code> file has the correct keys.</li>
             </ol>
           </div>
           
           <button 
             onClick={() => window.location.reload()}
             className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors"
           >
             Reload App
           </button>
         </div>
       </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-rose-50 text-rose-500 flex items-center justify-center font-bold tracking-widest">LOADING...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-purple-50 text-slate-700 font-sans selection:bg-rose-200 selection:text-rose-900">
      <GlobalStyles />
      
      {/* Navigation */}
      <nav className="border-b border-rose-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => setView('dashboard')}
          >
            {/* LOGO PLACEHOLDER */}
            <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-rose-200 bg-white flex items-center justify-center">
               <img src="https://placehold.co/100x100/fb7185/ffffff?text=GCL" alt="Gemmy Charmed Life" className="object-cover h-full w-full" />
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* SIMULATION TOGGLE */}
            <div className="flex bg-slate-100 border border-slate-200 rounded-full p-1">
              <button 
                onClick={() => { setActiveRole('customer'); setView('dashboard'); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeRole === 'customer' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Customer
              </button>
              <button 
                onClick={() => { setActiveRole('vendor'); setView('dashboard'); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeRole === 'vendor' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Vendor
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* --- DASHBOARD --- */}
        {view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Vendor: Create New Client Box */}
            {activeRole === 'vendor' && (
              <div className="bg-white border border-rose-100 p-8 rounded-3xl relative overflow-hidden shadow-xl shadow-rose-100/50">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-rose-200 to-purple-200 opacity-30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <h2 className="text-slate-800 text-lg font-bold mb-6 flex items-center gap-2">
                  <Sparkles size={20} className="text-purple-400"/> New Client Record
                </h2>
                <div className="flex flex-col sm:flex-row gap-4 items-end relative z-10">
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-xs text-rose-400 uppercase font-bold tracking-wider ml-1">Client Name</label>
                    <input 
                      type="text" 
                      value={clientForm.name}
                      onChange={e => setClientForm({...clientForm, name: e.target.value})}
                      className="w-full bg-slate-50 border border-rose-100 rounded-xl px-4 py-3 text-slate-700 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all"
                      placeholder="e.g. Ice Spice"
                    />
                  </div>
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-xs text-rose-400 uppercase font-bold tracking-wider ml-1">Email (Optional)</label>
                    <input 
                      type="email" 
                      value={clientForm.email}
                      onChange={e => setClientForm({...clientForm, email: e.target.value})}
                      className="w-full bg-slate-50 border border-rose-100 rounded-xl px-4 py-3 text-slate-700 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all"
                      placeholder="client@example.com"
                    />
                  </div>
                  <button 
                    onClick={createClientRecord}
                    className="w-full sm:w-auto bg-gradient-to-r from-rose-400 to-purple-400 hover:from-rose-500 hover:to-purple-500 text-white px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-200 hover:shadow-xl hover:scale-[1.02]"
                  >
                    <Package size={18} /> Generate Link
                  </button>
                </div>
              </div>
            )}

            {/* Orders List */}
            <div>
              <h2 className="text-2xl font-light text-slate-800 mb-6 flex items-center gap-2">
                {activeRole === 'vendor' ? 'Active Requests' : 'My Collection'}
                {activeRole === 'customer' && <Heart className="text-rose-400 fill-rose-400" size={20} />}
              </h2>
              
              <div className="grid gap-4">
                {orders.length === 0 ? (
                  <div className="text-center py-20 bg-white/50 rounded-3xl border-2 border-dashed border-rose-200">
                    <p className="text-rose-400 font-medium">No active orders found.</p>
                    <p className="text-slate-400 text-sm mt-1">Time to add some sparkle!</p>
                  </div>
                ) : (
                  orders.map(order => (
                    <div 
                      key={order.id}
                      onClick={() => { setActiveOrder(order); setView('order_detail'); }}
                      className="group bg-white hover:bg-rose-50/50 border border-rose-100 hover:border-rose-300 p-6 rounded-2xl transition-all cursor-pointer relative overflow-hidden shadow-sm hover:shadow-md"
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 z-10 relative">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-slate-800 group-hover:text-rose-500 transition-colors">{order.customerName}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-500 border border-purple-100">
                              #{order.id.slice(0,6)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 inline-block" />
                            Status: <span className="text-slate-700 font-medium">{STATUS_FLOW.find(s => s.id === order.status)?.label}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 group-hover:text-rose-500 transition-colors bg-white px-3 py-1 rounded-full border border-slate-100 group-hover:border-rose-200">
                          <span className="text-xs font-bold">Open</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                      
                      <ProgressBar currentStatus={order.status} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- ORDER DETAIL --- */}
        {view === 'order_detail' && activeOrder && (
          <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
            
            {/* Header */}
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => setView('dashboard')}
                className="text-slate-400 hover:text-rose-500 flex items-center gap-2 text-sm w-fit transition-colors font-medium"
              >
                <ChevronRight className="rotate-180" size={16} /> Back to Dashboard
              </button>
              
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white border border-rose-100 p-8 rounded-3xl shadow-sm">
                <div>
                  <h1 className="text-4xl text-slate-800 font-extrabold tracking-tight mb-3">
                    {activeOrder.customerName}
                  </h1>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 text-slate-600">
                      <User size={14} className="text-purple-400"/> 
                      Order #{activeOrder.id.slice(0,6)}
                    </div>
                    {activeOrder.address && (
                      <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 text-slate-600">
                        <MapPin size={14} className="text-rose-400"/> 
                        {activeOrder.address.city}, {activeOrder.address.state}
                      </div>
                    )}
                  </div>
                </div>

                {activeRole === 'vendor' && (
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-400 px-2 font-bold uppercase tracking-wider">Magic Link</div>
                    <code className="bg-white px-3 py-1.5 rounded-lg text-xs text-rose-500 border border-rose-100 font-mono">gemmycharmed.life/track/{activeOrder.id.slice(0,6)}</code>
                    <button className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-rose-500 transition-colors border border-transparent hover:border-slate-100">
                      <Copy size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tracker */}
            <div className="bg-white border border-rose-100 rounded-3xl p-6 shadow-xl shadow-rose-100/50 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-400 via-purple-400 to-rose-400" />
              <PizzaTracker currentStatus={activeOrder.status} />
            </div>

            {/* Dynamic Action Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. ADDRESS COLLECTION */}
                {activeOrder.status === 'created' && (
                  <div className="bg-white border border-rose-100 p-10 rounded-3xl text-center shadow-sm">
                    {activeRole === 'customer' ? (
                      <div className="max-w-md mx-auto text-left space-y-4">
                        <div className="flex justify-center mb-4">
                           <div className="bg-rose-100 p-4 rounded-full text-rose-500">
                             <MapPin size={32} />
                           </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 text-center">Where should we ship your kit?</h3>
                        <p className="text-slate-500 text-center text-sm mb-6">We need your address to send the mold kit so you can get started!</p>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Street Address" className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:border-rose-400 outline-none"
                            onChange={e => setAddressForm({...addressForm, street: e.target.value})}
                          />
                          <input placeholder="City" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:border-rose-400 outline-none"
                            onChange={e => setAddressForm({...addressForm, city: e.target.value})}
                          />
                          <input placeholder="State" className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:border-rose-400 outline-none"
                            onChange={e => setAddressForm({...addressForm, state: e.target.value})}
                          />
                          <input placeholder="Zip Code" className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:border-rose-400 outline-none"
                            onChange={e => setAddressForm({...addressForm, zip: e.target.value})}
                          />
                          <textarea 
                             placeholder="Gate code, delivery instructions, or notes for the artist..." 
                             className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-700 focus:border-rose-400 outline-none text-sm min-h-[80px]"
                             onChange={e => setAddressForm({...addressForm, note: e.target.value})}
                           />
                        </div>
                        <button onClick={submitAddress} className="w-full bg-rose-500 text-white font-bold py-4 rounded-xl hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 mt-4">
                          Confirm Address
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <div className="bg-slate-50 p-6 rounded-full mb-4">
                          <MapPin size={32} className="opacity-30" />
                        </div>
                        <p className="font-medium">Waiting for customer address...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. LOGISTICS DASHBOARD */}
                {(activeOrder.status !== 'created' && activeOrder.status !== 'address_captured') || activeOrder.address ? (
                  <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-sm">
                    <h3 className="text-slate-800 font-bold flex items-center gap-2 mb-6 border-b border-slate-100 pb-4 text-lg">
                      <Truck className="text-purple-400" /> Tracking & Shipping
                    </h3>

                    {activeRole === 'vendor' && activeOrder.status === 'address_captured' && (
                      <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl mb-8">
                        <h4 className="text-purple-600 font-bold text-sm mb-4 flex items-center gap-2"><Sparkles size={14}/> ACTION: SHIP MOLD KIT</h4>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="text-[10px] uppercase text-purple-400 font-bold">Outbound Tracking</label>
                            <input 
                              type="text" 
                              placeholder="e.g. 1Z999..." 
                              className="w-full bg-white border border-purple-200 rounded-lg p-2.5 text-slate-700 text-sm focus:border-purple-400 outline-none"
                              onChange={e => setShippingForm({...shippingForm, outbound: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-purple-400 font-bold">Return Label Tracking</label>
                            <input 
                              type="text" 
                              placeholder="e.g. 1Z888..." 
                              className="w-full bg-white border border-purple-200 rounded-lg p-2.5 text-slate-700 text-sm focus:border-purple-400 outline-none"
                              onChange={e => setShippingForm({...shippingForm, return: e.target.value})}
                            />
                          </div>
                        </div>
                        <button onClick={submitKitShipping} className="bg-purple-500 text-white text-sm font-bold px-6 py-2.5 rounded-lg hover:bg-purple-600 shadow-md shadow-purple-200">
                          Confirm Shipment
                        </button>
                      </div>
                    )}

                    {activeRole === 'vendor' && activeOrder.status === 'production' && (
                       <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl mb-8">
                        <h4 className="text-rose-500 font-bold text-sm mb-4 flex items-center gap-2"><Gem size={14}/> ACTION: SHIP FINAL PIECE</h4>
                        <div className="mb-4">
                          <label className="text-[10px] uppercase text-rose-400 font-bold">Grillz Tracking #</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 1Z777..." 
                            className="w-full bg-white border border-rose-200 rounded-lg p-2.5 text-slate-700 text-sm focus:border-rose-400 outline-none"
                            onChange={e => setFinalShippingForm(e.target.value)}
                          />
                        </div>
                        <button onClick={submitProductShipping} className="bg-rose-500 text-white text-sm font-bold px-6 py-2.5 rounded-lg hover:bg-rose-600 shadow-md shadow-rose-200">
                          Confirm Final Shipment
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeOrder.tracking.kitOutbound && (
                        <TrackingCard 
                          title="Kit Shipment" 
                          trackingNumber={activeOrder.tracking.kitOutbound}
                          status={activeOrder.tracking.kitOutboundStatus}
                          onSimulateUpdate={() => simulateTrackingUpdate('kitOutbound', 'Delivered', 'kit_delivered')}
                        />
                      )}
                      {activeOrder.tracking.kitReturn && (
                        <TrackingCard 
                          title="Mold Return" 
                          trackingNumber={activeOrder.tracking.kitReturn}
                          status={activeOrder.tracking.kitReturnStatus}
                          onSimulateUpdate={() => simulateTrackingUpdate('kitReturn', 'Delivered', 'mold_received')}
                        />
                      )}
                      {activeOrder.tracking.productOutbound && (
                        <TrackingCard 
                          title="Final Grillz" 
                          trackingNumber={activeOrder.tracking.productOutbound}
                          status={activeOrder.tracking.productOutboundStatus}
                          onSimulateUpdate={() => simulateTrackingUpdate('productOutbound', 'Delivered', 'product_delivered')}
                        />
                      )}
                    </div>
                    
                    {activeRole === 'customer' && activeOrder.status === 'photos_approved' && (
                       <div className="mt-6 p-5 bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                         <div className="text-sm text-slate-600">
                           <p className="font-bold text-slate-800 text-base mb-1">Mold Approved! 🎉</p>
                           Please stick the return label on the box and drop it off.
                         </div>
                         <button 
                           onClick={() => simulateTrackingUpdate('kitReturn', 'In Transit', 'mold_in_transit')}
                           className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition-colors shadow-lg"
                         >
                           I've Dropped it Off
                         </button>
                       </div>
                    )}
                  </div>
                ) : null}

                {/* 3. PHOTO MANAGEMENT */}
                {['kit_delivered', 'photos_submitted', 'photos_approved'].includes(activeOrder.status) && (
                   <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-slate-800 font-bold flex items-center gap-2 text-lg">
                          <Camera className="text-rose-400" /> Mold Photos
                        </h3>
                        {activeRole === 'customer' && activeOrder.status !== 'photos_approved' && (
                           <div className="relative">
                            <input 
                              type="file" id="photo-upload" className="hidden" accept="image/*"
                              onChange={handlePhotoUpload} disabled={isUploading}
                            />
                            <label htmlFor="photo-upload" className="cursor-pointer bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                              {isUploading ? 'Uploading...' : <><ImageIcon size={16} /> Add Photo</>}
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                        {activeOrder.photos?.map((photo, idx) => (
                          <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 shadow-inner">
                            <img src={photo.url} alt="Mold" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {(!activeOrder.photos || activeOrder.photos.length === 0) && (
                          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                            <Camera size={32} className="mx-auto text-slate-300 mb-2"/>
                            <p className="text-slate-500 text-sm font-medium">No photos uploaded yet.</p>
                            {activeRole === 'customer' && <p className="text-xs text-rose-400 mt-1">Please upload at least 2 photos of your mold.</p>}
                          </div>
                        )}
                      </div>

                      {activeRole === 'vendor' && activeOrder.status === 'photos_submitted' && (
                        <div className="flex justify-end pt-6 border-t border-slate-100">
                          <button onClick={approvePhotos} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all">
                            <CheckCircle size={18} /> Approve Photos
                          </button>
                        </div>
                      )}
                      {activeOrder.status === 'photos_approved' && (
                        <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100 justify-center">
                          <CheckCircle size={18} /> Photos Accepted!
                        </div>
                      )}
                   </div>
                )}

                {/* 4. FINAL APPROVAL */}
                {['product_delivered', 'fit_approved', 'paid_complete'].includes(activeOrder.status) && (
                  <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-sm">
                     <h3 className="text-slate-800 font-bold flex items-center gap-2 mb-6 border-b border-slate-100 pb-4 text-lg">
                      <ThumbsUp className="text-purple-400" /> Final Approval
                    </h3>
                    
                    {activeOrder.status === 'product_delivered' && activeRole === 'customer' ? (
                       <div className="space-y-6">
                         <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 text-sm text-purple-700">
                           <h4 className="font-bold mb-2 flex items-center gap-2"><Sparkles size={16}/> Does it sparkle?</h4>
                           Please try on your new piece and confirm it fits comfortably and matches your expectations!
                         </div>
                         <button onClick={confirmFit} className="w-full bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition-colors shadow-lg">
                           Yes, I Love It! (Confirm Fit)
                         </button>
                       </div>
                    ) : (
                      <div className="flex items-center justify-between bg-slate-50 p-5 rounded-2xl border border-slate-100">
                        <span className="text-slate-500 text-sm font-medium">Fit Approval Status:</span>
                        <span className="text-emerald-500 font-bold flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"><CheckCircle size={16}/> Confirmed</span>
                      </div>
                    )}

                    {activeOrder.status === 'fit_approved' && (
                      <div className="mt-8 border-t border-slate-100 pt-8">
                        <h4 className="text-slate-800 font-bold mb-4 flex items-center gap-2"><DollarSign className="text-rose-400"/> Balance Due</h4>
                        {activeRole === 'vendor' ? (
                           <div className="flex justify-between items-center bg-rose-50 p-5 rounded-2xl border border-rose-100">
                             <div className="text-sm text-rose-800">Customer approved! Collect remaining balance.</div>
                             <button onClick={markPaid} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-md">
                               Mark Paid
                             </button>
                           </div>
                        ) : (
                          <div className="bg-slate-50 p-8 rounded-2xl text-center border border-slate-100">
                            <p className="text-slate-600 font-medium mb-6">Please pay the remaining balance to complete your order.</p>
                            <button className="bg-slate-800 text-white font-bold px-10 py-4 rounded-xl hover:bg-slate-900 shadow-xl">
                              Pay Balance Now
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {activeOrder.status === 'paid_complete' && (
                       <div className="mt-8 bg-emerald-50 border border-emerald-100 rounded-3xl p-8 flex flex-col items-center justify-center text-emerald-600 text-center">
                         <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
                            <Gem size={32} className="text-emerald-500" />
                         </div>
                         <span className="font-extrabold text-xl tracking-tight">ORDER COMPLETE</span>
                         <span className="text-sm opacity-80 mt-1">Paid in Full & Delivered</span>
                       </div>
                    )}
                  </div>
                )}
                
                {/* Manual Vendor Override */}
                {activeRole === 'vendor' && (
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl mt-4 opacity-50 hover:opacity-100 transition-opacity">
                    <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase">Debug: Manual Status</h4>
                     <select 
                        value={activeOrder.status}
                        onChange={(e) => updateStatus(e.target.value)}
                        className="bg-slate-50 text-slate-600 text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none w-full"
                      >
                        {STATUS_FLOW.map(step => (
                          <option key={step.id} value={step.id}>{step.label}</option>
                        ))}
                      </select>
                  </div>
                )}
              </div>

              {/* Right Column: Correspondence Log */}
              <div className="lg:col-span-1 space-y-6">
                <div className="flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm sticky top-24">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <StickyNote size={18} className="text-rose-400"/> Order Notes
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">Updates & correspondence history</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 max-h-[500px] overflow-y-auto p-4 bg-slate-50/30">
                    {(!activeOrder.messages || activeOrder.messages.length === 0) && (
                      <div className="py-8 text-center text-slate-400">
                        <Mail size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-xs">No notes on file yet.</p>
                      </div>
                    )}
                    {activeOrder.messages?.map((msg, idx) => (
                      <NoteEntry key={idx} message={msg} />
                    ))}
                  </div>

                  <div className="p-4 bg-white border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                      {activeRole === 'vendor' ? 'Reply to Customer' : 'Leave a Note'}
                    </label>
                    <textarea 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={activeRole === 'vendor' ? "Update the customer..." : "Questions? Leave a note here..."}
                      className="w-full bg-slate-50 text-slate-700 text-sm rounded-xl p-3 focus:ring-2 focus:ring-rose-100 outline-none border border-slate-200 placeholder-slate-400 min-h-[100px] mb-3 resize-none"
                    />
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] text-slate-400 italic">
                         {activeRole === 'customer' && "Responses typically in 24-48h"}
                       </span>
                       <button onClick={sendNote} className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-all shadow-md">
                        Send Note
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Render App ---
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
