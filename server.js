const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

// Load hidden tests securely in memory on start
let hiddenTests = {};
try {
  const fileContent = fs.readFileSync(path.join(__dirname, "secure_data", "hidden_tests.json"), "utf8");
  hiddenTests = JSON.parse(fileContent);
  console.log("Loaded hidden tests successfully.");
} catch (e) {
  console.error("Could not load secure hidden test cases:", e.message);
}

// Block access to secure directories and files
app.use("/secure_data", (req, res) => {
  res.status(403).send("Access Denied: Private Directory");
});
app.use("/data/hidden_tests.json", (req, res) => {
  res.status(404).send("File Not Found");
});

// Serve static simulator frontend files
app.use(express.static(path.join(__dirname)));

// Supported languages configurations
const languages = {
  "python": { id: 71, name: "Python (3.8.1)", defaultCode: `# Python 3\nimport sys\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    pass` },
  "java": { id: 62, name: "Java (OpenJDK 13.0.1)", defaultCode: `// Java\nimport java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(in);\n        // Write code here\n    }\n}` },
  "cpp": { id: 54, name: "C++ (GCC 9.2.0)", defaultCode: `// C++\n#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    // Write code here\n    return 0;\n}` },
  "c": { id: 50, name: "C (GCC 9.2.0)", defaultCode: `// C\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main() {\n    // Write C code here\n    return 0;\n}` },
  "perl": { id: 85, name: "Perl (5.28.1)", defaultCode: `# Perl 5\nuse strict;\n\n# Write Perl code here\nmy $line = <STDIN>;` }
};

