import { expect, test } from '@playwright/test';

test('exibe a home e navega pela estrutura principal', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /olá, raabe/i })).toBeVisible();
  await page.getByRole('link', { name: 'Lista' }).first().click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.getByRole('heading', { name: 'Lista de compras' })).toBeVisible();
});

test('usa navegação inferior no mobile e sidebar no desktop', async ({ page }, testInfo) => {
  await page.goto('/');

  const isMobile = testInfo.project.name.includes('mobile');
  const bottomNavigation = page.locator('.bottom-nav');
  const sidebar = page.locator('.sidebar');

  if (isMobile) {
    await expect(bottomNavigation).toBeVisible();
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: 'Abrir perfil de Raabe' }).click();
    await expect(page.getByRole('menuitem', { name: 'Instalar Casaê' })).toBeVisible();
  } else {
    await expect(sidebar).toBeVisible();
    await expect(bottomNavigation).toBeHidden();
  }
});

test('mantém ações e filtros legíveis e bem posicionados no mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Regressão visual específica de mobile.');
  await page.setViewportSize({ width: 440, height: 900 });

  await page.goto('/comprar');
  const quickPurchase = page.getByRole('button', { name: 'Começar compra rápida' });
  await quickPurchase.hover();
  await expect
    .poll(() => quickPurchase.evaluate((button) => getComputedStyle(button).backgroundColor))
    .toBe('rgba(255, 255, 255, 0.15)');
  const hoverStyle = await quickPurchase.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    color: getComputedStyle(button.querySelector('.button__label')!).color,
  }));
  expect(hoverStyle.background).toBe('rgba(255, 255, 255, 0.15)');
  expect(hoverStyle.color).toBe('rgb(255, 255, 255)');

  await quickPurchase.click();
  const purchaseDialog = page.getByRole('dialog', { name: 'Onde você está comprando?' });
  const footerLayout = await purchaseDialog.locator('.shopping-dialog__footer').evaluate((footer) => {
    const buttons = [...footer.querySelectorAll<HTMLElement>('.button')];
    return {
      columns: getComputedStyle(footer).gridTemplateColumns.split(' ').length,
      labelsFit: buttons.every((button) => {
        const label = button.querySelector<HTMLElement>('.button__label')!;
        return label.scrollWidth <= label.clientWidth && button.scrollWidth <= button.clientWidth;
      }),
    };
  });
  expect(footerLayout).toEqual({ columns: 1, labelsFit: true });
  await purchaseDialog.getByRole('button', { name: 'Voltar' }).click();

  await page.goto('/produtos');
  const filterSpacing = await page.locator('.product-segment').evaluate((segment) => {
    const segmentBounds = segment.getBoundingClientRect();
    const lastButtonBounds = segment.querySelector('button:last-child')!.getBoundingClientRect();
    return {
      documentGap: document.documentElement.clientWidth - segmentBounds.right,
      innerGap: segmentBounds.right - lastButtonBounds.right,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(filterSpacing.documentGap).toBeGreaterThanOrEqual(16);
  expect(filterSpacing.innerGap).toBeGreaterThanOrEqual(4);
  expect(filterSpacing.overflow).toBe(0);

  await page.locator('.mobile-header .brand').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /olá, raabe/i })).toBeVisible();
});

test('usa seletores visuais do Casaê no histórico', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Regressão visual específica de mobile.');
  await page.setViewportSize({ width: 440, height: 900 });
  await page.goto('/historico?visao=precos');

  const filters = page.getByRole('region', { name: 'Filtros do histórico de preços' });
  await expect(filters.locator('select')).toHaveCount(0);
  const category = filters.getByRole('combobox', { name: 'Categoria' });
  await category.click();

  const menu = page.getByRole('listbox', { name: 'Categoria' });
  await expect(menu).toBeVisible();
  const menuLayout = await menu.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const fieldBounds = element.closest('.select-field')!.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      aligned:
        Math.abs(bounds.left - fieldBounds.left) <= 2 &&
        Math.abs(bounds.right - fieldBounds.right) <= 2,
      background: style.backgroundColor,
      insideViewport: bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth,
      radius: style.borderRadius,
      scrollable: element.scrollHeight > element.clientHeight,
      shadow: style.boxShadow,
    };
  });
  expect(menuLayout.aligned).toBe(true);
  expect(menuLayout.background).toBe('rgb(255, 255, 255)');
  expect(menuLayout.insideViewport).toBe(true);
  expect(menuLayout.radius).not.toBe('0px');
  expect(menuLayout.scrollable).toBe(true);
  expect(menuLayout.shadow).not.toBe('none');

  await page.getByRole('option', { name: 'Pet' }).click();
  await expect(category).toContainText('Pet');
  await expect(page).toHaveURL(/categoria=/);
});

