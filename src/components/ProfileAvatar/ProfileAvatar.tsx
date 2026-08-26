import { useEffect, useMemo } from 'react';
import type { HouseMember } from '../../domain/house';

type ProfileAvatarProps = {
  profile: Pick<HouseMember, 'displayName' | 'avatarBlob'>;
  size?: 'compact' | 'member' | 'profile';
  className?: string;
};

function getProfileInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-BR');
}

export function ProfileAvatar({ profile, size = 'profile', className = '' }: ProfileAvatarProps) {
  const imageUrl = useMemo(
    () => (profile.avatarBlob ? URL.createObjectURL(profile.avatarBlob) : null),
    [profile.avatarBlob],
  );

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  const classes = `avatar avatar--${size} ${className}`.trim();
  if (imageUrl) {
    return (
      <span className={classes} data-has-photo="true">
        <img alt={`Foto de perfil de ${profile.displayName}`} src={imageUrl} />
      </span>
    );
  }

  return (
    <span
      aria-label={`Avatar de ${profile.displayName}`}
      className={classes}
      data-has-photo="false"
      role="img"
    >
      {getProfileInitials(profile.displayName)}
    </span>
  );
}
