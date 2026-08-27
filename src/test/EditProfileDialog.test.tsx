import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HouseMember } from '../domain/house';
import type { ProfileAvatarData } from '../domain/profile-avatar';
import { EditProfileDialog } from '../features/settings/EditProfileDialog';

const { prepareProfilePhotoSourceMock, croppedAvatar } = vi.hoisted(() => ({
  prepareProfilePhotoSourceMock: vi.fn(),
  croppedAvatar: {
    avatarBlob: new Blob(['recortada'], { type: 'image/webp' }),
    avatarSourceBlob: new Blob(['fonte'], { type: 'image/webp' }),
    avatarCrop: { zoom: 1.4, centerX: 0.4, centerY: 0.6 },
  } satisfies ProfileAvatarData,
}));

vi.mock('../application/profile-photo', () => ({
  prepareProfilePhotoSource: prepareProfilePhotoSourceMock,
}));

vi.mock('../features/settings/PhotoCropDialog', () => ({
  PhotoCropDialog: ({
    onCancel,
    onUse,
  }: {
    onCancel: () => void;
    onUse: (avatar: ProfileAvatarData) => void;
  }) => (
    <section
      aria-label="Ajustar foto"
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
    >
      <button onClick={onCancel}>Cancelar ajuste</button>
      <button onClick={() => onUse(croppedAvatar)}>Usar foto</button>
    </section>
  ),
}));

const member = (avatar?: ProfileAvatarData): HouseMember => ({
  id: 'profile-a',
  houseId: 'house-a',
  displayName: 'Raabe',
  avatarSeed: 'raabe',
  avatarBlob: avatar?.avatarBlob,
  avatarSourceBlob: avatar?.avatarSourceBlob,
  avatarCrop: avatar?.avatarCrop,
  avatarRevision: avatar?.avatarRevision,
  avatarUpdatedAt: avatar?.avatarUpdatedAt,
  avatarRemotePath: avatar?.avatarRemotePath,
  avatarSourceRemotePath: avatar?.avatarSourceRemotePath,
  avatarSyncState: avatar?.avatarSyncState,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('EditProfileDialog', () => {
  beforeEach(() => {
    prepareProfilePhotoSourceMock.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-local');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('só aplica a foto depois de confirmar o recorte e só persiste ao salvar', async () => {
    const user = userEvent.setup();
    prepareProfilePhotoSourceMock.mockResolvedValue(croppedAvatar.avatarSourceBlob);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditProfileDialog member={member()} onClose={vi.fn()} onSave={onSave} />);

    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Raabe Silva');
    await user.upload(
      screen.getByLabelText('Selecionar foto de perfil'),
      new File(['imagem'], 'foto.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Ajustar foto' })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Usar foto' }));
    expect(screen.getByRole('img', { name: 'Foto de perfil de Raabe Silva' })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(onSave).toHaveBeenCalledWith('Raabe Silva', croppedAvatar);
  });

  it('cancela troca e edição sem alterar a foto persistida', async () => {
    const user = userEvent.setup();
    prepareProfilePhotoSourceMock.mockResolvedValue(croppedAvatar.avatarSourceBlob);
    const original = {
      avatarBlob: new Blob(['original'], { type: 'image/webp' }),
      avatarSourceBlob: new Blob(['fonte original'], { type: 'image/webp' }),
      avatarCrop: { zoom: 1.2, centerX: 0.5, centerY: 0.5 },
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditProfileDialog member={member(original)} onClose={onClose} onSave={onSave} />);

    await user.upload(
      screen.getByLabelText('Selecionar foto de perfil'),
      new File(['nova'], 'nova.webp', { type: 'image/webp' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar ajuste' }));
    expect(screen.getByRole('img', { name: 'Foto de perfil de Raabe' })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reposiciona foto existente, preserva legado e remove somente ao salvar', async () => {
    const user = userEvent.setup();
    const original = new Blob(['original'], { type: 'image/webp' });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditProfileDialog
        member={member({ avatarBlob: original })}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reposicionar' }));
    expect(screen.getByRole('dialog', { name: 'Ajustar foto' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancelar ajuste' }));
    await user.click(screen.getByRole('button', { name: 'Remover foto de perfil' }));
    expect(screen.getByRole('img', { name: 'Avatar de Raabe' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSave).toHaveBeenCalledWith('Raabe', null);
  });

  it('expõe a mensagem de imagem inválida sem salvar', async () => {
    prepareProfilePhotoSourceMock.mockRejectedValue(
      new Error('Escolha uma imagem JPG, PNG ou WebP.'),
    );
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

  it('não reenvia a foto quando apenas o nome muda', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditProfileDialog
        member={member({ avatarBlob: new Blob(['existente'], { type: 'image/webp' }) })}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Novo nome');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSave).toHaveBeenCalledWith('Novo nome', undefined);
  });

  it('não abre o reposicionamento sem source e o libera quando a hidratação termina', async () => {
    const user = userEvent.setup();
    const avatarBlob = new Blob(['avatar'], { type: 'image/webp' });
    const base = {
      avatarBlob,
      avatarCrop: { zoom: 1.3, centerX: 0.4, centerY: 0.6 },
      avatarRevision: 10,
      avatarUpdatedAt: '2026-08-27T12:00:00.000Z',
      avatarRemotePath: 'profile-a/version/avatar.webp',
      avatarSourceRemotePath: 'profile-a/version/source.webp',
      avatarSyncState: 'hydrating' as const,
    };
    const props = { onClose: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined) };
    const { rerender } = render(<EditProfileDialog member={member(base)} {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando foto para edição');
    expect(screen.getByRole('button', { name: 'Reposicionar' })).toBeDisabled();

    rerender(
      <EditProfileDialog
        member={member({
          ...base,
          avatarSourceBlob: new Blob(['source'], { type: 'image/webp' }),
          avatarSyncState: 'synced',
        })}
        {...props}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reposicionar' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Reposicionar' }));
    expect(screen.getByRole('dialog', { name: 'Ajustar foto' })).toBeVisible();
  });
});