test('preserva o layout nos breakpoints críticos sem overflow horizontal', async ({ page }) => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
    { width: 768, height: 900 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    for (const route of [
      '/',
      '/lista',
      '/comprar',
      '/produtos',
      '/mercados',
      '/historico',
      '/gastos',
      '/configuracoes',
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.locator('.app-shell').waitFor({ state: 'visible' });

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sidebarVisible: getComputedStyle(document.querySelector('.sidebar')!).display !== 'none',
        bottomNavigationVisible:
          getComputedStyle(document.querySelector('.bottom-nav')!).display !== 'none',
      }));

      expect(layout.scrollWidth).toBe(layout.clientWidth);
      expect(layout.sidebarVisible).toBe(viewport.width >= 960);
      expect(layout.bottomNavigationVisible).toBe(viewport.width < 960);

      if (route === '/configuracoes') {
        const avatars = await page.evaluate(() => {
          const inspect = (selector: string) => {
            const element = document.querySelector(selector)!;
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              width: bounds.width,
              height: bounds.height,
              borderRadius: style.borderRadius,
              flexGrow: style.flexGrow,
              flexShrink: style.flexShrink,
            };
          };
          return {
            member: inspect('.settings-members__list .avatar'),
            profile: inspect('.settings-profile > .avatar'),
          };
        });
        expect(avatars.member.width).toBeGreaterThanOrEqual(42);
        expect(avatars.member.width).toBeLessThanOrEqual(48);
        expect(avatars.member.height).toBe(avatars.member.width);
        expect(avatars.profile.width).toBeGreaterThanOrEqual(56);
        expect(avatars.profile.width).toBeLessThanOrEqual(64);
        expect(avatars.profile.height).toBe(avatars.profile.width);
        expect(avatars.member.borderRadius).toBe('50%');
        expect(avatars.profile.borderRadius).toBe('50%');
        expect(avatars.member.flexGrow).toBe('0');
        expect(avatars.member.flexShrink).toBe('0');
      }
    }
  }
});

