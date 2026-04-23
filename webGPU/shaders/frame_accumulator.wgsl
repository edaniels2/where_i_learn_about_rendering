@group(0) @binding(0) var out: texture_storage_2d<bgra8unorm, write>;
@group(0) @binding(1) var current: texture_2d<f32>;
@group(0) @binding(2) var accumulated: texture_2d<f32>;
@group(0) @binding(3) var<uniform> accumulatedFrameCount: f32;

@compute @workgroup_size(1) 
fn main(@builtin(global_invocation_id) id: vec3u) {
  let newColor: vec4f = textureLoad(current, id.xy, 0);
  let accumulatedColor: vec4f = textureLoad(accumulated, id.xy, 0);
  let weight = 1.0 / (accumulatedFrameCount + 1.0); // control with a uniform?
  let color = accumulatedColor * (1.0 - weight) + newColor * weight;
  textureStore(out, id.xy, color);
}
