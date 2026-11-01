import assert from "node:assert";
import { diffWordsWithSpace } from "diff";

console.log("Running Word-Level Diff Algorithm & Transformation Unit Tests...");

// 1. Basic insertion, deletion, and unchanged word extraction
const draft1 = "The platform processed $50M in annual transactions across 12 regions.";
const revised1 = "The platform processed $42M in annual transactions across 15 regions.";

const changes1 = diffWordsWithSpace(draft1, revised1);
let addedWords1 = 0;
let removedWords1 = 0;
let unchangedWords1 = 0;

changes1.forEach((part) => {
  const wordCount = (part.value.match(/\S+/g) || []).length;
  if (part.added) {
    addedWords1 += wordCount;
  } else if (part.removed) {
    removedWords1 += wordCount;
  } else {
    unchangedWords1 += wordCount;
  }
});

assert.strictEqual(removedWords1, 2, "Should detect 2 removed words (50M, 12)");
assert.strictEqual(addedWords1, 2, "Should detect 2 added words (42M, 15)");
assert.strictEqual(unchangedWords1, 9, "Should detect 9 unchanged words (The, platform, processed, $, in, annual, transactions, across, regions.)");
console.log("✓ Test 1: Precise word-level diff identifies inserted, deleted, and unchanged tokens ($50M -> $42M, 12 -> 15)");

// 2. Multiline, whitespace, and newline preservation
const multilineDraft = "Line 1: Summary report.\n\nLine 2: Revenue rose by 25%.\nLine 3: Conclusion.";
const multilineRevised = "Line 1: Summary report.\n\nLine 2: Revenue rose by 18%.\nLine 3: Conclusion.";

const changes2 = diffWordsWithSpace(multilineDraft, multilineRevised);
const reconstructed = changes2.map((p) => (p.removed ? "" : p.value)).join("");
assert.strictEqual(reconstructed, multilineRevised, "Revised text must match exactly when removals are omitted");

const reconstructedDraft = changes2.map((p) => (p.added ? "" : p.value)).join("");
assert.strictEqual(reconstructedDraft, multilineDraft, "Original text must match exactly when additions are omitted");
console.log("✓ Test 2: Multiline structure, newlines, and whitespace preserved across diff panes");

// 3. Punctuation and symbol handling (citations [1], parentheses, currency)
const draftPunct = "According to SEC Form 10-K [1], operating profit was $120.5M (up 14%).";
const revisedPunct = "According to SEC Form 10-K [1][2], operating profit was $115.2M (up 8.5%).";

const changes3 = diffWordsWithSpace(draftPunct, revisedPunct);
assert.ok(changes3.some((p) => p.removed && p.value === "120"), "Should track excised number 120");
assert.ok(changes3.some((p) => p.added && p.value === "115"), "Should track added grounded number 115");
assert.ok(changes3.some((p) => p.added && p.value.includes("[2]")), "Should track appended citation token [2]");
console.log("✓ Test 3: Citation brackets, parentheses, and numeric tokens diffed cleanly with word boundaries");

// 4. Complete excision (Hallucination removal without replacement)
const draftExcision = "CiteLock verifies citations. It was founded in 1982 by Alan Turing. It prevents hallucinations.";
const revisedExcision = "CiteLock verifies citations. It prevents hallucinations.";

const changes4 = diffWordsWithSpace(draftExcision, revisedExcision);
const removedPart = changes4.find((p) => p.removed);
assert.ok(removedPart, "Removed hallucinated clause must be identified");
assert.ok(removedPart.value.includes("founded in 1982 by Alan Turing"), "Excised clause accurately identified");
console.log("✓ Test 4: Pure factual excision without replacement captured accurately");

// 5. Identical strings (Zero delta)
const identicalText = "The quarterly compliance report is fully verified.";
const changes5 = diffWordsWithSpace(identicalText, identicalText);
assert.strictEqual(changes5.length, 1, "Identical strings produce single unchanged Change");
assert.strictEqual(changes5[0].added, false);
assert.strictEqual(changes5[0].removed, false);
assert.strictEqual(changes5[0].value, identicalText);
console.log("✓ Test 5: Identical text triggers zero-modification fast-path");

console.log("\nALL 5 WORD-DIFF UNIT TESTS PASSED!");
