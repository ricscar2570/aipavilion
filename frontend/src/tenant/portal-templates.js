import { escapeHtml } from "../core/helpers.js";

function dateValue(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function statusPill(value) {
    return `<span class="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium">${escapeHtml(value || "unknown")}</span>`;
}

function invitationRows(invitations = [], eventId) {
    if (!invitations.length) {
        return '<p class="text-sm text-gray-500">No invitations yet.</p>';
    }
    return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left">Recipient</th><th>Status</th><th>Delivery</th><th>Expires</th><th></th></tr></thead><tbody>${invitations
        .map(
            (invitation) => `<tr class="border-t">
                <td class="py-2"><strong>${escapeHtml(invitation.standName)}</strong><br>${escapeHtml(invitation.email)}</td>
                <td>${statusPill(invitation.status)}</td>
                <td>${statusPill(invitation.deliveryStatus || "queued")}</td>
                <td>${escapeHtml(invitation.expiresAt || "")}</td>
                <td class="text-right whitespace-nowrap">${
                    invitation.status === "pending"
                        ? `<button type="button" data-action="resend-invitation" data-event-id="${escapeHtml(eventId)}" data-invitation-id="${escapeHtml(invitation.invitationId)}" class="px-2 py-1 border rounded">Resend</button>
                           <button type="button" data-action="revoke-invitation" data-event-id="${escapeHtml(eventId)}" data-invitation-id="${escapeHtml(invitation.invitationId)}" class="px-2 py-1 border rounded text-red-700">Revoke</button>`
                        : ""
                }</td>
            </tr>`,
        )
        .join("")}</tbody></table></div>`;
}

function eventCards(events, invitationsByEvent) {
    if (!events.length) {
        return '<p class="text-gray-600">No events yet.</p>';
    }
    return events
        .map((item) => {
            const starts = new Date(item.startsAt);
            const ends = new Date(item.endsAt);
            const duplicateStart = Number.isNaN(starts.getTime())
                ? ""
                : dateValue(
                      new Date(
                          starts.getTime() + 365 * 24 * 60 * 60 * 1000,
                      ).toISOString(),
                  );
            const duplicateEnd = Number.isNaN(ends.getTime())
                ? ""
                : dateValue(
                      new Date(
                          ends.getTime() + 365 * 24 * 60 * 60 * 1000,
                      ).toISOString(),
                  );
            return `<article class="border border-gray-200 rounded-xl p-5 space-y-4" data-event-id="${escapeHtml(item.eventId)}">
                <div class="flex flex-wrap justify-between gap-3">
                    <div><h3 class="font-semibold text-lg">${escapeHtml(item.name)}</h3><p class="text-sm text-gray-600">${escapeHtml(item.startsAt)} · ${statusPill(item.status)}</p></div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" data-action="event-stands" data-event-id="${escapeHtml(item.eventId)}" class="px-3 py-2 border rounded-lg">Review stands</button>
                        ${item.status !== "published" && item.status !== "archived" ? `<button type="button" data-action="publish-event" data-event-id="${escapeHtml(item.eventId)}" class="btn-primary px-3 py-2">Publish</button>` : ""}
                        ${item.status !== "archived" ? `<button type="button" data-action="archive-event" data-event-id="${escapeHtml(item.eventId)}" class="px-3 py-2 border rounded-lg text-red-700">Archive</button>` : ""}
                    </div>
                </div>
                <details class="border rounded-lg p-3"><summary class="cursor-pointer font-medium">Duplicate event</summary>
                    <form data-duplicate-form data-event-id="${escapeHtml(item.eventId)}" class="grid md:grid-cols-2 gap-2 mt-3">
                        <input name="name" value="${escapeHtml(`${item.name} copy`)}" required class="px-3 py-2 border rounded-lg" />
                        <input name="timezone" value="${escapeHtml(item.timezone || "Europe/Rome")}" required class="px-3 py-2 border rounded-lg" />
                        <label class="text-sm">Starts<input name="startsAt" value="${duplicateStart}" type="datetime-local" required class="block w-full px-3 py-2 border rounded-lg" /></label>
                        <label class="text-sm">Ends<input name="endsAt" value="${duplicateEnd}" type="datetime-local" required class="block w-full px-3 py-2 border rounded-lg" /></label>
                        <button class="md:col-span-2 px-3 py-2 border rounded-lg">Create draft copy</button>
                    </form>
                </details>
                <form data-invite-form data-event-id="${escapeHtml(item.eventId)}" class="grid md:grid-cols-4 gap-2">
                    <input name="email" type="email" required placeholder="exhibitor@example.com" class="px-3 py-2 border rounded-lg" />
                    <input name="standName" required placeholder="Stand name" class="px-3 py-2 border rounded-lg" />
                    <input name="message" placeholder="Optional message" class="px-3 py-2 border rounded-lg" />
                    <button class="px-3 py-2 border rounded-lg">Send invitation</button>
                </form>
                <div><h4 class="font-medium mb-2">Invitations</h4>${invitationRows(invitationsByEvent[item.eventId] || [], item.eventId)}</div>
                <div data-event-stands="${escapeHtml(item.eventId)}"></div>
            </article>`;
        })
        .join("");
}

function membershipRows(memberships = [], owner) {
    if (!memberships.length) {
        return '<p class="text-sm text-gray-500">No members.</p>';
    }
    return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left">User ID</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${memberships
        .map(
            (member) =>
                `<tr class="border-t"><td class="py-2 font-mono text-xs">${escapeHtml(member.userId)}</td><td>${escapeHtml(member.role)}</td><td>${statusPill(member.status)}</td><td class="text-right">${
                    owner && member.role !== "owner"
                        ? `<button type="button" data-action="toggle-member" data-user-id="${escapeHtml(member.userId)}" data-role="${escapeHtml(member.role)}" data-status="${escapeHtml(member.status)}" class="px-2 py-1 border rounded">${member.status === "active" ? "Suspend" : "Reactivate"}</button>
                       <button type="button" data-action="remove-member" data-user-id="${escapeHtml(member.userId)}" class="px-2 py-1 border rounded text-red-700">Remove</button>`
                        : ""
                }</td></tr>`,
        )
        .join("")}</tbody></table></div>`;
}

