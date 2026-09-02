import assert from "node:assert/strict";
import { describe, it } from "node:test";

const API_URL = process.env.TEST_API_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Response may not contain JSON.
  }

  return {
    status: response.status,
    data
  };
}

describe("Pet Store API", () => {
  it("health endpoint should work", async () => {
    const result = await request("/api/health");

    assert.equal(result.status, 200);
    assert.equal(result.data?.ok, true);
  });

  it("owner status endpoint should work", async () => {
    const result = await request("/api/owner/status");

    assert.ok(
      result.status === 200 || result.status === 500,
      `Unexpected status: ${result.status}`
    );
  });

  it("pets endpoint should return a response", async () => {
    const result = await request("/api/pets");

    assert.ok(
      result.status >= 200 && result.status < 500,
      `Unexpected status: ${result.status}`
    );
  });

  it("inquiry endpoint should reject an incomplete request", async () => {
    const result = await request("/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.ok(
      result.status >= 400 && result.status < 500,
      `Expected a validation error, received ${result.status}`
    );
  });

  it("order endpoint should reject an incomplete request", async () => {
    const result = await request("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.ok(
      result.status >= 400 && result.status < 500,
      `Expected a validation error, received ${result.status}`
    );
  });
});
