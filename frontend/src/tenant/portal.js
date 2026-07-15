import { apiService } from "../core/api.js";
import {
    portalLoadingHTML,
    portalErrorHTML,
    organizerPortalHTML,
    moderationStandsHTML,
    exhibitorPortalHTML,
    leadsHTML,
    invitationAcceptanceHTML,
    auditEventsHTML,
} from "./portal-templates.js";

function isoFromLocal(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date");
    }
    return date.toISOString();
}

function requestId(prefix) {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function feedback(message, error = false) {
    const target = document.getElementById("portal-feedback");
    if (!target) {
        return;
    }
    target.textContent = message;
    target.classList.remove("hidden");
    target.classList.toggle("text-red-700", error);
    target.classList.toggle("text-green-700", !error);
    target.focus?.();
}

function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

class TenantPortal {
    constructor() {
        this._organizerAbort = null;
        this._exhibitorAbort = null;
    }

    async renderOrganizer(content) {
        this._organizerAbort?.abort();
        content.innerHTML = portalLoadingHTML("Organizer portal");
        try {
            const membershipData = await apiService.get("/me/memberships");
            const membership = (membershipData.memberships || []).find((item) =>
                ["owner", "organizer"].includes(item.role),
            );
            if (!membership) {
                content.innerHTML = portalErrorHTML(
                    "Organizer portal",
                    "This account has no organizer membership.",
                );
                return;
            }
            const organizationId = membership.organizationId;
            const [organizationData, eventData, billingData, memberData] =
                await Promise.all([
                    apiService.get(`/organizations/${organizationId}`),
                    apiService.get(`/organizations/${organizationId}/events`),
                    apiService.get(`/organizations/${organizationId}/billing`),
                    apiService.get(
                        `/organizations/${organizationId}/memberships`,
                    ),
                ]);
            const events = eventData.events || [];
            const invitationResults = await Promise.all(
                events.map(async (item) => {
                    try {
                        const result = await apiService.get(
                            `/organizations/${organizationId}/events/${item.eventId}/invitations`,
                        );
                        return [item.eventId, result.invitations || []];
                    } catch {
                        return [item.eventId, []];
                    }
                }),
            );
            content.innerHTML = organizerPortalHTML({
                membership,
                organization:
                    organizationData.organization ||
                    membership.organization ||
                    {},
                events,
                entitlement: billingData.entitlement,
                memberships: memberData.memberships || [],
                invitationsByEvent: Object.fromEntries(invitationResults),
            });
            this._bindOrganizer(content, membership);
        } catch (error) {
            content.innerHTML = portalErrorHTML(
                "Organizer portal",
                error.message || "Unable to load organizer data.",
            );
        }
    }

    _bindOrganizer(content, membership) {
        const organizationId = membership.organizationId;
        this._organizerAbort = new AbortController();
        const { signal } = this._organizerAbort;

        content.querySelector("#organization-profile-form")?.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                    await apiService.patch(`/organizations/${organizationId}`, {
                        name: data.get("name"),
                        billingEmail: data.get("billingEmail"),
                        timezone: data.get("timezone"),
                        locale: data.get("locale"),
                        profileCompleted: data.get("profileCompleted") === "on",
                    });
                    feedback("Organization profile saved.");
                } catch (error) {
                    feedback(error.message || "Unable to save profile.", true);
                }
            },
            { signal },
        );

        content.querySelector("#billing-checkout-form")?.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const idempotencyKey = requestId("billing");
                try {
                    const result = await apiService.post(
                        `/organizations/${organizationId}/billing/checkout`,
                        {
                            plan: data.get("plan"),
                            billingEmail: data.get("billingEmail"),
                            successUrl: `${window.location.origin}${window.location.pathname}#/organizer?billing=success`,
                            cancelUrl: `${window.location.origin}${window.location.pathname}#/organizer?billing=cancelled`,
                        },
                        {
                            retryUnsafe: true,
                            headers: { "Idempotency-Key": idempotencyKey },
                        },
                    );
                    if (result.url) {
                        window.location.assign(result.url);
                    }
                } catch (error) {
                    feedback(
                        error.message || "Unable to start billing checkout.",
                        true,
                    );
                }
            },
            { signal },
        );

        content.querySelector("#member-form")?.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                    await apiService.post(
                        `/organizations/${organizationId}/memberships`,
                        { userId: data.get("userId"), role: data.get("role") },
                    );
                    await this.renderOrganizer(content);
                    feedback("Membership granted.");
                } catch (error) {
                    feedback(
                        error.message || "Unable to grant membership.",
                        true,
                    );
                }
            },
            { signal },
        );

        content.querySelector("#create-event-form")?.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                    await apiService.post(
                        `/organizations/${organizationId}/events`,
                        {
                            name: data.get("name"),
                            description: data.get("description"),
                            startsAt: isoFromLocal(data.get("startsAt")),
                            endsAt: isoFromLocal(data.get("endsAt")),
                            timezone: data.get("timezone"),
                            visibility: "public",
                            branding: {},
                        },
                    );
                    await this.renderOrganizer(content);
                    feedback("Event created.");
                } catch (error) {
                    feedback(error.message || "Unable to create event.", true);
                }
            },
            { signal },
        );

        content.querySelectorAll("[data-duplicate-form]").forEach((form) => {
            form.addEventListener(
                "submit",
                async (event) => {
                    event.preventDefault();
                    const data = new FormData(form);
                    try {
                        await apiService.post(
                            `/organizations/${organizationId}/events/${form.dataset.eventId}/duplicate`,
                            {
                                name: data.get("name"),
                                startsAt: isoFromLocal(data.get("startsAt")),
                                endsAt: isoFromLocal(data.get("endsAt")),
                                timezone: data.get("timezone"),
                            },
                        );
                        await this.renderOrganizer(content);
                        feedback("Draft event copy created.");
                    } catch (error) {
                        feedback(
                            error.message || "Unable to duplicate event.",
                            true,
                        );
                    }
                },
                { signal },
            );
        });

        content.querySelectorAll("[data-invite-form]").forEach((form) => {
            form.addEventListener(
                "submit",
                async (event) => {
                    event.preventDefault();
                    const data = new FormData(form);
                    try {
                        const result = await apiService.post(
                            `/organizations/${organizationId}/events/${form.dataset.eventId}/invitations`,
                            {
                                email: data.get("email"),
                                standName: data.get("standName"),
                                message: data.get("message") || "",
                                expiresInDays: 14,
                            },
                        );
                        const invitationUrl = `${window.location.origin}${window.location.pathname}#/invitation/${encodeURIComponent(result.invitation.invitationId)}`;
                        await this.renderOrganizer(content);
                        feedback(
                            `Invitation created and queued for delivery. Fallback link: ${invitationUrl}`,
                        );
                    } catch (error) {
                        feedback(
                            error.message || "Unable to invite exhibitor.",
                            true,
                        );
                    }
                },
                { signal },
            );
        });

        content.addEventListener(
            "click",
            async (event) => {
                const button = event.target.closest("[data-action]");
                if (!button || !content.contains(button)) {
                    return;
                }
                const action = button.dataset.action;
                try {
                    if (action === "toggle-member-form") {
                        content
                            .querySelector("#member-form")
                            ?.classList.toggle("hidden");
                    }
                    if (action === "billing-portal") {
                        const result = await apiService.post(
                            `/organizations/${organizationId}/billing/portal`,
                            {
                                returnUrl: `${window.location.origin}${window.location.pathname}#/organizer`,
                            },
                        );
                        if (result.url) {
                            window.location.assign(result.url);
                        }
                    }
                    if (action === "publish-event") {
                        await apiService.post(
                            `/organizations/${organizationId}/events/${button.dataset.eventId}/publish`,
                            {},
                        );
                        await this.renderOrganizer(content);
                        feedback("Event published.");
                    }
                    if (action === "archive-event") {
                        await apiService.post(
                            `/organizations/${organizationId}/events/${button.dataset.eventId}/archive`,
                            {},
                        );
                        await this.renderOrganizer(content);
                        feedback(
                            "Event archived and removed from the public catalog.",
                        );
                    }
                    if (action === "event-stands") {
                        const result = await apiService.get(
                            `/organizations/${organizationId}/events/${button.dataset.eventId}/stands`,
                        );
                        const target = content.querySelector(
                            `[data-event-stands="${button.dataset.eventId}"]`,
                        );
                        target.innerHTML = moderationStandsHTML(
                            result.stands || [],
                        );
                        target.dataset.organizationId = organizationId;
                        target.dataset.eventId = button.dataset.eventId;
                    }
                    if (action === "moderate-stand") {
                        const target = button.closest("[data-event-stands]");
                        await apiService.patch(
                            `/organizations/${target.dataset.organizationId}/events/${target.dataset.eventId}/stands/${button.dataset.standId}/moderation`,
                            {
                                status: button.dataset.status,
                                moderationNote: "",
                            },
                        );
                        const result = await apiService.get(
                            `/organizations/${target.dataset.organizationId}/events/${target.dataset.eventId}/stands`,
                        );
                        target.innerHTML = moderationStandsHTML(
                            result.stands || [],
                        );
                        feedback(`Stand ${button.dataset.status}.`);
                    }
                    if (action === "resend-invitation") {
                        await apiService.post(
                            `/organizations/${organizationId}/events/${button.dataset.eventId}/invitations/${button.dataset.invitationId}/resend`,
                            {},
                        );
                        await this.renderOrganizer(content);
                        feedback("Invitation resent.");
                    }
                    if (action === "revoke-invitation") {
                        await apiService.delete(
                            `/organizations/${organizationId}/events/${button.dataset.eventId}/invitations/${button.dataset.invitationId}`,
                        );
                        await this.renderOrganizer(content);
                        feedback("Invitation revoked.");
                    }
                    if (action === "toggle-member") {
                        await apiService.patch(
                            `/organizations/${organizationId}/memberships/${encodeURIComponent(button.dataset.userId)}`,
                            {
                                role: button.dataset.role,
                                status:
                                    button.dataset.status === "active"
                                        ? "suspended"
                                        : "active",
                            },
                        );
                        await this.renderOrganizer(content);
                        feedback("Membership updated.");
                    }
                    if (action === "remove-member") {
                        await apiService.delete(
                            `/organizations/${organizationId}/memberships/${encodeURIComponent(button.dataset.userId)}`,
                        );
                        await this.renderOrganizer(content);
                        feedback("Membership removed.");
                    }
                    if (action === "load-audit") {
                        const result = await apiService.get(
                            `/organizations/${organizationId}/audit`,
                            { limit: 50 },
                        );
                        content.querySelector("#audit-results").innerHTML =
                            auditEventsHTML(result.events || []);
                    }
                    if (action === "export-user") {
                        const result = await apiService.get("/user/export");
                        downloadJson(
                            `ai-pavilion-user-export-${new Date().toISOString().slice(0, 10)}.json`,
                            result,
                        );
                        feedback("Personal data export downloaded.");
                    }
                } catch (error) {
                    feedback(error.message || "Operation failed.", true);
                }
            },
            { signal },
        );
    }

    async renderInvitation(content, invitationId) {
        content.innerHTML = invitationAcceptanceHTML(invitationId);
        content
            .querySelector("#accept-invitation")
            ?.addEventListener("click", async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                button.textContent = "Accepting…";
                try {
                    const result = await apiService.post(
                        `/invitations/${encodeURIComponent(invitationId)}/accept`,
                        {},
                    );
                    content.innerHTML = invitationAcceptanceHTML(
                        invitationId,
                        result,
                    );
                } catch (error) {
                    feedback(
                        error.message || "Unable to accept invitation.",
                        true,
                    );
                    button.disabled = false;
                    button.textContent = "Accept invitation";
                }
            });
    }

    async renderExhibitor(content) {
        this._exhibitorAbort?.abort();
        content.innerHTML = portalLoadingHTML("Exhibitor portal");
        try {
            const result = await apiService.get("/exhibitor/stands");
            content.innerHTML = exhibitorPortalHTML(result.stands || []);
            this._bindExhibitor(content);
        } catch (error) {
            content.innerHTML = portalErrorHTML(
                "Exhibitor portal",
                error.message || "Unable to load exhibitor data.",
            );
        }
    }

    _bindExhibitor(content) {
        this._exhibitorAbort = new AbortController();
        content.addEventListener(
            "click",
            async (event) => {
                const button = event.target.closest("[data-action]");
                if (!button) {
                    return;
                }
                const standId = button.dataset.standId;
                const form = standId
                    ? content.querySelector(`[data-stand-editor="${standId}"]`)
                    : null;
                try {
                    if (button.dataset.action === "toggle-stand-editor") {
                        form?.classList.toggle("hidden");
                    }
                    if (button.dataset.action === "save-stand") {
                        event.preventDefault();
                        const data = new FormData(form);
                        await apiService.put(`/exhibitor/stands/${standId}`, {
                            name: data.get("name"),
                            category: data.get("category"),
                            description: data.get("description"),
                            imageUrl: data.get("imageUrl"),
                        });
                        feedback("Stand saved.");
                    }
                    if (button.dataset.action === "submit-stand") {
                        event.preventDefault();
                        await apiService.post(
                            `/exhibitor/stands/${standId}/submit`,
                            {},
                        );
                        await this.renderExhibitor(content);
                        feedback("Stand submitted for review.");
                    }
                    if (button.dataset.action === "load-leads") {
                        event.preventDefault();
                        const result = await apiService.get(
                            "/exhibitor/leads",
                            {
                                standId,
                            },
                        );
                        content.querySelector(
                            `[data-leads-for="${standId}"]`,
                        ).innerHTML = leadsHTML(result.leads || []);
                    }
                    if (button.dataset.action === "save-lead") {
                        const leadId = button.dataset.leadId;
                        const select = content.querySelector(
                            `[data-lead-status="${leadId}"]`,
                        );
                        await apiService.patch(`/exhibitor/leads/${leadId}`, {
                            status: select.value,
                        });
                        feedback("Lead updated.");
                    }
                } catch (error) {
                    feedback(error.message || "Operation failed.", true);
                }
            },
            { signal: this._exhibitorAbort.signal },
        );
    }
}

export const tenantPortal = new TenantPortal();
