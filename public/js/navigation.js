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
      } else if (q.type === "writing") {
        this.renderWriting(q, panelBody);
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

  // Descriptive Writing (Email writing & Paragraph summary)
  renderWriting: function(question, container) {
    const textDiv = document.createElement("div");
    textDiv.className = "question-text";
    textDiv.innerHTML = question.questionText;
    container.appendChild(textDiv);

    const writingDiv = document.createElement("div");
    writingDiv.className = "writing-container";
    writingDiv.style.marginTop = "1rem";

    // Recover existing answer
    const savedAns = Questions.getAnswer(question.id);
    const savedVal = savedAns ? savedAns.value : "";

    writingDiv.innerHTML = `
      <label style="display:block; font-size:0.85rem; color:var(--tcs-text-gray); margin-bottom:0.6rem; font-weight:500;">Type your answer inside the box (Recommended: ${question.wordLimit || "50-80"} words):</label>
      <textarea class="writing-input" id="writing-ans" rows="12" style="width:100%; max-width:100%; min-height:220px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.15); border-radius: var(--radius-sm); color: white; padding: 1rem; font-family: inherit; font-size: 0.95rem; line-height: 1.6; outline: none; transition: border-color 0.2s; resize: vertical;" placeholder="Type your response here...">${savedVal}</textarea>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem; font-size:0.8rem; color:var(--tcs-text-gray);">
        <span>Keep focus on correct formatting, grammar, and key terms.</span>
        <span id="writing-word-count" style="font-weight:600; color:#a5c3f6;">Words: 0</span>
      </div>
    `;

    container.appendChild(writingDiv);

    const textarea = document.getElementById("writing-ans");
    const wordCountSpan = document.getElementById("writing-word-count");

    const updateWordCount = () => {
      const text = textarea.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      wordCountSpan.innerText = `Words: ${words}`;
      
      // Auto-save the response dynamically on input, similar to coding
      Questions.saveAnswer(question.id, textarea.value, "writing");
    };

    textarea.addEventListener("input", updateWordCount);
    updateWordCount();
  },

  // Coding Terminal IDE
  renderCoding: function(question, container) {
    container.innerHTML = "";

    const codingWorkspace = document.createElement("div");
    codingWorkspace.className = "coding-workspace";

    // 1. Left Problem Description Pane
    const problemPane = document.createElement("div");
    problemPane.className = "coding-problem-pane";
    problemPane.style.width = "45%";
    problemPane.style.borderRight = "1px solid var(--tcs-border)";

    problemPane.innerHTML = `
      <div class="question-panel-header">
        <div class="question-number-title">${question.title} [${question.difficulty}]</div>
        <div class="question-score-meta">Category: ${question.topic}</div>
      </div>
      <div class="question-content" style="font-size:0.92rem; padding: 1.5rem; overflow-y: auto; max-height: calc(100vh - 180px); line-height: 1.6;">
        ${question.problemStatement}
      </div>
    `;

    // 2. Right Editor Pane
    const editorPane = document.createElement("div");
    editorPane.className = "coding-editor-pane";
    editorPane.style.width = "55%";

    // Recover existing answer
    const savedAns = Questions.getAnswer(question.id);
    const savedCode = savedAns && savedAns.type === "coding" ? savedAns.value : "";
    const savedLang = savedAns && savedAns.lang ? savedAns.lang : "python";

    // Templates fallback
    const defaultTemplate = Judge0.languages[savedLang] ? Judge0.languages[savedLang].defaultCode : "";
    const currentCode = savedCode || defaultTemplate;

    editorPane.innerHTML = `
      <div class="editor-header">
        <div style="font-weight: bold; font-size: 0.85rem; color: #a5c3f6; font-family: sans-serif;">💻 NQT Coding Console</div>
        <div class="editor-controls">
          <select id="lang-selector" class="editor-select">
            <option value="python" ${savedLang === "python" ? "selected" : ""}>Python (3.8.1)</option>
            <option value="java" ${savedLang === "java" ? "selected" : ""}>Java (OpenJDK 13)</option>
            <option value="cpp" ${savedLang === "cpp" ? "selected" : ""}>C++ (GCC 9.2)</option>
            <option value="c" ${savedLang === "c" ? "selected" : ""}>C (GCC 9.2)</option>
            <option value="perl" ${savedLang === "perl" ? "selected" : ""}>Perl (5.28)</option>
          </select>
          <button id="btn-reset-code" class="btn-exam" style="padding: 0.2rem 0.6rem; font-size: 0.75rem; background: #3c3c3c; color: #fff; border-color: #555; border-radius: 3px; cursor:pointer;">Reset</button>
        </div>
      </div>
      <div class="editor-textarea-container" style="flex:1; display:flex; position:relative; background-color:#1e1e1e;">
        <div class="line-numbers" id="editor-line-numbers" style="width: 40px; text-align: right; padding: 1rem 8px 1rem 0; color: #858585; border-right: 1px solid #3c3c3c; font-family: monospace; font-size: 14px; line-height: 20px; user-select: none; overflow-y: hidden;">1</div>
        <textarea class="code-textarea" id="code-editor" spellcheck="false" style="flex: 1; background: transparent; color: #d4d4d4; border: none; outline: none; resize: none; font-family: Consolas, Monaco, monospace; font-size: 14px; line-height: 20px; padding: 1rem; overflow-y: auto; tab-size: 4;" placeholder="Type your code here...">${currentCode}</textarea>
      </div>
      <div class="coding-console-pane" style="height:200px; display:flex; flex-direction:column; background-color:#252526; border-top:2px solid #3c3c3c;">
        <div class="console-tabs" style="display:flex; height:35px; background-color:#2d2d2d; border-bottom:1px solid #3c3c3c;">
          <div class="console-tab active" id="tab-console-input" data-target="console-input-body" style="padding:0.4rem 1.2rem; color:#aaa; font-size:0.8rem; font-weight:bold; cursor:pointer; border-right:1px solid #3c3c3c; display:flex; align-items:center;">Custom Input</div>
          <div class="console-tab" id="tab-console-output" data-target="console-output-body" style="padding:0.4rem 1.2rem; color:#aaa; font-size:0.8rem; font-weight:bold; cursor:pointer; border-right:1px solid #3c3c3c; display:flex; align-items:center;">Console Log</div>
          <div class="console-tab" id="tab-console-results" data-target="console-results-body" style="padding:0.4rem 1.2rem; color:#aaa; font-size:0.8rem; font-weight:bold; cursor:pointer; border-right:1px solid #3c3c3c; display:flex; align-items:center;">Test Results</div>
        </div>
        <div class="console-body" id="console-input-body" style="flex:1; padding:0.8rem 1rem; overflow-y:auto;">
          <label style="display:block; font-size:0.75rem; color:#888; margin-bottom:0.3rem; font-family:sans-serif;">Provide custom test input (stdin):</label>
          <textarea class="custom-input-area" id="custom-stdin" style="width:100%; height:80px; background-color:#1e1e1e; color:#d4d4d4; border:1px solid #3c3c3c; border-radius:4px; padding:0.5rem; font-family:monospace; resize:none; outline:none;" placeholder="Enter input here...">${question.sampleCases && question.sampleCases[0] ? question.sampleCases[0].input : ""}</textarea>
        </div>
        <div class="console-body" id="console-output-body" style="display:none; flex:1; padding:0.8rem 1rem; overflow-y:auto;">
          <pre class="console-log" id="console-output-text" style="color:#9cdcfe; font-family:monospace; margin:0; white-space:pre-wrap;">Run your code to view the compilation or execution logs.</pre>
        </div>
        <div class="console-body" id="console-results-body" style="display:none; flex:1; padding:0.8rem 1rem; overflow-y:auto;">
          <div class="console-verdict" id="console-results-verdict" style="font-weight:bold; font-size:0.9rem; margin-bottom:0.5rem; color:#fff; font-family:sans-serif;">Click 'Submit Code' to evaluate your code against the hidden test suite.</div>
          <div id="testcase-rows-container"></div>
        </div>
      </div>
    `;

    codingWorkspace.appendChild(problemPane);
    codingWorkspace.appendChild(editorPane);
    container.appendChild(codingWorkspace);

    // Dom Elements
    const editor = document.getElementById("code-editor");
    const langSelect = document.getElementById("lang-selector");
    const resetBtn = document.getElementById("btn-reset-code");
    const lineNumbers = document.getElementById("editor-line-numbers");

    // Sync line numbers
    const updateLineNumbers = () => {
      const lines = editor.value.split('\n').length;
      let lineNumsHtml = "";
      for (let i = 1; i <= lines; i++) {
        lineNumsHtml += `${i}<br>`;
      }
      lineNumbers.innerHTML = lineNumsHtml;
    };

    // Save choice
    const handleCodeChange = () => {
      Questions.saveAnswer(question.id, editor.value, "coding", langSelect.value);
      updateLineNumbers();
    };

    // Bind event listeners
    editor.addEventListener("input", handleCodeChange);
    editor.addEventListener("scroll", () => {
      lineNumbers.scrollTop = editor.scrollTop;
    });

    langSelect.addEventListener("change", () => {
      const selectedLang = langSelect.value;
      const tpl = Judge0.languages[selectedLang] ? Judge0.languages[selectedLang].defaultCode : "";
      if (confirm("Changing language will replace your current code with the default template. Do you want to proceed?")) {
        editor.value = tpl;
        handleCodeChange();
      } else {
        const oldLang = Questions.getAnswer(question.id)?.lang || "python";
        langSelect.value = oldLang;
      }
    });

    resetBtn.addEventListener("click", () => {
      const selectedLang = langSelect.value;
      const tpl = Judge0.languages[selectedLang] ? Judge0.languages[selectedLang].defaultCode : "";
      if (confirm("Resetting code will clear your current changes. Proceed?")) {
        editor.value = tpl;
        handleCodeChange();
      }
    });

    // Handle Tab key inside editor
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + "    " + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        handleCodeChange();
      }
    });

    // Console Tabs binding
    const tabElements = document.querySelectorAll(".console-tab");
    tabElements.forEach(tab => {
      tab.addEventListener("click", () => {
        tabElements.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        // Hide all console bodies in this panel
        const consoleBodies = editorPane.querySelectorAll(".console-body");
        consoleBodies.forEach(body => {
          body.style.display = "none";
        });

        // Show target
        const targetId = tab.getAttribute("data-target");
        document.getElementById(targetId).style.display = "block";
      });
    });

    // Initial lines and scrolling setup
    updateLineNumbers();
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
    } else if (q.type === "writing") {
      const input = document.getElementById("writing-ans");
      if (input) {
        Questions.saveAnswer(q.id, input.value, "writing");
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
      Questions.saveAnswer(q.id, editor.value, "coding", langSelect.value, evalResult);

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
