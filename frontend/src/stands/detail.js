/**
 * Stand detail view.
 *
 * The renderer never emits inline JavaScript. All actions are delegated from
 * the detail container, which avoids global window bindings and repeated
 * document-level listeners when users navigate between stands.
 */

import { apiService } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { loadTurnstileJs } from "../core/external.js";
import { cartManager } from "../checkout/cart.js";
import { uiManager } from "../ui/ui.js";
import { escapeHtml, formatPrice } from "../core/helpers.js";
import { renderStandCard } from "./card.js";

function safeExternalUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch {
        return "";
    }
}

class StandDetailManager {
    constructor() {
        this.currentStand = null;
        this.currentGalleryIndex = 0;
        this._container = null;
        this._clickHandler = null;
        this._keyHandler = null;
        this._challengeToken = "";
        this._turnstileWidgetId = null;
    }

    async loadStandDetails(standId, containerId = "standDetailContainer") {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        try {
            uiManager.showLoader(containerId, "Loading stand details...");
            const stand = await apiService.getStandDetails(standId);
            this.currentStand = stand;
            this.currentGalleryIndex = 0;
            this.renderStandDetails(stand, container);
            this.setupDetailPageInteractions(container);
        } catch (error) {
            console.error("Error loading stand details:", error);
            uiManager.showError(container, "Unable to load stand details");
        }
    }

    renderStandDetails(stand, container) {
        const images = (
            Array.isArray(stand.images) ? stand.images : [stand.image_url]
        ).filter(Boolean);
        const products = Array.isArray(stand.products) ? stand.products : [];
        const documents = Array.isArray(stand.documents) ? stand.documents : [];
        const videos = Array.isArray(stand.videos) ? stand.videos : [];

        container.innerHTML = `
            <div class="stand-detail">
                <div class="stand-detail-header">
                    <button class="btn-back" type="button" data-action="back">← Back to Stands</button>
                    <div class="stand-detail-badges">
                        ${stand.category ? `<span class="badge">${escapeHtml(stand.category)}</span>` : ""}
                        ${stand.is_sponsored ? '<span class="badge badge-sponsored">Sponsored</span>' : ""}
                    </div>
                </div>

                <div class="stand-detail-grid">
                    <div class="stand-detail-left">
                        ${this.renderGallery(images)}
                        ${videos.length ? this.renderVideos(videos) : ""}
                    </div>

                    <div class="stand-detail-right">
                        <h1 class="stand-detail-title">${escapeHtml(stand.name || "Stand Details")}</h1>
                        <div class="stand-detail-description">
                            <p>${escapeHtml(stand.description || "No description available")}</p>
                        </div>
                        ${
                            stand.long_description
                                ? `
                            <div class="stand-detail-long-description">
                                <h3>About</h3>
                                <p>${escapeHtml(stand.long_description)}</p>
                            </div>`
                                : ""
                        }
                        ${this.renderContactInfo(stand)}
                        <div class="stand-detail-actions">
                            <button class="btn btn-primary" data-testid="contact-exhibitor" type="button" data-action="contact">📧 Contact Exhibitor</button>
                            <button class="btn btn-secondary" data-testid="save-stand" type="button" data-action="save">☆ Save Stand</button>
                            <button class="btn btn-secondary" type="button" data-action="book-meeting">📅 Book Meeting</button>
                            <button class="btn btn-secondary" type="button" data-action="share">🔗 Share</button>
                        </div>
                    </div>
                </div>

                ${
                    products.length
                        ? `
                    <div class="stand-detail-section">
                        <h2>Products & Services</h2>
                        <div class="products-grid">
                            ${products.map((product) => this.renderProduct(product, stand.stand_id)).join("")}
                        </div>
                    </div>`
                        : ""
                }

                ${
                    documents.length
                        ? `
                    <div class="stand-detail-section">
                        <h2>Downloads</h2>
                        <div class="documents-list">
                            ${documents.map((doc) => this.renderDocument(doc)).join("")}
                        </div>
                    </div>`
                        : ""
                }

                <div class="stand-detail-section">
                    <h2>Related Stands</h2>
                    <div id="relatedStandsGrid" class="related-stands-grid">
                        <div class="loader-container"><div class="loader"></div></div>
                    </div>
                </div>
            </div>`;

        this.loadRelatedStands(stand.stand_id, stand.category);
    }

