/**
 * Avadhi Nidhi V3 - Authentication & Role-Based Access Control (RBAC)
 * Supports Google Identity Services (GIS) OAuth2 & Registered Email Verification
 */

import { APP_CONFIG } from './config.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isInitialized = false;
    this.onAuthStateChangedCallback = null;
    this.unregisteredAttempt = null;
  }

  init(onAuthStateChanged) {
    this.onAuthStateChangedCallback = onAuthStateChanged;

    // Check existing stored session
    const stored = localStorage.getItem(APP_CONFIG.storageKeys.sessionUser);
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
      } catch (e) {
        localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);
      }
    }

    // Initialize Google Identity Services if script is loaded
    this.initGoogleClient();
    this.isInitialized = true;

    if (this.onAuthStateChangedCallback) {
      this.onAuthStateChangedCallback(this.currentUser);
    }
  }

  initGoogleClient() {
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
      // Retry in 500ms if script is still loading
      setTimeout(() => {
        if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
          this.setupGis();
        }
      }, 500);
      return;
    }
    this.setupGis();
  }

  setupGis() {
    try {
      const clientId = APP_CONFIG.googleClientId;
      if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        return; // Client ID not configured yet; Dev/Quick Login available
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => this.handleGoogleCredentialResponse(response),
        auto_select: false
      });

      // Render button if container exists
      const btnContainer = document.getElementById('google-signin-btn-container');
      if (btnContainer) {
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
          shape: 'pill'
        });
      }
    } catch (e) {
      console.warn("GIS setup notice:", e);
    }
  }

  /**
   * Handle credential returned by Google Identity Services
   */
  handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;

    try {
      const payload = this.decodeJwt(response.credential);
      const email = (payload.email || '').trim().toLowerCase();
      const name = payload.name || payload.given_name || email;
      const picture = payload.picture || '';

      this.verifyAndLogin(email, name, picture);
    } catch (err) {
      console.error("JWT decoding failed:", err);
      alert("Failed to decode Google Sign-In response.");
    }
  }

  /**
   * Match email against Member_Details
   */
  verifyAndLogin(email, displayName = '', picture = '', membersList = null) {
    const members = membersList || window.app?.state?.members || [];
    const normalizedEmail = email.trim().toLowerCase();

    // Look for matching member
    const match = members.find(m => {
      const memEmail = String(m.Email || m.email || '').trim().toLowerCase();
      return memEmail === normalizedEmail && memEmail !== '';
    });

    if (match) {
      // Verified member!
      this.unregisteredAttempt = null;
      this.currentUser = {
        name: match.Name || match.name,
        email: normalizedEmail,
        type: match.Type || match.type || 'Member',
        srNum: match['Sr. Num'] || match.srNum,
        phone: match.Phone || match.phone || '',
        picture: picture
      };

      localStorage.setItem(APP_CONFIG.storageKeys.sessionUser, JSON.stringify(this.currentUser));

      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(this.currentUser);
      }
      return { success: true, user: this.currentUser };
    } else {
      // Blocked - Unregistered email
      this.currentUser = null;
      this.unregisteredAttempt = { email: normalizedEmail, name: displayName };
      localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);

      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(null, this.unregisteredAttempt);
      }
      return { success: false, reason: "UNREGISTERED_EMAIL", email: normalizedEmail };
    }
  }

  /**
   * Quick-Login for Demo / Dev testing
   */
  devLoginAs(member) {
    if (!member) return;
    const email = (member.Email || member.email || `${(member.Name || member.name).toLowerCase().replace(/\s+/g, '')}@gmail.com`).toLowerCase();
    this.currentUser = {
      name: member.Name || member.name,
      email: email,
      type: member.Type || member.type || 'Member',
      srNum: member['Sr. Num'] || member.srNum,
      phone: member.Phone || member.phone || '',
      picture: ''
    };

    this.unregisteredAttempt = null;
    localStorage.setItem(APP_CONFIG.storageKeys.sessionUser, JSON.stringify(this.currentUser));

    if (this.onAuthStateChangedCallback) {
      this.onAuthStateChangedCallback(this.currentUser);
    }
  }

  signOut() {
    this.currentUser = null;
    this.unregisteredAttempt = null;
    localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);

    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch (e) {}
    }

    if (this.onAuthStateChangedCallback) {
      this.onAuthStateChangedCallback(null);
    }
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  isAdmin() {
    return this.currentUser && this.currentUser.type === 'Admin';
  }

  getCurrentUser() {
    return this.currentUser;
  }

  decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  }
}

export const authService = new AuthService();
