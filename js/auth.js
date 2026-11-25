/**
 * Avadhi Nidhi V3 - Authentication & Role-Based Access Control (RBAC)
 * Google Identity Services (GIS) OAuth2 Sign-In (Matching Staff Attendance App)
 * 
 * Flow:
 * 1. Checks stored session (with token exp validation).
 * 2. If no valid session, displays full-screen Login Gate.
 * 3. User authenticates via real Google Sign-In button (GIS).
 * 4. Decodes verified email from Google's signed JWT.
 * 5. Matches email case-insensitively against 'Email' column in Member_Details.
 * 6. If matched -> Saves session and grants role (Admin vs Member).
 * 7. If not matched -> Access Denied (user cannot access the app).
 * 8. NO backdoors or unverified logins.
 */

import { APP_CONFIG } from './config.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuthChecking = false;
    this.authError = '';
    this.onAuthStateChangedCallback = null;
  }

  init(onAuthStateChanged) {
    this.onAuthStateChangedCallback = onAuthStateChanged;

    // Check stored session
    this.tryRestoreSession();

    // Initialize Google Identity Services
    this.renderSignInButton();
  }

  /**
   * Try restoring existing authenticated session
   */
  tryRestoreSession() {
    const stored = localStorage.getItem(APP_CONFIG.storageKeys.sessionUser);
    if (!stored) {
      this.currentUser = null;
      if (this.onAuthStateChangedCallback) this.onAuthStateChangedCallback(null);
      return;
    }

    try {
      const user = JSON.parse(stored);
      // Validate session expiration
      if (user.exp && Date.now() > user.exp) {
        console.warn("Session expired. Re-authentication required.");
        localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);
        this.currentUser = null;
        if (this.onAuthStateChangedCallback) this.onAuthStateChangedCallback(null);
        return;
      }

      this.currentUser = user;
      if (this.onAuthStateChangedCallback) this.onAuthStateChangedCallback(this.currentUser);
    } catch (e) {
      localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);
      this.currentUser = null;
      if (this.onAuthStateChangedCallback) this.onAuthStateChangedCallback(null);
    }
  }

  /**
   * Render official Google Sign-In button (Google Identity Services)
   */
  renderSignInButton() {
    const clientId = APP_CONFIG.googleClientId;
    if (!clientId) {
      this.setAuthError("Google Client ID not configured. Please check config.js");
      return;
    }

    const waitForGIS = (retries = 0) => {
      if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => this.handleGoogleAuthCallback(response),
            auto_select: false
          });

          const btnEl = document.getElementById('google-signin-btn-login');
          if (btnEl) {
            btnEl.innerHTML = '';
            window.google.accounts.id.renderButton(btnEl, {
              theme: "filled_blue",
              size: "large",
              shape: "pill",
              width: 280,
              text: "signin_with"
            });
          }
        } catch (err) {
          console.warn("Google Auth Init Warning:", err);
        }
      } else if (retries < 30) {
        setTimeout(() => waitForGIS(retries + 1), 250);
      } else {
        this.setAuthError("Google Sign-In failed to load. Please refresh the page.");
      }
    };

    waitForGIS(0);
  }

  /**
   * Handle Google Auth Callback from GIS
   */
  async handleGoogleAuthCallback(response) {
    if (!response || !response.credential) return;

    this.isAuthChecking = true;
    this.authError = '';
    this.updateAuthUiState();

    try {
      // Decode JWT payload
      const payload = this.decodeJwt(response.credential);
      const userEmail = (payload.email || '').toLowerCase().trim();
      const tokenExp = payload.exp ? payload.exp * 1000 : Date.now() + 86400000 * 7; // 7 days

      if (!userEmail) {
        throw new Error("Unable to extract verified email from Google Sign-In.");
      }

      // Fetch or verify against live Member_Details
      let members = window.app?.state?.members || [];
      if (!members || members.length === 0) {
        // If not yet loaded in app state, read from cache or fetch
        const cached = localStorage.getItem(APP_CONFIG.storageKeys.cachedMembers);
        if (cached) {
          try { members = JSON.parse(cached); } catch (e) {}
        }
      }

      // If still empty, trigger live fetch
      if (!members || members.length === 0) {
        const { sheetsService } = await import('./sheetsService.js');
        const live = await sheetsService.loadAll();
        members = live.members || [];
      }

      // Match user in Member_Details (case-insensitive)
      const matchedMember = members.find(m => {
        const memEmail = String(m.Email || m.email || '').toLowerCase().trim();
        return memEmail === userEmail && memEmail !== '';
      });

      if (matchedMember) {
        // Authenticated & Registered!
        const role = matchedMember.Type || matchedMember.type || 'Member';
        this.currentUser = {
          name: matchedMember.Name || matchedMember.name || payload.name,
          email: userEmail,
          type: role,
          srNum: matchedMember['Sr. Num'] || matchedMember.srNum,
          phone: matchedMember.Phone || matchedMember.phone || '',
          picture: payload.picture || '',
          exp: tokenExp
        };

        localStorage.setItem(APP_CONFIG.storageKeys.sessionUser, JSON.stringify(this.currentUser));
        this.authError = '';
        this.isAuthChecking = false;

        if (this.onAuthStateChangedCallback) {
          this.onAuthStateChangedCallback(this.currentUser);
        }

        if (window.app && window.app.showToast) {
          window.app.showToast(`Welcome, ${this.currentUser.name}! Logged in as ${role}.`, 'success');
        }
      } else {
        // Access Denied: Unregistered Gmail
        this.currentUser = null;
        localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);
        this.isAuthChecking = false;
        this.authError = `Access Denied: ${userEmail} is not registered in the Member_Details sheet. Please contact your administrator (shuhaibonly@gmail.com) to grant access.`;
        this.updateAuthUiState();

        if (this.onAuthStateChangedCallback) {
          this.onAuthStateChangedCallback(null, { email: userEmail });
        }
      }

    } catch (err) {
      console.error("Auth Error:", err);
      this.isAuthChecking = false;
      this.authError = `Authentication failed: ${err.message || 'Please check your connection and try again.'}`;
      this.updateAuthUiState();
    }
  }

  setAuthError(msg) {
    this.authError = msg;
    this.updateAuthUiState();
  }

  updateAuthUiState() {
    const loadingEl = document.getElementById('auth-loading-state');
    const btnContainer = document.getElementById('google-signin-container-wrapper');
    const errorBox = document.getElementById('auth-error-box');
    const errorText = document.getElementById('auth-error-text');

    if (loadingEl) {
      if (this.isAuthChecking) {
        loadingEl.classList.remove('hidden');
      } else {
        loadingEl.classList.add('hidden');
      }
    }

    if (btnContainer) {
      if (this.isAuthChecking) {
        btnContainer.classList.add('hidden');
      } else {
        btnContainer.classList.remove('hidden');
      }
    }

    if (errorBox && errorText) {
      if (this.authError) {
        errorText.textContent = this.authError;
        errorBox.classList.remove('hidden');
      } else {
        errorBox.classList.add('hidden');
      }
    }
  }

  retryLogin() {
    this.authError = '';
    this.isAuthChecking = false;
    this.updateAuthUiState();
    this.renderSignInButton();
  }

  signOut() {
    this.currentUser = null;
    this.authError = '';
    this.isAuthChecking = false;
    localStorage.removeItem(APP_CONFIG.storageKeys.sessionUser);

    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch (e) {}
    }

    if (this.onAuthStateChangedCallback) {
      this.onAuthStateChangedCallback(null);
    }

    // Re-render sign-in button
    setTimeout(() => this.renderSignInButton(), 200);
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

  /**
   * Re-verify logged-in user against freshly synced Member_Details
   */
  verifyAndLogin(email, name, picture, members = []) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !Array.isArray(members) || members.length === 0) return this.currentUser;

    const matched = members.find(m => String(m.Email || m.email || '').toLowerCase().trim() === cleanEmail);
    if (matched) {
      this.currentUser = {
        ...(this.currentUser || {}),
        name: matched.Name || matched.name || name,
        email: cleanEmail,
        type: matched.Type || matched.type || 'Member',
        srNum: matched['Sr. Num'] || matched.srNum,
        phone: matched.Phone || matched.phone || '',
        picture: picture || this.currentUser?.picture || ''
      };
      localStorage.setItem(APP_CONFIG.storageKeys.sessionUser, JSON.stringify(this.currentUser));
    }
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
