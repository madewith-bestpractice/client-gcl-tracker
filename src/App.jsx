import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import {
  Gem, Sparkles, Package, Truck, Box, Camera, CheckCircle, Heart, DollarSign,
  Clipboard, ShieldCheck, ShieldX, RefreshCw, LogOut
} from 'lucide-react';

/* ---------------- Firebase bootstrap ---------------- */

const getFirebaseConfig = () => {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  return cfg.apiKey ? cfg : null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : undefined;
const auth = app ? getAuth(app) : undefined;
const db = app ? getFirestore(app) : undefined;
const storage = app ? getStorage(app) : undefined;

/* ---------------- Workflow ---------------- */

const STATUS_FLOW = [
  { id: 'created', label: 'Created', icon: Sparkles, description: 'Order created' },
  { id: 'address_captured', label: 'Address', icon: Clipboard, description: 'Shipping address confirmed' },
  { id: 'kit_shipped', label: 'Kit shipped', icon: Package, description: 'Kit is on the way' },
  { id: 'kit_delivered', label: 'Kit delivered', icon: Box, description: 'Customer has kit' },
  { id: 'photos_submitted', label: 'Photos submitted', icon: Camera, description: 'Photos received for review' },
  { id: 'photos_reviewed', label: 'Photos reviewed', icon: CheckCircle, description: 'Approved or needs changes' },
  { id: 'mold_in_transit', label: 'Mold return', icon: Truck, description: 'Mold heading back' },
  { id: 'mold_received', label: 'Mold received', icon: Box, description: 'Mold arrived' },
  { id: 'production', label: 'Making magic', icon: Gem, description: 'Creating your piece' },
  { id: 'product_shipped', label: 'Shipped', icon: Package, description: 'Final product on the way' },
  { id: 'product_delivered', label: 'Delivered', icon: Heart, description: 'Delivered to you' },
  { id: 'paid_complete', label: 'Complete', icon: DollarSign, description: 'All set' },
];

const statusIndex = (s) => Math.max(0, STATUS_FLOW.findIndex(x => x.id === s));

/* ---------------- Utilities ---------------- */

const qs = () => new URLSearchParams(window.location.search);
const getTokenFromURL = () => qs().get('t')?.trim() || '';

const genToken = (bytes = 24) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const nowISO = () => new Date().toISOString();

const compressImageToBlob = (file, maxDim = 1600, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  reader.onerror = reject;
  img.onload = () => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => blob ? resolve({ blob, width: w, height: h }) : reject(new Error('Compression failed')),
      'image/jpeg', quality);
  };
  img.onerror = reject;
  reader.readAsDataURL(file);
});

/* ---------------- UI bits ---------------- */

