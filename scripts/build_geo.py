#!/usr/bin/env python3
"""Build the NICC prototype geography: 38 provinces and 514 kabupaten/kota.

Sources (public, downloaded once into scripts/.cache):
  * ADM2 — BPS / OCHA ROAP via geoBoundaries (CC BY 3.0 IGO), 2020 vintage, 519 units
  * ADM1 — OpenStreetMap via geoBoundaries (ODbL), 34 provinces, used only to
    attribute each district to its province

The 2020 vintage predates the 2022 Papua split, so districts are re-attributed
to the six current Papua provinces by name, then dissolved into province shapes.
That keeps province and district boundaries perfectly nested.

Output: data/geo/provinces.geojson, data/geo/districts.geojson, data/geo/geo_meta.json
Run:    python3 scripts/build_geo.py   (requires shapely)
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "data" / "geo"

ADM2_URL = ("https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/"
            "releaseData/gbOpen/IDN/ADM2/geoBoundaries-IDN-ADM2_simplified.geojson")
ADM1_URL = ("https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/"
            "releaseData/gbOpen/IDN/ADM1/geoBoundaries-IDN-ADM1_simplified.geojson")

# Features in the ADM2 layer that are water bodies or forest, not kabupaten/kota.
NON_DISTRICT = {"Danau", "Danau Toba", "Hutan", "Waduk Cirata", "Wadung Kedungombo"}

# id, Bahasa name, OSM English name, region, time zone, population (millions, BPS 2023 approx.)
PROVINCES = [
    ("ACH", "Aceh", "Aceh", "Sumatra", "WIB", 5.48),
    ("SMU", "Sumatera Utara", "North Sumatra", "Sumatra", "WIB", 15.39),
    ("SMB", "Sumatera Barat", "West Sumatra", "Sumatra", "WIB", 5.76),
    ("RIA", "Riau", "Riau", "Sumatra", "WIB", 6.64),
    ("KPR", "Kepulauan Riau", "Riau Islands", "Sumatra", "WIB", 2.15),
    ("JMB", "Jambi", "Jambi", "Sumatra", "WIB", 3.68),
    ("SMS", "Sumatera Selatan", "South Sumatra", "Sumatra", "WIB", 8.74),
    ("BBL", "Kepulauan Bangka Belitung", "Bangka-Belitung Islands", "Sumatra", "WIB", 1.49),
    ("BKL", "Bengkulu", "Bengkulu", "Sumatra", "WIB", 2.09),
    ("LPG", "Lampung", "Lampung", "Sumatra", "WIB", 9.31),
    ("JKT", "DKI Jakarta", "Jakarta Special Capital Region", "Jabodetabek", "WIB", 10.67),
    ("JBR", "Jawa Barat", "West Java", "Java", "WIB", 49.86),
    ("BTN", "Banten", "Banten", "Java", "WIB", 12.31),
    ("JTG", "Jawa Tengah", "Central Java", "Java", "WIB", 37.54),
    ("DIY", "DI Yogyakarta", "Special Region of Yogyakarta", "Java", "WIB", 3.71),
    ("JTM", "Jawa Timur", "East Java", "Java", "WIB", 41.53),
    ("BAL", "Bali", "Bali", "Bali Nusra", "WITA", 4.38),
    ("NTB", "Nusa Tenggara Barat", "West Nusa Tenggara", "Bali Nusra", "WITA", 5.56),
    ("NTT", "Nusa Tenggara Timur", "East Nusa Tenggara", "Bali Nusra", "WITA", 5.57),
    ("KBR", "Kalimantan Barat", "West Kalimantan", "Kalimantan", "WIB", 5.62),
    ("KTG", "Kalimantan Tengah", "Central Kalimantan", "Kalimantan", "WIB", 2.74),
    ("KSL", "Kalimantan Selatan", "South Kalimantan", "Kalimantan", "WITA", 4.17),
    ("KTM", "Kalimantan Timur", "East Kalimantan", "Kalimantan", "WITA", 3.91),
    ("KTU", "Kalimantan Utara", "North Kalimantan", "Kalimantan", "WITA", 0.73),
    ("SLU", "Sulawesi Utara", "North Sulawesi", "Sulawesi", "WITA", 2.66),
    ("GTO", "Gorontalo", "Gorontalo", "Sulawesi", "WITA", 1.21),
    ("SLT", "Sulawesi Tengah", "Central Sulawesi", "Sulawesi", "WITA", 3.09),
    ("SLB", "Sulawesi Barat", "West Sulawesi", "Sulawesi", "WITA", 1.46),
    ("SLS", "Sulawesi Selatan", "South Sulawesi", "Sulawesi", "WITA", 9.36),
    ("SLG", "Sulawesi Tenggara", "Southeast Sulawesi", "Sulawesi", "WITA", 2.75),
    ("MAL", "Maluku", "Maluku", "Papua Maluku", "WIT", 1.88),
    ("MLU", "Maluku Utara", "North Maluku", "Papua Maluku", "WIT", 1.33),
    ("PPA", "Papua", "Papua", "Papua Maluku", "WIT", 1.06),
    ("PPB", "Papua Barat", "West Papua", "Papua Maluku", "WIT", 0.56),
    ("PBD", "Papua Barat Daya", None, "Papua Maluku", "WIT", 0.62),
    ("PPS", "Papua Selatan", None, "Papua Maluku", "WIT", 0.53),
    ("PPT", "Papua Tengah", None, "Papua Maluku", "WIT", 1.45),
    ("PPG", "Papua Pegunungan", None, "Papua Maluku", "WIT", 1.45),
]

# UU 14, 15, 16/2022 and UU 29/2022: the five new Papua provinces.
PAPUA_SPLIT = {
    "PPS": ["Merauke", "Boven Digoel", "Mappi", "Asmat"],
    "PPT": ["Nabire", "Puncak Jaya", "Paniai", "Mimika", "Puncak", "Dogiyai", "Intan Jaya", "Deiyai"],
    "PPG": ["Jayawijaya", "Pegunungan Bintang", "Yahukimo", "Tolikara", "Mamberamo Tengah",
            "Yalimo", "Lanny Jaya", "Nduga"],
    "PPA": ["Jayapura", "Kota Jayapura", "Keerom", "Sarmi", "Mamberamo Raya", "Waropen",
            "Biak Numfor", "Supiori", "Kepulauan Yapen"],
    "PBD": ["Sorong", "Kota Sorong", "Raja Ampat", "Tambrauw", "Maybrat", "Sorong Selatan"],
    "PPB": ["Manokwari", "Manokwari Selatan", "Pegunungan Arfak", "Teluk Bintuni",
            "Teluk Wondama", "Fakfak", "Kaimana"],
}

# Districts that form the Jabodetabek operating region (outside DKI itself).
JABODETABEK = {"Bogor", "Kota Bogor", "Kota Depok", "Bekasi", "Kota Bekasi", "Tangerang",
               "Kota Tangerang", "Kota Tangerang Selatan"}

# Current official names where the 2020 layer uses an older one.
RENAMES = {"Mamuju Utara": "Pasangkayu", "Toba Samosir": "Toba",
           "Kota Baru": "Kotabaru", "Banyu Asin": "Banyuasin", "Karang Asem": "Karangasem",
           "Kota Banjar Baru": "Kota Banjarbaru", "Kota Sawah Lunto": "Kota Sawahlunto",
           "Tulangbawang": "Tulang Bawang", "Maluku Tenggara Barat": "Kepulauan Tanimbar"}

# Metro cores get a site-density boost in the generator.
METRO = {"Kota Jakarta Pusat", "Kota Jakarta Selatan", "Kota Jakarta Barat", "Kota Jakarta Timur",
         "Kota Jakarta Utara", "Kota Surabaya", "Kota Bandung", "Kota Medan", "Kota Makassar",
         "Kota Semarang", "Kota Bekasi", "Kota Tangerang", "Kota Depok", "Kota Tangerang Selatan",
         "Kota Denpasar", "Kota Palembang", "Kota Batam", "Kota Balikpapan", "Kota Pekanbaru",
         "Kota Bogor", "Sidoarjo", "Bekasi", "Kota Yogyakarta", "Kota Malang", "Kota Samarinda",
         "Kota Manado", "Badung"}


def fetch(url: str, name: str) -> dict:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"downloading {name}")
        urllib.request.urlretrieve(url, path)
    return json.loads(path.read_text())


def rounded(geom, nd=4):
    def rnd(coords):
        if isinstance(coords[0], (float, int)):
            return [round(coords[0], nd), round(coords[1], nd)]
        return [rnd(c) for c in coords]
    m = mapping(geom)
    return {"type": m["type"], "coordinates": rnd(m["coordinates"])}


def clean(geom):
    geom = make_valid(geom)
    if geom.geom_type == "GeometryCollection":
        geom = unary_union([g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
    return geom


def main():
    adm2 = fetch(ADM2_URL, "adm2_simplified.geojson")
    adm1 = fetch(ADM1_URL, "adm1_simplified.geojson")

    osm_to_id = {p[2]: p[0] for p in PROVINCES if p[2]}
    prov_shapes = [(osm_to_id[f["properties"]["shapeName"]], clean(shape(f["geometry"])))
                   for f in adm1["features"]]
    papua_by_name = {n: pid for pid, names in PAPUA_SPLIT.items() for n in names}

    districts = []
    for f in adm2["features"]:
        raw = f["properties"]["shapeName"]
        if raw in NON_DISTRICT:
            continue
        g = clean(shape(f["geometry"]))
        if raw in papua_by_name:
            pid = papua_by_name[raw]
        elif raw == "Kepulauan Seribu":  # offshore kabupaten of DKI Jakarta
            pid = "JKT"
        else:
            pt = g.representative_point()
            hits = [pid for pid, ps in prov_shapes if ps.contains(pt)]
            if not hits:  # offshore islands: fall back to the nearest province
                hits = [min(prov_shapes, key=lambda p: p[1].distance(pt))[0]]
            pid = hits[0]
        districts.append({"raw": raw, "name": RENAMES.get(raw, raw), "prov": pid, "geom": g})

    assert len(districts) == 514, len(districts)

    meta = {p[0]: p for p in PROVINCES}
    dist_features, prov_members = [], {}
    counters = {}
    for d in sorted(districts, key=lambda d: (d["prov"], d["name"])):
        pid = d["prov"]
        counters[pid] = counters.get(pid, 0) + 1
        did = f"{pid}-{counters[pid]:02d}"
        is_kota = d["name"].startswith("Kota ")
        region = "Jabodetabek" if (pid == "JKT" or d["raw"] in JABODETABEK) else meta[pid][3]
        g = d["geom"].simplify(0.004, preserve_topology=True)
        c = d["geom"].representative_point()
        prov_members.setdefault(pid, []).append(d["geom"])
        dist_features.append({
            "type": "Feature",
            "properties": {
                "id": did, "name": d["name"], "province_id": pid,
                "type": "kota" if is_kota else "kabupaten", "region": region,
                "metro": d["raw"] in METRO, "center": [round(c.x, 4), round(c.y, 4)],
                "area_km2": round(d["geom"].area * 12321 * abs(__import__("math").cos(c.y * 0.01745)), 0),
            },
            "geometry": rounded(g),
        })

    prov_features = []
    for pid, name, _, region, tz, pop in PROVINCES:
        u = unary_union(prov_members[pid]).buffer(0)
        g = u.simplify(0.012, preserve_topology=True)
        c = u.representative_point()
        b = u.bounds
        prov_features.append({
            "type": "Feature",
            "properties": {"id": pid, "name": name, "region": region, "tz": tz,
                           "population_m": pop, "districts": len(prov_members[pid]),
                           "center": [round(c.x, 4), round(c.y, 4)],
                           "bbox": [round(v, 3) for v in b]},
            "geometry": rounded(g, 3),
        })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "districts.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": dist_features}, separators=(",", ":")))
    (OUT / "provinces.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": prov_features}, separators=(",", ":")))
    (OUT / "geo_meta.json").write_text(json.dumps({
        "sources": {"adm2": ADM2_URL, "adm1": ADM1_URL},
        "licence": "ADM2: BPS/OCHA ROAP, CC BY 3.0 IGO. ADM1 attribution: OpenStreetMap contributors, ODbL.",
        "provinces": len(prov_features), "districts": len(dist_features),
    }, indent=2))
    for fn in ("districts.geojson", "provinces.geojson"):
        print(fn, os.path.getsize(OUT / fn) // 1024, "KB")
    per = {pid: len(v) for pid, v in prov_members.items()}
    print(per)


if __name__ == "__main__":
    main()
