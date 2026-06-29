/**
 * TCS NQT Exam Timer and Auto-Submit System
 */

const Timer = {
  intervalId: null,
  secondsRemaining: 0,
  onTick: null, // Callback function f(timeString)
  onTimeout: null, // Callback function f()

  // Start the timer for a section
  start: function(durationMinutes, sectionId, onTick, onTimeout) {
    this.stop(); // Clear any existing timer
    
    this.onTick = onTick;
    this.onTimeout = onTimeout;

    // Load saved timer details or start fresh
    const saved = Utils.loadState(`timer_section_${sectionId}`);
    const now = Date.now();

    if (saved) {
      // Calculate elapsed time since last save
      const elapsedSeconds = Math.floor((now - saved.timestamp) / 1000);
      this.secondsRemaining = saved.secondsRemaining - elapsedSeconds;

      if (this.secondsRemaining <= 0) {
        this.secondsRemaining = 0;
        this.saveState(sectionId);
        setTimeout(() => this.onTimeout(), 100);
        return;
      }
    } else {
      this.secondsRemaining = durationMinutes * 60;
    }

    this.saveState(sectionId);

    // Start tick interval
    this.intervalId = setInterval(() => {
      this.secondsRemaining--;
      this.saveState(sectionId);
      
      const timeStr = this.formatTime(this.secondsRemaining);
      if (this.onTick) this.onTick(timeStr);

      if (this.secondsRemaining <= 0) {
        this.stop();
        if (this.onTimeout) this.onTimeout();
      }
    }, 1000);
    
    // Immediate initial tick call
    if (this.onTick) this.onTick(this.formatTime(this.secondsRemaining));
  },

  stop: function() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  // Save current timer status with a timestamp
  saveState: function(sectionId) {
    Utils.saveState(`timer_section_${sectionId}`, {
      secondsRemaining: this.secondsRemaining,
      timestamp: Date.now()
    });
  },

  // Remove timer details for a section (called when section submitted)
  clearState: function(sectionId) {
    Utils.clearState(`timer_section_${sectionId}`);
  },

  // Helper: Format seconds to HH:MM:SS or MM:SS
  formatTime: function(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  },

  getSecondsRemaining: function() {
    return this.secondsRemaining;
  }
};
