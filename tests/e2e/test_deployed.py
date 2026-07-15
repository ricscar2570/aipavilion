#!/usr/bin/env python3
"""Browser-level vertical smoke test for the disposable AWS development stack."""

from __future__ import annotations

import json
import os
import secrets
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUTPUTS_FILE = Path(os.getenv("STACK_OUTPUTS_FILE", ROOT / ".artifacts/dev-stack-outputs.json"))
USERS_FILE = Path(os.getenv("DEV_TEST_USERS_FILE", ROOT / ".artifacts/dev-test-users.json"))
BASE_URL = os.getenv("E2E_BASE_URL", "http://127.0.0.1:3000")
REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "eu-west-1"))
CHROMIUM_PATH = os.getenv("CHROMIUM_PATH")


def read_outputs() -> dict[str, str]:
    raw = json.loads(OUTPUTS_FILE.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return {entry["OutputKey"]: entry["OutputValue"] for entry in raw}
    return raw


def read_users() -> list[dict[str, str]]:
    return json.loads(USERS_FILE.read_text(encoding="utf-8"))["users"]


def login(page: Page, email: str, password: str) -> None:
    page.goto(f"{BASE_URL}/#/login", wait_until="domcontentloaded")
    page.locator("#auth-email").fill(email)
    page.locator("#auth-password").fill(password)
    page.locator("#auth-submit").click()
    page.locator("#auth-modal").wait_for(state="hidden", timeout=20_000)
    page.locator('[data-testid="auth-button"]').filter(has_not_text="Login").wait_for(
        timeout=20_000
    )


def logout(page: Page) -> None:
    page.locator('[data-testid="auth-button"]').click()
    page.locator("#user-menu-logout").click()
    page.locator('[data-testid="auth-button"]').filter(has_text="Login").wait_for()


def create_deletion_user(outputs: dict[str, str], password: str) -> str:
    cognito = boto3.client("cognito-idp", region_name=REGION)
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    email = f"browser-delete-{int(time.time())}-{secrets.token_hex(3)}@example.com"
    cognito.admin_create_user(
        UserPoolId=outputs["UserPoolId"],
        Username=email,
        MessageAction="SUPPRESS",
        UserAttributes=[
            {"Name": "email", "Value": email},
            {"Name": "email_verified", "Value": "true"},
            {"Name": "given_name", "Value": "Browser Delete"},
        ],
    )
    cognito.admin_set_user_password(
        UserPoolId=outputs["UserPoolId"],
        Username=email,
        Password=password,
        Permanent=True,
    )
    user = cognito.admin_get_user(
        UserPoolId=outputs["UserPoolId"], Username=email
    )
    user_id = next(
        attr["Value"] for attr in user["UserAttributes"] if attr["Name"] == "sub"
    )
    dynamodb.Table(outputs["UsersTableName"]).put_item(
        Item={
            "userId": user_id,
            "email": email,
            "displayName": "Browser Delete",
            "role": "visitor",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )
    return email


def assert_cognito_deleted(outputs: dict[str, str], email: str) -> None:
    cognito = boto3.client("cognito-idp", region_name=REGION)
    try:
        cognito.admin_get_user(UserPoolId=outputs["UserPoolId"], Username=email)
    except ClientError as error:
        if error.response["Error"]["Code"] == "UserNotFoundException":
            return
        raise
    raise AssertionError("The browser deletion flow did not remove the Cognito user")


def run() -> None:
    outputs = read_outputs()
    users = read_users()
    visitor = next(item for item in users if item["group"] == "visitor")
    atlas_organizer = next(
        item for item in users if item["email"].startswith("organizer.atlas.")
    )
    rival_exhibitor = next(
        item for item in users if item["email"].startswith("exhibitor.rival.")
    )
    deletion_email = create_deletion_user(outputs, visitor["password"])

    with sync_playwright() as playwright:
        launch_options = {"headless": True, "args": ["--no-sandbox"]}
        if CHROMIUM_PATH:
            launch_options["executable_path"] = CHROMIUM_PATH
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        try:
            page.goto(f"{BASE_URL}/#/", wait_until="domcontentloaded")
            assert page.get_by_text("Unpublished Preview", exact=True).count() == 0
            page.locator('[data-testid="stand-card"]', has_text="Boardgames Atlas").wait_for(
                timeout=20_000
            )
            page.locator('[data-testid="stand-card"]', has_text="Boardgames Atlas").click()
            page.get_by_role("heading", name="Boardgames Atlas").wait_for()

            page.locator('[data-testid="contact-exhibitor"]').click()
            page.locator("#contactName").fill("Browser Smoke")
            page.locator("#contactEmail").fill(visitor["email"])
            page.locator("#contactMessage").fill(
                "Browser-level Playwright contact request."
            )
            page.locator("#contactPrivacy").check()
            page.locator('[data-action="send"]').click()
            page.get_by_text("Message sent successfully!").wait_for(timeout=15_000)

            login(page, visitor["email"], visitor["password"])
            page.goto(f"{BASE_URL}/#/stand/stand_boardgames_atlas")
            page.get_by_role("heading", name="Boardgames Atlas").wait_for()
            page.locator('[data-testid="save-stand"]').click()
            page.get_by_text("Stand saved to your dashboard.").wait_for(timeout=15_000)

            page.locator('[data-testid="add-product"]').first.click()
            page.get_by_text("added to cart!", exact=False).wait_for(timeout=15_000)
            page.goto(f"{BASE_URL}/#/checkout")
            page.get_by_text("Development payment simulation", exact=False).wait_for()
            page.locator('[data-testid="pay-button"]').click()
            page.get_by_role("heading", name="Payment confirmed").wait_for(
                timeout=20_000
            )

            page.goto(f"{BASE_URL}/#/dashboard")
            page.get_by_role("heading", name="Saved Stands").wait_for(timeout=20_000)
            page.get_by_text("Boardgames Atlas", exact=True).wait_for()
            page.get_by_text("paid", exact=True).wait_for()

            # Multi-tenant organizer -> invitation -> exhibitor -> moderation journey.
            logout(page)
            login(page, atlas_organizer["email"], atlas_organizer["password"])
            page.goto(f"{BASE_URL}/#/organizer")
            page.get_by_role("heading", name="Atlas Events").wait_for(timeout=20_000)
            invite_form = page.locator('form[data-invite-form]', has_text="Invite exhibitor").first
            invite_form.locator('input[name="email"]').fill(rival_exhibitor["email"])
            stand_name = f"Browser Invited Stand {secrets.token_hex(3)}"
            invite_form.locator('input[name="standName"]').fill(stand_name)
            invite_form.get_by_role("button", name="Invite exhibitor").click()
            feedback = page.locator("#portal-feedback")
            feedback.wait_for(state="visible", timeout=20_000)
            feedback_text = feedback.text_content() or ""
            marker = "#/invitation/"
            if marker not in feedback_text:
                raise AssertionError(f"Invitation link missing from feedback: {feedback_text}")
            invitation_id = feedback_text.split(marker, 1)[1].strip()

            logout(page)
            login(page, rival_exhibitor["email"], rival_exhibitor["password"])
            page.goto(f"{BASE_URL}/#/invitation/{invitation_id}")
            page.get_by_role("button", name="Accept invitation").click()
            page.get_by_role("heading", name="Invitation accepted").wait_for(
                timeout=20_000
            )
            page.get_by_role("link", name="Open exhibitor portal").click()
            invited_card = page.locator("article", has_text=stand_name)
            invited_card.wait_for(timeout=20_000)
            invited_card.get_by_role("button", name="Edit").click()
            invited_form = invited_card.locator("form")
            invited_form.locator('input[name="category"]').fill("browser-pilot")
            invited_form.locator('textarea[name="description"]').fill(
                "Completed by the deployed Phase 3 browser journey."
            )
            invited_form.get_by_role("button", name="Save").click()
            page.get_by_text("Stand saved.", exact=True).wait_for(timeout=20_000)
            invited_form.get_by_role("button", name="Submit for review").click()
            page.get_by_text("Stand submitted for review.", exact=True).wait_for(
                timeout=20_000
            )

            logout(page)
            login(page, atlas_organizer["email"], atlas_organizer["password"])
            page.goto(f"{BASE_URL}/#/organizer")
            page.get_by_role("heading", name="Atlas Events").wait_for(timeout=20_000)
            page.get_by_role("button", name="Review stands").first.click()
            moderation_row = page.locator("[data-event-stands] > div", has_text=stand_name)
            moderation_row.wait_for(timeout=20_000)
            moderation_row.get_by_role("button", name="Publish").click()
            page.get_by_text("Stand published.", exact=True).wait_for(timeout=20_000)

            logout(page)
            page.goto(f"{BASE_URL}/#/event/evt_atlas_2026")
            page.get_by_text(stand_name, exact=True).wait_for(timeout=20_000)

            login(page, deletion_email, visitor["password"])
            page.goto(f"{BASE_URL}/#/dashboard")
            page.locator('[data-testid="delete-account"]').wait_for(timeout=20_000)
            page.locator('[data-testid="delete-account"]').click()
            page.locator('[data-action="confirm"]').click()
            page.locator('[data-testid="auth-button"]').filter(has_text="Login").wait_for(
                timeout=20_000
            )
            assert_cognito_deleted(outputs, deletion_email)
        finally:
            context.close()
            browser.close()

    print("Deployed Playwright vertical test passed.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:  # noqa: BLE001
        print(f"E2E failure: {exc}", file=sys.stderr)
        raise
