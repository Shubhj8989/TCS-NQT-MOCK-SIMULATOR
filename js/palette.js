/**
 * TCS NQT Sidebar Question Palette Manager
 */

const Palette = {
  // Render the entire palette container
  render: function(sectionId, currentQuestionIndex, onSelectQuestion) {
    const section = Questions.getSection(sectionId);
    if (!section) return;

    // 1. Render Summary Stats
    const stats = Questions.getSectionStats(sectionId);
    this.updateStatsUI(stats);

    // 2. Render Grid
    const grid = document.getElementById("question-palette-grid");
    if (!grid) return;
    
    grid.innerHTML = "";

    section.questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.className = "palette-btn";
      
      // Determine status color class
      const status = Questions.getQuestionStatus(q.id);
      let statusClass = "not-visited";
      if (status === 2) statusClass = "not-answered";
      else if (status === 3) statusClass = "answered";
      else if (status === 4) statusClass = "marked-review";
      else if (status === 5) statusClass = "answered-review";

      btn.classList.add(statusClass);
      
      // Highlight current question
      if (idx === currentQuestionIndex) {
        btn.classList.add("current");
      }

      btn.innerText = idx + 1;

      // Event listener to jump to question
      btn.addEventListener("click", () => {
        onSelectQuestion(idx);
      });

      grid.appendChild(btn);
    });
  },

  // Update summary counts in the sidebar legend
  updateStatsUI: function(stats) {
    const elAnswered = document.getElementById("stat-count-answered");
    const elNotAnswered = document.getElementById("stat-count-not-answered");
    const elNotVisited = document.getElementById("stat-count-not-visited");
    const elMarkedReview = document.getElementById("stat-count-marked-review");
    const elAnsweredReview = document.getElementById("stat-count-answered-review");

    if (elAnswered) elAnswered.innerText = stats.answered;
    if (elNotAnswered) elNotAnswered.innerText = stats.notAnswered;
    if (elNotVisited) elNotVisited.innerText = stats.notVisited;
    if (elMarkedReview) elMarkedReview.innerText = stats.marked;
    if (elAnsweredReview) elAnsweredReview.innerText = stats.answeredReview;
  }
};
