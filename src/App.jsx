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
  getDocs,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import JSZip from 'jszip';

import {
  Gem,
  Sparkles,
  Package,
  Truck,
  Box,
  Camera,
  CheckCircle,
  Heart,
  DollarSign,
  Clipboard,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  LogOut,
  Search,
  Copy,
  Download,
  Eye
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
const getHashFromURL = () => (window.location.hash || '').replace('#', '');

const genToken = (bytes = 24) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const nowISO = () => new Date().toISOString();

const toMillis = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : 0;

const safeFilename = (s) =>
  String(s || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';

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
    canvas.toBlob(
      (blob) => blob ? resolve({ blob, width: w, height: h }) : reject(new Error('Compression failed')),
      'image/jpeg',
      quality
    );
  };
  img.onerror = reject;
  reader.readAsDataURL(file);
});

/* ---------------- Tracking (Option A) helpers ---------------- */

const normalizeTracking = (s) =>
  String(s || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();

const detectCarrier = (raw) => {
  const t = normalizeTracking(raw);
  if (!t) return { key: 'unknown', label: 'Carrier', confidence: 0 };

  // UPS: 1Z + 16 chars
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return { key: 'ups', label: 'UPS', confidence: 0.95 };

  // USPS: often 20–22 digits and commonly starts with 9
  if (/^9\d{19,21}$/.test(t) || /^\d{20,22}$/.test(t)) return { key: 'usps', label: 'USPS', confidence: 0.75 };

  // FedEx: common lengths 12/15/20/22 digits (heuristic)
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20}$/.test(t) || /^\d{22}$/.test(t)) {
    return { key: 'fedex', label: 'FedEx', confidence: 0.7 };
  }

  // DHL (heuristic)
  if (/^\d{10}$/.test(t) || /^JD\d{16,18}$/.test(t)) return { key: 'dhl', label: 'DHL', confidence: 0.6 };

  return { key: 'unknown', label: 'Carrier', confidence: 0.2 };
};

const carrierTrackingUrl = (raw) => {
  const t = normalizeTracking(raw);
  const c = detectCarrier(t);
  if (!t) return null;

  switch (c.key) {
    case 'ups':
      return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`;
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
    case 'dhl':
      return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(t + ' tracking')}`;
  }
};

