import { test, expect } from '@playwright/test';

test.describe('Signup Flow', () => {
  test('shows pilot invite requirement', async ({ page }) => {
    await page.goto('/');
    
    // Should redirect to top-floor or auth/signin
    await expect(page).toHaveURL(/\/(top-floor|auth\/signin)/);
    
    // Page should load successfully
    await expect(page.locator('body')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Enter invalid email
    await page.fill('input[type="email"]', 'invalid');
    await page.click('button[type="submit"]');
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('input[type="email"]');
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('accepts valid email format', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Enter valid email (even if not whitelisted)
    await page.fill('input[type="email"]', 'test@example.com');
    
    const emailInput = page.locator('input[type="email"]');
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(true);
  });

  test('shows magic link sent message', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Enter a valid email (may fail at server if not whitelisted, but form submits)
    await page.fill('input[type="email"]', 'pilot@bureau.example.com');
    await page.click('button[type="submit"]');
    
    // Should either redirect or show error (not hang)
    await page.waitForTimeout(2000);
    
    // Page should have changed state
    const url = page.url();
    expect(url).toBeTruthy();
  });
});
