@group(0) @binding(0) var current: texture_2d<f32>;
@group(0) @binding(1) var accumulated: texture_2d<f32>;
@group(0) @binding(2) var<uniform> weight: f32;

@vertex
fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
  return position;
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texCoords = vec2u(position.xy);
  let newColor: vec4f = textureLoad(current, texCoords, 0);
  let accumulatedColor: vec4f = textureLoad(accumulated, texCoords, 0);
  return accumulatedColor * (1.0 - weight) + newColor * weight;
}
