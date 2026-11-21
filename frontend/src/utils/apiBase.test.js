import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseApiBase } from "./apiBase.js";

test("keeps a plain origin unchanged", () => {
  assert.equal(normaliseApiBase("https://voltix-store.duckdns.org"), "https://voltix-store.duckdns.org");
  assert.equal(normaliseApiBase("http://localhost:5000"), "http://localhost:5000");
});

test("removes one or more trailing slashes", () => {
  assert.equal(normaliseApiBase("https://example.com///"), "https://example.com");
  assert.equal(normaliseApiBase(" https://example.com/ "), "https://example.com");
});

test("removes an accidental /api suffix so /api/api never happens", () => {
  assert.equal(normaliseApiBase("https://example.com/api"), "https://example.com");
  assert.equal(normaliseApiBase("https://example.com/api/"), "https://example.com");
  assert.equal(normaliseApiBase("https://example.com/api//"), "https://example.com");
});

test("does not touch a path that only ends in api as part of a longer word", () => {
  assert.equal(normaliseApiBase("https://example.com/myapi"), "https://example.com/myapi");
});

test("returns an empty string for missing values", () => {
  assert.equal(normaliseApiBase(undefined), "");
  assert.equal(normaliseApiBase(null), "");
  assert.equal(normaliseApiBase(42), "");
});
