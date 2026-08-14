import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'e2e/.seed.json'), 'utf8')) as {
  password: string;
  listingId: string;
  buyer: { id: string; email: string };
  seller: { id: string; email: string };
  operations: { id: string; email: string };
};

type Locale = 'en' | 'ar';

async function signIn(page: Page, locale: Locale, email: string) {
  await page.goto(`/${locale}/account/sign-in`);
  const isArabic = locale === 'ar';
  await page.getByLabel(isArabic ? 'البريد الإلكتروني' : 'Email').fill(email);
  await page.getByLabel(isArabic ? 'كلمة المرور' : 'Password').fill(seed.password);
  await page.getByRole('button', { name: isArabic ? 'دخول' : 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
}

for (const locale of ['en', 'ar'] as const) {
  const isArabic = locale === 'ar';

  test(`${locale} buyer journey`, async ({ page }) => {
    await signIn(page, locale, seed.buyer.email);
    await expect(page.locator(`[dir="${isArabic ? 'rtl' : 'ltr'}"]`).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: isArabic ? 'مرحباً، Browser Buyer' : 'Welcome, Browser Buyer' })).toBeVisible();

    await page.goto(`/${locale}/listings/${seed.listingId}`);
    await expect(page.getByText('Browser E2E marketplace listing', { exact: true })).toBeVisible();

    await page.goto(`/${locale}/messages`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/messages$`));
    await expect(page.locator('main')).toBeVisible();
  });

  test(`${locale} seller journey`, async ({ page }) => {
    await signIn(page, locale, seed.seller.email);
    await expect(page.getByRole('heading', { name: isArabic ? 'مرحباً، Browser Seller' : 'Welcome, Browser Seller' })).toBeVisible();

    await page.getByRole('link', { name: isArabic ? 'إعلاناتي' : 'My listings' }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sell/manage$`));
    await expect(page.getByText('Browser E2E marketplace listing', { exact: true })).toBeVisible();

    await page.goto(`/${locale}/sell`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/sell$`));
    await expect(page.locator('main')).toBeVisible();
  });

  test(`${locale} operations journey`, async ({ page }) => {
    await signIn(page, locale, seed.operations.email);
    await page.goto(`/${locale}/operations`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/operations$`));
    await expect(page.getByRole('heading', {
      name: isArabic ? 'لوحة إدارة سوقنا' : 'Suqnaa administration dashboard'
    })).toBeVisible();
    await expect(page.getByRole('heading', { name: isArabic ? 'عبء العمل' : 'Operational workload' })).toBeVisible();
    await expect(page.getByRole('link', { name: isArabic ? 'الأدوار والصلاحيات' : 'Roles and permissions' })).toBeVisible();
  });
}
