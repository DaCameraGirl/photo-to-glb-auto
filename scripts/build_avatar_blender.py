from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
import bmesh


# All measurements are meters, Blender Z-up. The character faces +Y (the face
# projection camera sits in front of it along +Y), matching the convention the
# original script established. Origin ends up at the feet on the world center
# line so it drops straight onto a ground plane at y=0 in the Three.js game.
FLOOR_Z = 0.0
ANKLE_Z = 0.09
KNEE_Z = 0.47
HIP_Z = 0.88
CHEST_TOP_Z = 1.20
NECK_TOP_Z = 1.31
HEAD_CENTER = (0.0, 0.02, 1.42)
HEAD_SCALE = (0.115, 0.105, 0.135)

SHOULDER_X = 0.185
HIP_X = 0.12
UPPER_ARM_LEN = 0.25
LOWER_ARM_LEN = 0.23
UPPER_LEG_LEN = HIP_Z - KNEE_Z
LOWER_LEG_LEN = KNEE_Z - ANKLE_Z

# Separately-built parts (arms onto the torso, neck onto the torso/head) only
# read as one continuous character if they physically interpenetrate a little
# at the join. This is a stylized-game-art trick, not a physical requirement.
JOINT_OVERLAP = 0.05


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--face-texture", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--character-name", default="Photo Avatar")
    parser.add_argument(
        "--preview-render",
        help="Optional path to write a quick 3/4-view PNG preview for QA.",
    )
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.curves,
        bpy.data.armatures,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def make_material(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.8,
    metallic: float = 0.0,
    detail: float = 0.0,
    detail_scale: float = 40.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic

    if detail > 0.0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = detail_scale
        noise.inputs["Detail"].default_value = 3.0

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = detail
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])

        rough_range = nodes.new("ShaderNodeMapRange")
        rough_range.inputs["To Min"].default_value = max(0.0, roughness - 0.12)
        rough_range.inputs["To Max"].default_value = min(1.0, roughness + 0.12)
        links.new(noise.outputs["Fac"], rough_range.inputs["Value"])
        links.new(rough_range.outputs["Result"], shader.inputs["Roughness"])

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


def set_bone_group(obj: bpy.types.Object, bone_name: str) -> None:
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")


def add_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    bone: str,
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
    set_bone_group(obj, bone)
    return obj


def add_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    bone: str,
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
    set_bone_group(obj, bone)
    return obj


def add_loft(
    name: str,
    profile: list[tuple[float, float, float]],
    length: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    bone: str,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 14,
    bevel: float = 0.006,
    smooth_levels: int = 2,
) -> bpy.types.Object:
    """Builds a tapered, rounded limb/torso segment by lofting a ring profile
    along a cylinder. `profile` is a bottom-to-top list of (t, radius_x,
    radius_y) with t=0 at the bottom and t=1 at the top; radii are meters.
    This replaces plain scaled cubes with a continuous, organic silhouette.
    """
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=1.0, depth=length, end_fill_type="TRIFAN")
    obj = bpy.context.active_object
    obj.name = name
    obj.location = location
    obj.rotation_euler = rotation

    half = length / 2.0
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    vertical_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > half * 1.5]
    inner_cuts = len(profile) - 2
    if inner_cuts > 0:
        bmesh.ops.subdivide_edges(bm, edges=vertical_edges, cuts=inner_cuts, use_grid_fill=True)

    bm.verts.ensure_lookup_table()
    rim_verts = [v for v in bm.verts if abs(v.co.x) > 1e-6 or abs(v.co.y) > 1e-6]
    ring_zs = sorted({round(v.co.z, 5) for v in rim_verts})
    for ring_z, (t, rx, ry) in zip(ring_zs, profile):
        target_z = -half + t * length
        for v in bm.verts:
            if abs(v.co.z - ring_z) < 1e-4:
                v.co.x *= rx
                v.co.y *= ry
                v.co.z = target_z

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    if bevel > 0:
        bevel_mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        bevel_mod.width = bevel
        bevel_mod.segments = 2
    assign_material(obj, material)
    smooth_object(obj, levels=smooth_levels)
    set_bone_group(obj, bone)
    return obj