    renderGallery(images) {
        if (!images.length) {
            return '<div class="stand-gallery"><div class="gallery-placeholder">No image available</div></div>';
        }

        return `
            <div class="stand-gallery">
                <div class="gallery-main">
                    <img id="galleryMainImage" src="${escapeHtml(images[0])}" alt="Stand image">
                    ${
                        images.length > 1
                            ? `
                        <button class="gallery-nav gallery-prev" type="button" data-action="previous-image" aria-label="Previous image">❮</button>
                        <button class="gallery-nav gallery-next" type="button" data-action="next-image" aria-label="Next image">❯</button>`
                            : ""
                    }
                </div>
                ${
                    images.length > 1
                        ? `
                    <div class="gallery-thumbnails">
                        ${images
                            .map(
                                (image, index) => `
                            <button class="gallery-thumbnail-button" type="button" data-action="select-image" data-index="${index}" aria-label="Show image ${index + 1}">
                                <img src="${escapeHtml(image)}" alt="Thumbnail ${index + 1}" class="gallery-thumbnail ${index === 0 ? "active" : ""}">
                            </button>`,
                            )
                            .join("")}
                    </div>`
                        : ""
                }
            </div>`;
    }

    renderVideos(videos) {
        return `
            <div class="stand-videos">
                <h3>Videos</h3>
                ${videos
                    .map((video) => {
                        const url = safeExternalUrl(video.url);
                        if (!url) {
                            return "";
                        }
                        return `
                        <div class="video-container">
                            <video controls preload="metadata" width="100%">
                                <source src="${escapeHtml(url)}" type="video/mp4">
                                Your browser does not support video.
                            </video>
                            ${video.title ? `<p class="video-title">${escapeHtml(video.title)}</p>` : ""}
                        </div>`;
                    })
                    .join("")}
            </div>`;
    }

    renderContactInfo(stand) {
        const contact = stand.contact || {};
        const email = contact.email || stand.contact_email || "";
        const phone = contact.phone || stand.contact_phone || "";
        const website = safeExternalUrl(contact.website || stand.website || "");

        if (!email && !phone && !website) {
            return "";
        }

        return `
            <div class="stand-contact-info">
                <h3>Contact Information</h3>
                <div class="contact-details">
                    ${email ? `<div class="contact-item"><span aria-hidden="true">📧</span><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>` : ""}
                    ${phone ? `<div class="contact-item"><span aria-hidden="true">📞</span><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></div>` : ""}
                    ${website ? `<div class="contact-item"><span aria-hidden="true">🌐</span><a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Visit Website</a></div>` : ""}
                </div>
            </div>`;
    }

    renderProduct(product, standId) {
        const productId =
            product.productId || product.product_id || product.id || "";
        const price =
            typeof product.price === "number"
                ? product.price
                : (product.priceInCents || 0) / 100;
        const image = safeExternalUrl(product.image || product.image_url || "");

        return `
            <div class="product-card" data-product-id="${escapeHtml(productId)}">
                ${image ? `<div class="product-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name || "Product")}"></div>` : ""}
                <div class="product-info">
                    <h4>${escapeHtml(product.name || "Product")}</h4>
                    ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
                    ${price > 0 ? `<p class="product-price">${formatPrice(price)}</p>` : ""}
                    <button class="btn btn-primary btn-sm" type="button"
                            data-testid="add-product"
                            data-action="add-product"
                            data-product-id="${escapeHtml(productId)}"
                            data-product-name="${escapeHtml(product.name || "Product")}"
                            data-product-price="${escapeHtml(String(price))}"
                            data-stand-id="${escapeHtml(standId)}"
                            ${price > 0 && productId ? "" : "disabled"}>
                        Add to Cart
                    </button>
                </div>
            </div>`;
    }

    renderDocument(doc) {
        const url = safeExternalUrl(doc.url || "");
        const filename = doc.name || doc.title || "document";
        const fileSize = doc.size ? `(${this.formatFileSize(doc.size)})` : "";

        return `
            <div class="document-item">
                <span class="document-icon" aria-hidden="true">📄</span>
                <div class="document-info">
                    <strong>${escapeHtml(doc.title || doc.name || "Document")}</strong>
                    ${doc.description ? `<p>${escapeHtml(doc.description)}</p>` : ""}
                    <span class="document-size">${escapeHtml(fileSize)}</span>
                </div>
                <button class="btn btn-secondary btn-sm" type="button"
                        data-action="download-document"
                        data-url="${escapeHtml(url)}"
                        data-filename="${escapeHtml(filename)}"
                        ${url ? "" : "disabled"}>
                    Download
                </button>
            </div>`;
    }

