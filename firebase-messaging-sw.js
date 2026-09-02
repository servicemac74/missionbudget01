// firebase-messaging-sw.js
// Service Worker for McDonald Budget PWA.
// Handles:
//   - PWA offline cache (dashboard shell survives airplane mode)
//   - FCM background message display (future — when Cloud Functions are deployed)
//   - Notification tap → deep link routing into the budget app
//
// Firebase project: mcdonald-budget-01
// Scope: /missionbudget01/
// Cache version: missionbudget01-v1 (increment to missionbudget01-v2 when index.html is updated)
//
// IMPORTANT: This file must be named exactly firebase-messaging-sw.js
// and must live at the repo root (/missionbudget01/firebase-messaging-sw.js).
// Do not rename or move it.

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// ── Firebase config — mcdonald-budget-01 ─────────────────────────────────────
// Must match the _config block in budget_bill_tracker_template_v2.html exactly.
// If the Firebase project ever changes, update both this file and the template.
firebase.initializeApp({
  apiKey:            'AIzaSyBT_eGObW-c9tBTpLqPovvSoN-Ieo-jGe8',
  authDomain:        'mcdonald-budget-01.firebaseapp.com',
  projectId:         'mcdonald-budget-01',
  storageBucket:     'mcdonald-budget-01.firebasestorage.app',
  messagingSenderId: '472291576800',
  appId:             '1:472291576800:web:722f5e004b5e2ef5b83985',
  databaseURL:       'https://mcdonald-budget-01-default-rtdb.firebaseio.com'
});

var messaging = firebase.messaging();

// ── Background FCM message handler ───────────────────────────────────────────
// Fires when a push message arrives and the PWA is NOT in the foreground.
// Displays the notification using the payload from the Cloud Function.
// Cloud Functions are not yet deployed — this handler is ready for when they are.
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message received:', payload);

  var data  = payload.data || {};
  var title = (payload.notification && payload.notification.title)
    ? payload.notification.title
    : 'Budget Reminder';
  var body  = (payload.notification && payload.notification.body)
    ? payload.notification.body
    : '';

  var options = {
    body:               body,
    icon:               '/missionbudget01/icons/icon-192.png',
    badge:              '/missionbudget01/icons/icon-192.png',
    data:               { url: data.url || '/missionbudget01/' },
    requireInteraction: false,
    tag:                'budget-notification'
  };

  return self.registration.showNotification(title, options);
});

// ── Notification tap handler ──────────────────────────────────────────────────
// Fires when the user taps a notification.
// Reads the target URL from notification.data.url (set by Cloud Function).
// If the PWA is already open in a window, navigates that window.
// Otherwise opens a new window at the target URL.
//
// Deep link URL params the budget app supports:
//   ?view=transactions              → transaction list (current month)
//   ?view=transactions&date=YYYY-MM-DD → transactions filtered to that date
//   ?view=month&month=YYYY-MM       → monthly budget vs. actual view
//   ?view=accounts                  → account balances view
//   ?view=add                       → quick-add transaction form
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification tapped.');
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/missionbudget01/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // If an open PWA window exists, navigate it to the target URL
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(function(c) {
              return c ? c.focus() : null;
            });
          }
        }
        // No open window — open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Offline cache — app shell ─────────────────────────────────────────────────
// Caches the bill tracker HTML on install so the page shell loads even offline.
// Firebase sync won't work offline, but the page renders with last-known state
// from any prior local state (Firebase persists its own local cache separately).
//
// To bust this cache after deploying a new index.html:
//   increment CACHE_NAME to 'missionbudget01-v2', commit and push.
//   The activate handler will automatically delete the old cache on next SW load.
var CACHE_NAME = 'missionbudget01-v1';
var SHELL_URLS = [
  '/missionbudget01/',
  '/missionbudget01/index.html'
];

self.addEventListener('install', function(event) {
  console.log('[SW] Installing. Cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_URLS);
    }).catch(function(err) {
      // Cache failure is non-fatal — PWA still works, just no offline support
      console.log('[SW] Cache addAll failed (non-fatal):', err);
    })
  );
  // Take control immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating. Clearing old caches.');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    })
  );
  // Claim all open clients immediately so the new SW takes effect without reload
  self.clients.claim();
});

// ── Fetch handler — serve cached shell when offline ───────────────────────────
// Only intercepts navigation requests (full page loads).
// All other requests (Firebase RTDB, CDN scripts, etc.) pass through normally.
// Network-first: always tries the network. Falls back to cache only if offline.
self.addEventListener('fetch', function(event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        console.log('[SW] Offline — serving cached shell.');
        return caches.match('/missionbudget01/index.html');
      })
    );
  }
  // Non-navigation requests: pass through to network with no interception
});
