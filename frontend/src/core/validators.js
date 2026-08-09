/**
 * Client-side validators for auth and contact forms.
 *
 * Card validation is intentionally absent — Stripe Elements handles it
 * and exposing our own card logic would create a false sense of coverage.
 */

export function validateEmail(email) {
    if (!email || typeof email !== "string") {
        return { ok: false, error: "Email is required" };
    }
    if (email.length > 254) {
        return { ok: false, error: "Email is too long" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: "Enter a valid email address" };
    }
    return { ok: true };
}

export function validatePassword(password) {
    if (!password) {
        return { ok: false, error: "Password is required" };
    }
    if (password.length < 12) {
        return { ok: false, error: "Password must be at least 12 characters" };
    }
    if (!/[a-z]/.test(password)) {
        return { ok: false, error: "Password must include a lowercase letter" };
    }
    if (!/[A-Z]/.test(password)) {
        return { ok: false, error: "Password must include an uppercase letter" };
    }
    if (!/\d/.test(password)) {
        return { ok: false, error: "Password must include a number" };
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return { ok: false, error: "Password must include a symbol" };
    }
    return { ok: true };
}

export function validateRequired(value, label = "This field") {
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (!trimmed) {
        return { ok: false, error: `${label} is required` };
    }
    return { ok: true };
}