    setupDetailPageInteractions(container) {
        if (this._container && this._clickHandler) {
            this._container.removeEventListener("click", this._clickHandler);
        }
        if (this._keyHandler) {
            document.removeEventListener("keydown", this._keyHandler);
        }

        this._container = container;
        this._clickHandler = (event) => {
            const button = event.target.closest("[data-action]");
            if (!button || !container.contains(button)) {
                return;
            }

            const action = button.dataset.action;
            if (action === "back") {
                history.back();
            }
            if (action === "contact") {
                this.contactExhibitor(this.currentStand.stand_id);
            }
            if (action === "save") {
                this.saveCurrentStand();
            }
            if (action === "book-meeting") {
                this.bookMeeting(this.currentStand.stand_id);
            }
            if (action === "share") {
                this.shareStand(this.currentStand.stand_id);
            }
            if (action === "previous-image") {
                this.previousImage();
            }
            if (action === "next-image") {
                this.nextImage();
            }
            if (action === "select-image") {
                this.selectImage(Number(button.dataset.index));
            }
            if (action === "add-product") {
                this.addProductToCart(
                    button.dataset.productId,
                    button.dataset.productName,
                    Number(button.dataset.productPrice),
                    button.dataset.standId,
                );
            }
            if (action === "download-document") {
                this.downloadDocument(
                    button.dataset.url,
                    button.dataset.filename,
                );
            }
        };
        container.addEventListener("click", this._clickHandler);

        this._keyHandler = (event) => {
            if (event.key === "ArrowLeft") {
                this.previousImage();
            }
            if (event.key === "ArrowRight") {
                this.nextImage();
            }
        };
        document.addEventListener("keydown", this._keyHandler);
    }

    selectImage(index) {
        const images = (
            Array.isArray(this.currentStand?.images)
                ? this.currentStand.images
                : [this.currentStand?.image_url]
        ).filter(Boolean);
        if (!Number.isInteger(index) || index < 0 || index >= images.length) {
            return;
        }

        this.currentGalleryIndex = index;
        const mainImage = document.getElementById("galleryMainImage");
        if (mainImage) {
            mainImage.src = images[index];
        }
        document
            .querySelectorAll(".gallery-thumbnail")
            .forEach((thumbnail, currentIndex) => {
                thumbnail.classList.toggle("active", currentIndex === index);
            });
    }

    nextImage() {
        const images = (
            Array.isArray(this.currentStand?.images)
                ? this.currentStand.images
                : [this.currentStand?.image_url]
        ).filter(Boolean);
        if (images.length < 2) {
            return;
        }
        this.selectImage((this.currentGalleryIndex + 1) % images.length);
    }

    previousImage() {
        const images = (
            Array.isArray(this.currentStand?.images)
                ? this.currentStand.images
                : [this.currentStand?.image_url]
        ).filter(Boolean);
        if (images.length < 2) {
            return;
        }
        this.selectImage(
            (this.currentGalleryIndex - 1 + images.length) % images.length,
        );
    }

    async saveCurrentStand() {
        if (!this.currentStand) {
            return;
        }
        try {
            await apiService.saveStand(this.currentStand.stand_id);
            uiManager.success("Stand saved to your dashboard.");
        } catch (error) {
            if (error?.status === 401 || error?.status === 403) {
                uiManager.error("Please sign in before saving a stand.");
                return;
            }
            uiManager.error("Failed to save stand.");
        }
    }

    addProductToCart(productId, productName, price, standId) {
        try {
            cartManager.addItem(productId, productName, price, 1, { standId });
            uiManager.success(`${productName} added to cart!`);
        } catch (error) {
            console.error("Add to cart error:", error);
            uiManager.error(error.message);
        }
    }

    async downloadDocument(url, filename) {
        if (!safeExternalUrl(url)) {
            uiManager.error("Invalid document URL");
            return;
        }
        const link = document.createElement("a");
        link.href = url;
        link.download = filename || "document";
        link.rel = "noopener";
        link.click();
    }

    contactExhibitor(standId) {
        this._challengeToken =
            CONFIG.botProtection.mode === "simulated" ? "test-pass" : "";
        uiManager.showModal({
            title: "Contact Exhibitor",
            size: "medium",
            content: this.renderContactForm(),
            buttons: [
                {
                    label: "Cancel",
                    className: "btn-secondary",
                    action: "cancel",
                },
                {
                    label: "Send Message",
                    className: "btn-primary",
                    action: "send",
                    onClick: () => this.sendContactMessage(standId),
                },
            ],
        });
        this.initializeBotChallenge();
    }