test('mantém botões, campos e formulário longo corretos em 320px', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Regressão visual específica de mobile.');
  await page.setViewportSize({ width: 320, height: 720 });

  await page.goto('/configuracoes');
  const addMember = page.getByRole('button', { name: 'Adicionar membro' });
  const buttonLayout = await addMember.evaluate((button) => {
    const label = button.querySelector('.button__label')!;
    const icon = label.querySelector('svg')!;
    const labelBounds = label.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return {
      direction: getComputedStyle(label).flexDirection,
      iconShrink: getComputedStyle(icon).flexShrink,
      whiteSpace: getComputedStyle(label).whiteSpace,
      centers: Math.abs(
        iconBounds.top + iconBounds.height / 2 - (labelBounds.top + labelBounds.height / 2),
      ),
    };
  });
  expect(buttonLayout).toMatchObject({ direction: 'row', iconShrink: '0', whiteSpace: 'nowrap' });
  expect(buttonLayout.centers).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Adicionar produto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar produto' });
  const productInput = dialog.getByLabel(/^Produto/);
  await expect(productInput).toBeFocused();
  const controlStyle = await productInput.evaluate((input) => ({
    borderRadius: getComputedStyle(input).borderRadius,
    outline: getComputedStyle(input).outlineStyle,
    shadow: getComputedStyle(input).boxShadow,
  }));
  expect(controlStyle.borderRadius).not.toBe('0px');
  expect(controlStyle.outline).toBe('none');
  expect(controlStyle.shadow).not.toBe('none');

  const form = dialog.locator('.shopping-form');
  const initialDialogLayout = await dialog.evaluate((element) => {
    const footer = element.querySelector('.shopping-dialog__footer')!;
    const lastField = element.querySelector('.product-recurrence-field')!;
    const footerBounds = footer.getBoundingClientRect();
    const fieldBounds = lastField.getBoundingClientRect();
    return {
      footerPosition: getComputedStyle(footer).position,
      overlap: Math.max(0, fieldBounds.bottom - footerBounds.top),
    };
  });
  expect(initialDialogLayout).toEqual({ footerPosition: 'static', overlap: 0 });

  await form.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const footer = dialog.locator('.shopping-dialog__footer');
  await expect(footer.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Adicionar produto' })).toBeVisible();
  const footerLayout = await footer.evaluate((element) => {
    const actions = [...element.querySelectorAll<HTMLElement>('.button')];
    const cancel = actions[0]!;
    return {
      actions: actions.map((action) => ({
        width: action.getBoundingClientRect().width,
        whiteSpace: getComputedStyle(action).whiteSpace,
      })),
      cancelBackground: getComputedStyle(cancel).backgroundColor,
      cancelBorder: getComputedStyle(cancel).borderStyle,
      cancelVariant: cancel.classList.contains('button--secondary'),
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      footerRadius: getComputedStyle(element).borderRadius,
    };
  });
  expect(footerLayout.actions).toHaveLength(2);
  expect(
    footerLayout.actions.every((action) => action.width > 200 && action.whiteSpace === 'nowrap'),
  ).toBe(true);
  expect(footerLayout).toMatchObject({
    cancelBackground: 'rgb(255, 255, 255)',
    cancelBorder: 'solid',
    cancelVariant: true,
    columns: 1,
  });
  expect(footerLayout.footerRadius).not.toBe('0px');
});

