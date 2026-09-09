import * as THREE from 'three';

/**
 * 像素素材统一加载：NearestFilter、无 mipmap、sRGB。
 */
const textureLoader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

export function loadPixelTexture(url: string): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        cache.set(url, tex);
        resolve(tex);
      },
      undefined,
      (err) => reject(new Error(`加载纹理失败: ${url}: ${err}`)),
    );
  });
}
