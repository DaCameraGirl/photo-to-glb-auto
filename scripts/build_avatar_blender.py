from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
import bmesh


HEAD_CENTER = (0.0, 0.04, 1.62)
HEAD_SCALE = (0.12, 0.11, 0.145)


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--face-texture", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--character-name", default="Photo Avatar")
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def make_material(name: str, color: tuple[float, float, float], roughness: float = 0.8) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def smooth_object(obj: bpy.types.Object, levels: int = 1) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    modifier = obj.modifiers.new(name="Subdivision", type="SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    obj.select_set(False)


def add_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.015,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevel_mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        bevel_mod.width = bevel
        bevel_mod.segments = 2
    assign_material(obj, material)
    smooth_object(obj)
    return obj


def add_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    segments: int = 32,
    rings: int = 20,
    levels: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    smooth_object(obj, levels=levels)
    return obj


def edit_mesh(obj: bpy.types.Object, editor) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    mesh = bmesh.from_edit_mesh(obj.data)
    editor(mesh)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")


def sculpt_head(head: bpy.types.Object) -> None:
    def transform(mesh: bmesh.types.BMesh) -> None:
        for vert in mesh.verts:
            x, y, z = vert.co.x, vert.co.y, vert.co.z
            if z < -0.02:
                vert.co.x *= 0.92
            if z > 0.03 and abs(x) < 0.05:
                vert.co.y += 0.016
            if z < -0.06:
                vert.co.y -= 0.012
            if z > 0.07:
                vert.co.z *= 0.95

    edit_mesh(head, transform)


def add_face_projection(head: bpy.types.Object, image_path: Path) -> None:
    if not image_path.exists():
        raise FileNotFoundError(f"Face texture not found: {image_path}")

    image = bpy.data.images.load(str(image_path))
    width, height = image.size
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height

    cam_data = bpy.data.cameras.new("FaceProjectCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = HEAD_SCALE[2] * 2.15
    cam_obj = bpy.data.objects.new("FaceProjectCam", cam_data)
    cam_obj.location = (HEAD_CENTER[0], HEAD_CENTER[1] + 0.75, HEAD_CENTER[2])
    cam_obj.rotation_euler = (math.radians(-90), 0.0, 0.0)
    bpy.context.scene.collection.objects.link(cam_obj)

    uv_layer = head.data.uv_layers.new(name="FaceUV")
    head.data.uv_layers.active = uv_layer
    modifier = head.modifiers.new(name="FaceProject", type="UV_PROJECT")
    modifier.uv_layer = "FaceUV"
    modifier.projector_count = 1
    modifier.projectors[0].object = cam_obj

    bpy.context.view_layer.objects.active = head
    head.select_set(True)
    bpy.ops.object.modifier_move_to_index(modifier="FaceProject", index=0)
    bpy.ops.object.modifier_apply(modifier="FaceProject")
    head.select_set(False)
    bpy.data.objects.remove(cam_obj, do_unlink=True)

    material = bpy.data.materials.new(name="FacePhoto")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes["Principled BSDF"]
    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = "FaceUV"
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])
    links.new(tex_node.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.88

    face_index = len(head.data.materials)
    head.data.materials.append(material)

    bpy.ops.object.mode_set(mode="EDIT")
    mesh = bmesh.from_edit_mesh(head.data)
    mesh.faces.ensure_lookup_table()
    for face in mesh.faces:
        center = face.calc_center_median()
        if center.y > HEAD_SCALE[1] * 0.18 and center.z > -HEAD_SCALE[2] * 0.18:
            face.material_index = face_index
    bmesh.update_edit_mesh(head.data)
    bpy.ops.object.mode_set(mode="OBJECT")


def join_objects(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def build_model(args: argparse.Namespace) -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    materials = {
        "skin": make_material("Skin", (0.70, 0.56, 0.48), roughness=0.9),
        "hoodie": make_material("Hoodie", (0.09, 0.12, 0.18), roughness=0.94),
        "pants": make_material("Pants", (0.07, 0.08, 0.11), roughness=0.92),
        "shoes": make_material("Shoes", (0.92, 0.93, 0.94), roughness=0.8),
        "hair": make_material("Hair", (0.10, 0.07, 0.05), roughness=0.95),
    }

    parts = [
        add_cube("Torso", (0.0, 0.0, 1.20), (0.24, 0.11, 0.31), materials["hoodie"]),
        add_cube("Hips", (0.0, 0.0, 0.86), (0.18, 0.10, 0.11), materials["pants"]),
        add_cube("ArmL", (-0.33, 0.0, 1.20), (0.07, 0.07, 0.28), materials["hoodie"], rotation=(0.0, 0.0, math.radians(6))),
        add_cube("ArmR", (0.33, 0.0, 1.20), (0.07, 0.07, 0.28), materials["hoodie"], rotation=(0.0, 0.0, math.radians(-6))),
        add_cube("HandL", (-0.33, 0.03, 0.82), (0.05, 0.04, 0.07), materials["skin"], bevel=0.008),
        add_cube("HandR", (0.33, 0.03, 0.82), (0.05, 0.04, 0.07), materials["skin"], bevel=0.008),
        add_cube("LegL", (-0.11, 0.0, 0.46), (0.08, 0.08, 0.33), materials["pants"]),
        add_cube("LegR", (0.11, 0.0, 0.46), (0.08, 0.08, 0.33), materials["pants"]),
        add_cube("ShoeL", (-0.11, 0.08, 0.06), (0.09, 0.05, 0.05), materials["shoes"], bevel=0.008),
        add_cube("ShoeR", (0.11, 0.08, 0.06), (0.09, 0.05, 0.05), materials["shoes"], bevel=0.008),
        add_cube("Hood", (0.0, -0.10, 1.45), (0.16, 0.08, 0.17), materials["hoodie"], rotation=(math.radians(18), 0.0, 0.0), bevel=0.012),
    ]

    head = add_sphere("Head", HEAD_CENTER, HEAD_SCALE, materials["skin"], segments=40, rings=26, levels=2)
    sculpt_head(head)
    add_face_projection(head, Path(args.face_texture))
    parts.append(head)
    parts.append(add_sphere("EarL", (-0.115, 0.02, 1.61), (0.022, 0.015, 0.032), materials["skin"], segments=16, rings=10))
    parts.append(add_sphere("EarR", (0.115, 0.02, 1.61), (0.022, 0.015, 0.032), materials["skin"], segments=16, rings=10))
    parts.append(add_sphere("HairCap", (0.0, -0.01, 1.69), (0.125, 0.10, 0.09), materials["hair"], segments=24, rings=16))

    avatar = join_objects(args.character_name, parts)
    bpy.ops.object.select_all(action="DESELECT")
    avatar.select_set(True)
    bpy.context.view_layer.objects.active = avatar
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    output_blend = Path(args.output_blend)
    output_glb = Path(args.output_glb)
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


if __name__ == "__main__":
    build_model(parse_args())
