/**
 * TCS NQT Simulator Utilities & Security Engine
 */

const Utils = {
  // LocalStorage Persistence
  saveState: function(key, data) {
    try {
      const user = this.getCurrentUser();
      const globalKeys = ["users_registry", "current_user", "selected_mock_id", "judge0_config"];
      const isGlobal = globalKeys.includes(key);
      const prefix = (!isGlobal && user) ? `tcs_nqt_${user.username}_` : "tcs_nqt_";
      localStorage.setItem(`${prefix}${key}`, JSON.stringify(data));
    } catch (e) {
      console.error("Error saving state to localStorage", e);
    }
  },

  loadState: function(key) {
    try {
      const user = this.getCurrentUser();
      const globalKeys = ["users_registry", "current_user", "selected_mock_id", "judge0_config"];
      const isGlobal = globalKeys.includes(key);
      const prefix = (!isGlobal && user) ? `tcs_nqt_${user.username}_` : "tcs_nqt_";
      const val = localStorage.getItem(`${prefix}${key}`);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      console.error("Error loading state from localStorage", e);
      return null;
    }
  },

  clearState: function(key) {
    try {
      const user = this.getCurrentUser();
      const globalKeys = ["users_registry", "current_user", "selected_mock_id", "judge0_config"];
      const isGlobal = globalKeys.includes(key);
      const prefix = (!isGlobal && user) ? `tcs_nqt_${user.username}_` : "tcs_nqt_";
      localStorage.removeItem(`${prefix}${key}`);
    } catch (e) {
      console.error("Error clearing state from localStorage", e);
    }
  },

  clearAllStates: function() {
    try {
      const keys = Object.keys(localStorage);
      const user = this.getCurrentUser();
      keys.forEach(key => {
        if (user && key.startsWith(`tcs_nqt_${user.username}_`)) {
          localStorage.removeItem(key);
        } else if (!user && key.startsWith("tcs_nqt_") && !key.includes("users_registry") && !key.includes("current_user")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error("Error clearing all states", e);
    }
  },

  // Basic authentication handlers
  getCurrentUser: function() {
    try {
      const val = localStorage.getItem("tcs_nqt_current_user");
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  },

  registerUser: function(username, name, password) {
    try {
      const reg = this.loadState("users_registry") || {};
      const userKey = username.trim().toLowerCase();
      if (reg[userKey]) {
        return { success: false, message: "Username already exists." };
      }
      reg[userKey] = {
        username: username.trim(),
        name: name.trim(),
        password: password.trim()
      };
      this.saveState("users_registry", reg);
      return { success: true, message: "Registration successful!" };
    } catch (e) {
      return { success: false, message: "Error registering user." };
    }
  },

  loginUser: function(username, password) {
    try {
      const reg = this.loadState("users_registry") || {};
      const userKey = username.trim().toLowerCase();
      const user = reg[userKey];
      if (!user || user.password !== password.trim()) {
        return { success: false, message: "Invalid username or password." };
      }
      localStorage.setItem("tcs_nqt_current_user", JSON.stringify(user));
      return { success: true, user: user };
    } catch (e) {
      return { success: false, message: "Error logging in." };
    }
  },

  logoutUser: function() {
    try {
      localStorage.removeItem("tcs_nqt_current_user");
      window.location.href = "./login.html";
    } catch (e) {
      console.error("Error logging out", e);
    }
  },

  // Fullscreen Management
  enterFullscreen: function() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(err => console.log(err));
    } else if (docEl.mozRequestFullScreen) { /* Firefox */
      docEl.mozRequestFullScreen().catch(err => console.log(err));
    } else if (docEl.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
      docEl.webkitRequestFullscreen().catch(err => console.log(err));
    } else if (docEl.msRequestFullscreen) { /* IE/Edge */
      docEl.msRequestFullscreen().catch(err => console.log(err));
    }
  },

  isFullscreen: function() {
    return !!(document.fullscreenElement || 
              document.webkitFullscreenElement || 
              document.mozFullScreenElement || 
              document.msFullscreenElement);
  },

  // Custom alert dialog box (instead of native alert which exits fullscreen)
  showAlert: function(title, message, onConfirm = null) {
    // Check if dialog already exists
    let existing = document.getElementById('custom-alert-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'custom-alert-overlay';
    overlay.className = 'overlay';
    
    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-footer">
          <button id="custom-alert-btn" class="btn btn-exam btn-exam-primary">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('custom-alert-btn').addEventListener('click', () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    });
  },

  // Custom confirm dialog box
  showConfirm: function(title, message, onConfirm, onCancel = null) {
    let existing = document.getElementById('custom-confirm-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-overlay';
    overlay.className = 'overlay';
    
    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-footer">
          <button id="custom-confirm-cancel" class="btn btn-exam btn-secondary">Cancel</button>
          <button id="custom-confirm-ok" class="btn btn-exam btn-exam-success">Confirm Submit</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('custom-confirm-ok').addEventListener('click', () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    });

    document.getElementById('custom-confirm-cancel').addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });
  },

  // Security & Anti-Cheat Manager
  initSecurity: function(onAutoSubmit) {
    let warnings = this.loadState("security_warnings") || 0;
    const maxWarnings = 3;

    const showWarningToast = (message) => {
      const toast = document.createElement('div');
      toast.className = 'warning-toast';
      toast.innerHTML = `⚠️ <span>${message}</span>`;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.remove();
      }, 5000);
    };

    const triggerViolation = (type) => {
      // Don't trigger if exam already finished
      if (this.loadState("exam_finished")) return;

      warnings++;
      this.saveState("security_warnings", warnings);

      let msg = "";
      if (type === "tab-switch") {
        msg = `Tab switching / window minimization detected. This is violation ${warnings} of ${maxWarnings}.`;
      } else if (type === "fullscreen-exit") {
        msg = `You have exited fullscreen mode. Please return to fullscreen. This is violation ${warnings} of ${maxWarnings}.`;
      }

      if (warnings >= maxWarnings) {
        this.showAlert("EXAM SUSPENDED", "Maximum security violations exceeded. Your test is being submitted automatically.", () => {
          onAutoSubmit();
        });
      } else {
        this.showAlert("SECURITY WARNING", `${msg} Exceeding ${maxWarnings} violations will submit your exam.`, () => {
          if (type === "fullscreen-exit") {
            this.enterFullscreen();
          }
        });
        showWarningToast(`Warning: Violation detected (${warnings}/${maxWarnings})`);
      }
    };

    // 1. Tab switching detection
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation("tab-switch");
      }
    });

    // 2. Fullscreen exit detection
    document.addEventListener('fullscreenchange', () => {
      if (!this.isFullscreen()) {
        triggerViolation("fullscreen-exit");
      }
    });

    // 3. Disable right click (context menu)
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWarningToast("Right-click is disabled during the exam.");
    });

    // 4. Disable cut, copy, paste
    document.addEventListener('copy', (e) => e.preventDefault());
    document.addEventListener('cut', (e) => e.preventDefault());
    document.addEventListener('paste', (e) => e.preventDefault());

    // 5. Catch key combinations (F5, F11, Ctrl+R, etc.)
    document.addEventListener('keydown', (e) => {
      // F5 or Ctrl+R
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'R')) {
        e.preventDefault();
        showWarningToast("Page refresh is disabled during the exam.");
      }
      // F11 (Fullscreen control)
      if (e.key === 'F11') {
        e.preventDefault();
        showWarningToast("Fullscreen toggle via F11 is disabled.");
      }
    });

    // 6. Beforeunload prompt (Refresh warning)
    window.addEventListener('beforeunload', (e) => {
      if (!this.loadState("exam_finished")) {
        const msg = "Are you sure you want to leave? Your exam progress is auto-saved, but the timer will continue running.";
        e.returnValue = msg;
        return msg;
      }
    });

    return {
      getWarningsCount: () => warnings,
      resetWarnings: () => {
        warnings = 0;
        this.saveState("security_warnings", 0);
      }
    };
  }
};
