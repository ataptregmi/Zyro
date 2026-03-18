const { test, expect } = require('@playwright/test');

const demoUser = {
  name: 'Nova Striker',
  handle: '@novastriker',
  email: 'nova@regas.gg',
  password: 'secret123',
  joinedAt: '2026-03-16T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.REGAS_SUPABASE = { enabled: false };
  });
  await page.goto('/index.html');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('redirects unauthenticated visitors away from profile', async ({ page }) => {
  await page.goto('/profile.html');
  await expect(page).toHaveURL(/auth\.html/);
});

test('signup creates an account and lands on profile', async ({ page }) => {
  await page.goto('/auth.html#signup');
  const signupForm = page.locator('[data-auth-form="signup"]');

  await signupForm.getByLabel('Display name').fill(demoUser.name);
  await signupForm.getByLabel('Gamer tag').fill(demoUser.handle);
  await signupForm.getByLabel('Email').fill(demoUser.email);
  await signupForm.getByLabel('Password', { exact: true }).fill(demoUser.password);
  await signupForm.getByLabel('Confirm password').fill(demoUser.password);
  await signupForm.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/profile\.html/);
  await expect(page.locator('[data-profile-handle]')).toHaveText(demoUser.handle);
});

test('login works for an existing account', async ({ page }) => {
  await page.goto('/auth.html');
  await page.evaluate((user) => {
    localStorage.setItem('regasUsers', JSON.stringify([user]));
  }, demoUser);

  const loginForm = page.locator('[data-auth-form="login"]');
  await loginForm.getByLabel('Email').fill(demoUser.email);
  await loginForm.getByLabel('Password').fill(demoUser.password);
  await loginForm.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL(/profile\.html/);
  await expect(page.locator('[data-profile-handle]')).toHaveText(demoUser.handle);
});

test('shows placeholders for discord login and password reset', async ({ page }) => {
  await page.goto('/auth.html');

  await page.getByRole('button', { name: 'Continue with Discord' }).click();
  await expect(page.locator('[data-auth-message="login"]'))
    .toHaveText('Discord login is coming soon. Use email for now.');

  await page.getByRole('link', { name: 'Reset it' }).click();
  await expect(page).toHaveURL(/#reset/);
  await page.getByLabel('Email').last().fill(demoUser.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('[data-auth-message="reset"]'))
    .toHaveText('Password resets require the hosted backend.');
});

test('logout clears the session and returns home', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate((user) => {
    localStorage.setItem('regasSession', JSON.stringify(user));
  }, {
    name: demoUser.name,
    handle: demoUser.handle,
    email: demoUser.email,
    joinedAt: demoUser.joinedAt,
  });
  await page.reload();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/index\.html/);

  const session = await page.evaluate(() => localStorage.getItem('regasSession'));
  expect(session).toBeNull();
});
