import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
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
  where,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import {
  Gem, Sparkles, Package, Truck, Box, Camera, CheckCircle, Heart, DollarSign,
  Clipboard, Copy
} from 'lucide-react';

/* ---------------- Firebase Config ---------------- */

const getFirebaseConfig = () => {
  // Prefer build-time env vars for production (Cloudflare Pages)
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  // (Optional) Firebase Hosting preview environments inject __firebase_config
  if (!cfg.apiKey && typeof __firebase_config !== 'undefined') {
    try { return JSON.parse(__firebase_config); } catch { /* ignore */ }
  }

  return cfg.apiKey ? cfg : null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig && firebaseConfig.apiKey ? initializeApp(firebaseConfig) : undefined;
const auth = app ? getAuth(app) : undefined;
const db = app ? getFirestore(app) : undefined;
const storage = app ? getStorage(app) : undefined;

/* ---------------- Workflow + helpers ---------------- */

const STATUS_FLOW = [
  { id: 'created', label: 'Created', icon: Sparkles, description: 'Order created' },
  { id: 'address_captured', label: 'Address', icon: Clipboard, description: 'Shipping address confirmed' },
  { id: 'kit_shipped', label: 'Kit Shipped', icon: Package, description: 'Kit is on the way' },
  { id: 'kit_delivered', label: 'Kit Delivered', icon: Box, description: 'Customer has kit' },
  { id: 'photos_submitted', label: 'Reviewing', icon: Camera, description: 'Checking mold photos' },
  { id: 'photos_approved', label: 'Approved', icon: CheckCircle, description: 'Send mold back' },
  { id: 'mold_in_transit', label: 'Mold Return', icon: Truck, description: 'Mold on the way back' },
  { id: 'mold_received', label: 'Mold Received', icon: Box, description: 'We have your mold' },
  { id: 'production', label: 'Making Magic', icon: Gem, description: 'Creating your piece' },
  { id: 'product_shipped', label: 'Shipped', icon: Package, description: 'It\'s on the way!' },
  { id: 'product_delivered', label: 'Delivered', icon: Heart, description: 'You got it!' },
  { id: 'paid_complete', label: 'All Done', icon: DollarSign, description: 'Order Complete' },
];

const generateClaimCode = (len = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

const compressImageToBlob = (file, maxDim = 1600, quality = 0.82) => {
  // Resize + JPEG compress client-side to keep uploads cheap/fast.
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;

    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => blob ? resolve({ blob, width: w, height: h }) : reject(new Error('Image compression failed')),
        'image/jpeg',
        quality
      );
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const ProgressBar = ({ currentStatus }) => {
  const currentIndex = STATUS_FLOW.findIndex(s => s.id === currentStatus);
  const percentage = Math.max(5, ((currentIndex + 1) / STATUS_FLOW.length) * 100);
  return (
    <div className="w-full bg-rose-100 h-2 rounded-full overflow-hidden mt-2">
      <div className="bg-gradient-to-r from-rose-400 to-purple-500 h-full transition-all duration-500 ease-out"
           style={{ width: `${percentage}%` }} />
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeRole, setActiveRole] = useState('customer');
  const [isAdmin, setIsAdmin] = useState(false);

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [view, setView] = useState('dashboard');

  const [clientForm, setClientForm] = useState({ name: '', email: '' });
  const [claimForm, setClaimForm] = useState({ orderId: '', code: '' });
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // If config missing, show a friendly setup screen
  if (!app || !auth || !db) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8">
          <h1 className="text-2xl font-semibold text-slate-800">Deployment Configuration Needed</h1>
          <p className="text-slate-600 mt-2">
            Set Cloudflare Pages build environment variables:
            <code className="ml-2 text-sm">VITE_FIREBASE_API_KEY</code>, <code className="text-sm">VITE_FIREBASE_AUTH_DOMAIN</code>, etc.
          </p>
        </div>
      </div>
    );
  }

  // Auth bootstrap (anonymous by default)
  useEffect(() => {
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

  // Admin allowlist: /admins/{uid}
  useEffect(() => {
    if (!user || !db) return;
    const unsub = onSnapshot(doc(db, 'admins', user.uid), (snap) => {
      setIsAdmin(snap.exists());
    });
    return () => unsub();
  }, [user?.uid]);

  // Orders listener:
  // - admins: see all
  // - customers: only orders they own
  useEffect(() => {
    if (!user || !db) return;

    const q = isAdmin
      ? query(collection(db, 'orders'), limit(200))
      : query(collection(db, 'orders'), where('ownerUid', '==', user.uid), limit(200));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const toMillis = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'string' ? Date.parse(v) : 0);
      fetched.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setOrders(fetched);

      if (activeOrder) {
        const updated = fetched.find(o => o.id === activeOrder.id);
        if (updated) setActiveOrder(updated);
      }
    });

    return () => unsubscribe();
  }, [user, isAdmin, activeOrder?.id]);

  const adminLogin = async () => {
    if (!auth || !adminEmail || !adminPassword) return;
    setAuthError('');
    try {
      if (auth.currentUser?.isAnonymous) {
        await signOut(auth);
      }
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      setAdminPassword('');
    } catch (e) {
      console.error(e);
      setAuthError(e?.message || 'Login failed');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setView('dashboard');
  };

  // Vendor creates an order, customer claims it via Order ID + Claim Code
  const createClientRecord = async () => {
    if (!clientForm.name || !db || !isAdmin) return;
    try {
      const newOrder = {
        ownerUid: null,
        claimCode: generateClaimCode(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        customerName: clientForm.name,
        customerEmail: clientForm.email || null,
        status: 'created',
        photos: [],
        messages: [],
        tracking: { kitOutbound: null, kitReturn: null, productOutbound: null },
        address: null,
        paid: false
      };

      const docRef = await addDoc(collection(db, 'orders'), newOrder);
      setClientForm({ name: '', email: '' });
      setActiveOrder({ id: docRef.id, ...newOrder });
      setView('order_detail');
    } catch (e) {
      console.error(e);
    }
  };

  const claimOrder = async () => {
    if (!db || !user) return;
    const orderId = claimForm.orderId.trim();
    const code = claimForm.code.trim().toUpperCase();
    if (!orderId || !code) return;

    try {
      // Claim without reading first. Rules validate claimCode + ownerUid.
      await updateDoc(doc(db, 'orders', orderId), {
        ownerUid: user.uid,
        claimCode: code,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClaimForm({ orderId: '', code: '' });
    } catch (e) {
      console.error(e);
      setAuthError(e?.message || 'Unable to claim order');
    }
  };

  const sendNote = async () => {
    if (!newMessage.trim() || !db || !activeOrder) return;
    const msg = {
      text: newMessage,
      sender: activeRole === 'vendor' ? 'vendor' : 'customer',
      timestamp: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        messages: arrayUnion(msg),
        updatedAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (e) {
      console.error(e);
    }
  };

  const handlePhotoUpload = async (e) => {
    if (!db || !storage || !activeOrder || !user) return;
    try {
      setIsUploading(true);

      const file = e.target.files?.[0];
      if (!file) return;

      const { blob } = await compressImageToBlob(file);
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
      const path = `orders/${user.uid}/${activeOrder.id}/${Date.now()}_${safeName}.jpg`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(storageRef);

      const photoData = {
        url,
        storagePath: path,
        uploadedBy: activeRole,
        timestamp: new Date().toISOString(),
        approved: false
      };

      await updateDoc(doc(db, 'orders', activeOrder.id), {
        photos: arrayUnion(photoData),
        updatedAt: serverTimestamp()
      });
    } catch (e2) {
      console.error(e2);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-white to-purple-50">
      <nav className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-400 to-purple-500 flex items-center justify-center text-white shadow-sm">
              <Gem className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 leading-tight">Gemmy Charmed Life</div>
              <div className="text-xs text-slate-500">Order tracking + workflow</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex bg-slate-100 rounded-full p-1">
              <button
                onClick={() => { setActiveRole('customer'); setView('dashboard'); setAuthError(''); }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  activeRole === 'customer' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                type="button"
              >
                Customer
              </button>
              <button
                onClick={() => { setActiveRole('vendor'); setView('dashboard'); setAuthError(''); }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  activeRole === 'vendor' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                type="button"
              >
                Vendor
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <div className="space-y-8">

            {/* Customer: Claim an order */}
            {activeRole === 'customer' && (
              <div className="bg-white border border-rose-100 p-8 rounded-3xl shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Access your order</h2>
                <p className="text-slate-600 mt-1">
                  Enter the <span className="font-medium">Order ID</span> and <span className="font-medium">Claim Code</span> your vendor sent you.
                </p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Order ID</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      value={claimForm.orderId}
                      onChange={(e) => setClaimForm({ ...claimForm, orderId: e.target.value })}
                      placeholder="e.g. AbC123..."
                      type="text"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Claim Code</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      value={claimForm.code}
                      onChange={(e) => setClaimForm({ ...claimForm, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. 8K4Z2PQM"
                      type="text"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={claimOrder}
                      className="w-full rounded-xl bg-rose-600 text-white px-4 py-2 hover:bg-rose-700 disabled:opacity-50"
                      type="button"
                      disabled={!claimForm.orderId || !claimForm.code}
                    >
                      Claim &amp; view order
                    </button>
                  </div>
                </div>

                {authError && <p className="mt-3 text-sm text-rose-600">{authError}</p>}
              </div>
            )}

            {/* Vendor login gate */}
            {activeRole === 'vendor' && !isAdmin && (
              <div className="bg-white border border-purple-100 p-8 rounded-3xl shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Vendor sign-in required</h2>
                <p className="text-slate-600 mt-1">
                  Vendor access (dashboard, status updates, notes) requires a vendor account.
                </p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Password</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={adminLogin}
                      className="w-full rounded-xl bg-purple-600 text-white px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
                      type="button"
                      disabled={!adminEmail || !adminPassword}
                    >
                      Sign in
                    </button>
                  </div>
                </div>

                {authError && <p className="mt-3 text-sm text-rose-600">{authError}</p>}
              </div>
            )}

            {/* Vendor: Create New Client */}
            {activeRole === 'vendor' && isAdmin && (
              <div className="bg-white border border-rose-100 p-8 rounded-3xl shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Create new order</h2>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="Customer name"
                    value={clientForm.name}
                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="Customer email (optional)"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  />
                  <button
                    className="rounded-xl bg-rose-600 text-white px-4 py-2 hover:bg-rose-700 disabled:opacity-50"
                    onClick={createClientRecord}
                    disabled={!clientForm.name}
                    type="button"
                  >
                    Create order
                  </button>
                </div>
              </div>
            )}

            {/* Orders list */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Orders</h3>
                <div className="text-xs text-slate-500">{isAdmin ? 'Admin view' : 'Your orders'}</div>
              </div>

              <div className="mt-4 divide-y">
                {orders.length === 0 && (
                  <div className="py-6 text-slate-500">No orders yet.</div>
                )}
                {orders.map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left py-4 hover:bg-slate-50 px-2 rounded-xl"
                    onClick={() => { setActiveOrder(o); setView('order_detail'); }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-800">{o.customerName || 'Unnamed'}</div>
                        <div className="text-xs text-slate-500">Order ID: {o.id}</div>
                      </div>
                      <div className="text-xs text-slate-600">{o.status || '—'}</div>
                    </div>
                    <ProgressBar currentStatus={o.status || 'created'} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'order_detail' && activeOrder && (
          <div className="space-y-6">
            <button
              className="text-sm text-slate-600 hover:text-slate-800"
              onClick={() => setView('dashboard')}
              type="button"
            >
              ← Back
            </button>

            <div className="bg-white border border-slate-100 rounded-3xl p-8">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-800">{activeOrder.customerName}</h2>
                  <div className="text-sm text-slate-500 mt-1">Order ID: {activeOrder.id}</div>
                </div>

                {isAdmin && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Share</div>
                    <div className="mt-2 space-y-2">
                      <div className="text-xs text-slate-500">Order ID</div>
                      <code className="bg-white px-3 py-1.5 rounded-xl text-sm font-mono inline-block">{activeOrder.id}</code>
                      <div className="text-xs text-slate-500 mt-2">Claim Code</div>
                      <code className="bg-white px-3 py-1.5 rounded-xl text-sm font-mono inline-block">{activeOrder.claimCode || '—'}</code>
                      <div className="text-xs text-slate-500 mt-2">Customer uses both to claim the order.</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium text-slate-700">Status: <span className="text-slate-900">{activeOrder.status}</span></div>
                <ProgressBar currentStatus={activeOrder.status || 'created'} />
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-800">Messages</div>
                  </div>
                  <div className="mt-4 space-y-3 max-h-64 overflow-auto pr-2">
                    {(activeOrder.messages || []).map((m, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-xs text-slate-400">
                          {m.sender} · {m.timestamp}
                        </div>
                        <div className="text-slate-800">{m.text}</div>
                      </div>
                    ))}
                    {(activeOrder.messages || []).length === 0 && (
                      <div className="text-sm text-slate-500">No messages yet.</div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message…"
                    />
                    <button
                      className="rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800"
                      onClick={sendNote}
                      type="button"
                    >
                      Send
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                  <div className="font-semibold text-slate-800">Photos</div>
                  <div className="mt-4 flex items-center gap-3">
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={isUploading} />
                    {isUploading && <div className="text-sm text-slate-500">Uploading…</div>}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {(activeOrder.photos || []).map((p, idx) => (
                      <a key={idx} href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt="Upload" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                      </a>
                    ))}
                    {(activeOrder.photos || []).length === 0 && (
                      <div className="text-sm text-slate-500 col-span-2">No photos yet.</div>
                    )}
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