function billingHTML(entitlement, organization) {
    const current = entitlement || {};
    return `<div class="grid lg:grid-cols-2 gap-5">
        <div><h3 class="font-semibold">Current subscription</h3><p class="mt-2">${statusPill(current.status)} <strong>${escapeHtml(current.plan || "none")}</strong></p><p class="text-sm text-gray-600 mt-2">${escapeHtml(String(current.maxActiveEvents || 0))} active events · ${escapeHtml(String(current.maxStandsPerEvent || 0))} stands per event</p></div>
        <form id="billing-checkout-form" class="grid gap-2">
            <label class="text-sm">Plan<select name="plan" class="block w-full px-3 py-2 border rounded-lg"><option value="pilot">Pilot</option><option value="starter">Starter</option><option value="professional">Professional</option></select></label>
            <label class="text-sm">Billing email<input name="billingEmail" type="email" value="${escapeHtml(organization.billingEmail || organization.ownerEmail || "")}" required class="block w-full px-3 py-2 border rounded-lg" /></label>
            <div class="flex gap-2"><button class="btn-primary px-4 py-2">Choose plan</button><button type="button" data-action="billing-portal" class="px-4 py-2 border rounded-lg">Billing portal</button></div>
        </form>
    </div>`;
}

export function portalLoadingHTML(title) {
    return `<section class="max-w-7xl mx-auto px-4 py-10"><h1 class="text-3xl font-bold text-white mb-6">${escapeHtml(title)}</h1><div class="glass-card rounded-2xl p-8 text-gray-700" role="status">Loading…</div></section>`;
}

export function portalErrorHTML(title, message) {
    return `<section class="max-w-5xl mx-auto px-4 py-10"><h1 class="text-3xl font-bold text-white mb-6">${escapeHtml(title)}</h1><div class="glass-card rounded-2xl p-8"><p class="text-red-700">${escapeHtml(message)}</p></div></section>`;
}

