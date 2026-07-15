const scriptPromises = new Map();

export function loadExternalScript(
    src,
    { integrity, crossOrigin = "anonymous", attributes = {} } = {},
) {
    if (scriptPromises.has(src)) {
        return scriptPromises.get(src);
    }
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing?.dataset.loaded === "true") {
        return Promise.resolve(existing);
    }
    const promise = new Promise((resolve, reject) => {
        const script = existing || document.createElement("script");
        script.src = src;
        script.async = true;
        if (integrity) {
            script.integrity = integrity;
        }
        if (crossOrigin) {
            script.crossOrigin = crossOrigin;
        }
        for (const [key, value] of Object.entries(attributes)) {
            script.setAttribute(key, String(value));
        }
        script.addEventListener(
            "load",
            () => {
                script.dataset.loaded = "true";
                resolve(script);
            },
            { once: true },
        );
        script.addEventListener(
            "error",
            () => reject(new Error(`Unable to load required script: ${src}`)),
            { once: true },
        );
        if (!existing) {
            document.head.appendChild(script);
        }
    });
    scriptPromises.set(src, promise);
    return promise;
}

export async function loadStripeJs() {
    if (globalThis.Stripe) {
        return globalThis.Stripe;
    }
    await loadExternalScript("https://js.stripe.com/v3/", {
        crossOrigin: "anonymous",
    });
    if (!globalThis.Stripe) {
        throw new Error("Stripe.js did not initialize.");
    }
    return globalThis.Stripe;
}

export async function loadTurnstileJs() {
    if (globalThis.turnstile) {
        return globalThis.turnstile;
    }
    await loadExternalScript(
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
        { crossOrigin: "anonymous" },
    );
    if (!globalThis.turnstile) {
        throw new Error("Bot protection did not initialize.");
    }
    return globalThis.turnstile;
}