def edit_mesh(obj: bpy.types.Object, editor) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    mesh = bmesh.from_edit_mesh(obj.data)
    editor(mesh)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")


def sculpt_head(head: bpy.types.Object) -> None:
    hx, hy, hz = HEAD_SCALE

    def transform(mesh: bmesh.types.BMesh) -> None:
        for vert in mesh.verts:
            x, y, z = vert.co.x, vert.co.y, vert.co.z
            if y < -0.40 * hy:
                vert.co.x *= 0.90
                vert.co.y *= 0.96
            if z > 0.15 * hz and y > 0.35 * hy:
                vert.co.y += 0.10 * hy
            if -0.25 * hz < z < 0.10 * hz and abs(x) > 0.55 * hx:
                vert.co.x *= 1.06
            if z < -0.25 * hz and y > 0.05 * hy:
                vert.co.x *= 0.80
                vert.co.y *= 0.90
            if z < -0.45 * hz and y > 0.15 * hy:
                vert.co.y += 0.06 * hy
            if z > 0.50 * hz:
                vert.co.z *= 0.94

    edit_mesh(head, transform)


def add_face_projection(head: bpy.types.Object, image_path: Path, skin_color: tuple[float, float, float]) -> None:
    from mathutils import Vector

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
    cam_location = (HEAD_CENTER[0], HEAD_CENTER[1] + 0.75, HEAD_CENTER[2])
    cam_obj.location = cam_location
    # A hand-picked Euler rotation here previously pointed the camera's local
    # "up" toward world -Z, which projected the photo upside down. Deriving
    # the rotation from the aim direction avoids that class of bug entirely.
    aim = Vector(HEAD_CENTER) - Vector(cam_location)
    cam_obj.rotation_euler = aim.to_track_quat("-Z", "Y").to_euler()
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

    # Inset the UVs so the projection never samples right at the photo's edge.
    for loop in head.data.uv_layers["FaceUV"].data:
        loop.uv.x = 0.5 + (loop.uv.x - 0.5) * 0.92
        loop.uv.y = 0.5 + (loop.uv.y - 0.5) * 0.92

    material = head.data.materials[0]
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes["Principled BSDF"]

    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = "FaceUV"
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv_node.outputs["UV"], separate.inputs["Vector"])

    def edge_mask(coord_socket, half_width: float, feather: float):
        center = nodes.new("ShaderNodeMath")
        center.operation = "SUBTRACT"
        center.inputs[1].default_value = 0.5
        links.new(coord_socket, center.inputs[0])
        dist = nodes.new("ShaderNodeMath")
        dist.operation = "ABSOLUTE"
        links.new(center.outputs["Value"], dist.inputs[0])
        falloff = nodes.new("ShaderNodeMapRange")
        falloff.interpolation_type = "SMOOTHSTEP"
        falloff.inputs["From Min"].default_value = half_width - feather
        falloff.inputs["From Max"].default_value = half_width
        falloff.inputs["To Min"].default_value = 1.0
        falloff.inputs["To Max"].default_value = 0.0
        links.new(dist.outputs["Value"], falloff.inputs["Value"])
        return falloff.outputs["Result"]

    mask_u = edge_mask(separate.outputs["X"], 0.34, 0.12)
    mask_v = edge_mask(separate.outputs["Y"], 0.40, 0.14)

    # Only let the photo show up on forward-facing skin, never on the sides
    # or back of the head where an orthographic projection would otherwise
    # smear/repeat the image (the source of the old "black bar" artifacts).
    geometry = nodes.new("ShaderNodeNewGeometry")
    normal_xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geometry.outputs["Normal"], normal_xyz.inputs["Vector"])
    facing = nodes.new("ShaderNodeMapRange")
    facing.interpolation_type = "SMOOTHSTEP"
    facing.inputs["From Min"].default_value = 0.10
    facing.inputs["From Max"].default_value = 0.55
    links.new(normal_xyz.outputs["Y"], facing.inputs["Value"])

    mask_uv = nodes.new("ShaderNodeMath")
    mask_uv.operation = "MULTIPLY"
    links.new(mask_u, mask_uv.inputs[0])
    links.new(mask_v, mask_uv.inputs[1])

    mask_final = nodes.new("ShaderNodeMath")
    mask_final.operation = "MULTIPLY"
    links.new(mask_uv.outputs["Value"], mask_final.inputs[0])
    links.new(facing.outputs["Result"], mask_final.inputs[1])

    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    tex_node.extension = "EXTEND"
    links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])

    mix_node = nodes.new("ShaderNodeMixRGB")
    mix_node.inputs["Color1"].default_value = (*skin_color, 1.0)
    links.new(tex_node.outputs["Color"], mix_node.inputs["Color2"])
    links.new(mask_final.outputs["Value"], mix_node.inputs["Factor"])

    links.new(mix_node.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.6


def build_armature(name: str) -> bpy.types.Object:
    armature = bpy.data.armatures.new(f"{name}Armature")
    armature_obj = bpy.data.objects.new(f"{name}Armature", armature)
    armature_obj.location = (0.0, 0.0, 0.0)
    bpy.context.scene.collection.objects.link(armature_obj)

    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = armature.edit_bones

    hips = eb.new("Hips")
    hips.head = (0.0, 0.0, HIP_Z)
    hips.tail = (0.0, 0.0, (HIP_Z + CHEST_TOP_Z) / 2.0)

    spine = eb.new("Spine")
    spine.head = hips.tail
    spine.tail = (0.0, 0.0, CHEST_TOP_Z)
    spine.parent = hips
    spine.use_connect = True

    neck = eb.new("Neck")
    neck.head = spine.tail
    neck.tail = (0.0, 0.0, NECK_TOP_Z)
    neck.parent = spine
    neck.use_connect = True

    head_bone = eb.new("Head")
    head_bone.head = neck.tail
    head_bone.tail = (0.0, 0.0, NECK_TOP_Z + HEAD_SCALE[2] * 1.6)
    head_bone.parent = neck
    head_bone.use_connect = True

    for side, sign in (("L", -1.0), ("R", 1.0)):
        shoulder_x = SHOULDER_X * sign
        elbow_x = (SHOULDER_X + UPPER_ARM_LEN) * sign
        wrist_x = (SHOULDER_X + UPPER_ARM_LEN + LOWER_ARM_LEN) * sign
        hand_x = (SHOULDER_X + UPPER_ARM_LEN + LOWER_ARM_LEN + 0.08) * sign
        arm_z = CHEST_TOP_Z - 0.02

        upper_arm = eb.new(f"UpperArm_{side}")
        upper_arm.head = (shoulder_x, 0.0, arm_z)
        upper_arm.tail = (elbow_x, 0.0, arm_z)
        upper_arm.parent = spine

        lower_arm = eb.new(f"LowerArm_{side}")
        lower_arm.head = upper_arm.tail
        lower_arm.tail = (wrist_x, 0.0, arm_z)
        lower_arm.parent = upper_arm
        lower_arm.use_connect = True

        hand = eb.new(f"Hand_{side}")
        hand.head = lower_arm.tail
        hand.tail = (hand_x, 0.0, arm_z)
        hand.parent = lower_arm
        hand.use_connect = True

        hip_x = HIP_X * sign
        upper_leg = eb.new(f"UpperLeg_{side}")
        upper_leg.head = (hip_x, 0.0, HIP_Z)
        upper_leg.tail = (hip_x, 0.0, KNEE_Z)
        upper_leg.parent = hips

        lower_leg = eb.new(f"LowerLeg_{side}")
        lower_leg.head = upper_leg.tail
        lower_leg.tail = (hip_x, 0.0, ANKLE_Z)
        lower_leg.parent = upper_leg
        lower_leg.use_connect = True

        foot = eb.new(f"Foot_{side}")
        foot.head = lower_leg.tail
        foot.tail = (hip_x, 0.12, ANKLE_Z * 0.3)
        foot.parent = lower_leg
        foot.use_connect = True

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature_obj


def join_objects(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def render_preview(output_path: Path, target_z: float) -> None:
    from mathutils import Vector

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.film_transparent = False
    # AgX (Blender's default view transform) desaturates dark/mid tones
    # heavily and would make this QA render misrepresent the material colors
    # actually stored in the exported GLB. Standard keeps the preview honest.
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.45, 0.47, 0.50)

    target = Vector((0.0, 0.0, target_z))

    def add_sun(name: str, location: tuple[float, float, float], energy: float) -> None:
        light = bpy.data.lights.new(name, type="SUN")
        light.energy = energy
        obj = bpy.data.objects.new(name, light)
        obj.location = location
        obj.rotation_euler = (target - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)

    # Character faces +Y, so key/fill sit on the +Y (front) side; a small
    # rim light from -Y keeps the back from going fully black.
    add_sun("KeyLight", (1.3, 1.9, target_z + 1.1), 2.6)
    add_sun("FillLight", (-1.4, 1.3, target_z + 0.3), 1.8)
    add_sun("RimLight", (0.0, -1.7, target_z + 1.3), 1.0)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 55
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    cam_location = (1.0, 2.4, target_z + 0.1)
    cam_obj.location = cam_location
    cam_obj.rotation_euler = (target - Vector(cam_location)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)


def build_model(args: argparse.Namespace) -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    materials = {
        "skin": make_material("Skin", (0.72, 0.57, 0.47), roughness=0.55, detail=0.08, detail_scale=60.0),
        "hoodie": make_material("Hoodie", (0.10, 0.13, 0.19), roughness=0.85, detail=0.35, detail_scale=25.0),
        "pants": make_material("Pants", (0.16, 0.22, 0.34), roughness=0.80, detail=0.30, detail_scale=35.0),
        "shoes": make_material("Shoes", (0.93, 0.93, 0.94), roughness=0.55, detail=0.10, detail_scale=50.0),
        "sole": make_material("Sole", (0.12, 0.12, 0.13), roughness=0.90, detail=0.20, detail_scale=20.0),
        "hair": make_material("Hair", (0.09, 0.06, 0.045), roughness=0.40, detail=0.15, detail_scale=80.0),
        "drawstring": make_material("Drawstring", (0.88, 0.85, 0.78), roughness=0.60, detail=0.05, detail_scale=30.0),
    }

    parts: list[bpy.types.Object] = []

    parts.append(
        add_loft(
            "Torso",
            profile=[(0.0, 0.135, 0.10), (0.35, 0.145, 0.105), (0.7, 0.175, 0.115), (1.0, 0.185, 0.10)],
            length=CHEST_TOP_Z - HIP_Z,
            location=(0.0, 0.0, (HIP_Z + CHEST_TOP_Z) / 2.0),
            material=materials["hoodie"],
            bone="Spine",
        )
    )
    parts.append(
        add_loft(
            "Hips",
            profile=[(0.0, 0.125, 0.09), (1.0, 0.15, 0.105)],
            length=0.16,
            location=(0.0, 0.0, HIP_Z - 0.04),
            material=materials["pants"],
            bone="Hips",
        )
    )
    neck_bottom_z = CHEST_TOP_Z - JOINT_OVERLAP
    parts.append(
        add_loft(
            "Neck",
            profile=[(0.0, 0.055, 0.05), (1.0, 0.05, 0.045)],
            length=NECK_TOP_Z - neck_bottom_z,
            location=(0.0, 0.0, (neck_bottom_z + NECK_TOP_Z) / 2.0),
            material=materials["skin"],
            bone="Neck",
        )
    )
    parts.append(
        add_sphere(
            "Hood",
            (0.0, -0.09, 1.35),
            (0.145, 0.115, 0.165),
            materials["hoodie"],
            bone="Spine",
            segments=24,
            rings=16,
        )
    )
    parts.append(
        add_cube(
            "PocketFront",
            (0.0, 0.155, 0.98),
            (0.12, 0.02, 0.075),
            materials["hoodie"],
            bone="Spine",
        )
    )

    arm_z = CHEST_TOP_Z - 0.02
    leg_hip_z = (HIP_Z + KNEE_Z) / 2.0
    leg_knee_z = (KNEE_Z + ANKLE_Z) / 2.0

    for side, sign in (("R", 1.0), ("L", -1.0)):
        rot = (0.0, math.radians(90.0 * sign), 0.0)

        # The shoulder end is pulled JOINT_OVERLAP back into the torso so the
        # arm and body volumes actually intersect instead of just touching
        # tangentially (rotating the loft 90 degrees means their round
        # cross-sections would otherwise meet at a single grazing point).
        shoulder_root_x = SHOULDER_X - JOINT_OVERLAP
        elbow_x = SHOULDER_X + UPPER_ARM_LEN
        upper_arm_length = elbow_x - shoulder_root_x
        upper_arm_x = sign * (shoulder_root_x + elbow_x) / 2.0
        parts.append(
            add_loft(
                f"UpperArm{side}",
                profile=[(0.0, 0.065, 0.06), (1.0, 0.05, 0.048)],
                length=upper_arm_length,
                location=(upper_arm_x, 0.0, arm_z),
                rotation=rot,
                material=materials["hoodie"],
                bone=f"UpperArm_{side}",
            )
        )

        lower_arm_x = sign * (SHOULDER_X + UPPER_ARM_LEN + LOWER_ARM_LEN / 2.0)
        parts.append(
            add_loft(
                f"LowerArm{side}",
                profile=[(0.0, 0.05, 0.045), (1.0, 0.038, 0.035)],
                length=LOWER_ARM_LEN,
                location=(lower_arm_x, 0.0, arm_z),
                rotation=rot,
                material=materials["hoodie"],
                bone=f"LowerArm_{side}",
            )
        )

        hand_x = sign * (SHOULDER_X + UPPER_ARM_LEN + LOWER_ARM_LEN + 0.05)
        parts.append(
            add_sphere(
                f"Hand{side}",
                (hand_x, 0.0, arm_z),
                (0.045, 0.075, 0.035),
                materials["skin"],
                bone=f"Hand_{side}",
                segments=16,
                rings=10,
            )
        )

        hip_x = sign * HIP_X
        parts.append(
            add_loft(
                f"UpperLeg{side}",
                profile=[(0.0, 0.085, 0.08), (1.0, 0.10, 0.095)],
                length=UPPER_LEG_LEN,
                location=(hip_x, 0.0, leg_hip_z),
                material=materials["pants"],
                bone=f"UpperLeg_{side}",
            )
        )
        parts.append(
            add_loft(
                f"LowerLeg{side}",
                profile=[(0.0, 0.055, 0.05), (1.0, 0.08, 0.075)],
                length=LOWER_LEG_LEN,
                location=(hip_x, 0.0, leg_knee_z),
                material=materials["pants"],
                bone=f"LowerLeg_{side}",
            )
        )
        parts.append(
            add_cube(
                f"Shoe{side}",
                (hip_x, 0.05, ANKLE_Z * 0.55),
                (0.075, 0.14, 0.05),
                materials["shoes"],
                bone=f"Foot_{side}",
            )
        )
        parts.append(
            add_cube(
                f"Sole{side}",
                (hip_x, 0.05, 0.011),
                (0.08, 0.155, 0.02),
                materials["sole"],
                bone=f"Foot_{side}",
                bevel=0.006,
            )
        )
        parts.append(
            add_cube(
                f"PocketBack{side}",
                (hip_x * 0.55, -0.095, HIP_Z - 0.05),
                (0.045, 0.015, 0.05),
                materials["pants"],
                bone="Hips",
                bevel=0.006,
            )
        )
        parts.append(
            add_cube(
                f"Drawstring{side}",
                (0.035 * sign, 0.15, 1.06),
                (0.008, 0.008, 0.09),
                materials["drawstring"],
                bone="Spine",
                bevel=0.003,
            )
        )

    head = add_sphere("Head", HEAD_CENTER, HEAD_SCALE, materials["skin"], bone="Head", segments=40, rings=26, levels=2)
    sculpt_head(head)
    add_face_projection(head, Path(args.face_texture), skin_color=(0.72, 0.57, 0.47))
    parts.append(head)

    ear_x = HEAD_SCALE[0] * 1.0
    ear_z = HEAD_CENTER[2] - HEAD_SCALE[2] * 0.05
    parts.append(add_sphere("EarL", (-ear_x, HEAD_CENTER[1], ear_z), (0.022, 0.015, 0.032), materials["skin"], bone="Head", segments=16, rings=10))
    parts.append(add_sphere("EarR", (ear_x, HEAD_CENTER[1], ear_z), (0.022, 0.015, 0.032), materials["skin"], bone="Head", segments=16, rings=10))

    hair_center = (HEAD_CENTER[0], HEAD_CENTER[1] - 0.015, HEAD_CENTER[2] + 0.075)
    parts.append(add_sphere("HairCap", hair_center, (0.125, 0.105, 0.10), materials["hair"], bone="Head", segments=24, rings=16))
    curl_offsets = [
        (0.0, 0.03, 0.10, 0.045),
        (-0.075, 0.03, 0.075, 0.038),
        (0.075, 0.03, 0.075, 0.038),
        (-0.11, 0.0, 0.02, 0.032),
        (0.11, 0.0, 0.02, 0.032),
        (-0.06, 0.05, -0.04, 0.03),
        (0.06, 0.05, -0.04, 0.03),
    ]
    for i, (dx, dy, dz, radius) in enumerate(curl_offsets):
        loc = (hair_center[0] + dx, hair_center[1] + dy, hair_center[2] + dz)
        parts.append(add_sphere(f"HairCurl{i}", loc, (radius, radius * 0.9, radius), materials["hair"], bone="Head", segments=14, rings=10))

    avatar = join_objects(args.character_name, parts)
    bpy.context.view_layer.update()
    min_z = min((avatar.matrix_world @ v.co).z for v in avatar.data.vertices)
    bpy.context.scene.cursor.location = (0.0, 0.0, min_z)
    bpy.ops.object.select_all(action="DESELECT")
    avatar.select_set(True)
    bpy.context.view_layer.objects.active = avatar
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

    armature_obj = build_armature(args.character_name)
    avatar.parent = armature_obj
    armature_mod = avatar.modifiers.new(name="Armature", type="ARMATURE")
    armature_mod.object = armature_obj

    if args.preview_render:
        render_preview(Path(args.preview_render), target_z=(HIP_Z + CHEST_TOP_Z) / 2.0)

    output_blend = Path(args.output_blend)
    output_glb = Path(args.output_glb)
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    bpy.ops.object.select_all(action="DESELECT")
    avatar.select_set(True)
    armature_obj.select_set(True)
    bpy.context.view_layer.objects.active = avatar
    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_skins=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )


if __name__ == "__main__":
    build_model(parse_args())
