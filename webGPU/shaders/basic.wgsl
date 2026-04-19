struct VertexOutput {
    @builtin(position) clip_position: vec4f,
    @location(0) normal: vec3f,
    @location(1) tex_coords: vec2f,
    @location(2) tempLight: vec3f,
};
struct Material {
    Ka: vec3f,
    Kd: vec3f,
    Ks: vec3f,
    Ns: f32,
    d: f32,
    illum: u32,
};

@group(0) @binding(0)
var<uniform> transform: mat4x4<f32>;
@group(0) @binding(1)
var<uniform> rotation: mat4x4<f32>;
@group(0) @binding(2)
var<uniform> projection: mat4x4<f32>;
@group(0) @binding(3)
var<uniform> mtl: Material;
@group(0) @binding(4)
var tex_diffuse: texture_2d<f32>;
@group(0) @binding(5)
var tex_sampler: sampler;

@vertex
fn vs_main(
    @location(0) inPos: vec3f,
    @location(1) inNormal: vec3f,
    @location(2) inTexCoords: vec2f,
) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = projection * transform * vec4f(inPos, 1.0);
    // can we multiply normals by the same transform matrix? or do we need a rotation-only?
    // seems fine as long as w component is 0
    out.normal = normalize(/* rotation */ transform * vec4(inNormal, 0)).xyz;
    out.tempLight = (/* rotation */ transform * vec4f(.4, -0.7, -0.7, 0)).xyz;
    out.tex_coords = inTexCoords;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    var Ld: f32 = -dot(normalize(in.normal), in.tempLight);
    if (Ld < 0) {
        Ld = 0;
    }
    let color: vec3f = mtl.Ka * 0.4
        + mtl.Kd * Ld
        // + specular
    ;
    var tex: vec4f = textureSample(tex_diffuse, tex_sampler, in.tex_coords);
    tex = vec4f(tex.rgb * Ld, tex.a);
    return vec4f(color, 1) * tex;
}
