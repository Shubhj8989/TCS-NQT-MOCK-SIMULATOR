/**
 * TCS NQT Questions Database and Session State Manager
 */

const Questions = {
  activeMock: null, // Full mock test object loaded from JSON
  hiddenTests: null, // Hidden test cases for coding
  
  // Active session states
  session: {
    mockId: null,
    currentSectionId: null,
    currentQuestionIndex: 0,
    // Answers registry: { questionId: { value: <ans>, type: <mcq/fitb/coding>, lang: <for coding> } }
    answers: {},
    // Palette state flags
    visited: {},
    marked: {}
  },

  // Initialize and load Mock JSON
  loadMockTest: async function(mockId) {
    try {
      const response = await fetch(`./data/mock${mockId}.json`);
      if (!response.ok) {
        throw new Error("Failed to fetch mock data");
      }
      this.activeMock = await response.json();
      
      this.session.mockId = mockId;
      
      // Try restoring saved session
      this.restoreSession();

      return this.activeMock;
    } catch (e) {
      console.error("Error loading mock test", e);
      throw e;
    }
  },

  // Save session state to localStorage
  saveSession: function() {
    Utils.saveState(`session_mock_${this.session.mockId}`, this.session);
  },

  // Restore session state
  restoreSession: function() {
    const saved = Utils.loadState(`session_mock_${this.session.mockId}`);
    if (saved) {
      this.session = saved;
    } else {
      // Initialize fresh session structure
      this.session.currentSectionId = this.activeMock.sections[0].id;
      this.session.currentQuestionIndex = 0;
      this.session.answers = {};
      this.session.visited = {};
      this.session.marked = {};

      // Mark the very first question as visited
      const firstQ = this.getQuestion(this.session.currentSectionId, 0);
      if (firstQ) {
        this.session.visited[firstQ.id] = true;
      }
      
      this.saveSession();
    }
  },

  // Helper getters
  getSection: function(sectionId) {
    if (!this.activeMock) return null;
    return this.activeMock.sections.find(s => s.id === sectionId);
  },

  getQuestion: function(sectionId, index) {
    const section = this.getSection(sectionId);
    if (!section || !section.questions) return null;
    return section.questions[index];
  },

  getCurrentQuestion: function() {
    return this.getQuestion(this.session.currentSectionId, this.session.currentQuestionIndex);
  },

  getCurrentSection: function() {
    return this.getSection(this.session.currentSectionId);
  },

  // Actions
  saveAnswer: function(questionId, value, type, lang = null) {
    this.session.answers[questionId] = {
      value: value,
      type: type,
      lang: lang
    };
    this.saveSession();
  },

  clearAnswer: function(questionId) {
    if (this.session.answers[questionId]) {
      delete this.session.answers[questionId];
    }
    this.saveSession();
  },

  getAnswer: function(questionId) {
    return this.session.answers[questionId] || null;
  },

  markVisited: function(questionId) {
    this.session.visited[questionId] = true;
    this.saveSession();
  },

  toggleMarkForReview: function(questionId) {
    if (this.session.marked[questionId]) {
      delete this.session.marked[questionId];
    } else {
      this.session.marked[questionId] = true;
    }
    this.saveSession();
    return !!this.session.marked[questionId];
  },

  isMarked: function(questionId) {
    return !!this.session.marked[questionId];
  },

  isVisited: function(questionId) {
    return !!this.session.visited[questionId];
  },

  isAnswered: function(questionId) {
    return !!this.session.answers[questionId];
  },

  // Get question color status index for palette
  // 1: Not Visited (gray)
  // 2: Not Answered (red)
  // 3: Answered (green)
  // 4: Marked for Review (purple)
  // 5: Answered & Marked for Review (purple + green dot)
  getQuestionStatus: function(questionId) {
    const answered = this.isAnswered(questionId);
    const marked = this.isMarked(questionId);
    const visited = this.isVisited(questionId);

    if (answered && marked) return 5;
    if (marked) return 4;
    if (answered) return 3;
    if (visited) return 2;
    return 1;
  },

  // Get section statistics for current section
  getSectionStats: function(sectionId) {
    const section = this.getSection(sectionId);
    if (!section) return { total: 0, answered: 0, notAnswered: 0, marked: 0, notVisited: 0, answeredReview: 0 };
    
    let stats = {
      total: section.questions.length,
      answered: 0,
      notAnswered: 0,
      marked: 0,
      notVisited: 0,
      answeredReview: 0
    };

    section.questions.forEach(q => {
      const status = this.getQuestionStatus(q.id);
      if (status === 1) stats.notVisited++;
      else if (status === 2) stats.notAnswered++;
      else if (status === 3) stats.answered++;
      else if (status === 4) stats.marked++;
      else if (status === 5) {
        stats.answeredReview++;
        // Count as answered and marked
        stats.answered++;
      }
    });

    return stats;
  }
};
