const INSTALLED = Symbol.for("aipavilion.session-lifecycle.installed");
const ORIGINAL_FETCH = Symbol.for("aipavilion.session-lifecycle.fetch");

function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`aipavilion:${name}`, { detail }));
}

function ensureLiveRegion() {
    let region = document.getElementById("global-system-status");
    if (!region) {
        region = document.createElement("div");
        region.id = "global-system-status";
        region.className = "sr-only";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        region.setAttribute("aria-atomic", "true");
        document.body.append(region);
    }
    return region;
}

function announce(message, urgent = false) {
    const region = ensureLiveRegion();
    region.setAttribute("role", urgent ? "alert" : "status");
    region.setAttribute("aria-live", urgent ? "assertive" : "polite");
    region.textContent = "";
    window.setTimeout(() => {
        region.textContent = message;
    }, 10);
}

export function installSessionLifecycle() {
    if (typeof window === "undefined" || window[INSTALLED]) {
        return;
    }
    window[INSTALLED] = true;
    window.addEventListener("offline", () => {
        announce("The network connection is unavailable.", true);
        dispatch("offline");
    });
    window.addEventListener("online", () => {
        announce("The network connection has been restored.");
        dispatch("online");
    });
    const original = window.fetch.bind(window);
    window[ORIGINAL_FETCH] = original;
    window.fetch = async (...args) => {
        try {
            const response = await original(...args);
            const requestId =
                response.headers.get("x-request-id") ||
                response.headers.get("x-amzn-requestid");
            if (response.status === 401) {
                announce(
                    "Your session has expired. Sign in again to continue.",
                    true,
                );
                dispatch("session-expired", { requestId });
            }
            if (response.status === 429) {
                announce("Too many requests. Please try again shortly.", true);
                dispatch("rate-limited", { requestId });
            }
            if ([502, 503, 504].includes(response.status)) {
                announce("The service is temporarily unavailable.", true);
                dispatch("service-unavailable", { requestId });
            }
            return response;
        } catch (error) {
            if (!navigator.onLine) {
                announce("The network connection is unavailable.", true);
                dispatch("offline");
            }
            throw error;
        }
    };
}

export { announce };
