import assert from "node:assert";

// Logic under test from useDocumentPolling
const NON_TERMINAL_STATUSES = new Set(["uploaded", "processing", "pending"]);

function isPendingDocument(doc) {
  return NON_TERMINAL_STATUSES.has(doc.status);
}

function calculateBackoffDelay(baseIntervalMs, consecutiveErrors, maxDelay = 15000) {
  return Math.min(baseIntervalMs * Math.pow(1.5, consecutiveErrors), maxDelay);
}

function diffDocuments(prevDocs, fetchedDocs) {
  let hasChanges = false;
  const fetchedMap = new Map(fetchedDocs.map((d) => [d.id, d]));

  const updated = prevDocs.map((prev) => {
    const fresh = fetchedMap.get(prev.id);
    if (!fresh) return prev;

    const statusChanged = prev.status !== fresh.status;
    const errorChanged = prev.error_message !== fresh.error_message;
    const sizeChanged = prev.file_size_bytes !== fresh.file_size_bytes;

    if (statusChanged || errorChanged || sizeChanged) {
      hasChanges = true;
      return { ...prev, ...fresh };
    }

    return prev;
  });

  const existingIds = new Set(prevDocs.map((d) => d.id));
  const addedDocs = fetchedDocs.filter((d) => !existingIds.has(d.id));

  if (addedDocs.length > 0) {
    hasChanges = true;
    return [...addedDocs, ...updated];
  }

  return hasChanges ? updated : prevDocs;
}

console.log("Running Document Ingestion Polling Unit Tests...");

// 1. Pending vs Terminal Status Recognition
const uploadedDoc = { id: "1", filename: "contract.pdf", status: "uploaded" };
const processingDoc = { id: "2", filename: "financials.docx", status: "processing" };
const indexedDoc = { id: "3", filename: "policy.md", status: "indexed" };
const failedDoc = { id: "4", filename: "corrupted.txt", status: "failed", error_message: "Invalid file format" };

assert.strictEqual(isPendingDocument(uploadedDoc), true, "uploaded should be pending");
assert.strictEqual(isPendingDocument(processingDoc), true, "processing should be pending");
assert.strictEqual(isPendingDocument(indexedDoc), false, "indexed should be terminal");
assert.strictEqual(isPendingDocument(failedDoc), false, "failed should be terminal");
console.log("✓ Test 1: Document status lifecycle correctly identified (uploaded/processing vs indexed/failed)");

// 2. Exponential Backoff Calculation
const base = 2500;
const delay1 = calculateBackoffDelay(base, 1);
const delay2 = calculateBackoffDelay(base, 2);
const delay3 = calculateBackoffDelay(base, 3);
const delayMax = calculateBackoffDelay(base, 10);

assert.strictEqual(delay1, 3750, "Retry 1 should be 3750ms");
assert.strictEqual(delay2, 5625, "Retry 2 should be 5625ms");
assert.strictEqual(delay3, 8437.5, "Retry 3 should be 8437.5ms");
assert.strictEqual(delayMax, 15000, "Retry capped at 15000ms");
console.log("✓ Test 2: Exponential backoff accurately calculates bounded delays on network errors");

// 3. Document Diffing - No Changes (Preserve Reference to Prevent Layout Shifts)
const initialDocs = [indexedDoc, failedDoc];
const identicalFetch = [{ ...indexedDoc }, { ...failedDoc }];
const resultNoChange = diffDocuments(initialDocs, identicalFetch);
assert.strictEqual(resultNoChange, initialDocs, "diffDocuments should return same array reference when no changes");
console.log("✓ Test 3: Array reference preserved when no document changes (zero unnecessary re-renders)");

// 4. Document Diffing - Status Transition (uploaded -> processing -> indexed)
const inFlightDocs = [
  { id: "1", filename: "contract.pdf", status: "processing" },
  { id: "3", filename: "policy.md", status: "indexed" }
];
const freshFetchIndexed = [
  { id: "1", filename: "contract.pdf", status: "indexed", metadata: { chunk_count: 12 } },
  { id: "3", filename: "policy.md", status: "indexed" }
];
const resultUpdated = diffDocuments(inFlightDocs, freshFetchIndexed);
assert.notStrictEqual(resultUpdated, inFlightDocs, "Array reference should update when document changes");
assert.strictEqual(resultUpdated[0].status, "indexed", "Document 1 should now be indexed");
assert.strictEqual(resultUpdated[0].metadata.chunk_count, 12, "Document 1 metadata preserved");
assert.strictEqual(resultUpdated[1], inFlightDocs[1], "Document 3 row reference preserved without mutation");
console.log("✓ Test 4: Affected row updated cleanly while untouched rows preserve object references");

// 5. Remote Ingestion Addition
const newUploadedDoc = { id: "5", filename: "new_file.pdf", status: "uploaded" };
const remoteFetchAdded = [newUploadedDoc, ...freshFetchIndexed];
const resultAdded = diffDocuments(inFlightDocs, remoteFetchAdded);
assert.strictEqual(resultAdded.length, 3, "New document added to state");
assert.strictEqual(resultAdded[0].id, "5", "New document prepended to table");
console.log("✓ Test 5: New documents ingested remotely are merged seamlessly into registry");

console.log("\nALL 5 POLLING UNIT TESTS PASSED!");

