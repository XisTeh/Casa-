import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileAvatar } from '../components/ProfileAvatar/ProfileAvatar';

describe('ProfileAvatar', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-local');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('mostra até duas iniciais em um fallback circular quando não há foto', () => {
    const { rerender } = render(<ProfileAvatar profile={{ displayName: 'Raabe' }} size="member" />);
    expect(screen.getByRole('img', { name: 'Avatar de Raabe' })).toHaveTextContent('R');

    rerender(<ProfileAvatar profile={{ displayName: 'Raabe Silva' }} size="member" />);
    expect(screen.getByRole('img', { name: 'Avatar de Raabe Silva' })).toHaveTextContent('RS');
  });

  it('mostra a imagem persistida e não depende do nome para mantê-la', () => {
    const avatarBlob = new Blob(['foto'], { type: 'image/webp' });
    const { rerender } = render(<ProfileAvatar profile={{ displayName: 'Raabe', avatarBlob }} />);

    expect(screen.getByRole('img', { name: 'Foto de perfil de Raabe' })).toHaveAttribute(
      'src',
      'blob:avatar-local',
    );
    rerender(<ProfileAvatar profile={{ displayName: 'Raabe Silva', avatarBlob }} />);
    expect(screen.getByRole('img', { name: 'Foto de perfil de Raabe Silva' })).toBeVisible();
  });

  it('mantém uma object URL válida durante o replay de efeitos do Strict Mode', () => {
    const created: string[] = [];
    const revoked = new Set<string>();
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      const next = `blob:avatar-${created.length + 1}`;
      created.push(next);
      return next;
    });
    vi.mocked(URL.revokeObjectURL).mockImplementation((url) => revoked.add(url));

    const { unmount } = render(
      <StrictMode>
        <ProfileAvatar profile={{ displayName: 'Raabe', avatarBlob: new Blob(['foto']) }} />
      </StrictMode>,
    );

    const currentUrl = screen
      .getByRole('img', { name: 'Foto de perfil de Raabe' })
      .getAttribute('src');
    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(currentUrl).toBe(created.at(-1));
    expect(revoked.has(currentUrl!)).toBe(false);
    unmount();
    expect(revoked.has(currentUrl!)).toBe(true);
  });
});
