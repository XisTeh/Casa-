import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditProfileDialog } from '../features/settings/EditProfileDialog';
import type { HouseMember } from '../domain/house';

const { optimizeProfilePhotoMock } = vi.hoisted(() => ({
  optimizeProfilePhotoMock: vi.fn(),
}));

vi.mock('../application/profile-photo', () => ({
  optimizeProfilePhoto: optimizeProfilePhotoMock,
}));

const member = (avatarBlob?: Blob): HouseMember => ({
  id: 'profile-a',
  houseId: 'house-a',
  displayName: 'Raabe',
  avatarSeed: 'raabe',
  avatarBlob,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('EditProfileDialog', () => {
  beforeEach(() => {
    optimizeProfilePhotoMock.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-local');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('edita o nome, adiciona preview e salva a foto otimizada', async () => {
    const user = userEvent.setup();
    const optimized = new Blob(['otimizada'], { type: 'image/webp' });
    optimizeProfilePhotoMock.mockResolvedValue(optimized);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditProfileDialog member={member()} onClose={vi.fn()} onSave={onSave} />);

    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Raabe Silva');
    await user.upload(
      screen.getByLabelText('Selecionar foto de perfil'),
      new File(['imagem'], 'foto.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('img', { name: 'Foto de perfil de Raabe Silva' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(onSave).toHaveBeenCalledWith('Raabe Silva', optimized);
  });

  it('troca e remove a foto, mas cancelar não persiste alterações', async () => {
    const user = userEvent.setup();
    const original = new Blob(['original'], { type: 'image/webp' });
    const replacement = new Blob(['nova'], { type: 'image/webp' });
    optimizeProfilePhotoMock.mockResolvedValue(replacement);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { unmount } = render(
      <EditProfileDialog member={member(original)} onClose={onClose} onSave={onSave} />,
    );

    await user.upload(
      screen.getByLabelText('Selecionar foto de perfil'),
      new File(['nova'], 'nova.webp', { type: 'image/webp' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSave).not.toHaveBeenCalled();
    unmount();

    render(<EditProfileDialog member={member(original)} onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Remover foto de perfil' }));
    expect(screen.getByRole('img', { name: 'Avatar de Raabe' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSave).toHaveBeenCalledWith('Raabe', null);
  });

  it('expõe a mensagem de imagem inválida sem salvar', async () => {
    optimizeProfilePhotoMock.mockRejectedValue(new Error('Escolha uma imagem JPG, PNG ou WebP.'));
    const onSave = vi.fn();
    render(<EditProfileDialog member={member()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), {
      target: { files: [new File(['texto'], 'arquivo.gif', { type: 'image/gif' })] },
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma imagem JPG, PNG ou WebP.'),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
