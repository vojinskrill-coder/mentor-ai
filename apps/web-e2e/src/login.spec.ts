import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should display login page with brand heading', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Welcome to Mentor AI');
  });

  test('should display Google sign-in button', async ({ page }) => {
    await page.goto('/login');

    const googleBtn = page.locator('.google-btn');
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toContainText('Continue with Google');
  });

  test('should display dev mode button', async ({ page }) => {
    await page.goto('/login');

    const devBtn = page.locator('.dev-link');
    await expect(devBtn).toBeVisible();
    await expect(devBtn).toContainText('Continue (Dev Mode)');
  });

  test('should navigate to registration page', async ({ page }) => {
    await page.goto('/login');

    await page.click('a[href="/register"]');

    await expect(page).toHaveURL(/\/register/);
  });

  test('should navigate to chat on dev login', async ({ page }) => {
    await page.goto('/login');

    await page.click('.dev-link');

    await expect(page).toHaveURL(/\/chat/);
  });

  test('should show loading state on Google sign-in click', async ({ page }) => {
    await page.goto('/login');

    await page.click('.google-btn');

    // Button should become disabled during loading
    await expect(page.locator('.google-btn')).toBeDisabled();
  });
});

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Use dev login to access dashboard
    await page.goto('/login');
    await page.click('.dev-link');
  });

  test('should display dashboard after dev login', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.welcome-card h2')).toContainText('Welcome to Mentor AI');
  });

  test('should display navigation links', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.nav-links a').first()).toContainText('Chat');
  });

  test('should navigate to chat page', async ({ page }) => {
    await page.goto('/');

    await page.click('a[href="/chat"]');

    await expect(page).toHaveURL(/\/chat/);
  });
});