    async initializeBotChallenge() {
        if (CONFIG.botProtection.mode !== "turnstile") {
            return;
        }
        const target = document.getElementById("contactBotChallenge");
        if (!target || !CONFIG.botProtection.siteKey) {
            uiManager.error(
                "Bot protection is not configured. Please contact support.",
            );
            return;
        }
        try {
            const turnstile = await loadTurnstileJs();
            this._turnstileWidgetId = turnstile.render(target, {
                sitekey: CONFIG.botProtection.siteKey,
                callback: (token) => {
                    this._challengeToken = token;
                },
                "expired-callback": () => {
                    this._challengeToken = "";
                },
                "error-callback": () => {
                    this._challengeToken = "";
                },
            });
        } catch (error) {
            console.error("Bot challenge error:", error);
            uiManager.error("Unable to load bot protection.");
        }
    }

    renderContactForm() {
        return `
            <form id="contactForm" class="contact-form">
                <div class="form-group"><label for="contactName">Your Name</label><input type="text" id="contactName" maxlength="120" required></div>
                <div class="form-group"><label for="contactEmail">Your Email</label><input type="email" id="contactEmail" maxlength="254" required></div>
                <div class="form-group"><label for="contactMessage">Message</label><textarea id="contactMessage" rows="5" maxlength="3000" required></textarea></div>
                <div class="form-group" aria-hidden="true" style="position:absolute;left:-10000px"><label for="contactWebsite">Website</label><input type="text" id="contactWebsite" tabindex="-1" autocomplete="off"></div>
                <div class="form-group"><label><input type="checkbox" id="contactPrivacy" required> I acknowledge that my data will be sent to the exhibitor to answer this request.</label></div>
                ${CONFIG.botProtection.mode === "turnstile" ? '<div id="contactBotChallenge" class="form-group" aria-label="Bot protection"></div>' : ""}
            </form>`;
    }

    async sendContactMessage(standId) {
        const name = document.getElementById("contactName")?.value.trim();
        const email = document.getElementById("contactEmail")?.value.trim();
        const message = document.getElementById("contactMessage")?.value.trim();
        const privacyAccepted =
            document.getElementById("contactPrivacy")?.checked === true;
        if (!name || !email || !message || !privacyAccepted) {
            uiManager.error("Please fill all fields");
            return;
        }
        if (CONFIG.botProtection.enabled && !this._challengeToken) {
            uiManager.error("Please complete the bot protection check.");
            return;
        }

        try {
            const clientRequestId = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID()
                : `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            await apiService.post(
                "/stands/contact",
                {
                    standId,
                    name,
                    email,
                    message,
                    privacyAccepted,
                    website:
                        document.getElementById("contactWebsite")?.value || "",
                    clientRequestId,
                    challengeToken: this._challengeToken,
                },
                {
                    retryUnsafe: true,
                    headers: { "Idempotency-Key": clientRequestId },
                },
            );
            uiManager.success("Message sent successfully!");
        } catch (error) {
            console.error("Contact error:", error);
            uiManager.error("Failed to send message");
        }
    }

    bookMeeting() {
        uiManager.info("Meeting booking feature coming soon!");
    }

    async shareStand(standId) {
        const url = `${window.location.origin}${window.location.pathname}#/stand/${encodeURIComponent(standId)}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: this.currentStand.name,
                    text: this.currentStand.description,
                    url,
                });
            } else {
                await navigator.clipboard.writeText(url);
                uiManager.success("Link copied to clipboard!");
            }
        } catch (error) {
            if (error?.name !== "AbortError") {
                console.error("Share error:", error);
            }
        }
    }

    async loadRelatedStands(standId, category) {
        try {
            const container = document.getElementById("relatedStandsGrid");
            if (!container) {
                return;
            }

            const data = await apiService.get("/stands");
            const all = Array.isArray(data) ? data : data.stands || [];
            const stands = all
                .filter(
                    (stand) =>
                        stand.stand_id !== standId &&
                        (!category || stand.category === category),
                )
                .slice(0, 4);

            if (!stands.length) {
                container.innerHTML = "<p>No related stands found.</p>";
                return;
            }

            container.innerHTML = stands
                .map((stand) => renderStandCard(stand, { compact: true }))
                .join("");
            container.querySelectorAll("[data-stand-id]").forEach((element) => {
                element.style.cursor = "pointer";
                element.addEventListener("click", () => {
                    window.location.hash = `/stand/${encodeURIComponent(element.dataset.standId)}`;
                });
            });
        } catch (error) {
            console.error("Load related stands error:", error);
        }
    }

    formatFileSize(bytes) {
        if (!bytes) {
            return "0 Bytes";
        }
        const units = ["Bytes", "KB", "MB", "GB"];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1,
        );
        return `${Math.round((bytes / 1024 ** index) * 100) / 100} ${units[index]}`;
    }
}

export const standDetailManager = new StandDetailManager();
export default standDetailManager;
