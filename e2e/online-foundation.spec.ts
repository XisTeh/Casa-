import { expect, test, type Page } from '@playwright/test';

test.skip(
  process.env.PLAYWRIGHT_REMOTE_FOUNDATION !== 'true',
  'Executado separadamente contra o servidor de QA com Supabase simulado.',
);

const viewports = [
  { width: 320, height: 720 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

const profile = {
  id: '10000000-0000-0000-0000-000000000001',
  display_name: 'Raabe Online',
  avatar_path: null,
  created_at: '2026-08-26T10:00:00.000Z',
  updated_at: '2026-08-26T10:00:00.000Z',
};

async function installSession(page: Page) {
  await page.addInitScript(
    ({ profileId }) => {
      localStorage.setItem(
        'sb-casae-qa-auth-token',
        JSON.stringify({
          access_token: 'qa-access-token',
          refresh_token: 'qa-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: profileId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'raabe@casae.test',
            email_confirmed_at: '2026-08-26T10:00:00.000Z',
            phone: '',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: { display_name: 'Raabe Online' },
            identities: [],
            created_at: '2026-08-26T10:00:00.000Z',
          },
        }),
      );
    },
    { profileId: profile.id },
  );
}

async function mockSupabase(page: Page, hasHouse: boolean) {
  await page.route('https://casae-qa.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        body: JSON.stringify(body),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        status: 200,
      });
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      return json(url.searchParams.get('id')?.startsWith('in.') ? [profile] : profile);
    }
    if (url.pathname.endsWith('/rest/v1/house_members')) {
      if (!hasHouse) return json([]);
      if (url.searchParams.get('select') === 'house_id') return json([{ house_id: 'house-a' }]);
      return json([
        {
          id: 'member-a',
          house_id: 'house-a',
          user_id: profile.id,
          role: 'owner',
          status: 'active',
          joined_at: '2026-08-26T10:00:00.000Z',
        },
      ]);
    }
    if (url.pathname.endsWith('/rest/v1/houses')) {
      return json([
        {
          id: 'house-a',
          name: 'Casa Online',
          created_by: profile.id,
          created_at: '2026-08-26T10:00:00.000Z',
          updated_at: '2026-08-26T10:00:00.000Z',
        },
      ]);
    }
    if (url.pathname.endsWith('/rest/v1/shopping_items')) return json([]);
    if (url.pathname.endsWith('/rest/v1/rpc/create_house_invite')) {
      return json({
        token: 'A1B2-C3D4-E5F6-A7B8-C9D0-E1F2',
        expires_at: '2026-09-02T10:00:00.000Z',
      });
    }
    return json({});
  });
}

async function dismissLegacyMigration(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Adicionar itens locais?' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2_000 });
    await dialog.getByRole('button', { name: 'Agora não' }).click();
    await dialog.waitFor({ state: 'hidden' });
  } catch {
    // Dispositivos sem dados locais não exibem a decisão de migração.
  }
}

test('login, cadastro e recuperação permanecem responsivos', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [route, heading] of [
      ['/entrar', 'Entre no Casaê'],
      ['/criar-conta', 'Crie sua conta'],
      ['/recuperar-senha', 'Redefina sua senha'],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth).toBe(layout.clientWidth);
    }
  }
});

test('onboarding sem Casa permanece responsivo', async ({ page }) => {
  await installSession(page);
  await mockSupabase(page, false);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Olá, Raabe Online.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar minha Casa' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
  }
});

test('Lista, Configurações, membros, Casas e convite usam a identidade remota', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installSession(page);
  await mockSupabase(page, true);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Casa Online' })).toBeVisible();
    await dismissLegacyMigration(page);
    await expect(page.getByText('raabe@casae.test')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Raabe Online', level: 2 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.goto('/lista');
    await expect(page.getByRole('heading', { name: 'Lista de compras' })).toBeVisible();
    await dismissLegacyMigration(page);
    await page.getByRole('button', { name: 'Adicionar produto' }).first().click();
    const itemDialog = page.getByRole('dialog', { name: 'Adicionar produto' });
    const categorySelect = itemDialog.getByRole('combobox', { name: /Categoria/ });
    await expect(categorySelect.locator('option')).toHaveCount(11);
    await expect(categorySelect).toHaveValue('category-house-a-mercearia');
    await itemDialog.getByRole('button', { name: 'Cancelar' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Casa Online' })).toBeVisible();
  await dismissLegacyMigration(page);
  await page.getByRole('button', { name: 'Convidar membro' }).click();
  const dialog = page.getByRole('dialog', { name: /Convidar para Casa Online/ });
  await expect(dialog.getByText('A1B2-C3D4-E5F6-A7B8-C9D0-E1F2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
