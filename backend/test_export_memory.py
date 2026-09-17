"""Export lifetime, concurrency and bounded-buffer regression tests."""
import asyncio
import gc
import io
import threading
import weakref
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from geometry import ContainerSpec
from threemf import write_3mf


class Rows(list):
    pass


def spec(name="Bin"):
    return ContainerSpec(name, name, "bin", 2, 1, 3)


def mesh():
    return Rows([(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)]), Rows([(0, 1, 2)]), (1., 1., 1.)


def request():
    return main.GenerateRequest(items=[main.PreviewItem(spec=main.ContainerRequest(
        id="a", name="Bin", kind="bin", length_u=2, width_u=1, height_u=3), col=0, row=0)])


def test_writer_releases_previous_mesh_and_deduplicates(tmp_path):
    references = []
    calls = []
    def provider(s):
        gc.collect()
        assert all(ref() is None for ref in references)
        result = mesh()
        references.extend(weakref.ref(rows) for rows in result[:2])
        calls.append(s.name)
        return result
    a, b = spec("a"), spec("b")
    write_3mf(tmp_path / "out.3mf", [(a, 0, 0, False), (b, 2, 0, True), (a, 4, 0, False)], provider)
    assert calls == ["a", "b"]
    assert all(ref() is None for ref in references)


def test_xml_writes_are_bounded(monkeypatch, tmp_path):
    original = zipfile._ZipWriteFile.write
    sizes = []
    def record(self, data):
        sizes.append(len(data))
        return original(self, data)
    monkeypatch.setattr(zipfile._ZipWriteFile, "write", record)
    write_3mf(tmp_path / "large.3mf", [(spec(), 0, 0, False)],
              lambda _: ([(1., 2., 3.)] * 100000, [(0, 0, 0)] * 100000, (1., 2., 3.)))
    assert max(sizes) <= 64 * 1024
    assert sum(sizes) > 5 * 1024 * 1024


@pytest.fixture
def fake_generation(monkeypatch, tmp_path):
    import generators
    monkeypatch.setattr(main.tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(generators, "tessellate_container", lambda _: mesh())
    return tmp_path


def test_http_download_and_cleanup(fake_generation):
    with TestClient(main.app) as client:
        response = client.post("/generate", json=request().model_dump())
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/3mf"
    assert response.headers["content-disposition"] == 'attachment; filename="boxable.3mf"'
    assert int(response.headers["content-length"]) == len(response.content)
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.testzip() is None
    assert not list(fake_generation.glob("boxable-*"))


def test_generation_failure_removes_partial_archive(fake_generation, monkeypatch):
    def fail(path, *args):
        Path(path).write_bytes(b"partial")
        raise RuntimeError("generation failed")
    monkeypatch.setattr(main, "write_3mf", fail)
    with pytest.raises(RuntimeError, match="generation failed"):
        main.generate(request())
    assert not list(fake_generation.glob("boxable-*"))
    assert main._EXPORT_LOCK.acquire(blocking=False)
    main._EXPORT_LOCK.release()


@pytest.mark.parametrize("failure", [OSError, asyncio.CancelledError])
def test_interrupted_download_cleanup(fake_generation, failure):
    response = main.generate(request())
    path = Path(response.path)
    async def send(message):
        if message["type"] == "http.response.body":
            raise failure()
        assert message["type"] != "http.response.pathsend"
    async def receive():
        return {"type": "http.disconnect"}
    with pytest.raises(failure):
        asyncio.run(response({"type": "http", "method": "GET", "headers": [],
                              "extensions": {"http.response.pathsend": {}}}, receive, send))
    assert not path.exists()


def test_exports_serialize_but_download_does_not_hold_lock(fake_generation, monkeypatch):
    original = main.write_3mf
    first_entered, second_started, release = threading.Event(), threading.Event(), threading.Event()
    count = 0
    def blocked(*args):
        nonlocal count
        count += 1
        if count == 1:
            first_entered.set()
            assert release.wait(10)
        return original(*args)
    monkeypatch.setattr(main, "write_3mf", blocked)
    def second():
        second_started.set()
        return main.generate(request())
    with ThreadPoolExecutor(2) as pool:
        a = pool.submit(main.generate, request())
        assert first_entered.wait(10)
        b = pool.submit(second)
        assert second_started.wait(10)
        try:
            assert count == 1
        finally:
            release.set()
        responses = [a.result(timeout=10), b.result(timeout=10)]
    assert count == 2
    # Both archives exist before either download has started.
    assert all(Path(response.path).exists() for response in responses)
    assert main._EXPORT_LOCK.acquire(blocking=False)
    main._EXPORT_LOCK.release()
    for response in responses:
        Path(response.path).unlink()


def test_invalid_requests_create_no_archive(fake_generation):
    with TestClient(main.app) as client:
        assert client.post("/generate", json={}).status_code == 400
        data = request().model_dump()
        data["items"][0]["spec"]["length_u"] = 0
        assert client.post("/generate", json=data).status_code == 422
    assert not list(fake_generation.glob("boxable-*"))


def test_model_xml_matches_pre_refactor_golden():
    import hashlib
    from threemf import build_3mf, geometry_key, baseplate_key
    a = ContainerSpec("a", "A & <B> é", "bin", 2, 1, 3)
    b = ContainerSpec("b", "Second", "bin", 1, 2, 3)
    mesh = ([(0., -0.00001, 1.234567), (1., 2., 3.), (3., 4., 5.)], [(0, 1, 2)], (80., 40., 21.))
    payload = build_3mf(
        [(a, 0, 0, False), (b, 1, 2, True), (a, 3, 4, True)],
        {geometry_key(a): mesh, geometry_key(b): mesh},
        [(2, 1, 0, 0), (2, 1, 2, 0)], {baseplate_key(2, 1): mesh})
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        xml = archive.read("3D/3dmodel.model")
    # Captured from the original writer, including ordering and float formatting.
    assert hashlib.sha256(xml).hexdigest() == "13c94857c014d2d863f8fa03c71821ef6dfa0ef1db8f056d1e709afee90eb4b2"


def test_tessellation_preserves_welding_and_first_vertex():
    from types import SimpleNamespace
    from generators import _MESH_CACHE, _tessellate_shape
    class Shape:
        def BoundingBox(self):
            return SimpleNamespace(xmin=-2., ymin=3., zmin=1., xlen=2., ylen=2., zlen=1.)
        def tessellate(self, tolerance):
            assert tolerance == 0.5
            return [SimpleNamespace(x=x, y=y, z=z) for x, y, z in
                    [(-2., 3., 1.), (-1., 3., 1.), (-2., 4., 1.),
                     (-1.999999, 3., 1.)]], [(0, 1, 2), (3, 1, 2), (0, 3, 1)]
    _MESH_CACHE.clear()
    try:
        result = _tessellate_shape(Shape(), "regression", 0.5)
        assert result == ([(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)],
                          [(0, 1, 2), (0, 1, 2)], (2., 2., 1.))
    finally:
        _MESH_CACHE.clear()