const trackingHint = () =>
  "Tracking links may take a few hours to activate. The first scan often appears after pickup.";

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
      <div
        className="bg-gradient-to-r from-rose-400 to-purple-500 h-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
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
          <div
            key={s.id}
            className={`rounded-2xl border p-4 ${done ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${done ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
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

const ShipmentCard = ({ label, trackingNumber, onCopy }) => {
  const t = normalizeTracking(trackingNumber);
  const carrier = detectCarrier(t);
  const url = carrierTrackingUrl(t);

  if (!t) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-sm text-slate-500 mt-1">No tracking number yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">{label}</div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {carrier.label}
            </span>
            <span className="text-xs text-slate-500 break-all">{t}</span>
          </div>

          <div className="text-xs text-slate-500 mt-2">{trackingHint()}</div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => onCopy?.(t)} title="Copy tracking number">
            <span className="inline-flex items-center gap-2"><Copy className="w-4 h-4" />Copy</span>
          </Button>

          <a href={url} target="_blank" rel="noreferrer">
            <Button title="Open carrier tracking page">Track</Button>
          </a>
        </div>
      </div>
    </div>
  );
};

/* ---------------- App ---------------- */

export default function App() {
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
  const mode = token ? 'tracking' : 'vendor_portal';

  // auth + admin
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // vendor login
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // tracking doc + admin order doc
  const [trackDoc, setTrackDoc] = useState(null);
  const [orderDoc, setOrderDoc] = useState(null);

  // vendor portal: order list
  const [ordersIndex, setOrdersIndex] = useState([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | needs_attention | status id
  const [sortMode, setSortMode] = useState('updated_desc'); // updated_desc | created_desc | name_asc

  // export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ step: '', done: 0, total: 0 });

  // create form
  const [clientForm, setClientForm] = useState({ name: '', email: '' });

  // shared fields
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

  /* ---------- URL token watcher ---------- */
  useEffect(() => {
    const onPop = () => setToken(getTokenFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setURLToken = (t, hash) => {
    const u = new URL(window.location.href);
    if (t) u.searchParams.set('t', t);
    else u.searchParams.delete('t');
    u.hash = hash ? `#${hash}` : '';
    window.history.pushState({}, '', u.toString());
    setToken(t);
    setAuthError('');
  };

  const shareURL = token ? `${window.location.origin}${window.location.pathname}?t=${token}` : '';

  const copyText = async (txt) => {
    try { await navigator.clipboard.writeText(txt); } catch { /* ignore */ }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ---------- Auth bootstrap ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setUser(u);
          const adminSnap = await getDoc(doc(db, 'admins', u.uid));
          setIsAdmin(adminSnap.exists());
          setLoadingAuth(false);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error(e);
        setIsAdmin(false);
        setLoadingAuth(false);
      }
    });
    return () => unsub();
  }, []);

  /* ---------- Vendor: load order index (publicTracking) ---------- */
  const fetchOrdersIndex = async () => {
    if (!isAdmin) return;
    setIndexLoading(true);
    try {
      const q = query(collection(db, 'publicTracking'), orderBy('updatedAt', 'desc'), limit(500));
      const snaps = await getDocs(q);
      const items = snaps.docs.map(d => ({ token: d.id, ...d.data() }));
      setOrdersIndex(items);
    } finally {
      setIndexLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'vendor_portal') return;
    if (!isAdmin) return;
    fetchOrdersIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAdmin]);

  const needsAttention = (o) => {
    const lastBy = o.lastUpdateBy || 'vendor';
    const vendorSeen = toMillis(o.vendorLastSeenAt);
    const customerAct = toMillis(o.lastCustomerActivityAt);
    const updated = toMillis(o.updatedAt);
    if (lastBy !== 'customer') return false;
    return (customerAct || updated) > vendorSeen;
  };

  const filteredOrders = useMemo(() => {
    let items = [...ordersIndex];

    const s = searchText.trim().toLowerCase();
    if (s) {
      items = items.filter(o =>
        (o.customerName || '').toLowerCase().includes(s) ||
        (o.customerEmail || '').toLowerCase().includes(s) ||
        (o.status || '').toLowerCase().includes(s) ||
        (o.orderId || '').toLowerCase().includes(s) ||
        (o.token || '').toLowerCase().includes(s)
      );
    }

    if (statusFilter === 'needs_attention') {
      items = items.filter(needsAttention);
    } else if (statusFilter !== 'all') {
      items = items.filter(o => (o.status || 'created') === statusFilter);
    }

    if (sortMode === 'updated_desc') {
      items.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    } else if (sortMode === 'created_desc') {
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    } else if (sortMode === 'name_asc') {
      items.sort((a, b) => String(a.customerName || '').localeCompare(String(b.customerName || '')));
    }

    return items;
  }, [ordersIndex, searchText, statusFilter, sortMode]);

  /* ---------- Tracking page fetch ---------- */
  const fetchByToken = async (t) => {
    if (!t) return { track: null, order: null };
    const trackSnap = await getDoc(doc(db, 'publicTracking', t));
    if (!trackSnap.exists()) return { track: null, order: null };
    const track = { id: trackSnap.id, ...trackSnap.data() };

    let order = null;
    if (isAdmin && track.orderId) {
      const orderSnap = await getDoc(doc(db, 'orders', track.orderId));
      if (orderSnap.exists()) order = { id: orderSnap.id, ...orderSnap.data() };
    }
    return { track, order };
  };

  // polling on tracking view
  const pollRef = useRef(null);
  useEffect(() => {
    if (mode !== 'tracking') return;
    let alive = true;

    const tick = async () => {
      try {
        const { track, order } = await fetchByToken(token);
        if (!alive) return;
        setTrackDoc(track);
        setOrderDoc(order);
      } catch (e) {
        console.error(e);
      }
    };

    tick();
    pollRef.current = setInterval(tick, 15000);

    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [mode, token, isAdmin]);

  const manualRefresh = async () => {
    if (mode !== 'tracking' || !token) return;
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
  };

  /* ---------- Vendor: Create order + token + full URL copy ---------- */
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

    await setDoc(doc(db, 'publicTracking', t), {
      orderId: orderRef.id,
      customerName: orderData.customerName,
      customerEmail: orderData.customerEmail,
      status: orderData.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      address: null,
      tracking: orderData.tracking,
      paid: orderData.paid,
      photos: [],
      messages: [],
      lastUpdateBy: 'vendor',
      lastCustomerActivityAt: null,
      vendorLastSeenAt: serverTimestamp()
    });

    setClientForm({ name: '', email: '' });

    const full = `${window.location.origin}${window.location.pathname}?t=${t}`;
    await copyText(full);      // copies full URL
    setURLToken(t);            // opens it immediately
  };

  /* ---------- Vendor: seen + quick-open helpers ---------- */
  const markVendorSeen = async (t) => {
    if (!isAdmin || !t) return;
    try {
      await updateDoc(doc(db, 'publicTracking', t), { vendorLastSeenAt: serverTimestamp() });
    } catch { /* ignore */ }
  };

  const openFromList = async (t, hash) => {
    setURLToken(t, hash);
    await markVendorSeen(t);
  };

  const requireAdmin = () => {
    if (!isAdmin) throw new Error('Admin only');
    if (!trackDoc?.orderId) throw new Error('No order bound');
  };

  /* ---------- Customer writes: update publicTracking (plus orders if admin) ---------- */
  const saveAddress = async () => {
    if (!trackDoc) return;
    const address = { ...addressDraft };

    await updateDoc(doc(db, 'publicTracking', token), {
      address,
      status: 'address_captured',
      updatedAt: serverTimestamp(),
      lastUpdateBy: isAdmin ? 'vendor' : 'customer',
      ...(isAdmin ? { vendorLastSeenAt: serverTimestamp() } : { lastCustomerActivityAt: serverTimestamp() })
    });

    if (isAdmin && trackDoc.orderId) {
      await updateDoc(doc(db, 'orders', trackDoc.orderId), {
        address,
        status: 'address_captured',
        updatedAt: serverTimestamp()
      });
    }

    await manualRefresh();
  };

  const updateStatus = async (nextStatus) => {
    requireAdmin();
    await updateDoc(doc(db, 'publicTracking', token), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      lastUpdateBy: 'vendor',
      vendorLastSeenAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const saveTracking = async () => {
    requireAdmin();
    const tracking = {
      kitOutbound: normalizeTracking(trackingDraft.kitOutbound) || null,
      kitReturn: normalizeTracking(trackingDraft.kitReturn) || null,
      productOutbound: normalizeTracking(trackingDraft.productOutbound) || null
    };

    await updateDoc(doc(db, 'publicTracking', token), {
      tracking,
      updatedAt: serverTimestamp(),
      lastUpdateBy: 'vendor',
      vendorLastSeenAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      tracking,
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const setPaid = async (paid) => {
    requireAdmin();
    await updateDoc(doc(db, 'publicTracking', token), {
      paid,
      status: paid ? 'paid_complete' : (trackDoc.status || 'created'),
      updatedAt: serverTimestamp(),
      lastUpdateBy: 'vendor',
      vendorLastSeenAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      paid,
      status: paid ? 'paid_complete' : (orderDoc?.status || trackDoc.status),
      updatedAt: serverTimestamp()
    });
    await manualRefresh();
  };

  const sendMessage = async () => {
    if (!trackDoc) return;
    if (!messageText.trim()) return;

    const sender = isAdmin ? 'vendor' : 'customer';
    const msg = { sender, text: messageText.trim(), at: nowISO() };
    const messages = [ ...(trackDoc.messages || []), msg ];

    await updateDoc(doc(db, 'publicTracking', token), {
      messages,
      updatedAt: serverTimestamp(),
      lastUpdateBy: isAdmin ? 'vendor' : 'customer',
      ...(isAdmin ? { vendorLastSeenAt: serverTimestamp() } : { lastCustomerActivityAt: serverTimestamp() })
    });

    if (isAdmin && trackDoc.orderId) {
      await updateDoc(doc(db, 'orders', trackDoc.orderId), {
        messages,
        updatedAt: serverTimestamp()
      });
    }

    setMessageText('');
    await manualRefresh();
  };

  const uploadPhoto = async (file) => {
    if (!trackDoc) return;
    if (!file) return;

    setUploading(true);
    try {
      const { blob } = await compressImageToBlob(file);
      const safeName = safeFilename(file.name);
      const path = `orders/${trackDoc.orderId || 'unbound'}/${Date.now()}_${safeName}.jpg`;
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

      const photos = [ ...(trackDoc.photos || []), photo ];
      const cur = trackDoc.status || 'created';
      const nextStatus = statusIndex(cur) >= statusIndex('photos_submitted') ? cur : 'photos_submitted';

      await updateDoc(doc(db, 'publicTracking', token), {
        photos,
        status: nextStatus,
        updatedAt: serverTimestamp(),
        lastUpdateBy: isAdmin ? 'vendor' : 'customer',
        ...(isAdmin ? { vendorLastSeenAt: serverTimestamp() } : { lastCustomerActivityAt: serverTimestamp() })
      });

      if (isAdmin && trackDoc.orderId) {
        await updateDoc(doc(db, 'orders', trackDoc.orderId), {
          photos,
          status: nextStatus,
          updatedAt: serverTimestamp()
        });
      }

      await manualRefresh();
    } finally {
      setUploading(false);
    }
  };

  const reviewPhoto = async (idx, status, note) => {
    requireAdmin();
    const photos = [ ...(trackDoc.photos || []) ];
    if (!photos[idx]) return;

    photos[idx] = {
      ...photos[idx],
      review: { status, note: note || '', reviewedAt: nowISO() }
    };

    await updateDoc(doc(db, 'publicTracking', token), {
      photos,
      status: 'photos_reviewed',
      updatedAt: serverTimestamp(),
      lastUpdateBy: 'vendor',
      vendorLastSeenAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'orders', trackDoc.orderId), {
      photos,
      status: 'photos_reviewed',
      updatedAt: serverTimestamp()
    });

    await manualRefresh();
  };

  /* ---------- Keep drafts in sync when doc loads ---------- */
  useEffect(() => {
    if (!trackDoc) return;

    if (trackDoc.address) setAddressDraft({
      line1: trackDoc.address.line1 || '',
      line2: trackDoc.address.line2 || '',
      city: trackDoc.address.city || '',
      state: trackDoc.address.state || '',
      zip: trackDoc.address.zip || '',
      country: trackDoc.address.country || 'US'
    });

    if (trackDoc.tracking) setTrackingDraft({
      kitOutbound: trackDoc.tracking.kitOutbound || '',
      kitReturn: trackDoc.tracking.kitReturn || '',
      productOutbound: trackDoc.tracking.productOutbound || ''
    });

    setPaidDraft(!!trackDoc.paid);

    // If an admin opens a token link directly, count it as "seen"
    if (isAdmin && token) {
      markVendorSeen(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackDoc?.id, isAdmin]);

  /* ---------- Anchor scroll helper (for quick actions) ---------- */
  useEffect(() => {
    if (mode !== 'tracking') return;
    const hash = getHashFromURL();
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mode, token]);

  /* ---------- Export all (admin-only) ---------- */
  const exportAll = async () => {
    if (!isAdmin) return;
    setExporting(true);
    setExportProgress({ step: 'Fetching orders…', done: 0, total: 0 });

    try {
      const q = query(collection(db, 'publicTracking'), orderBy('updatedAt', 'desc'), limit(1000));
      const snaps = await getDocs(q);
      const orders = snaps.docs.map(d => ({ token: d.id, ...d.data() }));

      // CSV
      const headers = [
        'token', 'orderId', 'customerName', 'customerEmail', 'status',
        'createdAt', 'updatedAt',
        'paid',
        'kitOutbound', 'kitReturn', 'productOutbound',
        'address_line1', 'address_line2', 'address_city', 'address_state', 'address_zip', 'address_country',
        'photos_count', 'messages_count',
        'lastUpdateBy', 'lastCustomerActivityAt', 'vendorLastSeenAt',
        'customer_url'
      ];

      const fmtDate = (v) => {
        const ms = toMillis(v);
        if (!ms) return '';
        return new Date(ms).toISOString();
      };

      const csvEscape = (v) => {
        const s = (v === null || v === undefined) ? '' : String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };

      const rows = orders.map(o => {
        const addr = o.address || {};
        const tr = o.tracking || {};
        const url = `${window.location.origin}${window.location.pathname}?t=${o.token}`;
        return [
          o.token,
          o.orderId || '',
          o.customerName || '',
          o.customerEmail || '',
          o.status || '',
          fmtDate(o.createdAt),
          fmtDate(o.updatedAt),
          o.paid ? 'true' : 'false',
          tr.kitOutbound || '',
          tr.kitReturn || '',
          tr.productOutbound || '',
          addr.line1 || '',
          addr.line2 || '',
          addr.city || '',
          addr.state || '',
          addr.zip || '',
          addr.country || '',
          Array.isArray(o.photos) ? o.photos.length : 0,
          Array.isArray(o.messages) ? o.messages.length : 0,
          o.lastUpdateBy || '',
          fmtDate(o.lastCustomerActivityAt),
          fmtDate(o.vendorLastSeenAt),
          url
        ].map(csvEscape).join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      // ZIP
      const zip = new JSZip();
      zip.file('orders.csv', csv);
      zip.file('orders.json', JSON.stringify(orders, null, 2));

      // Images
      const allPhotos = [];
      orders.forEach(o => {
        (o.photos || []).forEach((p, idx) => {
          if (p?.url) {
            allPhotos.push({
              token: o.token,
              idx,
              url: p.url,
              uploadedAt: p.uploadedAt || '',
              reviewStatus: p.review?.status || 'pending'
            });
          }
        });
      });

      setExportProgress({ step: 'Downloading images…', done: 0, total: allPhotos.length });

      for (let i = 0; i < allPhotos.length; i++) {
        const item = allPhotos[i];
        setExportProgress({ step: 'Downloading images…', done: i, total: allPhotos.length });

        try {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();

          const base = `${item.idx + 1}_${safeFilename(item.reviewStatus)}_${safeFilename(item.uploadedAt || '')}.jpg`;
          const path = `images/${safeFilename(item.token)}/${base}`;

          zip.file(path, blob);
        } catch {
          const path = `images/${safeFilename(item.token)}/FAILED_${item.idx + 1}.txt`;
          zip.file(path, `Failed to download: ${item.url}`);
        }
      }

      setExportProgress({ step: 'Generating ZIP…', done: allPhotos.length, total: allPhotos.length });
      const out = await zip.generateAsync({ type: 'blob' });

      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(out, `gemmy-export-${stamp}.zip`);
    } finally {
      setExporting(false);
      setExportProgress({ step: '', done: 0, total: 0 });
    }
  };

  /* ---------------- Render ---------------- */

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
              <div className="text-xs text-slate-500">{mode === 'vendor_portal' ? 'Vendor portal' : 'Order tracking'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={manualRefresh}
              disabled={mode !== 'tracking' || !token}
              title="Refresh now"
            >
              <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />Refresh</span>
            </Button>

            {user && !user.isAnonymous && (
              <Button variant="ghost" onClick={logout} title="Sign out">
                <span className="inline-flex items-center gap-2"><LogOut className="w-4 h-4" />Sign out</span>
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* ---------------- Vendor Portal (no token) ---------------- */}
        {mode === 'vendor_portal' && (
          <>
            {!isAdmin && (
              <Card>
                <h2 className="text-xl font-semibold text-slate-800">Vendor sign-in</h2>
                <p className="text-slate-600 mt-1">Sign in to create orders and manage customer updates.</p>
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
              <>
                <Card>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-800">Create a new order</h2>
                      <p className="text-slate-600 mt-1">
                        Creates an order + copies the full customer tracking URL.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={exportAll}
                        disabled={exporting || indexLoading}
                        title="Export orders + images as a ZIP"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Download className="w-4 h-4" />
                          {exporting ? 'Exporting…' : 'Export all'}
                        </span>
                      </Button>
                    </div>
                  </div>

                  {exporting && (
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="font-semibold">{exportProgress.step}</div>
                      {exportProgress.total > 0 && (
                        <div className="mt-1">{exportProgress.done} / {exportProgress.total}</div>
                      )}
                    </div>
                  )}

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
                </Card>

                <Card>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-800">Orders</h2>
                      <p className="text-slate-600 mt-1">Newest updates appear at the top by default.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={fetchOrdersIndex} disabled={indexLoading}>
                        {indexLoading ? 'Refreshing…' : 'Refresh list'}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        className="pl-9"
                        placeholder="Search (name, email, status, orderId)…"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                      />
                    </div>

                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="needs_attention">Needs attention (NEW)</option>
                      {STATUS_FLOW.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>

                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value)}
                    >
                      <option value="updated_desc">Sort: newest update</option>
                      <option value="created_desc">Sort: newest created</option>
                      <option value="name_asc">Sort: name A→Z</option>
                    </select>
                  </div>

                  <div className="mt-5 divide-y">
                    {filteredOrders.length === 0 && (
                      <div className="py-6 text-slate-500">No matching orders.</div>
                    )}

                    {filteredOrders.map((o) => {
                      const fullUrl = `${window.location.origin}${window.location.pathname}?t=${o.token}`;
                      const isNew = needsAttention(o);
                      return (
                        <div key={o.token} className="py-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-slate-800 truncate">
                                {o.customerName || 'Unnamed'}
                              </div>
                              {isNew && (
                                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold px-2 py-0.5">
                                  NEW
                                </span>
                              )}
                              <span className="text-xs text-slate-500">{o.status || 'created'}</span>
                            </div>

                            <div className="text-xs text-slate-500 mt-1 break-all">{fullUrl}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              Updated: {toMillis(o.updatedAt) ? new Date(toMillis(o.updatedAt)).toLocaleString() : '—'}
                            </div>
                          </div>

                          {/* Quick actions */}
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="secondary" onClick={() => copyText(fullUrl)} title="Copy customer URL">
                              <span className="inline-flex items-center gap-2"><Copy className="w-4 h-4" />Copy</span>
                            </Button>

                            <Button variant="secondary" onClick={() => markVendorSeen(o.token)} title="Mark as seen">
                              <span className="inline-flex items-center gap-2"><Eye className="w-4 h-4" />Seen</span>
                            </Button>

                            <Button onClick={() => openFromList(o.token)} title="Open order">
                              Open
                            </Button>

                            <Button variant="secondary" onClick={() => openFromList(o.token, 'photos')} title="Jump to photos">
                              Photos
                            </Button>

                            <Button variant="secondary" onClick={() => openFromList(o.token, 'messages')} title="Jump to messages">
                              Messages
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {/* ---------------- Tracking Page (token present) ---------------- */}
        {mode === 'tracking' && (
          <>
            {loadingAuth ? (
              <Card><div className="text-slate-600">Loading…</div></Card>
            ) : (
              <>
                {!trackDoc && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <ShieldX className="w-5 h-5 text-rose-600" />
                      <div>
                        <div className="font-semibold text-slate-800">No order found for this link.</div>
                        <div className="text-sm text-slate-600">Double-check the token and try again.</div>
                      </div>
                    </div>
                  </Card>
                )}

                {trackDoc && (
                  <>
                    {isAdmin && (
                      <Card>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Vendor</div>
                            <div className="text-sm text-slate-600 mt-1">Customer URL:</div>
                            <div className="text-sm mt-1 break-all">{shareURL}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => copyText(shareURL)}>
                              <span className="inline-flex items-center gap-2"><Copy className="w-4 h-4" />Copy</span>
                            </Button>
                            <Button variant="secondary" onClick={() => { setURLToken(''); }}>
                              Back to portal
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}

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

                        {isAdmin && (
                          <div className="inline-flex items-center gap-2 text-xs text-emerald-700">
                            <ShieldCheck className="w-4 h-4" /> admin controls enabled
                          </div>
                        )}
                      </div>

                      <Timeline status={trackDoc.status} />
                    </Card>

                    {/* Address */}
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

                    {/* Shipments (Option A) */}
                    <Card>
                      <h2 className="text-xl font-semibold text-slate-800">Shipments</h2>
                      <p className="text-slate-600 mt-1">
                        Use the links below to view the latest carrier scans.
                      </p>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ShipmentCard
                          label="Kit outbound"
                          trackingNumber={trackDoc?.tracking?.kitOutbound}
                          onCopy={copyText}
                        />
                        <ShipmentCard
                          label="Mold return"
                          trackingNumber={trackDoc?.tracking?.kitReturn}
                          onCopy={copyText}
                        />
                        <ShipmentCard
                          label="Product outbound"
                          trackingNumber={trackDoc?.tracking?.productOutbound}
                          onCopy={copyText}
                        />
                      </div>

                      <div className="mt-4 text-sm text-slate-600">
                        {(() => {
                          const st = trackDoc?.status || 'created';
                          const kit = normalizeTracking(trackDoc?.tracking?.kitOutbound);
                          const prod = normalizeTracking(trackDoc?.tracking?.productOutbound);

                          if (['kit_shipped', 'kit_delivered'].includes(st) && !kit) {
                            return (
                              <>
                                <span className="text-rose-700 font-semibold">Vendor note:</span>{' '}
                                Kit is marked shipped, but no tracking number is set yet.
                              </>
                            );
                          }
                          if (['product_shipped', 'product_delivered'].includes(st) && !prod) {
                            return (
                              <>
                                <span className="text-rose-700 font-semibold">Vendor note:</span>{' '}
                                Product is marked shipped, but no tracking number is set yet.
                              </>
                            );
                          }
                          return (
                            <span className="text-slate-500">
                              Tip: if tracking isn’t showing scans yet, check again later—carriers often delay the first update.
                            </span>
                          );
                        })()}
                      </div>
                    </Card>

                    {/* Vendor operations */}
                    {isAdmin && (
                      <Card>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-800">Operations</h2>
                            <p className="text-slate-600 mt-1">Tracking numbers + phase transitions.</p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="secondary" onClick={() => updateStatus('kit_shipped')}>Kit shipped</Button>
                            <Button variant="secondary" onClick={() => updateStatus('kit_delivered')}>Kit delivered</Button>
                            <Button variant="secondary" onClick={() => updateStatus('mold_in_transit')}>Mold in transit</Button>
                            <Button variant="secondary" onClick={() => updateStatus('mold_received')}>Mold received</Button>
                            <Button variant="secondary" onClick={() => updateStatus('production')}>Production</Button>
                            <Button variant="secondary" onClick={() => updateStatus('product_shipped')}>Product shipped</Button>
                            <Button variant="secondary" onClick={() => updateStatus('product_delivered')}>Delivered</Button>
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

                        {/* Live preview shipment cards while editing */}
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <ShipmentCard label="Kit outbound (preview)" trackingNumber={trackingDraft.kitOutbound} onCopy={copyText} />
                          <ShipmentCard label="Mold return (preview)" trackingNumber={trackingDraft.kitReturn} onCopy={copyText} />
                          <ShipmentCard label="Product outbound (preview)" trackingNumber={trackingDraft.productOutbound} onCopy={copyText} />
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
                      <div id="messages" className="scroll-mt-24" />
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
                      <div id="photos" className="scroll-mt-24" />
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
                                    <Button variant="secondary" onClick={() => reviewPhoto(idx, 'approved', photoNoteDraft[idx] ?? '')}>
                                      Approve
                                    </Button>
                                    <Button variant="secondary" onClick={() => reviewPhoto(idx, 'rejected', photoNoteDraft[idx] ?? '')}>
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
