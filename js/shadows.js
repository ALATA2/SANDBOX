import { game } from './game.js';

export function updateShadowCamera(cameraPos, sunDir, moonDir, isDayTime, currentPreset) {
  if (!game.shadowsEnabled || !game.lights.sun) {
    if (game.lights.sun) game.lights.sun.castShadow = false;
    return;
  }

  const lightSourceDir = isDayTime ? sunDir : moonDir;

  if (game.lights.sun.target) {
    game.lights.sun.target.position.copy(cameraPos);
    game.lights.sun.target.updateMatrixWorld();
  }
  game.lights.sun.position.copy(cameraPos).addScaledVector(lightSourceDir, 200.0);

  // Set shadows dynamic: cast shadows during daytime, or at night only if the preset represents clear sky
  const isClearSky = (currentPreset === 'sunset' || currentPreset === 'nebula');
  game.lights.sun.castShadow = isDayTime || isClearSky;
}