export function organizerPortalHTML({
    membership,
    organization = {},
    events = [],
    entitlement,
    memberships = [],
    invitationsByEvent = {},
}) {
    const isOwner = membership.role === "owner";
    return `<section class="max-w-7xl mx-auto px-4 py-10 space-y-6">
        <header class="text-white"><p class="text-purple-200">Organizer portal</p><h1 class="text-3xl font-bold">${escapeHtml(organization.name || "Organization")}</h1><p>${escapeHtml(membership.role)} · ${escapeHtml(entitlement?.plan || "no plan")}</p></header>
        <div id="portal-feedback" class="hidden glass-card rounded-xl p-4" role="status" aria-live="polite"></div>
        <div class="grid xl:grid-cols-2 gap-6">
            <div class="glass-card rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Organization profile</h2>
                <form id="organization-profile-form" class="grid gap-3">
                    <label class="text-sm">Name<input name="name" value="${escapeHtml(organization.name || "")}" required class="block w-full px-3 py-2 border rounded-lg" /></label>
                    <label class="text-sm">Billing email<input name="billingEmail" type="email" value="${escapeHtml(organization.billingEmail || "")}" class="block w-full px-3 py-2 border rounded-lg" /></label>
                    <div class="grid sm:grid-cols-2 gap-3"><label class="text-sm">Timezone<input name="timezone" value="${escapeHtml(organization.timezone || "Europe/Rome")}" required class="block w-full px-3 py-2 border rounded-lg" /></label><label class="text-sm">Locale<input name="locale" value="${escapeHtml(organization.locale || "en-GB")}" required class="block w-full px-3 py-2 border rounded-lg" /></label></div>
                    <label class="text-sm"><input name="profileCompleted" type="checkbox" ${organization.profileCompleted ? "checked" : ""} /> Onboarding profile completed</label>
                    <button class="btn-primary py-2">Save profile</button>
                </form>
            </div>
            <div class="glass-card rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Billing and limits</h2>${billingHTML(entitlement, organization)}</div>
        </div>
        <div class="glass-card rounded-2xl p-6"><div class="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 class="text-xl font-semibold">Team</h2>${isOwner ? '<button type="button" data-action="toggle-member-form" class="px-3 py-2 border rounded-lg">Add member</button>' : ""}</div>
            ${
                isOwner
                    ? `<form id="member-form" class="hidden grid md:grid-cols-3 gap-2 mb-4"><input name="userId" required placeholder="Cognito user ID" class="px-3 py-2 border rounded-lg" /><select name="role" class="px-3 py-2 border rounded-lg"><option value="organizer">Organizer</option><option value="exhibitor">Exhibitor</option></select><button class="px-3 py-2 border rounded-lg">Grant membership</button></form>`
                    : ""
            }
            ${membershipRows(memberships, isOwner)}
        </div>
        <div class="glass-card rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Create event</h2>
            <form id="create-event-form" class="grid md:grid-cols-2 gap-3"><input name="name" required placeholder="Event name" class="px-3 py-2 border rounded-lg" /><input name="timezone" value="${escapeHtml(organization.timezone || "Europe/Rome")}" required class="px-3 py-2 border rounded-lg" /><label class="text-sm">Starts<input name="startsAt" type="datetime-local" required class="block w-full px-3 py-2 border rounded-lg" /></label><label class="text-sm">Ends<input name="endsAt" type="datetime-local" required class="block w-full px-3 py-2 border rounded-lg" /></label><textarea name="description" placeholder="Event description" class="md:col-span-2 px-3 py-2 border rounded-lg"></textarea><button class="btn-primary md:col-span-2 py-3">Create draft event</button></form>
        </div>
        <div class="glass-card rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Events</h2><div class="space-y-4">${eventCards(events, invitationsByEvent)}</div></div>
        <div class="glass-card rounded-2xl p-6"><div class="flex flex-wrap gap-2 items-center"><h2 class="text-xl font-semibold mr-auto">Compliance and activity</h2><button type="button" data-action="load-audit" class="px-3 py-2 border rounded-lg">Load audit trail</button><button type="button" data-action="export-user" class="px-3 py-2 border rounded-lg">Export my data</button></div><div id="audit-results" class="mt-4"></div></div>
    </section>`;
}

