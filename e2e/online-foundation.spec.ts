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
  avatar_source_path: null,
  avatar_crop: null,
  avatar_revision: 0,
  avatar_updated_at: null,
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

async function expectNoAutomaticLegacyDialogs(page: Page) {
  await expect(page.getByRole('dialog', { name: 'Adicionar itens locais?' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Adicionar dados locais?' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Adicionar compras anteriores?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Dados locais antigos' })).toHaveCount(0);
  await expect(page.getByText('Recuperação opcional')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adicionar à Casa' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ocultar' })).toHaveCount(0);
}

async function seedLegacyIndexedDb(page: Page) {
  await page.evaluate(async () => {
    const openDatabase = (name: string, version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = version ? indexedDB.open(name, version) : indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const waitForTransaction = (transaction: IDBTransaction) =>
      new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    const legacyHouseId = 'house-raabe-sidney';
    const now = '2026-08-01T10:00:00.000Z';
    const unified = await openDatabase('casae-local');
    const unifiedTransaction = unified.transaction(
      ['shoppingItems', 'products', 'categories', 'stores'],
      'readwrite',
    );
    unifiedTransaction.objectStore('shoppingItems').put({
      id: 'legacy-e2e-item',
      houseId: legacyHouseId,
      productName: 'Item antigo',
      quantity: 1,
      unit: 'unidade',
      category: 'outros',
      preferredBrand: '',
      notes: '',
      priority: 'normal',
      status: 'pending',
      addedBy: 'Legacy',
      createdAt: now,
      updatedAt: now,
    });
    unifiedTransaction.objectStore('products').put({
      id: 'legacy-e2e-product',
      houseId: legacyHouseId,
      name: 'Produto antigo',
      normalizedName: 'produto antigo',
      brand: '',
      categoryId: 'legacy-e2e-category',
      defaultUnit: 'unidade',
      notes: '',
      favorite: false,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    unifiedTransaction.objectStore('categories').put({
      id: 'legacy-e2e-category',
      houseId: legacyHouseId,
      name: 'Categoria antiga',
      normalizedName: 'categoria antiga',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    unifiedTransaction.objectStore('stores').put({
      id: 'legacy-e2e-store',
      houseId: legacyHouseId,
      name: 'Mercado antigo',
      nickname: '',
      address: '',
      notes: '',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await waitForTransaction(unifiedTransaction);
    unified.close();

    const createSeparateDatabase = (
      name: string,
      storeName: string,
      record: Record<string, unknown>,
    ) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(storeName, { keyPath: 'id' }).put(record);
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    await createSeparateDatabase('casae-shopping-list', 'shopping-items', {
      id: 'separate-legacy-item',
      productName: 'Item separado antigo',
    });
    await createSeparateDatabase('casae-purchases', 'purchase-sessions', {
      id: 'separate-legacy-session',
      status: 'completed',
    });
  });
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
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Olá, Raabe Online/ })).toBeVisible();
  await expectNoAutomaticLegacyDialogs(page);
  await seedLegacyIndexedDb(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Casa Online' })).toBeVisible();
    await expectNoAutomaticLegacyDialogs(page);
    await expect(page.getByText('raabe@casae.test')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Raabe Online', level: 2 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.goto('/lista');
    await expect(page.getByRole('heading', { name: 'Lista de compras' })).toBeVisible();
    await expectNoAutomaticLegacyDialogs(page);
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
  await expectNoAutomaticLegacyDialogs(page);
  await page.getByRole('button', { name: 'Convidar membro' }).click();
  const dialog = page.getByRole('dialog', { name: /Convidar para Casa Online/ });
  await expect(dialog.getByText('A1B2-C3D4-E5F6-A7B8-C9D0-E1F2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
