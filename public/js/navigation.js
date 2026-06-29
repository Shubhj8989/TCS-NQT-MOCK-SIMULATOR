/**
 * TCS NQT Exam Navigation and rendering controller
 */

const Navigation = {
  // Initial page layout binder
  init: function() {
    this.bindButtons();
    this.renderTabs();
    this.loadQuestion(Questions.session.currentQuestionIndex);
  },

  // Renders section tabs bar on top
  renderTabs: function() {
    const tabsContainer = document.getElementById("section-tabs-container");
    if (!tabsContainer) return;

    tabsContainer.innerHTML = "";
    
    // Check locked sections
    const lockedSections = Utils.loadState("locked_sections") || {};

    Questions.activeMock.sections.forEach(sec => {
      const tab = document.createElement("div");
      tab.className = "section-tab";
      if (sec.id === Questions.session.currentSectionId) {
        tab.classList.add("active");
      }
      if (lockedSections[sec.id]) {
        tab.classList.add("completed");
      }

      tab.innerText = sec.name;
      tabsContainer.appendChild(tab);
    });
  },

  // Load a question by index in the current active section
  loadQuestion: function(index) {
    const section = Questions.getCurrentSection();
    if (!section || index < 0 || index >= section.questions.length) return;

    Questions.session.currentQuestionIndex = index;
    const q = Questions.getCurrentQuestion();
    
    // Mark as visited
    Questions.markVisited(q.id);

    const qPanel = document.querySelector(".question-panel");
    if (!qPanel) return;

    if (q.type === "coding") {
      this.renderCoding(q, qPanel);
    } else {
      qPanel.innerHTML = `
        <div class="question-panel-header">
          <div class="question-number-title" id="current-question-title">Question ${index + 1}</div>
          <div class="question-score-meta">Marks: +1 | Negative: 0</div>
        </div>
        <div class="question-content" id="question-display-body"></div>
      `;
      const panelBody = document.getElementById("question-display-body");
      if (q.type === "mcq") {
        this.renderMCQ(q, panelBody);
      } else if (q.type === "fitb") {
        this.renderFITB(q, panelBody);
      }
    }

    // Refresh palette
    Palette.render(Questions.session.currentSectionId, index, (targetIdx) => {
      this.loadQuestion(targetIdx);
    });

    // Toggle navigation button disabled states
    const btnPrev = document.getElementById("btn-prev");
    if (btnPrev) {
      btnPrev.disabled = index === 0;
    }

    Questions.saveSession();
  },

  // MCQ questions
  renderMCQ: function(question, container) {
    const textDiv = document.createElement("div");
    textDiv.className = "question-text";
    textDiv.innerHTML = question.questionText;
    container.appendChild(textDiv);

    const listDiv = document.createElement("div");
    listDiv.className = "options-list";

    // Recover existing answer
    const savedAns = Questions.getAnswer(question.id);
    const selectedIdx = savedAns ? savedAns.value : null;

    question.options.forEach((opt, idx) => {
      const item = document.createElement("div");
      item.className = "option-item";
      if (selectedIdx === idx) {
        item.classList.add("selected");
      }

      item.innerHTML = `
        <input type="radio" class="option-radio" name="mcq-option" id="opt-${idx}" ${selectedIdx === idx ? "checked" : ""}>
        <label class="option-label" for="opt-${idx}">${opt}</label>
      `;

      item.addEventListener("click", () => {
        // Unselect others
        document.querySelectorAll(".option-item").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        document.getElementById(`opt-${idx}`).checked = true;
      });

      listDiv.appendChild(item);
    });

    container.appendChild(listDiv);
  },

  // Fill in the box
  renderFITB: function(question, container) {
    const textDiv = document.createElement("div");
    textDiv.className = "question-text";
    textDiv.innerHTML = question.questionText;
    container.appendChild(textDiv);

    const fitbDiv = document.createElement("div");
    fitbDiv.className = "fitb-container";

    // Recover existing answer
    const savedAns = Questions.getAnswer(question.id);
    const savedVal = savedAns ? savedAns.value : "";

    fitbDiv.innerHTML = `
      <label style="display:block;font-size:0.85rem;color:var(--tcs-text-gray);margin-bottom:0.4rem;">Type your answer inside the box:</label>
      <input type="text" class="fitb-input" id="fitb-ans" value="${savedVal}" placeholder="Numeric or text answer">
    `;

    container.appendChild(fitbDiv);
  },

  // Coding Terminal IDE (Simplified: static problem statement viewing)
  renderCoding: function(question, container) {
    container.innerHTML = "";

    const codingWorkspace = document.createElement("div");
    codingWorkspace.className = "coding-workspace";
    codingWorkspace.style.display = "block";

    const problemPane = document.createElement("div");
    problemPane.className = "coding-problem-pane";
    problemPane.style.width = "100%";
    problemPane.style.height = "auto";
    problemPane.style.maxHeight = "none";
    problemPane.style.borderRight = "none";

    problemPane.innerHTML = `
      <div class="question-panel-header">
        <div class="question-number-title">${question.title} [${question.difficulty}]</div>
        <div class="question-score-meta">Category: ${question.topic}</div>
      </div>
      <div class="question-content" style="font-size:0.95rem; padding: 2.2rem; overflow-y: auto; max-height: calc(100vh - 220px); border-radius: var(--radius-md); background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); margin-top: 1rem;">
        ${question.problemStatement}
      </div>
    `;

    codingWorkspace.appendChild(problemPane);
    container.appendChild(codingWorkspace);
    
    // Save standard answered status so the palette marks it as complete/visited
    Questions.saveAnswer(question.id, "read", "coding");
  },

  // Dummy bind for compatibility
  bindCodingInteractions: function(questionId) {},

  // Save current question inputs to session answers registry
  saveCurrentAnswer: function() {
    const q = Questions.getCurrentQuestion();
    if (!q) return;

    if (q.type === "mcq") {
      const selected = document.querySelector('input[name="mcq-option"]:checked');
      if (selected) {
        const idx = parseInt(selected.id.split("-")[1]);
        Questions.saveAnswer(q.id, idx, "mcq");
      }
    } else if (q.type === "fitb") {
      const input = document.getElementById("fitb-ans");
      if (input && input.value.trim() !== "") {
        Questions.saveAnswer(q.id, input.value.trim(), "fitb");
      }
    }
    // Coding is saved dynamically on input, so no manual action required
  },

  // Bind footer and exam actions
  bindButtons: function() {
    const btnSaveNext = document.getElementById("btn-save-next");
    const btnMarkReview = document.getElementById("btn-mark-review");
    const btnClear = document.getElementById("btn-clear");
    const btnPrev = document.getElementById("btn-prev");
    const btnSubmit = document.getElementById("btn-submit");

    if (btnSaveNext) {
      btnSaveNext.addEventListener("click", () => {
        const q = Questions.getCurrentQuestion();
        if (q && q.type === "coding") {
          // Simply move forward for coding reading section
          this.moveNext();
        } else {
          this.saveCurrentAnswer();
          this.moveNext();
        }
      });
    }

    if (btnMarkReview) {
      btnMarkReview.addEventListener("click", () => {
        const q = Questions.getCurrentQuestion();
        if (q) {
          // If option selected, save it first
          this.saveCurrentAnswer();
          Questions.toggleMarkForReview(q.id);
          this.moveNext();
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        const q = Questions.getCurrentQuestion();
        if (q) {
          Questions.clearAnswer(q.id);
          this.loadQuestion(Questions.session.currentQuestionIndex);
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        if (Questions.session.currentQuestionIndex > 0) {
          this.loadQuestion(Questions.session.currentQuestionIndex - 1);
        }
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        this.submitSectionPrompt();
      });
    }
  },

  moveNext: function() {
    const section = Questions.getCurrentSection();
    if (Questions.session.currentQuestionIndex < section.questions.length - 1) {
      this.loadQuestion(Questions.session.currentQuestionIndex + 1);
    } else {
      // Reached end of section, suggest section submission
      Utils.showAlert(
        "Section Completed",
        "You have reached the end of this section. Please click the 'Submit' button in the bottom right corner to lock your answers and proceed to the next section."
      );
      // Refresh palette to update status color markers
      Palette.render(Questions.session.currentSectionId, Questions.session.currentQuestionIndex, (targetIdx) => {
        this.loadQuestion(targetIdx);
      });
    }
  },

  // Compile & Run current coding question
  compileAndRun: async function() {
    const q = Questions.getCurrentQuestion();
    if (!q || q.type !== "coding") return;

    const editor = document.getElementById("code-editor");
    const langSelect = document.getElementById("lang-selector");
    const stdinVal = document.getElementById("custom-stdin").value;
    const outputLog = document.getElementById("console-output-text");

    if (!editor) return;

    outputLog.innerText = "Compiling and running on Judge0 compiler...";
    
    // Switch to compiler log tab
    document.getElementById("tab-console-output").click();

    // Use first sample case output as expected target if custom input matches
    let expectedOutput = q.sampleCases[0].output;
    if (stdinVal.trim() !== q.sampleCases[0].input.trim()) {
      expectedOutput = null; // custom input run
    }

    const res = await Judge0.runCode(editor.value, langSelect.value, stdinVal, expectedOutput, q.id);
    
    if (res.verdict === "Compilation Error") {
      outputLog.innerHTML = `<span class="verdict-error">Compilation Error</span>\n\n${res.stderr}`;
    } else if (res.verdict === "Runtime Error") {
      outputLog.innerHTML = `<span class="verdict-error">Runtime Error</span>\n\n${res.stderr}`;
    } else {
      outputLog.innerHTML = `Time: ${res.time} | Memory: ${res.memory}\nVerdict: <span class="verdict-accepted">${res.verdict}</span>\n\nStdout:\n${res.stdout}`;
    }
  },

  // Submit Section Action Flow
  submitSectionPrompt: function() {
    const section = Questions.getCurrentSection();
    const stats = Questions.getSectionStats(section.id);
    const unvisited = stats.notVisited;
    const unanswered = stats.total - stats.answered;

    let warningMsg = `You are about to submit the <strong>${section.name}</strong> section.<br><br>`;
    warningMsg += `• Total Questions: ${stats.total}<br>`;
    warningMsg += `• Answered: ${stats.answered}<br>`;
    warningMsg += `• Unanswered: ${unanswered}<br><br>`;
    warningMsg += `<span class="text-danger">⚠️ Once submitted, this section will be LOCKED. You cannot return to change your answers.</span>`;

    Utils.showConfirm(
      "Submit Section Confirm",
      warningMsg,
      () => {
        this.lockAndMoveToNextSection();
      }
    );
  },

  // Lock section and transition
  lockAndMoveToNextSection: function() {
    const activeSecId = Questions.session.currentSectionId;
    
    // Clear timer state
    Timer.clearState(activeSecId);

    // Save locked list
    const lockedSections = Utils.loadState("locked_sections") || {};
    lockedSections[activeSecId] = true;
    Utils.saveState("locked_sections", lockedSections);

    // Find next section index
    const sections = Questions.activeMock.sections;
    const currentIdx = sections.findIndex(s => s.id === activeSecId);

    if (currentIdx < sections.length - 1) {
      // Load next section details
      const nextSec = sections[currentIdx + 1];
      Questions.session.currentSectionId = nextSec.id;
      Questions.session.currentQuestionIndex = 0;
      
      // Save changes
      Questions.saveSession();

      // Show alert transition
      Utils.showAlert(
        "Section Submitted",
        `Section '${sections[currentIdx].name}' has been locked. Proceeding to section '${nextSec.name}' (${nextSec.duration} minutes).`,
        () => {
          // Force page reload to initialize the state clean with correct timer
          window.location.reload();
        }
      );
    } else {
      // Reached the end of the final section
      this.finishExam();
    }
  },

  // Submit and evaluate code against hidden test cases
  submitCodingCode: async function() {
    const q = Questions.getCurrentQuestion();
    if (!q || q.type !== "coding") return;

    const editor = document.getElementById("code-editor");
    const langSelect = document.getElementById("lang-selector");
    const verdictEl = document.getElementById("console-results-verdict");
    const rowsContainer = document.getElementById("testcase-rows-container");

    if (!editor || !verdictEl || !rowsContainer) return;

    // Switch to test results tab
    document.getElementById("tab-console-results").click();
    verdictEl.className = "console-verdict";
    verdictEl.innerText = "Evaluating code against hidden test cases...";
    rowsContainer.innerHTML = "";

    // Disable button to prevent double clicks during evaluation
    const btnSaveNext = document.getElementById("btn-save-next");
    if (btnSaveNext) {
      btnSaveNext.disabled = true;
      btnSaveNext.innerText = "Evaluating...";
    }

    try {
      const evalResult = await Judge0.evaluateSubmission(
        editor.value,
        langSelect.value,
        q.id
      );

      // Save answer
      Questions.saveAnswer(q.id, editor.value, "coding", langSelect.value);

      // Render verdict
      verdictEl.innerText = `${evalResult.verdict} (${evalResult.passedCount}/${evalResult.totalCount} passed)`;
      if (evalResult.verdict === "Accepted") {
        verdictEl.className = "console-verdict verdict-accepted";
      } else {
        verdictEl.className = "console-verdict verdict-wrong";
      }

      // Render rows
      evalResult.results.forEach(res => {
        const row = document.createElement("div");
        row.className = "testcase-row";
        
        let statusColor = "color:#f48771;"; // Red for failed
        if (res.success) {
          statusColor = "color:#4ec9b0;"; // Green for passed
        }
        
        row.innerHTML = `
          <span class="testcase-name">Test Case ${res.testCase}</span>
          <span class="testcase-status" style="${statusColor}">${res.verdict}</span>
        `;
        rowsContainer.appendChild(row);
      });

      // Show alert overlay
      Utils.showAlert(
        "Code Submitted",
        `Evaluation finished.<br>Verdict: <strong>${evalResult.verdict}</strong><br>Passed: <strong>${evalResult.passedCount} / ${evalResult.totalCount}</strong> test cases.`
      );

      // Refresh palette to show answered (green) status
      Palette.render(Questions.session.currentSectionId, Questions.session.currentQuestionIndex, (targetIdx) => {
        this.loadQuestion(targetIdx);
      });

    } catch (err) {
      console.error(err);
      verdictEl.innerText = "Error running evaluation. Check console.";
    } finally {
      if (btnSaveNext) {
        btnSaveNext.disabled = false;
        btnSaveNext.innerText = "Submit Code";
      }
    }
  },

  // Submit whole exam and finish
  finishExam: function() {
    // Set finished flag
    Utils.saveState("exam_finished", true);
    
    // Clear all section timers
    Questions.activeMock.sections.forEach(sec => {
      Timer.clearState(sec.id);
    });

    Utils.showAlert(
      "Congratulations!",
      "Your NQT Mock Test has been successfully submitted. Loading performance analysis dashboard...",
      () => {
        window.location.href = "./result.html";
      }
    );
  }
};
