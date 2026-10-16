// src/platform.js
// Talks to start.ng through its hidden connect page.
// Adapted from https://start.ng/docs.md

const START_NG = 'https://start.ng';
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

async function askStartNg(message, replyType, timeoutMs = 5000) {
  const el = await connectFrame();
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

let userChangeCallback = null;
let currentUser = null;
let currentGuest = null;

async function fetchUser() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return;
  currentUser = reply.user ?? null;
  currentGuest = reply.guest ?? null;
  if (userChangeCallback) {
    try { userChangeCallback(currentUser, currentGuest); } catch (e) { console.warn('user callback error:', e); }
  }
}

export function getCurrentUser() { return currentUser; }
export function getGuest() { return currentGuest; }

export function onUserChange(cb) {
  userChangeCallback = cb;
  if (currentUser || currentGuest) {
    try { cb(currentUser, currentGuest); } catch (e) { console.warn('user callback error:', e); }
  }
}

export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

export async function saveScore(stats) {
  if (!currentUser) return { ok: false, error: 'Sign in to save your score' };
  const reply = await askStartNg(
    { type: 'startng:score', stats },
    'startng:scoreSaved'
  );
  return reply ?? { ok: false, error: 'No reply from start.ng' };
}

export async function getLeaderboard(limit = 10) {
  const reply = await askStartNg(
    { type: 'startng:leaderboard', limit },
    'startng:leaderboardData'
  );
  return reply ?? { ok: false, entries: [] };
}

// Ask on load and when the player returns to the tab.
addEventListener('load', fetchUser);
addEventListener('focus', fetchUser);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fetchUser();
});

// Delay the initial fetch so game.js can set up its callback first.
setTimeout(fetchUser, 1500);

export { askStartNg, START_NG };