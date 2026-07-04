from __future__ import annotations

import cgi
import json
import os
import subprocess
import sys
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
UI_ROOT = ROOT / "ui"
RUNS_ROOT = ROOT / "runs"
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png"}


def _slugify(value: str) -> str:
    chars = []
    for ch in value.lower():
        chars.append(ch if ch.isalnum() else "-")
    slug = "".join(chars).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "avatar"


class PhotoToGlbHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def _json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        self.path = str(path)
        with path.open("rb") as handle:
            data = handle.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Length", str(len(data)))
        if path.suffix.lower() == ".glb":
            self.send_header("Content-Type", "model/gltf-binary")
        elif path.suffix.lower() == ".css":
            self.send_header("Content-Type", "text/css; charset=utf-8")
        elif path.suffix.lower() == ".js":
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
        else:
            self.send_header("Content-Type", self.guess_type(str(path)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        if route in {"/", "/index.html"}:
            self._send_file(UI_ROOT / "index.html")
            return
        if route.startswith("/ui/"):
            self._send_file(ROOT / route.lstrip("/"))
            return
        if route.startswith("/runs/"):
            self._send_file(ROOT / route.lstrip("/"))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/convert":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Expected multipart form data."})
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )

        upload = form["image"] if "image" in form else None
        if upload is None or not getattr(upload, "file", None) or not getattr(upload, "filename", None):
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Choose a JPG or PNG first."})
            return

        original_name = Path(upload.filename)
        suffix = original_name.suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Only .jpg, .jpeg, and .png are supported."})
            return

        character_name = form.getfirst("name", "Photo Avatar").strip() or "Photo Avatar"
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = RUNS_ROOT / f"web_{stamp}_{_slugify(character_name)}"
        input_dir = run_dir / "input"
        work_dir = run_dir / "work"
        input_dir.mkdir(parents=True, exist_ok=True)
        work_dir.mkdir(parents=True, exist_ok=True)

        input_path = input_dir / f"source{suffix}"
        output_path = run_dir / f"{_slugify(character_name)}.glb"

        with input_path.open("wb") as handle:
            handle.write(upload.file.read())

        command = [
            sys.executable,
            "-m",
            "photo_to_glb.cli",
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--name",
            character_name,
            "--work-dir",
            str(work_dir),
        ]
        result = subprocess.run(
            command,
            cwd=str(ROOT),
            text=True,
            capture_output=True,
            check=False,
        )

        if result.returncode != 0:
            self._json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "error": "Conversion failed.",
                    "details": (result.stderr or result.stdout).strip(),
                },
            )
            return

        payload = {
            "name": character_name,
            "downloadUrl": f"/runs/{output_path.relative_to(RUNS_ROOT).as_posix()}",
            "faceTextureUrl": f"/runs/{(work_dir / 'face_texture.png').relative_to(RUNS_ROOT).as_posix()}",
            "blendUrl": f"/runs/{(work_dir / f'{_slugify(character_name)}.blend').relative_to(RUNS_ROOT).as_posix()}",
            "stdout": result.stdout.strip(),
        }
        self._json(HTTPStatus.OK, payload)


def run_server(port: int = 8787) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), PhotoToGlbHandler)
    print(f"Photo To GLB Studio running at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    port = int(os.getenv("PHOTO_TO_GLB_PORT", "8787"))
    run_server(port=port)
