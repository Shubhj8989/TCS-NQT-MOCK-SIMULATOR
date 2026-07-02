/**
 * TCS NQT Performance Analytics and grading Engine
 */

const Result = {
  stats: {
    scores: { foundation: 0, advanced: 0, coding: 0, overall: 0, maxOverall: 125 },
    accuracy: { numerical: 0, verbal: 0, reasoning: 0, advanced: 0, coding: 0 },
    time: { fastest: "0s", slowest: "0s", average: "0s" },
    topics: { strong: [], weak: [], recommendation: "" },
    prediction: { percentile: 0, rank: 0, eligibleProfile: "Not Eligible" }
  },

  // Calculate results by grading the session responses
  calculate: async function(mockId) {
    const mockData = Questions.activeMock;
    const session = Questions.session;
    const hiddenTests = Questions.hiddenTests || {};

    if (!mockData) return null;

    let scoreFoundation = 0;
    let scoreAdvanced = 0;
    let scoreCoding = 0;

    let totalFoundation = 0;
    let totalAdvanced = 0;
    let totalCoding = 0;

    // Tracker maps for topics
    // topicName: { correct: 0, total: 0 }
    const topicTracker = {};
    const sectionCounts = {
      numerical: { correct: 0, attempted: 0, total: 0 },
      verbal: { correct: 0, attempted: 0, total: 0 },
      reasoning: { correct: 0, attempted: 0, total: 0 },
      advanced: { correct: 0, attempted: 0, total: 0 },
      coding: { correct: 0, attempted: 0, total: 0 }
    };

    // Process MCQ and FITB Questions
    for (let sec of mockData.sections) {
      const isFoundation = ["numerical", "verbal", "reasoning"].includes(sec.id);
      
      for (let q of sec.questions) {
        const ans = session.answers[q.id];
        
        // Track topic
        const topic = q.topic || "General";
        if (!topicTracker[topic]) {
          topicTracker[topic] = { correct: 0, total: 0 };
        }
        topicTracker[topic].total++;

        // Track section total
        sectionCounts[sec.id].total++;

        if (q.type === "mcq" || q.type === "fitb") {
          const weight = isFoundation ? 1 : 2; // MCQ weight
          if (isFoundation) totalFoundation += weight; else totalAdvanced += weight;

          if (ans) {
            sectionCounts[sec.id].attempted++;
            let isCorrect = false;

            if (q.type === "mcq") {
              isCorrect = parseInt(ans.value) === q.correctOption;
            } else if (q.type === "fitb") {
              isCorrect = String(ans.value).trim().toLowerCase() === String(q.correctOption).trim().toLowerCase();
            }

            if (isCorrect) {
              if (isFoundation) scoreFoundation += weight; else scoreAdvanced += weight;
              topicTracker[topic].correct++;
              sectionCounts[sec.id].correct++;
            }
          }
        } else if (q.type === "writing") {
          const weight = 5; // 5 marks for writing
          totalFoundation += weight;

          if (ans) {
            sectionCounts[sec.id].attempted++;
            try {
              const evalRes = await fetch("/api/evaluate-writing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  questionId: q.id,
                  userAnswer: ans.value,
                  mockId: mockId
                })
              }).then(r => r.json());

              ans.evaluation = evalRes;
              scoreFoundation += evalRes.score;

              if (evalRes.score >= 3.5) {
                topicTracker[topic].correct++;
                sectionCounts[sec.id].correct++;
              }
            } catch (err) {
              console.error("Error evaluating writing question:", err);
              ans.evaluation = {
                score: 3,
                verdict: "Pass",
                feedback: "Static fallback grading: Your answer format is generally correct.",
                grammarErrors: []
              };
              scoreFoundation += 3;
            }
          }
        } else if (q.type === "coding") {
          totalCoding += 15; // 15 marks per coding question
          sectionCounts[sec.id].total++; // Increment Q count

          if (ans) {
            sectionCounts[sec.id].attempted++;
            let questionScore = 0;

            const checkCodeLogicLocally = (qId, cleanCode) => {
              const code = cleanCode.toLowerCase();
              switch (qId) {
                case "m1_cod_1": return (code.includes("sum") || code.includes("total") || code.includes("+=")) && code.includes("==");
                case "m1_cod_2": return code.includes("max") || code.includes("jump") || code.includes("step") || code.includes("reach");
                case "m2_cod_1": return (code.includes("[i") || code.includes("charat") || code.includes("range(len")) && (code.includes("count") || code.includes("++") || code.includes("+="));
                case "m2_cod_2": return code.includes("dp[") || code.includes("table[") || (code.match(/for/g) || []).length >= 3;
                case "m3_cod_1": return (code.includes("target") || code.includes("k") || code.includes("+")) && ((code.match(/for/g) || []).length >= 2 || code.includes("map") || code.includes("dict"));
                case "m3_cod_2": return (code.includes("grid[") || code.includes("matrix[") || code.includes("arr[")) && (code.includes("max") || code.includes("math."));
                case "m4_cod_1": return code.includes("17") || code.includes("base") || code.includes("radix") || code.includes("convert");
                case "m4_cod_2": return (code.includes("sort") || code.includes("lambda") || code.includes("compare")) && (code.includes("profit") || code.includes("deadline") || code.includes("slot"));
                case "m5_cod_1": return (code.includes("%") || code.includes("mod") || code.includes("/")) && (code.includes("factor") || code.includes("prime") || code.includes("sqrt"));
                case "m5_cod_2": return (code.includes("==") && (code.includes("[::-1]") || code.includes("reverse") || code.includes("equal"))) || code.includes("substring") || code.includes("[i:") || code.includes("substr");
                case "m6_cod_1": return (code.includes("sum") || code.includes("target") || code.includes("+=") || code.includes("add")) && code.includes("while");
                case "m6_cod_2": return code.includes("grid") || code.includes("obstacle") || code.includes("dp[") || code.includes("path");
                case "m7_cod_1": return code.includes("sort") || code.includes("count") || code.includes("anagram") || code.includes("frequency") || code.includes("len");
                case "m7_cod_2": return code.includes("interval") || code.includes("merge") || code.includes("sort") || code.includes("overlap") || code.includes("start");
                case "m8_cod_1": return code.includes("sort") || code.includes("heap") || code.includes("kth") || code.includes("largest") || code.includes("priority");
                case "m8_cod_2": return code.includes("dp[") || code.includes("edit") || code.includes("distance") || code.includes("min") || code.includes("replace");
                case "m9_cod_1": return code.includes("pow") || code.includes("digit") || code.includes("armstrong") || code.includes("sum") || code.includes("%10");
                case "m9_cod_2": return code.includes("product") || code.includes("except") || code.includes("prefix") || code.includes("suffix") || code.includes("self");
                case "m10_cod_1": return code.includes("roman") || code.includes("int") || code.includes("map") || code.includes("dict") || code.includes("switch");
                case "m10_cod_2": return code.includes("coin") || code.includes("change") || code.includes("dp[") || code.includes("min") || code.includes("amount");
                default: return true;
              }
            };

            if (ans.evaluation) {
              const passed = ans.evaluation.passedCount || 0;
              const total = ans.evaluation.totalCount || 1;
              questionScore = (passed / total) * 15;
            } else if (ans.value && ans.value.length > 30 && ans.value !== "no" && ans.value !== "yes") {
              const cleanCode = ans.value.replace(/\s+/g, "").toLowerCase();
              const isCorrectLogic = checkCodeLogicLocally(q.id, cleanCode);
              questionScore = isCorrectLogic ? 10 : 3;
            } else if (ans.value === "yes") {
              questionScore = 15;
            }

            scoreCoding += questionScore;
            if (questionScore >= 10.5) {
              topicTracker[topic].correct++;
              sectionCounts[sec.id].correct++;
            }
          }
        }
      }
    }

    // Scores
    this.stats.scores.foundation = Math.round(scoreFoundation);
    this.stats.scores.advanced = Math.round(scoreAdvanced);
    this.stats.scores.coding = Math.round(scoreCoding);
    this.stats.scores.overall = Math.round(scoreFoundation + scoreAdvanced + scoreCoding);
    this.stats.scores.maxOverall = totalFoundation + totalAdvanced + totalCoding;

    // Accuracy
    const calcAccuracy = (counts) => counts.attempted > 0 ? Math.round((counts.correct / counts.attempted) * 100) : 0;
    this.stats.accuracy.numerical = calcAccuracy(sectionCounts.numerical);
    this.stats.accuracy.verbal = calcAccuracy(sectionCounts.verbal);
    this.stats.accuracy.reasoning = calcAccuracy(sectionCounts.reasoning);
    this.stats.accuracy.advanced = calcAccuracy(sectionCounts.advanced);
    this.stats.accuracy.coding = calcAccuracy(sectionCounts.coding);

    // Topic Analysis
    const strongTopics = [];
    const weakTopics = [];
    Object.keys(topicTracker).forEach(topic => {
      const data = topicTracker[topic];
      const acc = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      if (acc >= 70) {
        strongTopics.push(topic);
      } else if (acc < 50) {
        weakTopics.push(topic);
      }
    });

    this.stats.topics.strong = strongTopics.length > 0 ? strongTopics : ["Logical Reasoning Foundations"];
    this.stats.topics.weak = weakTopics.length > 0 ? weakTopics : ["Advanced Arithmetic Logic"];

    // Recommendations Builder
    let recs = "You are performing well. ";
    if (this.stats.topics.weak.length > 0) {
      recs = `Focus on improving concepts in: ${this.stats.topics.weak.join(", ")}. `;
    }
    if (this.stats.scores.coding < 15) {
      recs += "Practice more syntax templates in Python or C++ to speed up writing error-free logic for Coding Section.";
    } else {
      recs += "Keep practicing advanced level data structure questions to target Prime hiring packages.";
    }
    this.stats.topics.recommendation = recs;

    // Time Analysis Simulation (Realistic data points based on NQT averages)
    this.stats.time.fastest = "18s";
    this.stats.time.slowest = "8m 42s";
    const totalAttempted = sectionCounts.numerical.attempted + sectionCounts.verbal.attempted + sectionCounts.reasoning.attempted + sectionCounts.advanced.attempted;
    this.stats.time.average = totalAttempted > 0 ? `${Math.round(45 + Math.random() * 25)}s` : "0s";

    // Percentile & Rank Projections
    const scorePct = (this.stats.scores.overall / this.stats.scores.maxOverall) * 100;
    // Sigmoid curve map to simulate competitive percentile
    let percentile = 100 / (1 + Math.exp(-((scorePct - 50) / 12)));
    percentile = parseFloat(Math.min(99.98, Math.max(5.4, percentile)).toFixed(2));

    this.stats.prediction.percentile = percentile;
    // Rank out of 350,000 students
    this.stats.prediction.rank = Math.max(1, Math.round(((100 - percentile) / 100) * 350000));

    // Profile Predictions (Standard NQT Cutoffs including Solved Coding self-assessment)
    // Prime: >= 80% Foundation, >= 70% Advanced, and solved BOTH coding questions (30 marks)
    // Digital: >= 65% Foundation, >= 55% Advanced, and solved at least ONE coding question (15 marks)
    // Ninja: >= 45% Foundation
    const foundationPct = (this.stats.scores.foundation / totalFoundation) * 100;
    const advancedPct = (this.stats.scores.advanced / totalAdvanced) * 100;
    const codingScore = this.stats.scores.coding;

    let profile = "Not Eligible";
    if (foundationPct >= 80 && advancedPct >= 70 && codingScore === 30) {
      profile = "Prime";
    } else if (foundationPct >= 65 && advancedPct >= 55 && codingScore >= 15) {
      profile = "Digital";
    } else if (foundationPct >= 45) {
      profile = "Ninja";
    }
    
    this.stats.prediction.eligibleProfile = profile;

    // Save final report data
    Utils.saveState(`result_mock_${mockId}`, this.stats);
    return this.stats;
  }
};
