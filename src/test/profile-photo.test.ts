import { describe, expect, it } from 'vitest';
import {
  constrainAvatarCrop,
  getAvatarPreviewGeometry,
  moveAvatarCrop,
} from '../application/profile-photo';

describe('profile photo crop geometry', () => {
  it('cobre o círculo com uma foto horizontal sem deixar áreas vazias', () => {
    const geometry = getAvatarPreviewGeometry({ width: 1200, height: 800 }, 320, {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
    });
    expect(geometry).toEqual({ width: 480, height: 320, left: -80, top: 0 });
  });

  it('cobre o círculo com uma foto vertical e limita o arraste nas bordas', () => {
    const image = { width: 800, height: 1200 };
    const moved = moveAvatarCrop(
      { zoom: 1, centerX: 0.5, centerY: 0.5 },
      image,
      320,
      10_000,
      -10_000,
    );
    expect(moved.zoom).toBe(1);
    expect(moved.centerX).toBe(0.5);
    expect(moved.centerY).toBeCloseTo(2 / 3);
    const geometry = getAvatarPreviewGeometry(image, 320, moved);
    expect(geometry.left).toBe(0);
    expect(geometry.top + geometry.height).toBeCloseTo(320);
  });

  it('limita zoom e centro para manter o recorte sempre dentro da imagem', () => {
    const crop = constrainAvatarCrop(
      { zoom: 9, centerX: -2, centerY: 8 },
      { width: 1200, height: 800 },
    );
    expect(crop.zoom).toBe(3);
    expect(crop.centerX).toBeCloseTo(1 / 9);
    expect(crop.centerY).toBeCloseTo(5 / 6);
  });
});
