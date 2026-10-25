// Wet road: a planar mirror render (y = 0) sampled by the road material with vertical streak blur,
// puddle/paint masks and a water Fresnel term. Same projection trick as three's Reflector, but fed
// into a MeshStandardMaterial so the asphalt keeps its PBR shading underneath the reflection.
import {
  HalfFloatType, LinearFilter, Matrix4, PerspectiveCamera, Vector2, Vector3, Vector4, WebGLRenderTarget,
} from '../vendor/three.module.js';

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export const createMirror = (renderer, { scale = 0.5 } = {}) => {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
  const camera = new PerspectiveCamera();
  const matrix = new Matrix4();
  const rot = new Matrix4();
  const look = new Vector3();
  const size = new Vector2();
  const texel = new Vector2();
  const hidden = [];

  const setSize = () => {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(2, Math.round(size.x * scale));
    const h = Math.max(2, Math.round(size.y * scale));
    target.setSize(w, h);
    texel.set(1 / w, 1 / h);
  };

  const update = (scene, view) => {
    view.updateMatrixWorld();
    rot.extractRotation(view.matrixWorld);
    camera.position.set(view.position.x, -view.position.y, view.position.z);
    look.set(0, 0, -1).applyMatrix4(rot).add(view.position);
    look.y = -look.y;
    camera.up.set(0, 1, 0).applyMatrix4(rot);
    camera.up.y = -camera.up.y;
    camera.lookAt(look);
    camera.far = view.far;
    camera.updateMatrixWorld();
    camera.projectionMatrix.copy(view.projectionMatrix);
    camera.projectionMatrixInverse.copy(view.projectionMatrixInverse);
    matrix.copy(BIAS).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);

    hidden.forEach((o) => { o.visible = false; });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    hidden.forEach((o) => { o.visible = true; });
  };

  return { target, matrix, texel, update, setSize, hide: (...objs) => hidden.push(...objs), dispose: () => target.dispose() };
};

// Patches a MeshStandardMaterial into the wet road. mask: R = paint, G = puddle; rect = (x0, z0, width, length).
export const wetRoad = (material, mirror, { mask, rect, taps = 12, strength = 1 }) => {
  const uniforms = {
    tMirror: { value: mirror.target.texture },
    uMirrorMatrix: { value: mirror.matrix },
    uMask: { value: mask },
    uMaskRect: { value: new Vector4(...rect) },
    uStrength: { value: strength },
  };
  material.userData.wet = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uMirrorMatrix;\nvarying vec4 vMirror;\nvarying vec3 vWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wpos = modelMatrix * vec4( transformed, 1.0 );\nvWorld = wpos.xyz;\nvMirror = uMirrorMatrix * wpos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tMirror;
        uniform sampler2D uMask;
        uniform vec4 uMaskRect;
        uniform float uStrength;
        varying vec4 vMirror;
        varying vec3 vWorld;
        float paintMask, puddleMask;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 muv = vec2( ( vWorld.x - uMaskRect.x ) / uMaskRect.z, ( uMaskRect.y - vWorld.z ) / uMaskRect.w );
        vec3 mk = texture2D( uMask, clamp( muv, 0.001, 0.999 ) ).rgb;
        float inside = step( 0.0, muv.x ) * step( muv.x, 1.0 );
        paintMask = mk.r * inside;
        puddleMask = mix( 0.35, mk.g, inside );
        diffuseColor.rgb *= mix( 0.62, 0.42, puddleMask );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.78 ), paintMask * 0.9 );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.16, smoothstep( 0.2, 0.8, puddleMask ) );
        roughnessFactor = mix( roughnessFactor, 0.45, paintMask * 0.6 );`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.2;   // the mirror already carries the light sources' reflections`)
      .replace('#include <opaque_fragment>', `
        {
          vec2 ruv = vMirror.xy / vMirror.w;
          vec2 distort = ( normal.xy - nonPerturbedNormal.xy ) * ( 1.0 - puddleMask * 0.8 );
          float blur = roughnessFactor * 0.05 + 0.002;
          vec3 refl = vec3( 0.0 );
          float wsum = 0.0;
          for ( int i = 0; i < ${taps}; i ++ ) {
            float t = ( float( i ) / float( ${taps - 1} ) ) * 2.0 - 1.0;
            float w = exp( -t * t * 2.5 );
            refl += texture2D( tMirror, ruv + distort * 0.05 + vec2( t * blur * 0.08, t * blur ) ).rgb * w;
            wsum += w;
          }
          refl = min( refl / wsum, vec3( 2.5 ) );
          float cosT = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
          float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
          float wet = clamp( 0.3 + puddleMask * 0.7, 0.0, 1.0 ) * ( 1.0 - paintMask * 0.5 );
          float k = clamp( F * 1.6 + 0.08, 0.0, 1.0 ) * wet * uStrength;
          outgoingLight = outgoingLight * ( 1.0 - k * 0.5 ) + refl * k;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `wetRoad${taps}`;
  return material;
};
