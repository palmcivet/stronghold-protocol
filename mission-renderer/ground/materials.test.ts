import { MeshStandardMaterial, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { addFocus, focusUniforms } from '#ground/materials.js';

describe('focus falloff', () => {
  it('adds its uniforms and dims the light outside the lit field in the standard shader', () => {
    const focus = focusUniforms();
    const material = addFocus(new MeshStandardMaterial(), focus);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uFocus).toBe(focus.uFocus);
    expect(shader.uniforms.uFocusDim).toBe(focus.uFocusDim);
    expect(shader.vertexShader).toContain('vFocusWorld = (modelMatrix');
    expect(shader.fragmentShader).toContain('uniform vec4 uFocus;');
    expect(shader.fragmentShader).toContain(
      'outgoingLight *= mix(uFocusDim, 1.0, fm);',
    );
    expect(material.customProgramCacheKey()).toBe('terrain-focus');
  });
});
