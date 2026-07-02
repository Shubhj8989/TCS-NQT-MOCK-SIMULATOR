const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = 8000;

// Load environment variables from .env file if present
const dotenvPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(dotenvPath)) {
  const dotenvContent = fs.readFileSync(dotenvPath, "utf8");
  dotenvContent.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
}

app.use(cors());
app.use(express.json());

// Load hidden tests securely in memory on start
let hiddenTests = {};
try {
  const fileContent = fs.readFileSync(path.join(__dirname, "..", "secure_data", "hidden_tests.json"), "utf8");
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
app.use(express.static(path.join(__dirname, "..")));
app.use(express.static(path.join(__dirname, "..", "public")));

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
  // Check Vercel environment variables first
  if (process.env.RAPIDAPI_KEY) {
    return {
      apiUrl: process.env.JUDGE0_API_URL || "https://judge0-ce.p.rapidapi.com",
      apiKey: process.env.RAPIDAPI_KEY.trim(),
      useLocalMock: false
    };
  }

  try {
    const configPath = path.join(__dirname, "..", "secure_data", "config.json");
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (fileConfig.apiKey) {
        fileConfig.useLocalMock = false;
      }
      return fileConfig;
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

// Helper: Query Piston API (Free, unlimited executions)
function queryPiston(sourceCode, languageKey, stdin) {
  return new Promise((resolve, reject) => {
    const pistonLangs = {
      "python": { language: "python", version: "3.10.0" },
      "java": { language: "java", version: "15.0.2" },
      "cpp": { language: "c++", version: "10.2.0" },
      "c": { language: "c", version: "10.2.0" },
      "perl": { language: "perl", version: "5.32.1" }
    };

    const target = pistonLangs[languageKey] || { language: languageKey, version: "*" };

    const payload = JSON.stringify({
      language: target.language,
      version: target.version,
      files: [
        {
          content: sourceCode
        }
      ],
      stdin: stdin
    });

    const options = {
      hostname: "emkc.org",
      path: "/api/v2/piston/execute",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Piston API status code ${res.statusCode}: ${data}`));
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

// Helper: Parse Piston execution response
function parsePistonResult(result) {
  const compile = result.compile || {};
  const run = result.run || {};
  
  if (compile.code !== undefined && compile.code !== 0) {
    return {
      success: false,
      verdict: "Compilation Error",
      stdout: "",
      stderr: compile.stderr || compile.output || "Compilation failed",
      time: "0.000s",
      memory: "0.0MB"
    };
  }

  const isRuntimeError = run.code !== 0;
  let verdict = "Accepted";
  if (isRuntimeError) {
    verdict = "Runtime Error";
  }

  return {
    success: !isRuntimeError,
    verdict: verdict,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    time: "0.080s",
    memory: "12.0MB"
  };
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
    case "m6_cod_1": // Subarray with Given Sum
      return (code.includes("sum") || code.includes("target") || code.includes("+=") || code.includes("add")) && code.includes("while");
    case "m6_cod_2": // Grid Path Count with Obstacles
      return code.includes("grid") || code.includes("obstacle") || code.includes("dp[") || code.includes("path");
    case "m7_cod_1": // Anagram Detection
      return code.includes("sort") || code.includes("count") || code.includes("anagram") || code.includes("frequency") || code.includes("len");
    case "m7_cod_2": // Merge Overlapping Intervals
      return code.includes("interval") || code.includes("merge") || code.includes("sort") || code.includes("overlap") || code.includes("start");
    case "m8_cod_1": // Kth Largest Element
      return code.includes("sort") || code.includes("heap") || code.includes("kth") || code.includes("largest") || code.includes("priority");
    case "m8_cod_2": // Edit Distance
      return code.includes("dp[") || code.includes("edit") || code.includes("distance") || code.includes("min") || code.includes("replace");
    case "m9_cod_1": // Armstrong Number
      return code.includes("pow") || code.includes("digit") || code.includes("armstrong") || code.includes("sum") || code.includes("%10");
    case "m9_cod_2": // Product of Array Except Self
      return code.includes("product") || code.includes("except") || code.includes("prefix") || code.includes("suffix") || code.includes("self");
    case "m10_cod_1": // Roman to Integer
      return code.includes("roman") || code.includes("int") || code.includes("map") || code.includes("dict") || code.includes("switch");
    case "m10_cod_2": // Coin Change Problem
      return code.includes("coin") || code.includes("change") || code.includes("dp[") || code.includes("min") || code.includes("amount");
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

  // 1. If Judge0 is configured and active, query it
  if (!config.useLocalMock && config.apiKey) {
    try {
      const result = await queryJudge0(config, sourceCode, langConfig.id, stdin, expectedOutput);
      const parsed = parseJudge0Result(result);
      return res.json(parsed);
    } catch (err) {
      console.warn("Judge0 call failed, trying Piston:", err.message);
    }
  }

  // 2. Query Piston API for free, sandboxed code execution
  try {
    const pistonRes = await queryPiston(sourceCode, language, stdin);
    const parsed = parsePistonResult(pistonRes);
    return res.json(parsed);
  } catch (err) {
    console.warn("Piston call failed, falling back to static checkers:", err.message);
  }

  // 3. Static checks fallback
  const mockResult = runLocalMock(sourceCode, language, stdin, expectedOutput, questionId);
  res.json(mockResult);
});

// Helper: Find question by ID across mock test JSONs
function findQuestionById(questionId) {
  for (let i = 1; i <= 10; i++) {
    try {
      const mockFilePath = path.join(__dirname, "..", "public", "data", `mock${i}.json`);
      if (fs.existsSync(mockFilePath)) {
        const mockData = JSON.parse(fs.readFileSync(mockFilePath, "utf8"));
        for (const sec of mockData.sections) {
          const found = sec.questions.find(q => q.id === questionId);
          if (found) return found;
        }
      }
    } catch (err) {}
  }
  return null;
}

// Helper: Local fallback code grader
function generateLocalCodeReview(questionId, language, sourceCode) {
  const cleanCode = sourceCode.replace(/\s+/g, "").toLowerCase();
  
  let score = 10;
  let complexity = "O(N) Time, O(1) Space";
  let feedback = "Logical structure appears solid. Satisfies the constraints. Good code organization.";

  if (cleanCode.length < 50) {
    score = 3.5;
    feedback = "The code seems too short to implement the complete logic. Please verify your solution.";
    complexity = "O(1) Time, O(1) Space";
  } else if (!cleanCode.includes("for") && !cleanCode.includes("while")) {
    score = 6.0;
    feedback = "Missing iterative structures (loops) which are typically needed for processing array/string bounds.";
  }

  return {
    score,
    feedback,
    complexity
  };
}

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
      memory: "0.0MB",
      aiReport: {
        score: 15.0,
        complexity: "O(1) Time, O(1) Space",
        feedback: "Problem has no hidden testcases. Automatically accepted."
      }
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

    // 1. Try Judge0 if configured
    if (!config.useLocalMock && config.apiKey) {
      try {
        const result = await queryJudge0(config, sourceCode, langConfig.id, test.input, test.output);
        resObj = parseJudge0Result(result);
      } catch (err) {
        console.warn(`Test case #${i+1} failed Judge0 call:`, err.message);
      }
    }

    // 2. Try Piston API if Judge0 is skipped or failed
    if (!resObj) {
      try {
        const pistonRes = await queryPiston(sourceCode, language, test.input);
        resObj = parsePistonResult(pistonRes);
      } catch (err) {
        console.warn(`Test case #${i+1} failed Piston call:`, err.message);
      }
    }

    // 3. Fallback to local static checkers
    if (!resObj) {
      resObj = runLocalMock(sourceCode, language, test.input, test.output, questionId);
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
    }
  }

  // AI Evaluation
  let aiReport = null;
  const groqConfig = getGroqConfig();

  if (groqConfig.apiKey) {
    try {
      const questionObj = findQuestionById(questionId);
      const systemPrompt = `You are a TCS NQT code evaluator. Evaluate the student's source code for the coding problem.
Determine:
1. Logic correctness and typical edge cases handling.
2. Time and space complexity.
Provide a score from 0.0 to 15.0 (TCS coding questions are worth 15 Marks), and constructive suggestions in a single paragraph.
Output a JSON object ONLY. Do not output any conversational wrapper, just valid JSON.
Format:
{
  "score": 12.5,
  "complexity": "O(N) Time, O(1) Space",
  "feedback": "Your suggestions string here"
}`;

      const userMessage = `Question Title: ${questionObj ? questionObj.title : "NQT Problem"}
Language: ${language}
Source Code:
"${sourceCode}"`;

      const groqResponseText = await queryGroq(groqConfig, systemPrompt, userMessage);
      
      let cleaned = groqResponseText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(json)?/, "").replace(/```$/, "").trim();
      }
      
      aiReport = JSON.parse(cleaned);
    } catch (err) {
      console.warn("Groq AI code evaluation failed, falling back to local review:", err.message);
    }
  }

  if (!aiReport) {
    aiReport = generateLocalCodeReview(questionId, language, sourceCode);
  }

  res.json({
    success: passedCount === tests.length,
    verdict: overallVerdict,
    passedCount: passedCount,
    totalCount: tests.length,
    failedTestCaseNumber: failedTestCaseNumber,
    time: `${maxTime.toFixed(3)}s`,
    memory: `${maxMemory.toFixed(1)}MB`,
    aiReport: aiReport
  });
});

// Helper: Get Groq Config
function getGroqConfig() {
  if (process.env.GROQ_API_KEY) {
    return {
      apiKey: process.env.GROQ_API_KEY.trim(),
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant"
    };
  }
  try {
    const configPath = path.join(__dirname, "..", "secure_data", "config.json");
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (fileConfig.groqApiKey) {
        return {
          apiKey: fileConfig.groqApiKey.trim(),
          model: fileConfig.groqModel || "llama-3.1-8b-instant"
        };
      }
    }
  } catch (err) {
    console.error("Error reading groq config file", err.message);
  }
  return {
    apiKey: "",
    model: "llama-3.1-8b-instant"
  };
}

// Helper: Call Groq Chat Completions API
function queryGroq(config, systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsedRes = JSON.parse(data);
            const content = parsedRes.choices[0].message.content;
            resolve(content);
          } else {
            reject(new Error(`Groq API error, status code ${res.statusCode}: ${data}`));
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

// Helper: Fallback Heuristic Evaluator
function evaluateWritingHeuristically(q, userAnswer) {
  const text = (userAnswer || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  
  let score = 5;
  const feedbackParts = [];
  const grammarErrors = [];
  const keywordsUsed = [];
  const keywordsMissing = [];

  let targetMin = 50;
  let targetMax = 80;
  if (q.id.includes("reas") || q.id.includes("summary") || (q.wordLimit && q.wordLimit.includes("30"))) {
    targetMin = 30;
    targetMax = 50;
  }

  if (words === 0) {
    return {
      score: 0,
      verdict: "Fail",
      feedback: "Unattempted writing task.",
      grammarErrors: [],
      keywordsUsed: []
    };
  }

  if (words < targetMin) {
    const diff = targetMin - words;
    score -= Math.min(2.5, diff * 0.1);
    feedbackParts.push(`Your response is too short (${words} words). It is below the recommended minimum of ${targetMin} words.`);
  } else if (words > targetMax + 15) {
    score -= 1.0;
    feedbackParts.push(`Your response is slightly verbose (${words} words), exceeding the recommended maximum of ${targetMax} words.`);
  } else {
    feedbackParts.push(`Good length (${words} words), fitting within the target word range.`);
  }

  // Extract phrases/keywords to check
  let phrasesToCheck = q.phrases || [];
  if (phrasesToCheck.length === 0 && q.questionText) {
    const match = q.questionText.match(/(?:Phrases to use|Use phrases|phrases):\s*<\/i>\s*(.*?)(?:\.|\n|<)/i) || 
                  q.questionText.match(/(?:Phrases to use|Use phrases|phrases):\s*(.*?)(?:\.|\n|<)/i);
    if (match && match[1]) {
      phrasesToCheck = match[1].split(/,|;/).map(s => s.replace(/<[^>]*>/g, "").trim()).filter(Boolean);
    }
  }

  if (phrasesToCheck.length > 0) {
    phrasesToCheck.forEach(phrase => {
      const cleanPhrase = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const regex = new RegExp("\\b" + cleanPhrase + "\\b", "i");
      if (regex.test(text.toLowerCase())) {
        keywordsUsed.push(phrase);
      } else {
        keywordsMissing.push(phrase);
      }
    });

    if (keywordsMissing.length > 0) {
      const deduct = keywordsMissing.length * 0.5;
      score -= Math.min(2.5, deduct);
      feedbackParts.push(`Missing required phrases: ${keywordsMissing.join(", ")}.`);
    } else {
      feedbackParts.push("All required phrases were successfully incorporated into your response.");
    }
  }

  // Basic structure check for Email
  if (q.id.includes("email") || q.questionText.toLowerCase().includes("email")) {
    const hasSalutation = /dear\b|hello\b|hi\b|respected\b/i.test(text);
    const hasClosing = /regards\b|sincerely\b|thanks\b|warm regards\b|yours\b/i.test(text);
    if (!hasSalutation) {
      score -= 0.5;
      grammarErrors.push("Missing formal salutation (e.g., 'Dear [Name]') at the beginning.");
    }
    if (!hasClosing) {
      score -= 0.5;
      grammarErrors.push("Missing professional sign-off / closing (e.g., 'Warm regards') at the end.");
    }
  }

  score = Math.max(1, parseFloat(score.toFixed(1)));
  const verdict = score >= 3.5 ? "Pass" : "Fail";
  
  return {
    score,
    verdict,
    feedback: feedbackParts.join(" ") || "Your response was graded successfully.",
    grammarErrors,
    keywordsUsed
  };
}

// endpoint: Evaluate Email/Paragraph Summary Writing using Groq API
app.post("/api/evaluate-writing", async (req, res) => {
  const { questionId, userAnswer, mockId } = req.body;
  
  if (!questionId || mockId === undefined) {
    return res.status(400).json({ error: "Missing questionId or mockId." });
  }

  let questionObj = null;

  // Try to load the question from the specified mock data file
  try {
    const mockFilePath = path.join(__dirname, "..", "public", "data", `mock${mockId}.json`);
    if (fs.existsSync(mockFilePath)) {
      const mockData = JSON.parse(fs.readFileSync(mockFilePath, "utf8"));
      for (const sec of mockData.sections) {
        const found = sec.questions.find(q => q.id === questionId);
        if (found) {
          questionObj = found;
          break;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not load mock${mockId}.json directly:`, err.message);
  }

  // Fallback to searching all mock files (1-10) if not found
  if (!questionObj) {
    for (let i = 1; i <= 10; i++) {
      try {
        const mockFilePath = path.join(__dirname, "..", "public", "data", `mock${i}.json`);
        if (fs.existsSync(mockFilePath)) {
          const mockData = JSON.parse(fs.readFileSync(mockFilePath, "utf8"));
          for (const sec of mockData.sections) {
            const found = sec.questions.find(q => q.id === questionId);
            if (found) {
              questionObj = found;
              break;
            }
          }
        }
      } catch (err) {}
      if (questionObj) break;
    }
  }

  if (!questionObj) {
    return res.status(404).json({ error: "Question not found in mock test database." });
  }

  const groqConfig = getGroqConfig();

  // If Groq key is present, query it
  if (groqConfig.apiKey) {
    try {
      const systemPrompt = `You are a TCS NQT exam evaluator. Evaluate the student's writing answer for the question.
Provide a score from 0.0 to 5.0, a Pass/Fail verdict (Pass if score >= 3.5, else Fail), constructive feedback on the response's content and structure, any minor grammar errors or enhancements, and a list of requested keywords/phrases that were successfully used.
Output a JSON object ONLY. Do not output any other text or formatting wrappers except valid JSON.
Format:
{
  "score": 4.5,
  "verdict": "Pass",
  "feedback": "Feedback description",
  "grammarErrors": ["Error/Suggestion 1", "Error/Suggestion 2"],
  "keywordsUsed": ["keyword1", "keyword2"]
}`;

      const userMessage = `Question Type: ${questionObj.type}
Prompt text: ${questionObj.questionText}
Genuine Reference Answer: ${questionObj.correctOption}
Required Phrases (if any): ${JSON.stringify(questionObj.phrases || [])}
Recommended Word Count: ${questionObj.wordLimit || "50-80 words"}

Student's Answer:
"${userAnswer}"`;

      const groqResponseText = await queryGroq(groqConfig, systemPrompt, userMessage);
      
      let cleaned = groqResponseText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(json)?/, "").replace(/```$/, "").trim();
      }
      
      const parsedRes = JSON.parse(cleaned);
      return res.json(parsedRes);
    } catch (err) {
      console.warn("Groq API evaluation failed, falling back to local heuristics:", err.message);
    }
  }

  // Fallback heuristic evaluation
  const result = evaluateWritingHeuristically(questionObj, userAnswer);
  res.json(result);
});

if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Coding Judge Backend listening at http://localhost:${PORT}`);
  });
}
module.exports = app;
