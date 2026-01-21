// Service Worker for Bullpen Tracker - Offline Support

const CACHE_NAME = 'bullpen-tracker-v1';
const STATIC_CACHE_NAME = 'bullpen-tracker-static-v1';
const DYNAMIC_CACHE_NAME = 'bullpen-tracker-dynamic-v1';

// Core assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/trends',
  '/offline.html',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Supabase API requests (we want these to always go to network)
  if (url.hostname.includes('supabase')) {
    return;
  }

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // For navigation requests, try network first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Try to return cached page
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page
            return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response and update cache in background
        fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((response) => {
          // Cache successful responses for static assets
          if (response.ok && (
            request.url.includes('/_next/static/') ||
            request.url.includes('/fonts/') ||
            request.url.includes('.css') ||
            request.url.includes('.js')
          )) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return offline placeholder for images
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#eee" width="200" height="200"/><text fill="#999" x="50%" y="50%" text-anchor="middle" dy=".3em">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
          throw new Error('Network error');
        });
    })
  );
});

// Handle background sync for offline pitch saves
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pitches') {
    event.waitUntil(syncPitches());
  }
});

async function syncPitches() {
  try {
    // Get pending pitches from IndexedDB
    const db = await openPitchDB();
    const pendingPitches = await getAllPendingPitches(db);

    for (const pitch of pendingPitches) {
      try {
        // Try to sync with server
        const response = await fetch('/api/pitches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pitch),
        });

        if (response.ok) {
          // Remove from pending queue
          await removePendingPitch(db, pitch.id);
        }
      } catch (err) {
        console.error('[SW] Failed to sync pitch:', err);
      }
    }
  } catch (err) {
    console.error('[SW] Sync failed:', err);
  }
}

// IndexedDB helpers for offline pitch storage
function openPitchDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BullpenTrackerOffline', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingPitches')) {
        db.createObjectStore('pendingPitches', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllPendingPitches(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingPitches', 'readonly');
    const store = transaction.objectStore('pendingPitches');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function removePendingPitch(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingPitches', 'readwrite');
    const store = transaction.objectStore('pendingPitches');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

console.log('[SW] Service Worker loaded');
