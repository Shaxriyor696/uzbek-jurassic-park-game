import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Siqilgan modellar uchun GLTFLoader (public/models/lite: meshopt geometriya/animatsiya, WebP tekstura ≤1024 px).
 * Asl og‘ir fayllar assets-src/ da — saytga chiqmaydi; qayta siqish: gltf-transform optimize … --compress meshopt --texture-compress webp --texture-size 1024
 */
export function createGltfLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

/** public/models/lite ichidagi fayl manzili */
export const liteModelUrl = (file: string) => `${import.meta.env.BASE_URL}models/lite/${encodeURIComponent(file.split('/').pop()!)}`;
