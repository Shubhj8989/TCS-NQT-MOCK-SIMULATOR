/**
 * Client-side backend judge connector
 */

const Judge0 = {
  // Configured languages
  languages: {
    "python": { id: 71, name: "Python (3.8.1)", extension: "py", defaultCode: "# Python 3\nimport sys\n\ndef solve():\n    # Read input from stdin\n    # lines = sys.stdin.read().split()\n    pass\n\nif __name__ == '__main__':\n    # solve()\n    pass" },
    "java": { id: 62, name: "Java (OpenJDK 13.0.1)", extension: "java", defaultCode: "// Java\nimport java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write code here\n    }\n}" },
    "cpp": { id: 54, name: "C++ (GCC 9.2.0)", extension: "cpp", defaultCode: "// C++\n#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    // Write code here\n    return 0;\n}" },
    "c": { id: 50, name: "C (GCC 9.2.0)", extension: "c", defaultCode: "// C\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main() {\n    // Write C code here\n    return 0;\n}" },
    "perl": { id: 85, name: "Perl (5.28.1)", extension: "pl", defaultCode: "# Perl 5\nuse strict;\nuse warnings;\n\n# Write Perl code here\n" }
  },

  getConfig: function() {
    // Keep config settings on client for API references if needed (e.g. settings page)
    const saved = Utils.loadState("judge0_config");
    return saved || {
      apiUrl: "http://localhost:8000",
      apiKey: "",
      useLocalMock: true
    };
  },

  saveConfig: function(config) {
    Utils.saveState("judge0_config", config);
  },

  // Calls backend compiler run
  runCode: async function(sourceCode, languageKey, stdin, expectedOutput = null, questionId = null) {
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode,
          language: languageKey,
          stdin,
          expectedOutput,
          questionId
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned error status ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.error("Local compiler API error", e);
      return {
        success: false,
        verdict: "Runtime Error",
        stdout: "",
        stderr: "Failed to connect to simulation server API: " + e.message,
        time: "0.000s",
        memory: "0.0MB"
      };
    }
  },

  // Evaluates submission securely against hidden test cases
  evaluateSubmission: async function(sourceCode, languageKey, questionId) {
    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode,
          language: languageKey,
          questionId
        })
      });

      if (!response.ok) {
        throw new Error(`Server evaluation error status ${response.status}`);
      }

      const res = await response.json();

      // Reconstruct testcase rows dynamically for rendering in the console UI
      // This displays Passed vs failed testcase indices without exposing raw payloads
      const results = [];
      for (let i = 1; i <= res.totalCount; i++) {
        let success = true;
        let verdict = "Accepted";

        if (res.failedTestCaseNumber !== null && i >= res.failedTestCaseNumber) {
          success = false;
          verdict = i === res.failedTestCaseNumber ? res.verdict : "Not Run";
        }

        results.push({
          testCase: i,
          success: success,
          verdict: verdict
        });
      }

      return {
        success: res.success,
        verdict: res.verdict,
        passedCount: res.passedCount,
        totalCount: res.totalCount,
        results: results,
        time: res.time,
        memory: res.memory
      };
    } catch (e) {
      console.error("Local compiler API error", e);
      return {
        success: false,
        verdict: "Runtime Error",
        passedCount: 0,
        totalCount: 0,
        results: [],
        time: "0.000s",
        memory: "0.0MB"
      };
    }
  }
};
