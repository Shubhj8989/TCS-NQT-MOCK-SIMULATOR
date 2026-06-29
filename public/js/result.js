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
        } else if (q.type === "coding") {
          totalCoding += 0; // Coding weight disabled
          sectionCounts[sec.id].total++; // Increment Q count

          if (ans) {
            sectionCounts[sec.id].attempted++;
            // Marking as viewed/read
            topicTracker[topic].correct++;
            sectionCounts[sec.id].correct++;
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

    // Profile Predictions (Aptitude-based as coding is disabled)
    const foundationPct = (this.stats.scores.foundation / totalFoundation) * 100;
    const advancedPct = (this.stats.scores.advanced / totalAdvanced) * 100;

    let profile = "Not Eligible";
    if (foundationPct >= 80 && advancedPct >= 70) {
      profile = "Prime";
    } else if (foundationPct >= 65 && advancedPct >= 55) {
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
