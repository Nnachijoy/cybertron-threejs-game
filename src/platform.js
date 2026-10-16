// src/platform.js

// 1. Work out where start.ng is based on the current URL
let START_NG = null;
if (window.location.hostname.endsWith('.start.ng')) {
    START_NG = 'https://start.ng';
} else if (window.location.hostname.endsWith('.start.localhost')) {
    START_NG = 'http://start.localhost:5173';
}

// 2. Set up the iframe connection
let iframe = null;
let user = null;
let userChangeCallback = null;

if (START_NG) {
    iframe = document.createElement('iframe');
    iframe.src = `${START_NG}/connect`;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    window.addEventListener('message', (event) => {
        // Security check: Only accept messages from start.ng
        if (event.origin !== START_NG) return;
        
        const data = event.data;
        if (data && data.type === 'startng:user') {
            user = data.user; // { id, name, style } or null
            if (userChangeCallback) userChangeCallback(user);
        }
    });
}

// 3. Functions to export
export function getCurrentUser() {
    return user;
}

export function onUserChange(callback) {
    userChangeCallback = callback;
    // Immediately call with current user if we have one
    if (user) callback(user);
}

export function signIn() {
    if (!START_NG) {
        alert("Sign-in isn't available here. Playing as guest.");
        return;
    }
    window.location.href = `${START_NG}/?return_to=${encodeURIComponent(window.location.href)}`;
}

// 4. Ping start.ng to ask who is signed in
export function checkUser() {
    if (!START_NG || !iframe) return;
    const requestId = Date.now().toString();
    iframe.contentWindow.postMessage({ type: 'startng:whoami', requestId }, START_NG);
}

// 5. Events: Check on load, focus, and tab visibility
window.addEventListener('load', () => {
    checkUser();
    
    // Fallback: If start.ng doesn't reply in 3 seconds, force Guest with a test style
    setTimeout(() => {
        if (!user) {
            console.log("Forcing Guest fallback with test style.");
            user = { 
                id: 'guest', 
                name: 'Guest', 
                style: { 
                    primaryColor: '#ff6b6b', 
                    secondaryColor: '#2b2f4a', 
                    skinColor: '#8d5524', 
                    hat: 'tophat', 
                    accessory: 'glasses' 
                } 
            };
            if (userChangeCallback) userChangeCallback(user);
        }
    }, 3000);
});

window.addEventListener('focus', checkUser);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkUser();
});

export { START_NG };