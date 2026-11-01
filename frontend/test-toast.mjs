import assert from "node:assert";

// Implementation of sanitizeErrorMessage under test
function sanitizeErrorMessage(err, defaultMessage = "An unexpected error occurred. Please try again.") {
  if (!err) return defaultMessage;

  let rawMessage = "";
  if (typeof err === "string") {
    rawMessage = err;
  } else if (err instanceof Error) {
    rawMessage = err.message;
  } else if (typeof err === "object" && err !== null && "message" in err) {
    rawMessage = String(err.message);
  } else {
    return defaultMessage;
  }

  // Strip stack traces or multi-line python tracebacks
  if (
    rawMessage.includes("Traceback (most recent call last)") ||
    rawMessage.includes("File \"") ||
    rawMessage.includes("at Object.") ||
    rawMessage.includes("at async")
  ) {
    return defaultMessage;
  }

  // Strip database connection strings, passwords, or raw SQL queries
  if (
    /password|psycopg|sqlalchemy|select\s+.*from|pgvector|insert\s+into|neon/i.test(
      rawMessage
    )
  ) {
    return "A database operation failed. Please try again later.";
  }

  // Strip Internal Server Error 500 dumps
  if (
    rawMessage.startsWith("API Error 500") ||
    rawMessage.includes("Internal Server Error")
  ) {
    return "The verification service encountered an internal issue. Please try again.";
  }

  // Clean Firebase auth error codes into helpful user guidance
  if (
    rawMessage.includes("auth/invalid-credential") ||
    rawMessage.includes("auth/invalid-login-credentials")
  ) {
    return "Invalid email or password. Please verify your credentials.";
  }
  if (rawMessage.includes("auth/user-not-found")) {
    return "No account found with this email address.";
  }
  if (rawMessage.includes("auth/wrong-password")) {
    return "Incorrect password. Please try again.";
  }
  if (rawMessage.includes("auth/email-already-in-use")) {
    return "This email is already registered. Please sign in.";
  }
  if (rawMessage.includes("auth/popup-closed-by-user")) {
    return "Authentication was cancelled by the user.";
  }
  if (rawMessage.includes("auth/network-request-failed")) {
    return "Network error. Please check your internet connection.";
  }
  if (rawMessage.includes("auth/too-many-requests")) {
    return "Too many attempts. Please wait a few moments before trying again.";
  }

  // If prefixed with API Error 400/403/404/422, extract clean detail
  const apiErrorMatch = rawMessage.match(/^API Error \d+:\s*(.*)$/);
  if (apiErrorMatch && apiErrorMatch[1]) {
    const detail = apiErrorMatch[1].trim();
    if (detail.startsWith("{") || detail.startsWith("[")) {
      try {
        const parsed = JSON.parse(detail);
        if (typeof parsed === "string") return parsed;
        if (parsed.detail && typeof parsed.detail === "string") return parsed.detail;
        if (Array.isArray(parsed) && parsed[0]?.msg) return parsed[0].msg;
      } catch {
        return defaultMessage;
      }
    }
    return detail.length > 200 ? `${detail.slice(0, 197)}...` : detail;
  }

  // Bound message length to prevent oversized UI toasts
  if (rawMessage.length > 250) {
    return `${rawMessage.slice(0, 247)}...`;
  }

  return rawMessage;
}

// TEST SUITE
console.log("Running Toast Sanitize Unit Tests...");

// 1. Python traceback leak
const tracebackErr = new Error(`Traceback (most recent call last): File "/app/orchestrator.py", line 42, in run_claim_audit: KeyError: 'claim'`);
assert.strictEqual(
  sanitizeErrorMessage(tracebackErr),
  "An unexpected error occurred. Please try again.",
  "Test 1 failed: Traceback leaked"
);
console.log("✓ Test 1: Python traceback sanitized");

// 2. Database & password leak
const dbErr = "OperationalError: password authentication failed for user citelock at postgres://neon.tech:5432";
assert.strictEqual(
  sanitizeErrorMessage(dbErr),
  "A database operation failed. Please try again later.",
  "Test 2 failed: DB credential leaked"
);
console.log("✓ Test 2: Database credential and connection string sanitized");

// 3. Raw SQL leak
const sqlErr = "Error: SELECT * FROM chunks WHERE pgvector_distance < 0.5 failed";
assert.strictEqual(
  sanitizeErrorMessage(sqlErr),
  "A database operation failed. Please try again later.",
  "Test 3 failed: SQL leak"
);
console.log("✓ Test 3: SQL query leak sanitized");

// 4. 500 Internal Server Error
const internalErr = "API Error 500: Internal Server Error occurred in LLM Judge backend";
assert.strictEqual(
  sanitizeErrorMessage(internalErr),
  "The verification service encountered an internal issue. Please try again.",
  "Test 4 failed: 500 error leak"
);
console.log("✓ Test 4: 500 internal server error sanitized");

// 5. Firebase auth error codes
assert.strictEqual(
  sanitizeErrorMessage("Firebase: Error (auth/invalid-credential)."),
  "Invalid email or password. Please verify your credentials."
);
assert.strictEqual(
  sanitizeErrorMessage("Firebase: Error (auth/user-not-found)."),
  "No account found with this email address."
);
assert.strictEqual(
  sanitizeErrorMessage("Firebase: Error (auth/too-many-requests)."),
  "Too many attempts. Please wait a few moments before trying again."
);
console.log("✓ Test 5: Firebase authentication error codes converted to friendly messages");

// 6. API Error 400 with JSON detail
const apiJsonErr = 'API Error 400: {"detail": "Workspace name already exists in tenant scope"}';
assert.strictEqual(
  sanitizeErrorMessage(apiJsonErr),
  "Workspace name already exists in tenant scope",
  "Test 6 failed: JSON detail parsing"
);
console.log("✓ Test 6: FastAPI 400 JSON detail extracted cleanly");

// 7. Normal human message preserved
const normalErr = "Network connection timed out while uploading document.";
assert.strictEqual(
  sanitizeErrorMessage(normalErr),
  "Network connection timed out while uploading document."
);
console.log("✓ Test 7: Normal error message preserved");

console.log("\nALL 7 TOAST SANITIZATION TESTS PASSED!");

