from mesh_cache import MeshCache


MESH = ([(0.0, 0.0, 0.0)], [(0, 0, 0)], (1.0, 1.0, 1.0))


def test_cache_evicts_least_recently_used_and_accounts_for_replacements():
    cache = MeshCache()
    cache['a'] = MESH
    one_size = cache.size_bytes
    cache.max_bytes = 2 * one_size
    cache['b'] = MESH
    assert cache.get('a') is MESH
    cache['c'] = MESH
    assert cache.get('b') is None
    assert cache.get('a') is MESH
    assert cache.get('c') is MESH
    cache['a'] = MESH
    assert cache.size_bytes == 2 * one_size
    cache.clear()
    assert cache.size_bytes == 0
    assert cache.get('a') is None


def test_oversized_mesh_does_not_displace_existing_cache():
    cache = MeshCache()
    cache['a'] = MESH
    cache.max_bytes = cache.size_bytes
    cache['b'] = (MESH[0] * 100, MESH[1] * 100, MESH[2])
    assert cache.get('b') is None
    assert cache.get('a') is MESH
    assert cache.size_bytes <= cache.max_bytes
