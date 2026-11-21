import { normaliseApiBase } from "../utils/apiBase";

const configuredApiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Every request is built as `${API_BASE_URL}/api/...`, so the base must be the bare origin.
// VITE_API_URL previously ended in "/api" on the deployed build, which produced
// https://host/api/api/products and only worked because nginx stripped one prefix.
// normaliseApiBase() removes that suffix so the mistake can never come back.
export const API_BASE_URL = normaliseApiBase(configuredApiUrl);