test('adiciona, troca, remove e isola a foto local do perfil', async ({ page }) => {
  test.setTimeout(60_000);
  const firstPhoto = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const secondPhoto = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlK6KsAAAAASUVORK5CYII=',
    'base64',
  );

  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  let dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await dialog.getByLabel('Selecionar foto de perfil').setInputFiles({
    name: 'perfil.png',
    mimeType: 'image/png',
    buffer: firstPhoto,
  });
  await expect(dialog.getByRole('img', { name: 'Foto de perfil de Raabe' })).toBeVisible();
  await dialog.getByLabel('Nome').fill('Raabe Foto');
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil atualizado.');
  await expect(page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' })).toHaveCount(3);
  await expect(
    page.locator('.settings-members__list').getByRole('img', {
      name: 'Foto de perfil de Raabe Foto',
    }),
  ).toBeVisible();
  await expect(
    page.locator('.settings-profile').getByRole('img', { name: 'Foto de perfil de Raabe Foto' }),
  ).toBeVisible();
  await expect(
    page
      .locator('.sidebar__profile, .mobile-profile-trigger')
      .getByRole('img', { name: 'Foto de perfil de Raabe Foto' }),
  ).toBeVisible();

  const renderedPhoto = page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' }).first();
  expect(
    await renderedPhoto.evaluate((image) => ({
      fit: getComputedStyle(image).objectFit,
      position: getComputedStyle(image).objectPosition,
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    })),
  ).toMatchObject({ fit: 'cover', position: '50% 50%' });

  await page.reload();
  await expect(page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' })).toHaveCount(3);

  await page.getByRole('button', { name: 'Editar perfil' }).click();
  dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await dialog.getByLabel('Nome').fill('Alteração cancelada');
  await dialog.getByRole('button', { name: 'Remover foto de perfil' }).click();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Raabe Foto' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' })).toHaveCount(3);

  await page.getByRole('button', { name: 'Editar perfil' }).click();
  dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await dialog.getByLabel('Selecionar foto de perfil').setInputFiles({
    name: 'perfil-trocado.png',
    mimeType: 'image/png',
    buffer: secondPhoto,
  });
  await expect(dialog.getByRole('button', { name: 'Trocar foto' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click();

  await page.getByRole('button', { name: 'Nova Casa' }).click();
  dialog = page.getByRole('dialog', { name: 'Nova Casa' });
  await dialog.getByLabel('Nome da Casa').fill('Casa sem foto');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('img', { name: 'Avatar de Raabe Foto' }).first()).toBeVisible();
  await page.getByRole('button', { name: /Casa Raabe & Sidney/ }).click();
  await expect(page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' })).toHaveCount(3);

  await page.getByRole('button', { name: 'Editar perfil' }).click();
  dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await dialog.getByRole('button', { name: 'Remover foto de perfil' }).click();
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('img', { name: 'Foto de perfil de Raabe Foto' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Avatar de Raabe Foto' })).toHaveCount(3);

  await page.getByRole('button', { name: 'Editar perfil' }).click();
  dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await dialog.getByLabel('Selecionar foto de perfil').setInputFiles({
    name: 'invalida.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('imagem inválida'),
  });
  await expect(dialog.getByRole('alert')).toContainText('Escolha uma imagem JPG, PNG ou WebP.');
});

test('integra Produtos, Lista, compra, Histórico e preserva snapshots', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/produtos');
  await expect(page.getByRole('heading', { name: 'Produtos da casa' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar produto' }).click();
  const productDialog = page.getByRole('dialog', { name: 'Adicionar produto' });
  await productDialog.getByLabel(/^Produto/).fill('Arroz especial E2E');
  await productDialog.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca original');
  await productDialog.getByLabel(/^Categoria/).selectOption({ label: 'Mercearia' });
  await productDialog.getByLabel('Quantidade padrão').fill('2');
  await productDialog.getByLabel('Unidade').selectOption('pacote');
  await productDialog.getByText('Marcar como favorito').click();
  await productDialog.getByRole('button', { name: 'Adicionar produto' }).click();

  const productCard = page.locator('.product-card').filter({ hasText: 'Arroz especial E2E' });
  await expect(productCard).toContainText('Marca original');
  await productCard.getByRole('button', { name: 'Adicionar à lista' }).click();
  await expect(page.getByRole('status')).toContainText('foi adicionado');

  await page.goto('/lista');
  await expect(page.getByText('Arroz especial E2E')).toBeVisible();
  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByLabel('Nome do novo mercado').fill('Mercado Produtos E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByRole('button', { name: /Arroz especial E2E/ }).click();
  await page.getByLabel('Preço por pacote').fill('10,00');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();

  await page.goto('/produtos');
  let purchasedCard = page.locator('.product-card').filter({ hasText: 'Arroz especial E2E' });
  await expect(purchasedCard).toContainText('R$ 10,00');
  await expect(purchasedCard).toContainText('Mercado Produtos E2E');
  await purchasedCard.getByRole('button', { name: 'Adicionar à lista' }).click();
  await expect(page.getByRole('status')).toContainText('foi adicionado');

  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByRole('radio', { name: 'Cadastrar novo' }).check();
  await page.getByLabel('Nome do novo mercado').fill('Mercado Preços E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByRole('button', { name: /Arroz especial E2E/ }).click();
  await page.getByLabel('Preço por pacote').fill('12,00');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();

  await page.goto('/produtos');
  purchasedCard = page.locator('.product-card').filter({ hasText: 'Arroz especial E2E' });
  await expect(purchasedCard).toContainText('R$ 12,00');
  await purchasedCard
    .getByRole('button', { name: 'Abrir histórico de preços de Arroz especial E2E' })
    .click();
  const productPriceDialog = page.getByRole('dialog', { name: 'Arroz especial E2E' });
  await expect(productPriceDialog.getByText('Comparação entre mercados')).toBeVisible();
  await expect(
    productPriceDialog.getByText('Mercado Produtos E2E', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    productPriceDialog.getByText('Mercado Preços E2E', { exact: true }).first(),
  ).toBeVisible();
  await productPriceDialog.getByRole('button', { name: 'Fechar histórico de preços' }).click();

  await purchasedCard.getByRole('button', { name: 'Editar Arroz especial E2E' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar produto' });
  await editDialog.getByLabel(/^Produto/).fill('Arroz especial E2E 1kg');
  await editDialog.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca nova');
  await editDialog.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Arroz especial E2E 1kg' })).toBeVisible();

  await page.goto('/historico');
  await page.getByRole('button', { name: /Mercado Produtos E2E/ }).click();
  const historyDialog = page.getByRole('dialog', { name: 'Mercado Produtos E2E' });
  await expect(historyDialog.getByText('Arroz especial E2E')).toBeVisible();
  await expect(historyDialog.getByText(/Marca original/)).toBeVisible();
  await expect(historyDialog.getByText('Arroz especial E2E 1kg')).toHaveCount(0);
  await historyDialog.getByRole('button', { name: 'Fechar detalhe' }).click();

  await page.getByRole('tab', { name: 'Preços' }).click();
  const priceCard = page.getByRole('button', { name: /Arroz especial E2E 1kg/ });
  await expect(priceCard).toContainText('+20%');
  await priceCard.click();
  const renamedPriceDialog = page.getByRole('dialog', { name: 'Arroz especial E2E 1kg' });
  await expect(
    renamedPriceDialog.getByText('Nome na compra: Arroz especial E2E').first(),
  ).toBeVisible();
  await expect(
    renamedPriceDialog.getByText('Mercado Produtos E2E', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    renamedPriceDialog.getByText('Mercado Preços E2E', { exact: true }).first(),
  ).toBeVisible();
});

test('inicia e cancela uma compra preservando a lista', async ({ page }) => {
  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByLabel('Nome do novo mercado').fill('Mercado de teste');
  await page.getByRole('dialog').getByRole('button', { name: 'Comprar usando a lista' }).click();

  await expect(page.getByRole('heading', { name: 'Mercado de teste' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar compra' }).click();

  await expect(page.getByText(/lista continua intacta/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hora de ir às compras.' })).toBeVisible();
});

test('integra Mercados, Comprar e Histórico com snapshots reais', async ({ page }) => {
  await page.goto('/mercados');
  await page.getByRole('button', { name: 'Cadastrar primeiro mercado' }).click();
  const storeDialog = page.getByRole('dialog', { name: 'Adicionar mercado' });
  await storeDialog.getByLabel(/^Nome/).fill('Mercado E2E');
  await storeDialog.getByRole('button', { name: 'Adicionar mercado' }).click();
  await expect(page.getByRole('heading', { name: 'Mercado E2E' })).toBeVisible();

  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Comprar usando a lista' }).click();
  await page.getByRole('button', { name: /Arroz/ }).click();
  await page.getByLabel('Preço por pacote').fill('8,90');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();

  await page.goto('/historico');
  await expect(page.getByRole('button', { name: /Mercado E2E/ })).toBeVisible();
  await page.getByRole('button', { name: /Mercado E2E/ }).click();
  const purchaseDetail = page.getByRole('dialog', { name: 'Mercado E2E' });
  await expect(purchaseDetail.getByText('Arroz')).toBeVisible();
  await expect(purchaseDetail.getByText(/Tio João/)).toBeVisible();
  await expect(purchaseDetail.getByText(/17,80/).first()).toBeVisible();
});

test('atualiza Gastos e Dashboard após uma compra e persiste o orçamento mensal', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Começar compra rápida' }).click();
  await page.getByLabel('Nome do novo mercado').fill('Mercado Gastos E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Começar compra rápida' }).click();

  const quickProductInput = page.getByRole('textbox', { name: 'Produto' });
  await expect(quickProductInput).toBeFocused();
  await quickProductInput.fill('Café do orçamento');
  await page.getByLabel('Quantidade do item rápido').fill('2');
  await page.getByLabel('Preço unitário do item rápido').fill('10,00');
  await page.getByRole('button', { name: 'Adicionar e continuar' }).click();
  await expect(page.getByText('R$ 20,00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();

  await page.goto('/gastos');
  await expect(page.getByRole('heading', { name: 'Gastos', exact: true })).toBeVisible();
  const spendingSummary = page.getByRole('region', { name: 'Resumo financeiro do mês' });
  await expect(spendingSummary.getByText('R$ 20,00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Definir orçamento' }).first().click();
  const budgetDialog = page.getByRole('dialog', { name: 'Definir orçamento' });
  await budgetDialog.getByLabel('Orçamento do mês').fill('100,00');
  await budgetDialog.getByRole('button', { name: 'Salvar orçamento' }).click();
  await expect(page.locator('.budget-panel__progress').getByText('20% utilizado')).toBeVisible();
  await expect(page.getByText('R$ 80,00 disponíveis')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Gastos acumulados no mês' })).toBeVisible();
  await expect(page.locator('.spending-chart__budget')).toContainText('R$ 100,00');
  await page.getByRole('button', { name: 'Ver relatório completo' }).click();
  const monthlyReport = page.getByRole('region', { name: 'Resumo do mês' });
  await expect(monthlyReport.getByText('Ticket médio').first()).toBeVisible();
  await expect(monthlyReport.getByText('R$ 20,00').first()).toBeVisible();
  await expect(monthlyReport.getByText('Mercado Gastos E2E').first()).toBeVisible();
  await expect(monthlyReport.getByText('Café do orçamento').first()).toBeVisible();
  const chartPoint = page.locator('.spending-chart__interactive-point--current').first();
  await expect(chartPoint).toBeVisible();
  await chartPoint.click();
  await expect(page.locator('.spending-chart__tooltip')).toContainText('acumulados');

  await page.getByRole('button', { name: /Mercado Gastos E2E/ }).click();
  const purchaseDetail = page.getByRole('dialog', { name: 'Mercado Gastos E2E' });
  await expect(purchaseDetail.getByText('Café do orçamento')).toBeVisible();
  await purchaseDetail.getByRole('button', { name: 'Fechar detalhe' }).click();

  await page.goto('/');
  const dashboardSpending = page.locator('.summary-card--spending');
  await expect(dashboardSpending).toContainText('R$ 20,00');
  await expect(dashboardSpending).toContainText('R$ 100,00');
  await expect(dashboardSpending).toContainText('20%');
  const spendingAction = dashboardSpending.getByRole('link', { name: 'Ver gastos' });
  await expect(spendingAction).toBeVisible();
  const spendingActionStyle = await spendingAction.evaluate((link) => ({
    background: getComputedStyle(link).backgroundColor,
    color: getComputedStyle(link).color,
    height: link.getBoundingClientRect().height,
  }));
  expect(spendingActionStyle).toMatchObject({
    background: 'rgb(23, 59, 69)',
    color: 'rgba(255, 255, 255, 0.9)',
  });
  expect(spendingActionStyle.height).toBeGreaterThanOrEqual(40);

  await page.getByRole('link', { name: 'Abrir histórico de compras' }).click();
  await expect(page).toHaveURL(/\/historico$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/');
  await page.reload();
  await expect(page.locator('.summary-card--spending')).toContainText('R$ 100,00');
});

test('configura recorrência manual, filtra e preserva após reload', async ({ page }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Adicionar produto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar produto' });
  await dialog.getByLabel(/^Produto/).fill('Papel recorrente E2E');
  await dialog.getByLabel(/^Categoria/).selectOption({ label: 'Higiene' });
  await dialog.getByLabel('Quantidade padrão').fill('12');
  await dialog.getByLabel('Unidade').selectOption('unidade');
  await dialog.getByRole('checkbox', { name: 'Marcar como recorrente' }).check();
  await dialog.getByLabel('Repor a cada').fill('30');
  await dialog.getByRole('button', { name: 'Adicionar produto' }).click();

  const productCard = page.locator('.product-card').filter({ hasText: 'Papel recorrente E2E' });
  await expect(productCard).toContainText('Recorrência');
  await expect(productCard).toContainText('a cada 30 dias');
  await page.getByRole('button', { name: 'Recorrentes' }).click();
  await expect(productCard).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Recorrentes' }).click();
  await expect(
    page.locator('.product-card').filter({ hasText: 'Papel recorrente E2E' }),
  ).toContainText('a cada 30 dias');
});

test('isola dados ao criar e alternar Casas e registra o membro ativo', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Casa e perfis' })).toBeVisible();

  await page.getByRole('button', { name: 'Editar Casa' }).click();
  let dialog = page.getByRole('dialog', { name: 'Editar Casa' });
  await dialog.getByLabel('Nome da Casa').fill('Casa Antiga E2E');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Casa Antiga E2E' })).toBeVisible();

  await page.getByRole('button', { name: /Adicionar membro/ }).click();
  dialog = page.getByRole('dialog', { name: 'Adicionar membro' });
  await dialog.getByLabel('Nome do membro').fill('Ronnan E2E');
  await dialog.getByLabel('Função').selectOption('member');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Ronnan E2E', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: /Abrir perfil de Raabe/ }).click();
  await page.getByRole('menuitem', { name: 'Trocar perfil' }).click();
  await page.getByRole('button', { name: 'Ronnan E2E', exact: true }).click();
  await expect(page.getByRole('button', { name: /Abrir perfil de Ronnan E2E/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nova Casa' }).click();
  dialog = page.getByRole('dialog', { name: 'Nova Casa' });
  await dialog.getByLabel('Nome da Casa').fill('Casa Nova E2E');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Casa Nova E2E' })).toBeVisible();

  await page.goto('/lista');
  await expect(page.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
  await page.goto('/produtos');
  await expect(page.getByRole('heading', { name: 'Seu catálogo começa aqui' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar produto' }).click();
  dialog = page.getByRole('dialog', { name: 'Adicionar produto' });
  await dialog.getByLabel(/^Produto/).fill('Café Casa Nova');
  await dialog.getByLabel(/^Categoria/).selectOption({ label: 'Mercearia' });
  await dialog.getByRole('button', { name: 'Adicionar produto' }).click();
  await expect(page.getByRole('heading', { name: 'Café Casa Nova' })).toBeVisible();

  await page.goto('/mercados');
  await expect(page.getByText('Nenhum mercado cadastrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar primeiro mercado' }).click();
  dialog = page.getByRole('dialog', { name: 'Adicionar mercado' });
  await dialog.getByLabel(/^Nome/).fill('Mercado Casa Nova');
  await dialog.getByRole('button', { name: 'Adicionar mercado' }).click();
  await expect(page.getByRole('heading', { name: 'Mercado Casa Nova' })).toBeVisible();

  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Começar compra rápida' }).click();
  await page.getByRole('radio', { name: /Mercado Casa Nova/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Começar compra rápida' }).click();
  await page.getByRole('textbox', { name: 'Produto' }).fill('Café Casa Nova');
  await page.getByLabel('Quantidade do item rápido').fill('1');
  await page.getByLabel('Preço unitário do item rápido').fill('30,00');
  await page.getByRole('button', { name: 'Adicionar e continuar' }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();

  await page.goto('/historico');
  await page.getByRole('button', { name: /Mercado Casa Nova/ }).click();
  const purchaseDetail = page.getByRole('dialog', { name: 'Mercado Casa Nova' });
  await expect(purchaseDetail.getByText('Ronnan E2E', { exact: true })).toBeVisible();
  await purchaseDetail.getByRole('button', { name: 'Fechar detalhe' }).click();
  await page.goto('/gastos');
  await expect(page.getByText('R$ 30,00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Definir orçamento' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Definir orçamento' });
  await dialog.getByLabel('Orçamento do mês').fill('200,00');
  await dialog.getByRole('button', { name: 'Salvar orçamento' }).click();
  await expect(page.locator('.budget-panel__progress').getByText('15% utilizado')).toBeVisible();

  await page.goto('/configuracoes');
  await page.getByRole('button', { name: /Casa Antiga E2E/ }).click();
  await expect(page.getByRole('heading', { name: 'Casa Antiga E2E' })).toBeVisible();
  await page.goto('/lista');
  await expect(page.getByText('8 itens faltando')).toBeVisible();
  await expect(page.getByText('Café Casa Nova')).toHaveCount(0);

  await page.goto('/configuracoes');
  await page.getByRole('button', { name: /Casa Nova E2E/ }).click();
  await expect(page.getByRole('heading', { name: 'Casa Nova E2E' })).toBeVisible();
  await page.goto('/historico');
  await expect(page.getByRole('button', { name: /Mercado Casa Nova/ })).toBeVisible();
  await page.goto('/gastos');
  await expect(page.getByText('R$ 200,00').first()).toBeVisible();
});

test('faz compra rápida com três produtos em 320px', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Cenário específico de uso com uma mão.');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/comprar');
  await page.getByRole('button', { name: 'Começar compra rápida' }).click();
  await page.getByLabel('Nome do novo mercado').fill('Mercado Express E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'Começar compra rápida' }).click();

  const finalizePurchase = page.getByRole('button', { name: 'Finalizar compra' });
  await expect(finalizePurchase).toBeDisabled();
  const disabledStyle = await finalizePurchase.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    opacity: getComputedStyle(button).opacity,
  }));

  const addProduct = async (name: string, quantity: string, price: string) => {
    const productInput = page.getByRole('textbox', { name: 'Produto' });
    const quantityInput = page.getByLabel('Quantidade do item rápido');
    const priceInput = page.getByLabel('Preço unitário do item rápido');
    await productInput.fill(name);
    await expect(productInput).toHaveValue(name);
    await quantityInput.click();
    await quantityInput.fill(quantity);
    await expect(quantityInput).toHaveValue(quantity);
    await priceInput.fill(price);
    await expect(priceInput).toHaveValue(price);
    await page.getByRole('button', { name: 'Adicionar e continuar' }).click();
    await expect(productInput).toHaveValue('');
  };

  await addProduct('Coca-Cola 2L', '2', '8,99');
  await addProduct('Pão de forma', '1', '6,50');
  await addProduct('Sabonete', '3', '4,00');

  await expect(page.getByText('R$ 36,48').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar Coca-Cola 2L' })).toBeVisible();
  await expect(finalizePurchase).toBeEnabled();
  const enabledStyle = await finalizePurchase.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    color: getComputedStyle(button).color,
    labelColor: getComputedStyle(button.querySelector('.button__label')!).color,
    opacity: getComputedStyle(button).opacity,
  }));
  expect(enabledStyle).toEqual({
    background: 'rgb(23, 59, 69)',
    color: 'rgba(255, 255, 255, 0.9)',
    labelColor: 'rgba(255, 255, 255, 0.9)',
    opacity: '1',
  });
  expect(enabledStyle.background).not.toBe(disabledStyle.background);
  expect(Number(enabledStyle.opacity)).toBeGreaterThan(Number(disabledStyle.opacity));
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  const collision = await page.evaluate(() => {
    const cta = document.querySelector<HTMLElement>('.purchase-actions__complete')!;
    const navigation = document.querySelector<HTMLElement>('.bottom-nav')!;
    const ctaBounds = cta.getBoundingClientRect();
    const navigationBounds = navigation.getBoundingClientRect();
    return Math.max(0, ctaBounds.bottom - navigationBounds.top);
  });
  expect(collision).toBe(0);
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    productFocused: document.activeElement?.getAttribute('placeholder') === 'Ex.: Coca-Cola 2L',
  }));
  expect(layout.scrollWidth).toBe(layout.clientWidth);
  expect(layout.productFocused).toBe(true);

  await finalizePurchase.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText(/finalizada com sucesso/i)).toBeVisible();
  await page.goto('/historico');
  await page.getByRole('button', { name: /Mercado Express E2E/ }).click();
  const detail = page.getByRole('dialog', { name: 'Mercado Express E2E' });
  await expect(detail.getByText('Coca-Cola 2L')).toBeVisible();
  await expect(detail.getByText('Pão de forma')).toBeVisible();
  await expect(detail.getByText('Sabonete')).toBeVisible();
});
