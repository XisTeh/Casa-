import { casaeManifest } from '../pwa/manifest';

describe('manifest do Casaê', () => {
  it('declara identidade, escopo, cores e ícones any/maskable versionados', () => {
    expect(casaeManifest).toMatchObject({
      name: 'Casaê',
      short_name: 'Casaê',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      theme_color: '#173b45',
      background_color: '#f7f6f2',
    });

    expect(casaeManifest.icons.filter((icon) => icon.purpose === 'any')).toHaveLength(2);
    expect(casaeManifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(2);
    expect(casaeManifest.icons.every((icon) => icon.src.includes('-v2-'))).toBe(true);
    expect(casaeManifest.icons.map((icon) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '192x192',
      '512x512',
    ]);
  });
});
