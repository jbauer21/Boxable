"""Bounded, least-recently-used mesh storage (call under the CAD lock)."""

import sys
from collections import OrderedDict


class MeshCache:
    def __init__(self, max_bytes=32 * 1024 * 1024):
        self.max_bytes = max_bytes
        self._entries = OrderedDict()
        self.size_bytes = 0

    def get(self, key):
        entry = self._entries.get(key)
        if entry is None:
            return None
        self._entries.move_to_end(key)
        return entry[0]

    def __setitem__(self, key, mesh):
        previous = self._entries.pop(key, None)
        if previous is not None:
            self.size_bytes -= previous[1]
        # Conservatively count shared numeric objects more than once.
        vertices, triangles, extents = mesh
        size = sys.getsizeof(key) + sys.getsizeof(mesh) + sys.getsizeof(extents)
        size += sum(sys.getsizeof(n) for n in extents)
        for rows in (vertices, triangles):
            size += sys.getsizeof(rows)
            size += sum(sys.getsizeof(row) + sum(sys.getsizeof(n) for n in row) for row in rows)
        if size > self.max_bytes:
            return
        while self._entries and self.size_bytes + size > self.max_bytes:
            _, (_, removed_size) = self._entries.popitem(last=False)
            self.size_bytes -= removed_size
        self._entries[key] = (mesh, size)
        self.size_bytes += size

    def clear(self):
        self._entries.clear()
        self.size_bytes = 0