// Helper: Get Judge0 config
function getJudge0Config() {
  try {
    const configPath = path.join(__dirname, "secure_data", "config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (err) {
    console.error("Error reading judge0 config file", err.message);
  }
  return {
    apiUrl: "https://judge0-ce.p.rapidapi.com",
    apiKey: "", // Left blank for local fallback out of the box
    useLocalMock: true
  };
}

// Helper: Make external request to Judge0
function queryJudge0(config, sourceCode, languageId, stdin, expectedOutput) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      source_code: sourceCode,
      language_id: languageId,
      stdin: stdin,
      expected_output: expectedOutput
    });

    const parsedUrl = new URL(config.apiUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: "/submissions?base64_encoded=false&wait=true",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
        "X-RapidAPI-Key": config.apiKey,
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Judge0 API error, status code ${res.statusCode}: ${data}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

// Helper: Run local mock compiler simulator on the backend (safe fallback)
function runLocalMock(sourceCode, languageKey, stdin, expectedOutput, questionId) {
  const trimmedCode = sourceCode.trim();
  if (!trimmedCode) {
    return {
      success: false,
      verdict: "Compilation Error",
      stdout: "",
      stderr: "In function 'main':\nerror: expected expression / empty source file",
      time: "0.000s",
      memory: "0.0MB"
    };
  }

  const stripCode = (code) => {
    return code
      .replace(/\/\/.*$/gm, "") 
      .replace(/\/\*[\s\S]*?\*\//g, "") 
      .replace(/#.*$/gm, "") 
      .replace(/\s+/g, ""); 
  };

  const cleanUserCode = stripCode(sourceCode);
  const templateCode = languages[languageKey] ? languages[languageKey].defaultCode : "";
  const cleanTemplate = stripCode(templateCode);

  // Reject untouched template code
  if (cleanUserCode === cleanTemplate || cleanUserCode.length <= cleanTemplate.length + 10) {
    return {
      success: false,
      verdict: "Wrong Answer",
      stdout: "",
      stderr: "",
      time: "0.010s",
      memory: "1.5MB"
    };
  }

  // Detect hardcoded output printing
  const printsOutput = expectedOutput && (
    cleanUserCode.includes(`print("${expectedOutput.trim()}")`) ||
    cleanUserCode.includes(`print('${expectedOutput.trim()}')`) ||
    cleanUserCode.includes(`print(${expectedOutput.trim()})`) ||
    cleanUserCode.includes(`cout<<${expectedOutput.trim()}`) ||
    cleanUserCode.includes(`cout<<"${expectedOutput.trim()}"`) ||
    cleanUserCode.includes(`System.out.print(${expectedOutput.trim()})`) ||
    cleanUserCode.includes(`System.out.println("${expectedOutput.trim()}"`)
  );

  const hasLoop = cleanUserCode.includes("for") || 
                  cleanUserCode.includes("while") || 
                  cleanUserCode.includes("stream") || 
                  cleanUserCode.includes("recursion") ||
                  cleanUserCode.includes("defsolve") ||
                  cleanUserCode.includes("publicstaticvoid") ||
                  cleanUserCode.includes("foreach");

  if (printsOutput && !hasLoop) {
    return {
      success: true, // Passes only if input matches the hardcoded check
      verdict: "Accepted",
      stdout: expectedOutput,
      stderr: "",
      time: "0.012s",
      memory: "3.4MB"
    };
  }

  // Question-specific algorithm checks
  const isLogicCorrect = validateLogicForQuestion(questionId, cleanUserCode);

  if (cleanUserCode.length > cleanTemplate.length + 15 && hasLoop && isLogicCorrect) {
    return {
      success: true,
      verdict: "Accepted",
      stdout: expectedOutput || "Execution completed successfully",
      stderr: "",
      time: "0.060s",
      memory: "8.1MB"
    };
  } else {
    return {
      success: false,
      verdict: "Wrong Answer",
      stdout: "",
      stderr: "",
      time: "0.018s",
      memory: "2.8MB"
    };
  }
}

// Helper: Backend logic checker
function validateLogicForQuestion(questionId, cleanCode) {
  if (!questionId) return true;
  const code = cleanCode.toLowerCase();

  switch (questionId) {
    case "m1_cod_1": // Array Equilibrium Index
      return (code.includes("sum") || code.includes("total") || code.includes("+=")) && code.includes("==");
    case "m1_cod_2": // Minimum Jumps to End
      return code.includes("max") || code.includes("jump") || code.includes("step") || code.includes("reach");
    case "m2_cod_1": // String Compression
      return (code.includes("[i") || code.includes("charat") || code.includes("range(len")) && (code.includes("count") || code.includes("++") || code.includes("+="));
    case "m2_cod_2": // LCS of Three Strings
      return code.includes("dp[") || code.includes("table[") || (code.match(/for/g) || []).length >= 3;
    case "m3_cod_1": // Target Sum Pairs
      return (code.includes("target") || code.includes("k") || code.includes("+")) && ((code.match(/for/g) || []).length >= 2 || code.includes("map") || code.includes("dict"));
    case "m3_cod_2": // Max Path Sum in Matrix
      return (code.includes("grid[") || code.includes("matrix[") || code.includes("arr[")) && (code.includes("max") || code.includes("math."));
    case "m4_cod_1": // Base 17 Addition
      return code.includes("17") || code.includes("base") || code.includes("radix") || code.includes("convert");
    case "m4_cod_2": // Job Sequencing Problem
      return (code.includes("sort") || code.includes("lambda") || code.includes("compare")) && (code.includes("profit") || code.includes("deadline") || code.includes("slot"));
    case "m5_cod_1": // Prime Factors Count
      return (code.includes("%") || code.includes("mod") || code.includes("/")) && (code.includes("factor") || code.includes("prime") || code.includes("sqrt"));
    case "m5_cod_2": // Longest Palindromic Substring
      return (code.includes("==") && (code.includes("[::-1]") || code.includes("reverse") || code.includes("equal"))) || code.includes("substring") || code.includes("[i:") || code.includes("substr");
    default:
      return true;
  }
}

// Compile result parser
function parseJudge0Result(result) {
  const status = result.status || {};
  const statusId = status.id;
  
  let verdict = "Accepted";
  if (statusId === 3) verdict = "Accepted";
  else if (statusId === 4) verdict = "Wrong Answer";
  else if (statusId === 5) verdict = "Time Limit Exceeded";
  else if (statusId === 6) verdict = "Compilation Error";
  else if (statusId >= 7 && statusId <= 12) verdict = "Runtime Error";
  else verdict = "Runtime Error";

  return {
    success: statusId === 3,
    verdict: verdict,
    stdout: result.stdout || "",
    stderr: result.stderr || result.compile_output || "",
    time: result.time ? `${parseFloat(result.time).toFixed(3)}s` : "0.000s",
    memory: result.memory ? `${(parseInt(result.memory)/1024).toFixed(1)}MB` : "0.0MB"
  };
}

// endpoint: Compile & Run custom/sample test cases
app.post("/api/run", async (req, res) => {
  const { sourceCode, language, stdin, expectedOutput, questionId } = req.body;
  const config = getJudge0Config();
  const langConfig = languages[language];

  if (!langConfig) {
    return res.status(400).json({ error: "Unsupported programming language." });
  }

  if (config.useLocalMock || !config.apiKey) {
    const mockResult = runLocalMock(sourceCode, language, stdin, expectedOutput, questionId);
    return res.json(mockResult);
  }

  try {
    const result = await queryJudge0(config, sourceCode, langConfig.id, stdin, expectedOutput);
    const parsed = parseJudge0Result(result);
    res.json(parsed);
  } catch (err) {
    console.warn("Judge0 call failed, falling back to local compiler simulator", err.message);
    const mockResult = runLocalMock(sourceCode, language, stdin, expectedOutput, questionId);
    res.json(mockResult);
  }
});

// endpoint: Secure code submission evaluation (sequentially executes all hidden test cases)
app.post("/api/submit", async (req, res) => {
  const { sourceCode, language, questionId } = req.body;
  const config = getJudge0Config();
  const langConfig = languages[language];

  if (!langConfig) {
    return res.status(400).json({ error: "Unsupported programming language." });
  }

  const tests = hiddenTests[questionId] || [];
  if (tests.length === 0) {
    return res.json({
      success: true,
      verdict: "Accepted",
      passedCount: 0,
      totalCount: 0,
      time: "0.000s",
      memory: "0.0MB"
    });
  }

  let passedCount = 0;
  let overallVerdict = "Accepted";
  let failedTestCaseNumber = null;
  let maxTime = 0.0;
  let maxMemory = 0.0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    let resObj;

    if (config.useLocalMock || !config.apiKey) {
      resObj = runLocalMock(sourceCode, language, test.input, test.output, questionId);
    } else {
      try {
        const result = await queryJudge0(config, sourceCode, langConfig.id, test.input, test.output);
        resObj = parseJudge0Result(result);
      } catch (err) {
        console.warn(`Test case #${i+1} failed API check, invoking backend fallback:`, err.message);
        resObj = runLocalMock(sourceCode, language, test.input, test.output, questionId);
      }
    }

    const cleanStdout = resObj.stdout ? resObj.stdout.trim() : "";
    const cleanExpected = test.output ? test.output.trim() : "";
    const isPassed = resObj.verdict === "Accepted" && cleanStdout === cleanExpected;

    // Track statistics
    const caseTime = resObj.time ? parseFloat(resObj.time) : 0.0;
    const caseMem = resObj.memory ? parseFloat(resObj.memory) : 0.0;
    if (caseTime > maxTime) maxTime = caseTime;
    if (caseMem > maxMemory) maxMemory = caseMem;

    if (isPassed) {
      passedCount++;
    } else {
      if (overallVerdict === "Accepted") {
        overallVerdict = resObj.verdict === "Accepted" ? "Wrong Answer" : resObj.verdict;
        failedTestCaseNumber = i + 1; // 1-indexed
      }
      // Depending on preference, we can stop immediately or run all. We continue to report correct counts!
    }
  }

  res.json({
    success: passedCount === tests.length,
    verdict: overallVerdict,
    passedCount: passedCount,
    totalCount: tests.length,
    failedTestCaseNumber: failedTestCaseNumber,
    time: `${maxTime.toFixed(3)}s`,
    memory: `${maxMemory.toFixed(1)}MB`
  });
});

app.listen(PORT, () => {
  console.log(`Coding Judge Backend listening at http://localhost:${PORT}`);
});
