import { apiService } from "../core/api.js";
import { escapeHtml } from "../core/helpers.js";
import { renderStandCard } from "../stands/card.js";

function formatDate(value, timezone = "Europe/Rome") {
    if (!value) {
        return "Date to be announced";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
    }).format(date);
}

function eventCard(event) {
    return `<article class="glass-card rounded-2xl p-6 hover-lift">
        <p class="text-sm text-purple-700 mb-2">${escapeHtml(formatDate(event.startsAt, event.timezone))}</p>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">${escapeHtml(event.name)}</h2>
        <p class="text-gray-600 mb-5">${escapeHtml(event.description || "Explore exhibitors and event content.")}</p>
        <a href="#/event/${encodeURIComponent(event.eventId)}" class="btn-primary inline-block px-5 py-2">Open event</a>
    </article>`;
}

class PublicEvents {
    async renderList(content) {
        content.innerHTML =
            '<section class="max-w-7xl mx-auto px-4 py-10"><h1 class="text-4xl font-bold text-white mb-8">Events</h1><div class="glass-card rounded-2xl p-8">Loading events…</div></section>';
        try {
            const result = await apiService.get("/events");
            const events = result.events || [];
            content.innerHTML = `<section class="max-w-7xl mx-auto px-4 py-10"><header class="text-white mb-8"><p class="text-purple-200">Public programme</p><h1 class="text-4xl font-bold">Events</h1></header><div class="grid md:grid-cols-2 gap-6">${
                events.length
                    ? events.map(eventCard).join("")
                    : '<div class="glass-card rounded-2xl p-8 text-gray-700">No public events are available.</div>'
            }</div></section>`;
        } catch (error) {
            content.innerHTML = `<section class="max-w-3xl mx-auto px-4 py-16"><div class="glass-card rounded-2xl p-8 text-red-700">${escapeHtml(error.message || "Unable to load events.")}</div></section>`;
        }
    }

    async renderDetail(content, eventId) {
        content.innerHTML =
            '<section class="max-w-7xl mx-auto px-4 py-10 text-white">Loading event…</section>';
        try {
            const result = await apiService.get(
                `/events/${encodeURIComponent(eventId)}/stands`,
            );
            const event = result.event;
            const stands = result.stands || [];
            content.innerHTML = `<section class="max-w-7xl mx-auto px-4 py-10"><header class="text-white mb-8"><a href="#/events" class="text-purple-200">← All events</a><h1 class="text-4xl font-bold mt-3">${escapeHtml(event.name)}</h1><p class="text-white/80 mt-2">${escapeHtml(formatDate(event.startsAt, event.timezone))} – ${escapeHtml(formatDate(event.endsAt, event.timezone))}</p><p class="text-white/80 mt-4 max-w-3xl">${escapeHtml(event.description || "")}</p></header><div id="event-stands-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6"></div></section>`;
            const grid = content.querySelector("#event-stands-grid");
            if (!stands.length) {
                grid.innerHTML =
                    '<div class="glass-card rounded-2xl p-8 text-gray-700">No published stands are available for this event.</div>';
                return;
            }
            for (const stand of stands) {
                const wrapper = document.createElement("div");
                wrapper.className =
                    "glass-card rounded-2xl overflow-hidden hover-lift cursor-pointer";
                wrapper.innerHTML = renderStandCard(stand);
                wrapper.addEventListener("click", () => {
                    window.location.hash = `/stand/${encodeURIComponent(stand.stand_id)}`;
                });
                grid.appendChild(wrapper);
            }
        } catch (error) {
            content.innerHTML = `<section class="max-w-3xl mx-auto px-4 py-16"><div class="glass-card rounded-2xl p-8 text-red-700">${escapeHtml(error.message || "Unable to load event.")}</div></section>`;
        }
    }
}

export const publicEvents = new PublicEvents();
export { formatDate, eventCard };