export function auditEventsHTML(events = []) {
    if (!events.length) {
        return '<p class="text-sm text-gray-500">No audit events found.</p>';
    }
    return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left">Time</th><th>Action</th><th>Resource</th><th>Actor</th></tr></thead><tbody>${events
        .map(
            (item) =>
                `<tr class="border-t"><td class="py-2">${escapeHtml(item.createdAt)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(`${item.resourceType || ""} ${item.resourceId || ""}`)}</td><td class="font-mono text-xs">${escapeHtml(item.actorUserId || "system")}</td></tr>`,
        )
        .join("")}</tbody></table></div>`;
}

export function moderationStandsHTML(stands = []) {
    if (!stands.length) {
        return '<p class="text-sm text-gray-500">No stands for this event.</p>';
    }
    return stands
        .map(
            (stand) =>
                `<div class="flex flex-wrap items-center justify-between gap-2 border-t py-3"><div><strong>${escapeHtml(stand.name)}</strong><span class="ml-2 text-sm text-gray-500">${escapeHtml(stand.status)}</span></div><div class="flex gap-2"><button type="button" data-action="moderate-stand" data-status="published" data-stand-id="${escapeHtml(stand.stand_id)}" class="px-3 py-1 border rounded">Publish</button><button type="button" data-action="moderate-stand" data-status="rejected" data-stand-id="${escapeHtml(stand.stand_id)}" class="px-3 py-1 border rounded text-red-700">Reject</button></div></div>`,
        )
        .join("");
}

export function exhibitorPortalHTML(stands = []) {
    const cards = stands.length
        ? stands
              .map(
                  (stand) =>
                      `<article class="glass-card rounded-2xl p-6" data-stand-card="${escapeHtml(stand.stand_id)}"><div class="flex flex-wrap justify-between gap-3"><div><h2 class="text-xl font-semibold">${escapeHtml(stand.name)}</h2><p class="text-sm text-gray-600">${escapeHtml(stand.status)} · ${escapeHtml(stand.category || "general")}</p></div><button type="button" data-action="toggle-stand-editor" data-stand-id="${escapeHtml(stand.stand_id)}" class="px-3 py-2 border rounded-lg">Edit</button></div><form data-stand-editor="${escapeHtml(stand.stand_id)}" class="hidden mt-4 space-y-3"><input name="name" value="${escapeHtml(stand.name)}" class="w-full px-3 py-2 border rounded-lg" /><input name="category" value="${escapeHtml(stand.category || "general")}" class="w-full px-3 py-2 border rounded-lg" /><textarea name="description" class="w-full px-3 py-2 border rounded-lg">${escapeHtml(stand.description || "")}</textarea><input name="imageUrl" value="${escapeHtml(stand.image_url || "")}" placeholder="Image URL" class="w-full px-3 py-2 border rounded-lg" /><div class="flex flex-wrap gap-2"><button data-action="save-stand" data-stand-id="${escapeHtml(stand.stand_id)}" class="btn-primary px-4 py-2">Save</button><button data-action="submit-stand" data-stand-id="${escapeHtml(stand.stand_id)}" class="px-4 py-2 border rounded-lg">Submit for review</button><button data-action="load-leads" data-stand-id="${escapeHtml(stand.stand_id)}" class="px-4 py-2 border rounded-lg">Leads</button></div></form><div data-leads-for="${escapeHtml(stand.stand_id)}" class="mt-4"></div></article>`,
              )
              .join("")
        : '<div class="glass-card rounded-2xl p-8 text-gray-700">No stand is assigned to this account yet. Accept an organizer invitation first.</div>';
    return `<section class="max-w-6xl mx-auto px-4 py-10 space-y-5"><header class="text-white"><p class="text-purple-200">Exhibitor portal</p><h1 class="text-3xl font-bold">My stands</h1></header><div id="portal-feedback" class="hidden glass-card rounded-xl p-4" role="status" aria-live="polite"></div>${cards}</section>`;
}

export function leadsHTML(leads = []) {
    if (!leads.length) {
        return '<p class="text-sm text-gray-500">No leads yet.</p>';
    }
    return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left">Contact</th><th>Status</th><th>Message</th><th></th></tr></thead><tbody>${leads
        .map(
            (lead) =>
                `<tr class="border-t"><td class="py-2"><strong>${escapeHtml(lead.name)}</strong><br>${escapeHtml(lead.email)}</td><td><select data-lead-status="${escapeHtml(lead.leadId)}" class="border rounded p-1">${["new", "contacted", "qualified", "closed", "spam"].map((status) => `<option ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td>${escapeHtml(lead.message)}</td><td><button type="button" data-action="save-lead" data-lead-id="${escapeHtml(lead.leadId)}" class="px-2 py-1 border rounded">Save</button></td></tr>`,
        )
        .join("")}</tbody></table></div>`;
}

export { dateValue };

export function invitationAcceptanceHTML(invitationId, result = null) {
    if (result?.accepted) {
        return '<section class="max-w-2xl mx-auto px-4 py-16"><div class="glass-card rounded-2xl p-8 text-center"><h1 class="text-3xl font-bold text-gray-900 mb-3">Invitation accepted</h1><p class="text-gray-600 mb-6">Your exhibitor membership and draft stand are ready.</p><a href="#/exhibitor" class="btn-primary inline-block px-6 py-3">Open exhibitor portal</a></div></section>';
    }
    return `<section class="max-w-2xl mx-auto px-4 py-16"><div class="glass-card rounded-2xl p-8 text-center"><p class="text-sm text-purple-700 mb-2">Exhibitor invitation</p><h1 class="text-3xl font-bold text-gray-900 mb-3">Join this event</h1><p class="text-gray-600 mb-6">Accept invitation <code>${escapeHtml(invitationId)}</code> using the signed-in account whose email received it.</p><div id="portal-feedback" class="hidden rounded-xl p-4 mb-4" role="status" aria-live="polite"></div><button id="accept-invitation" class="btn-primary px-6 py-3">Accept invitation</button></div></section>`;
}