const Card = ({ children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">{children}</div>
);

const Input = (props) => (
  <input
    {...props}
    className={[
      "w-full rounded-xl border border-slate-200 px-3 py-2",
      "focus:outline-none focus:ring-2 focus:ring-rose-200",
      props.className || ""
    ].join(" ")}
  />
);

const Textarea = (props) => (
  <textarea
    {...props}
    className={[
      "w-full rounded-xl border border-slate-200 px-3 py-2",
      "focus:outline-none focus:ring-2 focus:ring-rose-200",
      props.className || ""
    ].join(" ")}
  />
);

const Button = ({ variant = 'primary', className = '', ...props }) => {
  const base = "rounded-xl px-4 py-2 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = variant === 'primary'
    ? "bg-rose-600 text-white hover:bg-rose-700"
    : variant === 'dark'
    ? "bg-slate-900 text-white hover:bg-slate-800"
    : variant === 'ghost'
    ? "bg-transparent text-slate-700 hover:bg-slate-100"
    : "bg-slate-100 text-slate-800 hover:bg-slate-200";
  return <button {...props} className={`${base} ${styles} ${className}`} />;
};

const ProgressBar = ({ currentStatus }) => {
  const i = statusIndex(currentStatus);
  const pct = Math.max(5, ((i + 1) / STATUS_FLOW.length) * 100);
  return (
    <div className="w-full bg-rose-100 h-2 rounded-full overflow-hidden mt-2">
      <div className="bg-gradient-to-r from-rose-400 to-purple-500 h-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }} />
    </div>
  );
};

const Timeline = ({ status }) => {
  const cur = statusIndex(status);
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {STATUS_FLOW.map((s, idx) => {
        const Icon = s.icon;
        const done = idx <= cur;
        return (
          <div key={s.id} className={`rounded-2xl border p-4 ${done ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${done ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">{s.label}</div>
                <div className="text-sm text-slate-600">{s.description}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- App ---------------- */

export default function App() {
  // Config missing
  if (!app || !auth || !db || !storage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8">
          <h1 className="text-2xl font-semibold text-slate-800">Deployment Configuration Needed</h1>
          <p className="text-slate-600 mt-2">
            Set Cloudflare Pages env vars: <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, etc.
          </p>
        </div>
      </div>
    );
  }

  // token drives routing
  const [token, setToken] = useState(getTokenFromURL());
  const mode = token ? 'tracking' : 'vendor_portal'; // auto-routing

  // auth + role
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // vendor login
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // data
  const [trackDoc, setTrackDoc] = useState(null); // {orderId, ...public view}
  const [orderDoc, setOrderDoc] = useState(null); // admin-only
  const [loading, setLoading] = useState(true);

  // vendor: create
  const [clientForm, setClientForm] = useState({ name: '', email: '' });

  // shared actions
  const [messageText, setMessageText] = useState('');
  const [photoNoteDraft, setPhotoNoteDraft] = useState({});
  const [uploading, setUploading] = useState(false);

  // drafts
  const [addressDraft, setAddressDraft] = useState({
    line1: '', line2: '', city: '', state: '', zip: '', country: 'US'
  });
  const [trackingDraft, setTrackingDraft] = useState({
    kitOutbound: '', kitReturn: '', productOutbound: ''
  });
  const [paidDraft, setPaidDraft] = useState(false);

  /* ---------- Polling limits (per visit) ---------- */
  const LIMITS = useMemo(() => ({
    customer: { maxChecks: 240, intervalMs: 15000 }, // ~1 hour @ 15s
    vendor: { maxChecks: 720, intervalMs: 5000 },   // ~1 hour @ 5s
  }), []);

  // Who is this viewer (for refresh budget)?
  const viewerType = (mode === 'vendor_portal' || isAdmin) ? 'vendor' : 'customer';
  const checksKey = viewerType === 'vendor' ? 'checks_vendor' : 'checks_customer';

  const [checksUsed, setChecksUsed] = useState(() => Number(sessionStorage.getItem(checksKey) || 0));
  const [checksLimitHit, setChecksLimitHit] = useState(false);

  useEffect(() => {
    // If viewerType changes (e.g., vendor signs in), re-load counter bucket for this visit
    const used = Number(sessionStorage.getItem(checksKey) || 0);
    setChecksUsed(used);
    const lim = viewerType === 'vendor' ? LIMITS.vendor.maxChecks : LIMITS.customer.maxChecks;
    setChecksLimitHit(used >= lim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checksKey]);

  const bumpCheck = () => {
    const next = (Number(sessionStorage.getItem(checksKey) || 0) + 1);
    sessionStorage.setItem(checksKey, String(next));
    setChecksUsed(next);
    const lim = viewerType === 'vendor' ? LIMITS.vendor.maxChecks : LIMITS.customer.maxChecks;
    if (next >= lim) setChecksLimitHit(true);
    return next;
  };

  /* ---------- URL token watcher ---------- */
  useEffect(() => {
    const onPop = () => setToken(getTokenFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setURLToken = (t) => {
    const u = new URL(window.location.href);
    if (t) u.searchParams.set('t', t);
    else u.searchParams.delete('t');
    window.history.pushState({}, '', u.toString());
    setToken(t);
    setAuthError('');
  };

  /* ---------- Auth bootstrap ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setUser(u);
          // check admin allowlist
          const adminSnap = await getDoc(doc(db, 'admins', u.uid));
          setIsAdmin(adminSnap.exists());
          setLoading(false);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error(e);
        setIsAdmin(false);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  /* ---------- Data fetchers ---------- */
  const fetchByToken = async (t) => {
    if (!t) return { track: null, order: null };
    bumpCheck();

    const trackRef = doc(db, 'publicTracking', t);
    const trackSnap = await getDoc(trackRef);
    if (!trackSnap.exists()) return { track: null, order: null };

    const track = { id: trackSnap.id, ...trackSnap.data() };

    let order = null;
    if (isAdmin && track.orderId) {
      const orderSnap = await getDoc(doc(db, 'orders', track.orderId));
      if (orderSnap.exists()) order = { id: orderSnap.id, ...orderSnap.data() };
    }

    return { track, order };
  };

  /* ---------- Polling loop (only in tracking mode) ---------- */
  const pollRef = useRef(null);
  useEffect(() => {
    if (mode !== 'tracking') return; // no polling on vendor portal screen
    if (checksLimitHit) return;

    const { intervalMs } = viewerType === 'vendor' ? LIMITS.vendor : LIMITS.customer;

    const tick = async () => {
      try {
        if (!token) return;
        const { track, order } = await fetchByToken(token);
        setTrackDoc(track);
        setOrderDoc(order);
      } catch (e) {
        console.error(e);
      }
    };

    tick();

    pollRef.current = setInterval(() => {
      if (checksLimitHit) return;
      const lim = viewerType === 'vendor' ? LIMITS.vendor.maxChecks : LIMITS.customer.maxChecks;
      const used = Number(sessionStorage.getItem(checksKey) || 0);
      if (used >= lim) {
        setChecksLimitHit(true);
        return;
      }
      tick();
    }, intervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token, viewerType, isAdmin, checksLimitHit]);

  /* ---------- Manual refresh button ---------- */
  const manualRefresh = async () => {
    if (mode !== 'tracking') return;
    if (checksLimitHit) return;
    if (!token) return;

    const lim = viewerType === 'vendor' ? LIMITS.vendor.maxChecks : LIMITS.customer.maxChecks;
    const used = Number(sessionStorage.getItem(checksKey) || 0);
    if (used >= lim) { setChecksLimitHit(true); return; }

    const { track, order } = await fetchByToken(token);
    setTrackDoc(track);
    setOrderDoc(order);
  };

  /* ---------- Vendor auth actions ---------- */
  const adminLogin = async () => {
    setAuthError('');
    try {
      if (auth.currentUser?.isAnonymous) await signOut(auth);
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      setAdminPassword('');
    } catch (e) {
      setAuthError(e?.message || 'Login failed');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setTrackDoc(null);
    setOrderDoc(null);
    // Do NOT clear token automatically; logging out while viewing a token link should still show customer view.
  };

  /* ---------- Vendor: Create order + token + public tracking doc ---------- */
  const createOrder = async () => {
    if (!isAdmin) return;
    if (!clientForm.name.trim()) return;

    const t = genToken(24);
    const orderData = {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      customerName: clientForm.name.trim(),
      customerEmail: clientForm.email.trim() || null,
      status: 'created',

      address: null,
      tracking: { kitOutbound: null, kitReturn: null, productOutbound: null },
      paid: false,

      photos: [],
      messages: [],

      trackToken: t,
      archived: false
    };

    const orderRef = await addDoc(collection(db, 'orders'), orderData);

    const publicRef = doc(db, 'publicTracking', t);
    await setDoc(publicRef, {
      orderId: orderRef.id,
      customerName: orderData.customerName,
      status: orderData.status,
      updatedAt: serverTimestamp(),
      address: null,
      tracking: orderData.tracking,
      paid: orderData.paid,
      photos: [],
      messages: [],
    });

    setClientForm({ name: '', email: '' });
    setURLToken(t); // sends vendor directly to the order page they just created
  };

  /* ---------- Shared update helpers ---------- */
  const requireAdmin = () => {
    if (!isAdmin) throw new Error('Admin only');
    if (!trackDoc?.orderId) throw new Error('No order bound');
  };

  const updateStatus = async (nextStatus) => {
    requireAdmin();
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'publicTracking', token), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const saveAddress = async () => {
    if (!trackDoc?.orderId) return;
    const address = { ...addressDraft };

    // Customer (token holder) can save address; vendor sees it too.
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      address,
      status: 'address_captured',
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'publicTracking', token), {
      address,
      status: 'address_captured',
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const saveTracking = async () => {
    requireAdmin();
    const tracking = {
      kitOutbound: trackingDraft.kitOutbound || null,
      kitReturn: trackingDraft.kitReturn || null,
      productOutbound: trackingDraft.productOutbound || null
    };
    await updateDoc(doc(db, 'orders', trackDoc.orderId), { tracking, updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'publicTracking', token), { tracking, updatedAt: serverTimestamp() });
    await manualRefresh();
  };

  const setPaid = async (paid) => {
    requireAdmin();
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      paid,
      status: paid ? 'paid_complete' : (orderDoc?.status || trackDoc.status),
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'publicTracking', token), {
      paid,
      status: paid ? 'paid_complete' : trackDoc.status,
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const sendMessage = async () => {
    if (!trackDoc?.orderId) return;
    if (!messageText.trim()) return;

    const sender = isAdmin ? 'vendor' : 'customer';
    const msg = { sender, text: messageText.trim(), at: nowISO() };

    const newMessages = [ ...(orderDoc?.messages || trackDoc?.messages || []), msg ];
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      messages: newMessages,
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'publicTracking', token), {
      messages: newMessages,
      updatedAt: serverTimestamp()
    });

    setMessageText('');
    await manualRefresh();
  };

  const uploadPhoto = async (file) => {
    if (!trackDoc?.orderId) return;
    if (!file) return;

    setUploading(true);
    try {
      const { blob } = await compressImageToBlob(file);
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
      const path = `orders/${trackDoc.orderId}/${Date.now()}_${safeName}.jpg`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(storageRef);

      const photo = {
        url,
        storagePath: path,
        uploadedAt: nowISO(),
        uploadedBy: isAdmin ? 'vendor' : 'customer',
        review: { status: 'pending', note: '', reviewedAt: null }
      };

      const updatedPhotos = [ ...(orderDoc?.photos || trackDoc?.photos || []), photo ];
      const cur = orderDoc?.status || trackDoc.status;
      const nextStatus = statusIndex(cur) >= statusIndex('photos_submitted') ? cur : 'photos_submitted';

      await updateDoc(doc(db, 'orders', trackDoc.orderId), {
        photos: updatedPhotos,
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'publicTracking', token), {
        photos: updatedPhotos,
        status: nextStatus,
        updatedAt: serverTimestamp()
      });

      await manualRefresh();
    } finally {
      setUploading(false);
    }
  };

  const reviewPhoto = async (idx, status, note) => {
    requireAdmin();
    const photos = [ ...(orderDoc?.photos || []) ];
    if (!photos[idx]) return;

    photos[idx] = {
      ...photos[idx],
      review: { status, note: note || '', reviewedAt: nowISO() }
    };

    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      photos,
      status: 'photos_reviewed',
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'publicTracking', token), {
      photos,
      status: 'photos_reviewed',
      updatedAt: serverTimestamp()
    });

    await manualRefresh();
  };

  /* ---------- Keep drafts in sync when doc loads ---------- */
  useEffect(() => {
    const src = orderDoc || trackDoc;
    if (!src) return;

    if (src.address) setAddressDraft({
      line1: src.address.line1 || '',
      line2: src.address.line2 || '',
      city: src.address.city || '',
      state: src.address.state || '',
      zip: src.address.zip || '',
      country: src.address.country || 'US'
    });

    if (src.tracking) setTrackingDraft({
      kitOutbound: src.tracking.kitOutbound || '',
      kitReturn: src.tracking.kitReturn || '',
      productOutbound: src.tracking.productOutbound || ''
    });

    setPaidDraft(!!src.paid);
  }, [orderDoc?.id, trackDoc?.id]);

  const shareURL = token ? `${window.location.origin}${window.location.pathname}?t=${token}` : '';
  const src = orderDoc || trackDoc;

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
              <div className="text-xs text-slate-500">
                {mode === 'vendor_portal' ? 'Vendor portal' : 'Order tracking'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={manualRefresh}
              disabled={mode !== 'tracking' || !token || checksLimitHit}
              title="Refresh now"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />Refresh
              </span>
            </Button>

            {user && !user.isAnonymous && (
              <Button variant="ghost" onClick={logout} title="Sign out">
                <span className="inline-flex items-center gap-2">
                  <LogOut className="w-4 h-4" />Sign out
                </span>
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {checksLimitHit && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="font-semibold">Refresh limit reached for this visit.</div>
            <div className="text-sm mt-1">
              To keep costs predictable, we pause updates after {viewerType === 'vendor' ? LIMITS.vendor.maxChecks : LIMITS.customer.maxChecks} checks.
              Refresh the page later to continue.
            </div>
            <div className="text-xs mt-2 text-amber-800">
              Used: {checksUsed} · Interval: {viewerType === 'vendor' ? LIMITS.vendor.intervalMs/1000 : LIMITS.customer.intervalMs/1000}s
            </div>
          </div>
        )}

        {/* ---------------- Vendor Portal (no token) ---------------- */}
        {mode === 'vendor_portal' && (
          <>
            {!isAdmin && (
              <Card>
                <h2 className="text-xl font-semibold text-slate-800">Vendor sign-in</h2>
                <p className="text-slate-600 mt-1">Sign in to create orders and generate customer tracking links.</p>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} type="email" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Password</label>
                    <Input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} type="password" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={adminLogin} disabled={!adminEmail || !adminPassword}>Sign in</Button>
                  </div>
                </div>
                {authError && <div className="mt-3 text-sm text-rose-600">{authError}</div>}
              </Card>
            )}

            {isAdmin && (
              <Card>
                <h2 className="text-xl font-semibold text-slate-800">Create a new order</h2>
                <p className="text-slate-600 mt-1">This will generate a secure customer tracking link.</p>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    placeholder="Customer name"
                    value={clientForm.name}
                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  />
                  <Input
                    placeholder="Customer email (optional)"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  />
                  <Button onClick={createOrder} disabled={!clientForm.name.trim()}>Create & open</Button>
                </div>

                <div className="mt-6 text-sm text-slate-600">
                  Already have a token link? Paste it here to open:
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Tracking token" />
                    <Button variant="secondary" onClick={() => setURLToken(token)} disabled={!token}>Open token</Button>
                    <div className="text-xs text-slate-500 flex items-center">
                      (This takes you to the order tracking page.)
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ---------------- Tracking Page (token present) ---------------- */}
        {mode === 'tracking' && (
          <>
            {loading ? (
              <Card>
                <div className="text-slate-600">Loading order…</div>
              </Card>
            ) : (
              <>
                {!trackDoc && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <ShieldX className="w-5 h-5 text-rose-600" />
                      <div>
                        <div className="font-semibold text-slate-800">No order found for this link.</div>
                        <div className="text-sm text-slate-600">Double-check the link token and try again.</div>
                      </div>
                    </div>
                  </Card>
                )}

                {trackDoc && (
                  <>
                    <Card>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Order</div>
                          <h1 className="text-2xl font-semibold text-slate-800 mt-1">{trackDoc.customerName || 'Your order'}</h1>
                          <div className="text-sm text-slate-500 mt-1">
                            Status: <span className="font-semibold text-slate-800">{trackDoc.status}</span>
                          </div>
                          <ProgressBar currentStatus={trackDoc.status} />
                        </div>

                        {isAdmin && shareURL && (
                          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 max-w-lg">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Share link</div>
                              <span className="inline-flex items-center gap-2 text-xs text-emerald-700">
                                <ShieldCheck className="w-4 h-4" /> token-based
                              </span>
                            </div>
                            <div className="text-sm mt-2 break-all">{shareURL}</div>
                          </div>
                        )}
                      </div>

                      <Timeline status={trackDoc.status} />
                    </Card>

                    {/* Address (customer or vendor) */}
                    <Card>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-800">Shipping address</h2>
                          <p className="text-slate-600 mt-1">Fill this out so we can ship your kit + final piece.</p>
                        </div>
                        <Button onClick={saveAddress}>Save address</Button>
                      </div>

                      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Address line 1" value={addressDraft.line1} onChange={(e) => setAddressDraft({ ...addressDraft, line1: e.target.value })} />
                        <Input placeholder="Address line 2" value={addressDraft.line2} onChange={(e) => setAddressDraft({ ...addressDraft, line2: e.target.value })} />
                        <Input placeholder="City" value={addressDraft.city} onChange={(e) => setAddressDraft({ ...addressDraft, city: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="State" value={addressDraft.state} onChange={(e) => setAddressDraft({ ...addressDraft, state: e.target.value })} />
                          <Input placeholder="ZIP" value={addressDraft.zip} onChange={(e) => setAddressDraft({ ...addressDraft, zip: e.target.value })} />
                        </div>
                      </div>
                    </Card>

                    {/* Operations (vendor-only) */}
                    {isAdmin && (
                      <Card>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-800">Operations</h2>
                            <p className="text-slate-600 mt-1">Tracking numbers + phase transitions.</p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="secondary" onClick={() => updateStatus('kit_shipped')}>Set: kit shipped</Button>
                            <Button variant="secondary" onClick={() => updateStatus('kit_delivered')}>Set: kit delivered</Button>
                            <Button variant="secondary" onClick={() => updateStatus('mold_in_transit')}>Set: mold in transit</Button>
                            <Button variant="secondary" onClick={() => updateStatus('mold_received')}>Set: mold received</Button>
                            <Button variant="secondary" onClick={() => updateStatus('production')}>Set: production</Button>
                            <Button variant="secondary" onClick={() => updateStatus('product_shipped')}>Set: product shipped</Button>
                            <Button variant="secondary" onClick={() => updateStatus('product_delivered')}>Set: delivered</Button>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700">Kit outbound tracking #</label>
                            <Input value={trackingDraft.kitOutbound} onChange={(e) => setTrackingDraft({ ...trackingDraft, kitOutbound: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Mold return tracking #</label>
                            <Input value={trackingDraft.kitReturn} onChange={(e) => setTrackingDraft({ ...trackingDraft, kitReturn: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Product outbound tracking #</label>
                            <Input value={trackingDraft.productOutbound} onChange={(e) => setTrackingDraft({ ...trackingDraft, productOutbound: e.target.value })} />
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                          <Button onClick={saveTracking}>Save tracking</Button>
                          <div className="flex items-center gap-3">
                            <label className="text-sm text-slate-700 font-medium">Paid/complete</label>
                            <input type="checkbox" checked={paidDraft} onChange={(e) => setPaidDraft(e.target.checked)} />
                            <Button variant="dark" onClick={() => setPaid(paidDraft)}>Save paid</Button>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Messages */}
                    <Card>
                      <h2 className="text-xl font-semibold text-slate-800">Messages</h2>
                      <div className="mt-4 space-y-3 max-h-72 overflow-auto pr-2">
                        {(trackDoc.messages || []).length === 0 && <div className="text-slate-500">No messages yet.</div>}
                        {(trackDoc.messages || []).map((m, i) => (
                          <div key={i} className="rounded-2xl border border-slate-100 p-3">
                            <div className="text-xs text-slate-500">{m.sender} · {m.at}</div>
                            <div className="text-slate-800 mt-1">{m.text}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                        <div className="md:col-span-5">
                          <label className="text-sm font-medium text-slate-700">New message</label>
                          <Input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Type your message…" />
                        </div>
                        <Button className="md:col-span-1" onClick={sendMessage} disabled={!messageText.trim()}>
                          Send
                        </Button>
                      </div>
                    </Card>

                    {/* Photos */}
                    <Card>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-800">Photos</h2>
                          <p className="text-slate-600 mt-1">Upload photos; vendor approves/rejects with notes.</p>
                        </div>
                        <div className="text-sm text-slate-500">{uploading ? 'Uploading…' : ''}</div>
                      </div>

                      <div className="mt-4">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadPhoto(f);
                            e.target.value = '';
                          }}
                        />
                      </div>

                      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(trackDoc.photos || []).length === 0 && (
                          <div className="text-slate-500">No photos yet.</div>
                        )}

                        {(trackDoc.photos || []).map((p, idx) => {
                          const review = p.review || { status: 'pending', note: '', reviewedAt: null };
                          const badge =
                            review.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                            review.status === 'rejected' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                            'bg-slate-50 border-slate-200 text-slate-700';

                          return (
                            <div key={idx} className="rounded-2xl border border-slate-100 p-4">
                              <a href={p.url} target="_blank" rel="noreferrer">
                                <img src={p.url} alt="upload" className="w-full h-56 object-cover rounded-xl border border-slate-200" />
                              </a>

                              <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${badge}`}>
                                {review.status === 'approved' && <CheckCircle className="w-4 h-4" />}
                                {review.status === 'rejected' && <ShieldX className="w-4 h-4" />}
                                {review.status === 'pending' && <Camera className="w-4 h-4" />}
                                {review.status.toUpperCase()}
                              </div>

                              {review.note && (
                                <div className="mt-2 text-sm text-slate-700">
                                  <span className="font-semibold">Vendor note:</span> {review.note}
                                </div>
                              )}

                              {isAdmin && (
                                <div className="mt-3 space-y-2">
                                  <label className="text-sm font-medium text-slate-700">Review note (optional)</label>
                                  <Textarea
                                    rows={2}
                                    value={photoNoteDraft[idx] ?? review.note ?? ''}
                                    onChange={(e) => setPhotoNoteDraft({ ...photoNoteDraft, [idx]: e.target.value })}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => reviewPhoto(idx, 'approved', photoNoteDraft[idx] ?? '')}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => reviewPhoto(idx, 'rejected', photoNoteDraft[idx] ?? '')}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
