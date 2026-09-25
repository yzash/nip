#!/usr/bin/env python3
"""NICC synthetic data generator (PRD §10).

Seeded and re-runnable: the same stories.yaml + seed always produces the same /data.
Story clusters and demo figures live in stories.yaml; role scope and approval policy in
roles.json. Geography comes from data/geo (built once by scripts/build_geo.py).

    python3 generate.py            # writes data/*.json and prints the story check

Every number is synthetic. Baselines and targets are placeholders for IOH calibration.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import yaml
from shapely.geometry import Point, shape
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CFG = yaml.safe_load((ROOT / "stories.yaml").read_text())
ROLES = json.loads((ROOT / "roles.json").read_text())
POLICY = ROLES["policy"]

SEED = CFG["seed"]
rng = np.random.default_rng(SEED)
rnd = random.Random(SEED)

NOW = dt.datetime.fromisoformat(CFG["now"])
TODAY = NOW.date()
AS_OF = TODAY - dt.timedelta(days=1)            # D-1
AS_OF_D5 = TODAY - dt.timedelta(days=5)         # D-5 (Smart CapEx)
KPI_DAYS = CFG["kpi_days"]
DATES = [AS_OF - dt.timedelta(days=KPI_DAYS - 1 - i) for i in range(KPI_DAYS)]
MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]
STAGES = ["Decision", "BOQ", "PO", "Vendor allocation", "Material dispatch",
          "Installation", "Integration", "RFS", "Validation"]
CLASSES = ["capacity", "power", "transport", "ran_hardware", "environmental"]
TZ_OFFSET = {"WIB": 7, "WITA": 8, "WIT": 9}


def iso(d) -> str:
    return d.isoformat() if isinstance(d, dt.date) else str(d)


def ts(d: dt.datetime) -> str:
    return d.replace(microsecond=0).isoformat()


def days(n: float) -> dt.timedelta:
    return dt.timedelta(days=float(n))


def week_date(k: float) -> dt.date:
    return TODAY + days(7 * k)


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def pick(seq, p=None):
    if p is None:
        return seq[int(rng.integers(len(seq)))]
    p = np.asarray(p, float)
    return seq[int(rng.choice(len(seq), p=p / p.sum()))]


def r2(x, n=2):
    return float(round(float(x), n))


# ----------------------------------------------------------------------------------------
# Geography
# ----------------------------------------------------------------------------------------
PROV_GJ = json.loads((DATA / "geo" / "provinces.geojson").read_text())
DIST_GJ = json.loads((DATA / "geo" / "districts.geojson").read_text())
PROVS = {f["properties"]["id"]: f["properties"] for f in PROV_GJ["features"]}
DISTS = {f["properties"]["id"]: f["properties"] for f in DIST_GJ["features"]}
DIST_SHAPE = {f["properties"]["id"]: shape(f["geometry"]) for f in DIST_GJ["features"]}
DIST_PREP = {k: prep(v) for k, v in DIST_SHAPE.items()}
DIST_BY_NAME = defaultdict(list)
for d in DISTS.values():
    DIST_BY_NAME[(d["province_id"], d["name"])].append(d["id"])


def dist_id(prov: str, name: str) -> str:
    return DIST_BY_NAME[(prov, name)][0]


def locate(lon: float, lat: float, prov: str | None = None) -> str:
    p = Point(lon, lat)
    cands = [k for k in DISTS if prov is None or DISTS[k]["province_id"] == prov]
    for k in cands:
        if DIST_PREP[k].contains(p):
            return k
    return min(cands, key=lambda k: DIST_SHAPE[k].distance(p))


# ----------------------------------------------------------------------------------------
# Names
# ----------------------------------------------------------------------------------------
NAME_PARTS = {
    "Java": (["Suka", "Mekar", "Karang", "Cipta", "Sido", "Tegal", "Ngadi", "Wono", "Banjar",
              "Kali", "Tanjung", "Pasir", "Sri", "Purwo", "Jati", "Ciwaru", "Cibeber", "Baturaja"],
             ["jaya", "mulya", "sari", "rejo", "harjo", "makmur", "asri", "wangi", "agung", "maju",
              "indah", "mukti", "raharja", "kerta", "luhur", "sentosa", "kencana"], True),
    "Jabodetabek": (["Kebon", "Rawa", "Pondok", "Cempaka", "Kelapa", "Bintaro", "Cilandak", "Duren",
                     "Tanah", "Pulo", "Pasar", "Kampung", "Cipinang", "Kemang", "Sunter", "Grogol"],
                    ["Jeruk", "Baru", "Indah", "Gading", "Sari", "Mas", "Asri", "Permai", "Raya",
                     "Timur", "Barat", "Selatan", "Utara", "Jaya", "Kuning", "Tinggi"], False),
    "Sumatra": (["Sungai", "Tanjung", "Air", "Batang", "Pematang", "Simpang", "Koto", "Lubuk",
                 "Padang", "Bukit", "Talang", "Muara", "Teluk", "Kampung", "Sei"],
                ["Baru", "Jaya", "Raya", "Indah", "Tinggi", "Hilir", "Hulu", "Panjang", "Gadang",
                 "Dalam", "Besar", "Lama", "Tengah", "Merah", "Putih"], False),
    "Kalimantan": (["Sungai", "Tanjung", "Loa", "Muara", "Anjir", "Handil", "Kuala", "Teluk",
                    "Batu", "Long", "Tering", "Kampung"],
                   ["Baru", "Jaya", "Raya", "Indah", "Hulu", "Hilir", "Kecil", "Besar", "Lama",
                    "Ulin", "Janang", "Makmur"], False),
    "Sulawesi": (["Bonto", "Tana", "Lembang", "Bulu", "Watang", "Kampung", "Tamal", "Bara",
                  "Pattallassang", "Paccinongang", "Moncong", "Balang"],
                 ["Baru", "Lompo", "Caddi", "Raya", "Jaya", "Tinggi", "Indah", "Loe", "Sari",
                  "Makmur", "Timur"], False),
    "Bali Nusra": (["Banjar", "Desa", "Kampung", "Tanjung", "Batu", "Pantai", "Labuan", "Kuta"],
                   ["Kaja", "Kelod", "Kangin", "Kauh", "Baru", "Sari", "Jaya", "Indah", "Bajo"], False),
    "Papua Maluku": (["Kampung", "Distrik", "Teluk", "Tanjung", "Pulau", "Negeri", "Waena",
                      "Kota"],
                     ["Baru", "Indah", "Jaya", "Raya", "Permai", "Utara", "Selatan", "Lama",
                      "Pantai"], False),
}
URBAN_TAGS = ["Pasar", "Terminal", "Stasiun", "Alun-Alun", "Kampus", "Plaza", "RSUD",
              "Pelabuhan", "Perumahan", "Kawasan Industri", "Ruko"]
PEOPLE = ["Agus Setiawan", "Dewi Lestari", "Hendra Wijaya", "Putri Anggraini", "Fajar Nugraha",
          "Siti Rahayu", "Yoga Saputra", "Indah Permatasari", "Rian Hidayat", "Wulan Sari",
          "Dimas Aditya", "Ayu Kusumawati", "Arif Rahman", "Nurul Hasanah", "Eko Purnomo",
          "Fitri Handayani", "Bagus Wicaksono", "Ratna Dewi", "Taufik Hidayatullah",
          "Mega Puspita", "Irfan Maulana", "Lestari Wahyuni", "Gilang Ramadhan", "Sinta Maharani",
          "Yusuf Kurniawan", "Anisa Fitriani", "Hadi Susanto", "Rina Oktaviani", "Ilham Akbar",
          "Dian Safitri", "Reza Firmansyah", "Novi Andriani", "Andika Pratama", "Tri Wahyudi",
          "Maria Simanjuntak", "Johan Sitorus", "Ketut Ariawan", "Made Suarjana", "Andi Baso",
          "Muh. Ikhsan", "Yohanes Wenda", "Paulus Rumbiak", "Syahrul Ramadhan", "Darmawan Lubis",
          "Kadek Sudarsana", "Wayan Mertha", "Roni Tambunan", "Ahmad Fauzi", "Lukman Hakim",
          "Evi Susilawati", "Samuel Manuputty", "Fransiskus Lema", "Budi Santoso", "Hasan Basri"]


def site_name(region: str, urban: bool, cls: str) -> str:
    pre, suf, joined = NAME_PARTS[region]
    core = pre[int(rng.integers(len(pre)))] + ("" if joined else " ") + suf[int(rng.integers(len(suf)))]
    if joined:
        core = core[0].upper() + core[1:]
    if cls == "ibs":
        return f"IBS {pick(['Mall', 'Plaza', 'Tower', 'Apartemen', 'RS'])} {core}"
    if cls == "das":
        return f"DAS {pick(['Stadion', 'Bandara', 'Stasiun', 'Terminal'])} {core}"
    if urban and rng.random() < 0.35:
        return f"{pick(URBAN_TAGS)} {core}"
    return core


# ----------------------------------------------------------------------------------------
# 1. Sites
# ----------------------------------------------------------------------------------------
STORIES = CFG["stories"]
story_sites_spec = []  # (story, locality, lon, lat, prov, district_name|None)
for key, st in STORIES.items():
    for row in st["sites"]:
        name, lon, lat = row[0], row[1], row[2]
        dname = row[3] if len(row) > 3 else st.get("district")
        story_sites_spec.append((key, name, lon, lat, st["province"], dname))

N_TOTAL = CFG["sites_total"]
N_GENERIC = N_TOTAL - len(story_sites_spec)

# District weights: population share of the province, boosted for kota and metro cores.
dist_ids = sorted(DISTS)
w = []
for k in dist_ids:
    d = DISTS[k]
    p = PROVS[d["province_id"]]
    base = p["population_m"] / p["districts"]
    f = 1.0
    if d["type"] == "kota":
        f *= 2.2
    if d["metro"]:
        f *= 2.6
    if d["province_id"] == "JKT":
        f *= 1.6
    if d["name"] == "Kepulauan Seribu":
        f = 0.05
    if d["region"] == "Papua Maluku":
        f *= 0.8
    w.append(base * f)
w = np.array(w)
alloc = np.maximum(2, np.floor(w / w.sum() * (N_GENERIC - 2 * len(dist_ids)) + 2)).astype(int)
while alloc.sum() < N_GENERIC:
    alloc[int(rng.choice(len(alloc), p=w / w.sum()))] += 1
while alloc.sum() > N_GENERIC:
    i = int(rng.choice(len(alloc), p=w / w.sum()))
    if alloc[i] > 2:
        alloc[i] -= 1


def sample_point(did: str, urban: bool):
    d = DISTS[did]
    g = DIST_SHAPE[did]
    cx, cy = d["center"]
    minx, miny, maxx, maxy = g.bounds
    span = max(maxx - minx, maxy - miny)
    for _ in range(60):
        if urban or rng.random() < 0.55:
            s = span * (0.12 if urban else 0.18)
            x, y = rng.normal(cx, s), rng.normal(cy, s)
        else:
            x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if DIST_PREP[did].contains(Point(x, y)):
            return float(x), float(y)
    return float(cx + rng.normal(0, 0.005)), float(cy + rng.normal(0, 0.005))


RAN_VENDORS = {"Jabodetabek": [0.45, 0.30, 0.15, 0.10], "Java": [0.35, 0.35, 0.20, 0.10],
               "Sumatra": [0.20, 0.25, 0.40, 0.15], "Kalimantan": [0.25, 0.20, 0.35, 0.20],
               "Sulawesi": [0.30, 0.20, 0.30, 0.20], "Bali Nusra": [0.30, 0.35, 0.20, 0.15],
               "Papua Maluku": [0.15, 0.20, 0.35, 0.30]}
OEMS = ["Ericsson", "Nokia", "Huawei", "ZTE"]
TOWERCOS = ["Mitratel", "Protelindo", "Tower Bersama", "EdgePoint", "IOH-owned"]
FIVE_G_DISTRICTS = {"Kota Jakarta Pusat", "Kota Jakarta Selatan", "Kota Jakarta Barat",
                    "Kota Jakarta Utara", "Kota Jakarta Timur", "Kota Bandung", "Kota Medan",
                    "Kota Makassar", "Kota Denpasar", "Badung", "Kota Tangerang Selatan",
                    "Kota Bekasi", "Kota Semarang", "Kota Batam", "Kota Balikpapan",
                    "Kota Yogyakarta", "Kota Depok", "Kota Palembang"}

sites = []
prov_counter = Counter()


def new_site_id(prov):
    prov_counter[prov] += 1
    return f"{prov}-{prov_counter[prov]:04d}"


def make_site(did, lon, lat, name=None, story=None, force=None):
    d = DISTS[did]
    prov = d["province_id"]
    region = d["region"]
    urban = d["type"] == "kota" or d["metro"]
    remote = region == "Papua Maluku" or (region in ("Kalimantan", "Bali Nusra") and not urban)
    if urban:
        cls = pick(["macro", "small_cell", "ibs", "das"], [0.62, 0.2, 0.13, 0.05])
    else:
        cls = pick(["macro", "small_cell", "ibs"], [0.93, 0.05, 0.02])
    techs = ["2G", "4G"] if rng.random() < 0.72 else ["4G"]
    if urban and d["name"] in FIVE_G_DISTRICTS and rng.random() < 0.16:
        techs = techs + ["5G"]
    if urban and rng.random() < 0.04:
        techs = techs + ["FTTH"]
    if remote:
        backhaul = pick(["microwave", "satellite", "fibre"], [0.55, 0.3, 0.15]) \
            if region == "Papua Maluku" else pick(["microwave", "fibre", "satellite"], [0.7, 0.2, 0.1])
    else:
        backhaul = pick(["fibre", "microwave"], [0.62, 0.38] if urban else [0.25, 0.75])
    if remote:
        power = pick(["grid", "grid+genset", "genset", "solar hybrid"], [0.35, 0.3, 0.2, 0.15])
    else:
        power = pick(["grid", "grid+genset"], [0.85, 0.15] if urban else [0.6, 0.4])
    year = int(rng.choice(np.arange(2004, 2027), p=np.array(
        [1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 1], float) / 97))
    on_air = dt.date(year, int(rng.integers(1, 13)), int(rng.integers(1, 28)))
    if on_air > AS_OF - days(60):
        on_air = AS_OF - days(int(rng.integers(60, 400)))
    coastal = bool(region in ("Sumatra", "Kalimantan", "Papua Maluku", "Bali Nusra") and rng.random() < 0.3)
    s = {
        "site_id": new_site_id(prov),
        "name": name or site_name(region, urban, cls),
        "district_id": did, "province_id": prov, "region": region,
        "lat": round(lat, 5), "lon": round(lon, 5),
        "site_class": cls, "vendor": pick(OEMS, RAN_VENDORS[region]),
        "technologies": techs, "backhaul": backhaul, "power_type": power,
        "on_air_date": iso(on_air),
        "cluster": "",
        "tower_company": "Building owner" if cls in ("ibs", "das") else pick(TOWERCOS, [0.34, 0.3, 0.18, 0.08, 0.1]),
        "structure": {"macro": pick(["Greenfield tower", "Rooftop"], [0.75, 0.25] if not urban else [0.45, 0.55]),
                      "small_cell": "Street pole", "ibs": "Indoor", "das": "Indoor"}[cls],
        "elevation_m": int(clamp(rng.gamma(2.0, 60 if not coastal else 6), 1, 2400)),
        "coastal": coastal,
        "urban": bool(urban),
        "story": story,
    }
    if force:
        s.update(force)
    return s


for i, did in enumerate(dist_ids):
    d = DISTS[did]
    urban = d["type"] == "kota" or d["metro"]
    for _ in range(int(alloc[i])):
        lon, lat = sample_point(did, urban)
        sites.append(make_site(did, lon, lat))

# Story sites.
for key, name, lon, lat, prov, dname in story_sites_spec:
    did = dist_id(prov, dname) if dname else locate(lon, lat, prov)
    if not DIST_PREP[did].contains(Point(lon, lat)):
        did = locate(lon, lat, prov)
    force = {"site_class": "macro", "structure": "Greenfield tower"}
    if key == "bekasi_capacity":
        force.update(technologies=["2G", "4G"], backhaul="fibre", power_type="grid",
                     tower_company=pick(["Mitratel", "Protelindo", "Tower Bersama"]))
    elif key == "sulsel_transport":
        force.update(technologies=["2G", "4G"], backhaul="microwave",
                     power_type=pick(["grid", "grid+genset"]))
    elif key == "surabaya_cnx":
        force.update(technologies=["2G", "4G", "5G"], backhaul="fibre", power_type="grid",
                     cluster=STORIES["surabaya_cnx"]["cluster"])
    elif key == "cjava_power":
        force.update(technologies=["2G", "4G"], power_type=pick(["grid+genset", "grid"], [0.7, 0.3]),
                     backhaul=pick(["microwave", "fibre"], [0.6, 0.4]),
                     on_air_date=iso(dt.date(int(rng.integers(2006, 2012)), int(rng.integers(1, 13)), 15)))
    sites.append(make_site(did, lon, lat, name=name, story=key, force=force))

# Hub site for the South Sulawesi trunk (the core end of the link).
hub_spec = STORIES["sulsel_transport"]["link"]["hub"]
sulsel_hub = make_site(locate(hub_spec[1], hub_spec[2], "SLS"), hub_spec[1], hub_spec[2],
                       name=hub_spec[0], force={"site_class": "macro", "backhaul": "fibre",
                                                "technologies": ["2G", "4G", "5G"],
                                                "structure": "Rooftop"})
# replace one generic Makassar site so the total stays at N_TOTAL
mks = [s for s in sites if s["district_id"] == dist_id("SLS", "Kota Makassar") and not s["story"]]
victim = mks[0]
sulsel_hub["site_id"] = victim["site_id"]
sites[sites.index(victim)] = sulsel_hub

# Surabaya 5G is limited to the story cluster and the Phase 1 program sites (set later).
sby = dist_id("JTM", "Kota Surabaya")
for s in sites:
    if s["district_id"] == sby and not s["story"] and "5G" in s["technologies"]:
        s["technologies"].remove("5G")

N = len(sites)
assert N == N_TOTAL, N
IDX = {s["site_id"]: i for i, s in enumerate(sites)}
by_district = defaultdict(list)
for s in sites:
    by_district[s["district_id"]].append(s)

# Clusters: Netra cluster = district code + grid cell.
for s in sites:
    if not s["cluster"]:
        gx = int((s["lon"] * 10) % 7)
        gy = int((abs(s["lat"]) * 10) % 5)
        s["cluster"] = f"{s['district_id'].replace('-', '')}-C{gx * 5 + gy + 1:02d}"

story_idx = defaultdict(list)
for i, s in enumerate(sites):
    if s["story"]:
        story_idx[s["story"]].append(i)

age_years = np.array([(AS_OF - dt.date.fromisoformat(s["on_air_date"])).days / 365.25 for s in sites])
urban_arr = np.array([s["urban"] for s in sites])
region_arr = np.array([s["region"] for s in sites])

# Subscribers and energy telemetry
for i, s in enumerate(sites):
    base = {"Jabodetabek": 6200, "Java": 3600, "Sumatra": 2600, "Kalimantan": 2000,
            "Sulawesi": 2300, "Bali Nusra": 2400, "Papua Maluku": 1300}[s["region"]]
    mult = 1.8 if DISTS[s["district_id"]]["metro"] else (1.3 if s["urban"] else 0.8)
    mult *= {"macro": 1.0, "small_cell": 0.45, "ibs": 0.7, "das": 0.9}[s["site_class"]]
    subs = base * mult * rng.lognormal(0, 0.35)
    if s["story"] == "bekasi_capacity":
        subs = rng.uniform(6800, 9200)
    elif s["story"] == "surabaya_cnx":
        subs = rng.uniform(12500, 15500)
    elif s["story"] == "sulsel_transport":
        subs = rng.uniform(5200, 7400)
    s["subscribers"] = int(subs)
    genset = s["power_type"] in ("grid+genset", "genset")
    s["energy"] = {
        "grid_outages_30d": int(rng.poisson(1.5 if s["region"] in ("Jabodetabek", "Java") else 5)),
        "genset_hours_day": r2(rng.uniform(0.5, 4) if s["power_type"] == "grid+genset" else
                              (rng.uniform(14, 22) if s["power_type"] == "genset" else
                               (rng.uniform(3, 9) if s["power_type"] == "solar hybrid" else 0)), 1),
        "battery_health_pct": int(clamp(rng.normal(86 - age_years[i] * 1.2, 7), 38, 100)),
        "rectifier_alarms_30d": int(rng.poisson(0.8 + (2.5 if genset else 0))),
        "energy_opex_idr_month": int(round((7_500_000 if s["urban"] else 5_200_000) *
                                           (2.6 if s["power_type"] == "genset" else 1.35 if genset else 1.0)
                                           * rng.lognormal(0, 0.2), -4)),
    }

# ----------------------------------------------------------------------------------------
# 2. Cells
# ----------------------------------------------------------------------------------------
cells = []
BANDS_4G = ["L900", "L1800", "L2100", "L2300"]
for s in sites:
    nsec = 3 if s["site_class"] == "macro" else (1 if s["site_class"] == "small_cell" else 2)
    az0 = int(rng.integers(0, 120))
    for k in range(nsec):
        sector = "ABC"[k]
        band = pick(BANDS_4G, [0.25, 0.45, 0.2, 0.1])
        if "5G" in s["technologies"] and k < 2:
            band = pick(["N1800", "N2100"], [0.4, 0.6])
        cap = {"L900": 75, "L1800": 150, "L2100": 150, "L2300": 220, "N1800": 480, "N2100": 620}[band]
        cells.append({"cell_id": f"{s['site_id']}-{sector}{k + 1}", "site_id": s["site_id"],
                      "band": band, "sector": sector, "azimuth": (az0 + 120 * k) % 360,
                      "capacity_mbps": cap})

# ----------------------------------------------------------------------------------------
# 3. Daily KPIs (N x 90)
# ----------------------------------------------------------------------------------------
T = KPI_DAYS
t = np.arange(T)[None, :]
weekend = np.array([d.weekday() >= 5 for d in DATES])[None, :]

mw = np.array([s["backhaul"] != "fibre" for s in sites])
sat = np.array([s["backhaul"] == "satellite" for s in sites])
genset = np.array([s["power_type"] in ("grid+genset", "genset") for s in sites])

prb0 = np.where(urban_arr, rng.normal(56, 10, N), rng.normal(38, 11, N))
prb_growth = rng.normal(0.035, 0.05, N)                 # pts per day
prb = prb0[:, None] + prb_growth[:, None] * t + rng.normal(0, 2.6, (N, T)) - weekend * 3.0

avail_base = 99.93 - 0.18 * mw - 0.5 * sat - 0.12 * genset - 0.012 * np.clip(age_years - 8, 0, None)
avail = np.repeat(avail_base[:, None], T, axis=1) - np.abs(rng.normal(0, 0.06, (N, T)))
outage = rng.random((N, T)) < (0.006 + 0.01 * mw + 0.02 * sat + 0.01 * genset)[:, None]
avail -= outage * rng.uniform(0.4, 4.5, (N, T))

alarm_lambda = 0.4 + 0.6 * mw + 0.8 * genset + 0.06 * np.clip(age_years, 0, 20)
alarms = rng.poisson(np.repeat(alarm_lambda[:, None], T, axis=1)).astype(float) + outage * rng.integers(2, 9, (N, T))
tickets = rng.poisson(0.25 + 0.03 * (urban_arr * 4)[:, None], (N, T)).astype(float)


def derive(prb, avail, alarms):
    p = np.clip(prb, 3, 99)
    bad = 1.8 + np.clip(p - 65, 0, None) * 0.42 + (100 - avail) * 1.4
    thr_cap = np.where(urban_arr, 48, 30)[:, None]
    thr = thr_cap * (1 - p / 100) ** 0.75 + 3
    cnx = 82 - np.clip(p - 70, 0, None) * 0.45 - (100 - avail) * 3.2 - np.clip(bad - 4, 0, None) * 0.6 - alarms * 0.25
    return bad, thr, cnx


# Keep generic sites out of the red predicted classes by capping their PRB trajectory.
prb = np.clip(prb, 5, 92)

# Story trajectories -------------------------------------------------------------
ramp = np.clip((t - (T - 90)) / 89.0, 0, 1)
for i in story_idx["bekasi_capacity"]:
    start, end = rng.uniform(66, 71), rng.uniform(86, 89.5)
    prb[i] = start + (end - start) * ramp[0] ** 1.35 + rng.normal(0, 1.4, T) - weekend[0] * 2
    avail[i] = 99.9 - np.abs(rng.normal(0, 0.05, T))
    prb_growth[i] = (end - start) / 90
for n, i in enumerate(story_idx["sulsel_transport"]):
    r = np.clip((t[0] - (T - 24)) / 23, 0, 1)
    avail[i] = 99.85 - r * rng.uniform(0.6, 1.1) - np.abs(rng.normal(0, 0.08, T))
    alarms[i] = rng.poisson(0.8 + r * 6.5)
    prb[i] = rng.normal(58, 3, T) + r * 6
for i in story_idx["surabaya_cnx"]:
    prb[i] = np.clip(rng.normal(74, 2.5, T) + np.clip((t[0] - (T - 45)) / 44, 0, 1) * 9, 5, 97)
    avail[i] = 99.9 - np.abs(rng.normal(0, 0.05, T))
for i in story_idx["cjava_power"]:
    r = np.clip((t[0] - (T - 35)) / 34, 0, 1)
    alarms[i] = rng.poisson(1.0 + r * 5.5)
    dips = rng.random(T) < (0.05 + 0.18 * r)
    avail[i] = 99.9 - np.abs(rng.normal(0, 0.05, T)) - dips * rng.uniform(0.3, 1.6, T)

avail = np.clip(avail, 75, 100)
bad, thr, cnx = derive(prb, avail, alarms)
cnx += rng.normal(0, 1.1, (N, T))
for i in story_idx["surabaya_cnx"]:
    r = np.clip((t[0] - (T - 28)) / 27, 0, 1)
    cnx[i] = rng.normal(79.5, 0.5, T) - r * rng.uniform(3.0, 3.8)
for i in story_idx["bekasi_capacity"]:
    cnx[i] = cnx[i] - 1.0
cnx = np.clip(cnx, 30, 99)
bad = np.clip(bad + rng.normal(0, 0.35, (N, T)), 0.2, 25)
thr = np.clip(thr + rng.normal(0, 1.2, (N, T)), 0.5, 250)
alarms = np.clip(alarms, 0, 255)
tickets = np.clip(tickets, 0, 255)

# Latest values (D-1) used across the generator.
cur = {"availability": avail[:, -1], "prb": prb[:, -1], "cnx": cnx[:, -1], "bad": bad[:, -1],
       "alarms": alarms[:, -7:].mean(1)}


def health_score(av, cx, bd, pr, al):
    a = np.clip((av - 97) / 3, 0, 1) * 100
    c = np.clip((cx - 50) / 40, 0, 1) * 100
    b = np.clip(1 - (bd - 2) / 14, 0, 1) * 100
    p = np.clip(1 - (pr - 55) / 45, 0, 1) * 100
    l = np.clip(1 - al / 10, 0, 1) * 100
    return 0.3 * a + 0.25 * c + 0.15 * b + 0.15 * p + 0.15 * l


# ----------------------------------------------------------------------------------------
# 4. Forecast (N x 8 weeks, cumulative probability of failure/breach by week k)
# ----------------------------------------------------------------------------------------
fc_class = [None] * N
fc_prob = np.zeros((N, 8))
fc_cross = np.full(N, 0)            # week the site crosses 60%, 0 = never in horizon
factor_rows = [None] * N
wts = np.full(N, 99.0)             # capacity weeks to saturation

risk = {
    "capacity": np.clip((cur["prb"] - 50) / 40, 0, 1) * 0.6 + np.clip(prb_growth * 8, 0, 0.4),
    "power": 0.25 * genset + 0.02 * np.clip(age_years - 6, 0, None) +
             np.array([(100 - s["energy"]["battery_health_pct"]) / 120 for s in sites]),
    "transport": 0.3 * mw + 0.35 * sat + np.clip((100 - cur["availability"]) * 0.4, 0, 0.3),
    "ran_hardware": 0.035 * np.clip(age_years - 5, 0, None) + np.clip(cur["alarms"] / 20, 0, 0.3),
    "environmental": np.array([0.4 * s["coastal"] + (0.15 if s["elevation_m"] < 15 else 0) for s in sites]),
}
risk_mat = np.stack([risk[c] for c in CLASSES], 1) + rng.normal(0, 0.05, (N, 5))


def curve(pmax, cross_week=None, s=None):
    s = s if s is not None else rng.uniform(0.8, 1.5)
    k = np.arange(1, 9)
    if cross_week:
        m = cross_week - 0.5 - s * math.log((0.6 / pmax) / (1 - 0.6 / pmax))
    else:
        m = rng.uniform(2, 9)
    return pmax / (1 + np.exp(-(k - m) / s))


def set_red(i, cls, cross, pmax=None):
    pmax = pmax or rng.uniform(0.78, 0.95)
    fc_class[i] = cls
    fc_prob[i] = curve(pmax, cross)
    fc_cross[i] = int(np.argmax(fc_prob[i] >= POLICY["red_min_probability"]) + 1)


# Background: amber and green.
for i in range(N):
    cls = CLASSES[int(np.argmax(risk_mat[i]))]
    fc_class[i] = cls
    r = float(risk_mat[i].max())
    u = rng.random()
    if u < 0.055 + 0.06 * r:
        pmax = rng.uniform(0.3, 0.57)
    else:
        pmax = clamp(rng.beta(1.3, 9) + r * 0.08, 0.01, 0.29)
    fc_prob[i] = curve(pmax)

# Story reds.
for i in story_idx["bekasi_capacity"]:
    set_red(i, "capacity", STORIES["bekasi_capacity"]["crossing_week"], rng.uniform(0.88, 0.94))
for i in story_idx["sulsel_transport"]:
    set_red(i, "transport", STORIES["sulsel_transport"]["crossing_week"], rng.uniform(0.9, 0.95))
for i in story_idx["cjava_power"]:
    set_red(i, "power", STORIES["cjava_power"]["crossing_week"], rng.uniform(0.74, 0.82))
sby_idx = story_idx["surabaya_cnx"]
sby_cap = sby_idx[: STORIES["surabaya_cnx"]["capacity_predicted_sites"]]
for n, i in enumerate(sby_cap):
    set_red(i, "capacity", 5, rng.uniform(0.78, 0.88))
for i in sby_idx[len(sby_cap):]:
    fc_class[i] = "capacity"
    fc_prob[i] = curve(rng.uniform(0.42, 0.56))

used = set(i for v in story_idx.values() for i in v) | {IDX[sulsel_hub["site_id"]]}
LATER = np.array([0.02, 0.03, 0.04, 0.07, 0.14, 0.2, 0.24, 0.26])


def choose_reds(cls, n, cond):
    cand = [i for i in range(N) if i not in used and cond(sites[i])]
    cand.sort(key=lambda i: -risk[cls][i] - rng.random() * 0.3)
    chosen = cand[:n]
    for i in chosen:
        used.add(i)
        set_red(i, cls, int(rng.choice(np.arange(1, 9), p=LATER / LATER.sum())))
    return chosen


PF = CFG["predicted_failures"]
reds_power = choose_reds("power", PF["power"] - len(story_idx["cjava_power"]),
                         lambda s: s["power_type"] != "grid" and s["region"] in ("Sumatra", "Kalimantan", "Bali Nusra", "Papua Maluku"))
reds_transport = choose_reds("transport", PF["transport"] - len(story_idx["sulsel_transport"]),
                             lambda s: s["backhaul"] != "fibre" and s["region"] in ("Papua Maluku", "Kalimantan", "Sumatra", "Bali Nusra"))
reds_ran = choose_reds("ran_hardware", PF["ran_hardware"],
                       lambda s: s["region"] in ("Java", "Sumatra", "Jabodetabek") and s["site_class"] == "macro")
reds_env = choose_reds("environmental", PF["environmental"],
                       lambda s: s["coastal"] and s["region"] in ("Sumatra", "Kalimantan"))
for i in reds_ran:
    alarms[i, -21:] += rng.poisson(2.5, 21)

# Capacity: generic sites never cross 60% on capacity unless chosen for a covered program.
for i in range(N):
    if i in used:
        continue
    if fc_prob[i, -1] >= POLICY["red_min_probability"]:
        fc_prob[i] = curve(rng.uniform(0.3, 0.57))

# Weeks to saturation for all sites from the PRB trend (capped at 26 = "beyond horizon").
slope_wk = np.maximum(prb_growth * 7, 0.05)
wts = np.clip((88 - cur["prb"]) / slope_wk, 0.5, 26)

FACTORS = {
    "capacity": lambda i: [f"PRB peak-hour trend +{max(prb_growth[i] * 7, 0.3):.1f} pts/wk",
                           f"Traffic growth {int(clamp(prb_growth[i] * 400 + 6, 3, 28))}% MoM",
                           pick([f"5G/LTE-A device share {int(rng.uniform(22, 41))}%",
                                 "Event calendar: industrial shift peak", "New housing cluster in catchment",
                                 "Campus term start"])],
    "power": lambda i: [f"Battery health {sites[i]['energy']['battery_health_pct']}% (EOL < 60%)",
                        f"Genset run {sites[i]['energy']['genset_hours_day']} h/day" if sites[i]['energy']['genset_hours_day'] else
                        f"Grid outages ×{sites[i]['energy']['grid_outages_30d'] + 4} in 30 d",
                        f"Rectifier alarms ×{sites[i]['energy']['rectifier_alarms_30d'] + 5} (30 d)"],
    "transport": lambda i: [f"Backhaul peak utilisation {int(rng.uniform(86, 95))}%",
                            f"MW fade events ×{int(rng.uniform(12, 30))} (14 d)" if sites[i]["backhaul"] == "microwave" else "Satellite link margin 1.8 dB",
                            pick(["Single path, no protection", "Rain season onset (BMKG)", "Fibre cut history ×3 (12 mo)"])],
    "ran_hardware": lambda i: [f"Unit age {age_years[i]:.1f} yrs (MTBF 9 yrs)",
                               f"Recurring VSWR alarm ×{int(rng.uniform(4, 11))}",
                               f"Cabinet temperature {int(rng.uniform(43, 51))}°C peak"],
    "environmental": lambda i: ["BMKG heavy-rain outlook (dasarian)",
                                f"Elevation {sites[i]['elevation_m']} m ASL",
                                pick(["Flood incident 2024 within 2 km", "Coastal abrasion zone", "River overflow zone"])],
}


def factors_for(i):
    cls = fc_class[i]
    names = FACTORS[cls](i)
    wt = np.sort(rng.dirichlet([4, 2.5, 1.5]))[::-1]
    return [{"factor": n, "weight": r2(x)} for n, x in zip(names, wt)]


# ----------------------------------------------------------------------------------------
# 5. Programs (30), vendors, warehouses, SKUs
# ----------------------------------------------------------------------------------------
VENDORS = [
    {"vendor_id": "V01", "name": "PT Karya Rollout Nusantara", "short": "KRN",
     "regions": ["Jabodetabek", "Java"], "capacity_sites_per_month": 42, "sla_pct": 94.1},
    {"vendor_id": "V02", "name": "PT Sinar Menara Teknik", "short": "SMT",
     "regions": ["Java", "Bali Nusra"], "capacity_sites_per_month": 34, "sla_pct": 91.6},
    {"vendor_id": "V03", "name": "PT Garda Telekomunikasi Indonesia", "short": "GTI",
     "regions": ["Sumatra"], "capacity_sites_per_month": 28, "sla_pct": 84.7},
    {"vendor_id": "V04", "name": "PT Borneo Infra Services", "short": "BIS",
     "regions": ["Kalimantan"], "capacity_sites_per_month": 14, "sla_pct": 88.2},
    {"vendor_id": "V05", "name": "PT Celebes Network Engineering", "short": "CNE",
     "regions": ["Sulawesi", "Papua Maluku"], "capacity_sites_per_month": 16, "sla_pct": 86.9},
    {"vendor_id": "V06", "name": "PT Timur Raya Solusi", "short": "TRS",
     "regions": ["Bali Nusra", "Papua Maluku", "Sulawesi"], "capacity_sites_per_month": 12, "sla_pct": 82.3},
]
WAREHOUSES = [
    ("WH-CKR", "Cikarang (Jabodetabek)", "Jabodetabek", 107.148, -6.300),
    ("WH-SMG", "Semarang", "Java", 110.420, -6.980),
    ("WH-SBY", "Surabaya", "Java", 112.730, -7.250),
    ("WH-MDN", "Medan", "Sumatra", 98.680, 3.590),
    ("WH-PLB", "Palembang", "Sumatra", 104.760, -2.980),
    ("WH-BPN", "Balikpapan", "Kalimantan", 116.860, -1.260),
    ("WH-MKS", "Makassar", "Sulawesi", 119.430, -5.140),
    ("WH-JYP", "Jayapura", "Papua Maluku", 140.700, -2.540),
]
# sku, description, category, unit cost (IDR), lead days
SKUS = [
    ("ANT-MB-4T4R", "Multi-band panel antenna 4T4R 65°", "RAN", 32_000_000, 18),
    ("ANT-MB-8T8R", "Multi-band panel antenna 8T8R", "RAN", 46_000_000, 35),
    ("AAU-64T-N21", "5G AAU 64T64R n1/n78 class", "RAN", 310_000_000, 56),
    ("RRU-4T-L18", "RRU 4T4R L1800", "RAN", 88_000_000, 42),
    ("RRU-4T-L21", "RRU 4T4R L2100", "RAN", 84_000_000, 42),
    ("RRU-2T-L09", "RRU 2T2R L900", "RAN", 61_000_000, 42),
    ("BBU-CAP-BRD", "BBU baseband capacity board", "RAN", 46_000_000, 35),
    ("BBU-MAIN", "BBU main control unit", "RAN", 92_000_000, 49),
    ("SC-OUT-4G", "Outdoor small cell 4G 2x20W", "RAN", 118_000_000, 42),
    ("IBS-RHUB", "Indoor pico RHUB + 8 pRRU", "RAN", 142_000_000, 42),
    ("MNT-KIT", "Antenna mount and bracket kit", "Civil", 6_500_000, 10),
    ("CPRI-KIT", "Fibre CPRI jumper kit", "Transport", 4_200_000, 10),
    ("DC-CBL-KIT", "DC power cable kit", "Power", 3_800_000, 10),
    ("BAT-LI-100", "Li-ion battery 48V 100Ah", "Power", 38_000_000, 28),
    ("BAT-LI-200", "Li-ion battery 48V 200Ah", "Power", 64_000_000, 35),
    ("RECT-MOD-3K", "Rectifier module 3 kW", "Power", 9_800_000, 21),
    ("RECT-SHELF", "Rectifier shelf + controller", "Power", 42_000_000, 28),
    ("GEN-15KVA", "Diesel genset 15 kVA", "Power", 118_000_000, 42),
    ("SOL-PNL-5K", "Solar array 5 kWp + MPPT", "Power", 96_000_000, 42),
    ("ATS-PNL", "Automatic transfer switch panel", "Power", 14_500_000, 21),
    ("MW-ODU-E", "MW ODU E-band 10 Gbps", "Transport", 92_000_000, 42),
    ("MW-ODU-18", "MW ODU 18 GHz 1+1", "Transport", 54_000_000, 35),
    ("MW-IDU-MOD", "MW IDU modem card XPIC", "Transport", 36_000_000, 35),
    ("MW-DISH-1.2", "MW antenna dish 1.2 m", "Transport", 18_000_000, 28),
    ("FO-CBL-48C", "Fibre optic cable 48 core (per km)", "Transport", 21_000_000, 21),
    ("FO-ODF", "ODF 48 port + splice", "Transport", 7_600_000, 14),
    ("SFP-25G", "SFP28 25G module", "Transport", 3_400_000, 14),
    ("CSR-ROUTER", "Cell-site router 10G", "Transport", 58_000_000, 42),
    ("VSAT-HTS", "VSAT HTS terminal", "Transport", 88_000_000, 56),
    ("CAB-OUT", "Outdoor cabinet", "Civil", 28_000_000, 21),
    ("CAB-RAISE", "Cabinet raise platform (flood)", "Civil", 36_000_000, 21),
    ("GRD-KIT", "Grounding and lightning kit", "Civil", 8_400_000, 14),
    ("SVC-INSTALL", "Installation and commissioning", "Service", 38_000_000, 0),
    ("SVC-TOWERCO", "Tower company loading and access fee", "Service", 27_500_000, 0),
    ("SVC-DT-OPT", "Drive test and optimisation", "Service", 12_000_000, 0),
    ("SVC-LOGISTIC", "Transport and logistics", "Service", 8_000_000, 0),
    ("SVC-CIVIL", "Civil works (foundation, fence)", "Service", 145_000_000, 0),
    ("SVC-PERMIT", "Permit and landlord (IMB/PBG)", "Service", 42_000_000, 0),
    ("SVC-FIBRE-LAY", "Fibre laying and ducting (per km)", "Service", 185_000_000, 0),
    ("TWR-NEW-42", "New tower 42 m (built by tower company)", "Civil", 520_000_000, 0),
]
SKU = {s[0]: s for s in SKUS}

BOQ_TEMPLATES = {
    "sector_add": [("ANT-MB-4T4R", 1), ("RRU-4T-L18", 1), ("RRU-4T-L21", 1), ("BBU-CAP-BRD", 1),
                   ("MNT-KIT", 1), ("CPRI-KIT", 1), ("DC-CBL-KIT", 1), ("SVC-INSTALL", 1),
                   ("SVC-TOWERCO", 1), ("SVC-DT-OPT", 1), ("SVC-LOGISTIC", 1)],
    "carrier_add": [("RRU-2T-L09", 0), ("BBU-CAP-BRD", 0), ("SVC-DT-OPT", 1), ("SVC-LOGISTIC", 1),
                    ("CPRI-KIT", 1), ("SFP-25G", 2)],
    "5g_add": [("AAU-64T-N21", 1), ("BBU-MAIN", 0), ("CPRI-KIT", 1), ("SFP-25G", 2), ("SVC-INSTALL", 1),
               ("SVC-TOWERCO", 1), ("SVC-DT-OPT", 1), ("DC-CBL-KIT", 1)],
    "power": [("BAT-LI-200", 1), ("RECT-MOD-3K", 2), ("ATS-PNL", 1), ("DC-CBL-KIT", 1), ("SVC-INSTALL", 1),
              ("SVC-LOGISTIC", 1)],
    "solar": [("SOL-PNL-5K", 1), ("BAT-LI-200", 1), ("RECT-MOD-3K", 2), ("SVC-INSTALL", 1), ("SVC-LOGISTIC", 1)],
    "transport": [("MW-ODU-E", 1), ("MW-IDU-MOD", 1), ("MW-DISH-1.2", 1), ("CSR-ROUTER", 1), ("SVC-INSTALL", 1),
                  ("SVC-TOWERCO", 1), ("SVC-LOGISTIC", 1)],
    "fibre": [("FO-CBL-48C", 6), ("FO-ODF", 2), ("SFP-25G", 4), ("SVC-FIBRE-LAY", 6), ("SVC-PERMIT", 1)],
    "satellite": [("VSAT-HTS", 1), ("CSR-ROUTER", 1), ("SVC-INSTALL", 1), ("SVC-LOGISTIC", 2)],
    "new_site": [("TWR-NEW-42", 1), ("SVC-CIVIL", 1), ("SVC-PERMIT", 1), ("BBU-MAIN", 1), ("RRU-4T-L18", 3),
                 ("ANT-MB-4T4R", 3), ("CAB-OUT", 1), ("BAT-LI-100", 2), ("RECT-SHELF", 1), ("MW-ODU-18", 1),
                 ("SVC-INSTALL", 1), ("GRD-KIT", 1)],
    "small_cell": [("SC-OUT-4G", 1), ("CPRI-KIT", 1), ("SFP-25G", 1), ("SVC-INSTALL", 1), ("SVC-PERMIT", 0)],
    "ran_swap": [("BBU-MAIN", 1), ("RRU-4T-L18", 3), ("SVC-INSTALL", 1), ("SVC-DT-OPT", 1), ("SVC-LOGISTIC", 1)],
    "flood": [("CAB-RAISE", 1), ("GRD-KIT", 1), ("ATS-PNL", 1), ("SVC-CIVIL", 0), ("SVC-INSTALL", 1)],
    "refarm": [("SVC-DT-OPT", 1)],
}

# id, name, type, boq template, region, district selector (prov, [district names]) or None,
# stage, health, n_sites, managed_by, vendor, target_rfs, forecast delay (days), extra
D = lambda p, *names: (p, list(names))
PROGRAM_SPECS = [
    ("PRG-2601", "Surabaya 5G Densification — Phase 1", "5G capacity", "5g_add", "Java", D("JTM", "Kota Surabaya"), "Validation", "on_track", 24, "legacy", "V02", "2026-06-22", 0, {"gb": True}),
    ("PRG-2602", "Jabodetabek Capacity Relief — Wave 1", "Capacity", "sector_add", "Jabodetabek", D("JKT", "Kota Jakarta Barat", "Kota Jakarta Timur", "Kota Jakarta Utara"), "Validation", "on_track", 38, "legacy", "V01", "2026-07-13", 0, {"gb": True}),
    ("PRG-2603", "Medan Metro Sector Add", "Capacity", "sector_add", "Sumatra", D("SMU", "Kota Medan", "Deli Serdang"), "Validation", "late", 22, "legacy", "V03", "2026-07-27", 24, {"gb": True}),
    ("PRG-2604", "Bali Peak-Season Capacity", "Capacity", "sector_add", "Bali Nusra", D("BAL", "Badung", "Kota Denpasar", "Gianyar"), "Validation", "on_track", 26, "legacy", "V02", "2026-06-29", 0, {"gb": True}),
    ("PRG-2605", "Sumatra Battery Retrofit — Wave 1", "Power resilience", "power", "Sumatra", D("SMS", "Ogan Komering Ilir", "Musi Banyuasin", "Banyuasin", "Muara Enim"), "Validation", "at_risk", 30, "legacy", "V03", "2026-07-06", 14, {}),
    ("PRG-2606", "Kalimantan Microwave Capacity Upgrade", "Transport", "transport", "Kalimantan", D("KSL", "Banjar", "Tanah Laut", "Barito Kuala", "Tapin"), "Validation", "late", 20, "legacy", "V04", "2026-07-20", 35, {"gb": True}),
    ("PRG-2607", "Bandung Raya Carrier Add — Wave 1", "Capacity", "carrier_add", "Java", D("JBR", "Bandung", "Kota Cimahi", "Bandung Barat"), "Validation", "on_track", 24, "legacy", "V01", "2026-06-15", 0, {"gb": True}),
    ("PRG-2608", "Makassar 4G Refarming", "Refarming", "refarm", "Sulawesi", D("SLS", "Gowa", "Takalar"), "RFS", "at_risk", 16, "nicc", "V05", "2026-08-24", 7, {"gb": True}),
    ("PRG-2609", "Surabaya 5G Densification — Phase 2", "5G capacity", "5g_add", "Java", None, "Installation", "late", 12, "legacy", "V02", "2026-10-19", 21, {"gb": True, "story": "surabaya_cnx"}),
    ("PRG-2610", "Jakarta CBD Capacity — Wave 2", "Capacity", "sector_add", "Jabodetabek", D("JKT", "Kota Jakarta Selatan", "Kota Jakarta Pusat"), "Material dispatch", "at_risk", 18, "legacy", "V01", "2026-11-02", 7, {"gb": True}),
    ("PRG-2611", "Jawa Tengah Power Resilience", "Power resilience", "power", "Java", None, "Material dispatch", "on_track", 14, "nicc", "V02", "2026-10-26", 0, {"story": "cjava_power"}),
    ("PRG-2612", "Medan Capacity — Wave 2", "Capacity", "sector_add", "Sumatra", D("SMU", "Kota Medan", "Kota Binjai"), "Vendor allocation", "at_risk", 10, "legacy", "V03", "2026-11-02", 7, {"gb": True, "vendor_sla_risk": True}),
    ("PRG-2613", "Denpasar–Badung Capacity", "Capacity", "sector_add", "Bali Nusra", D("BAL", "Kota Denpasar", "Badung"), "PO", "on_track", 8, "nicc", "V02", "2026-11-02", 0, {"gb": True}),
    ("PRG-2614", "IKN Corridor Coverage", "New site", "new_site", "Kalimantan", D("KTM", "Penajam Paser Utara", "Kutai Kartanegara", "Kota Balikpapan"), "Installation", "at_risk", 9, "legacy", "V04", "2026-11-23", 14, {"towerco_wait": True}),
    ("PRG-2615", "Sumatra Transport Microwave-to-Fibre", "Transport", "fibre", "Sumatra", D("RIA", "Kampar", "Pelalawan", "Siak", "Kota Pekanbaru"), "Integration", "at_risk", 14, "legacy", "V03", "2026-10-19", 14, {"gb": True, "vendor_sla_risk": True}),
    ("PRG-2616", "Papua Satellite Backhaul Upgrade", "Transport", "satellite", "Papua Maluku", D("PPG", "Jayawijaya", "Yahukimo", "Lanny Jaya", "Tolikara"), "Installation", "late", 7, "legacy", "V06", "2026-09-21", 28, {}),
    ("PRG-2617", "Palembang Sector Add", "Capacity", "sector_add", "Sumatra", D("SMS", "Kota Palembang"), "BOQ", "on_track", 6, "nicc", "V03", "2026-11-09", 0, {"gb": True}),
    ("PRG-2618", "Semarang–Solo Carrier Add", "Capacity", "carrier_add", "Java", D("JTG", "Kota Semarang", "Kota Surakarta"), "Integration", "on_track", 9, "nicc", "V02", "2026-10-12", 0, {"gb": True}),
    ("PRG-2619", "NTT Solar Hybrid Retrofit", "Energy", "solar", "Bali Nusra", D("NTT", "Kupang", "Timor Tengah Selatan", "Belu", "Sumba Timur"), "Installation", "at_risk", 12, "legacy", "V06", "2026-10-26", 14, {"vendor_sla_risk": True}),
    ("PRG-2620", "Makassar Small Cell Densification", "Capacity", "small_cell", "Sulawesi", D("SLS", "Kota Makassar"), "PO", "at_risk", 10, "nicc", "V05", "2026-11-02", 7, {"gb": True, "towerco_wait": True}),
    ("PRG-2621", "Sulawesi Selatan Fibre Ring (Makassar–Parepare)", "Transport", "fibre", "Sulawesi", None, "Decision", "at_risk", 9, "nicc", "V05", "2027-02-15", 0, {"gb": True, "story": "sulsel_transport", "budget": 18_500_000_000, "capex_class": "capex_major"}),
    ("PRG-2622", "Nusantara Capital (IKN) New Sites", "New site", "new_site", "Kalimantan", D("KTM", "Penajam Paser Utara", "Kutai Kartanegara"), "Decision", "on_track", 8, "nicc", "V04", "2027-01-25", 0, {"budget": 9_600_000_000, "capex_class": "capex_major"}),
    ("PRG-2623", "Jabodetabek 5G Densification — Wave 3", "5G capacity", "5g_add", "Jabodetabek", D("JKT", "Kota Jakarta Selatan", "Kota Jakarta Barat"), "Decision", "on_track", 20, "nicc", "V01", "2026-12-14", 0, {"gb": True, "capex_class": "capex_minor"}),
    ("PRG-2624", "Riau Flood Hardening", "Environmental", "flood", "Sumatra", D("RIA", "Indragiri Hilir", "Rokan Hilir", "Bengkalis"), "BOQ", "at_risk", 8, "nicc", "V03", "2026-12-07", 7, {}),
    ("PRG-2625", "2G Sunset Refarming — Wave 2", "Refarming", "refarm", "Java", D("JTG", "Cilacap", "Banyumas", "Kebumen", "Purworejo", "Magelang"), "RFS", "late", 40, "legacy", "V02", "2026-08-31", 28, {"gb": True}),
    ("PRG-2626", "Java RAN Modernisation Swap", "RAN modernisation", "ran_swap", "Java", D("JTM", "Jember", "Banyuwangi", "Lumajang", "Probolinggo"), "Validation", "late", 30, "legacy", "V02", "2026-02-23", 30, {"complete": True}),
    ("PRG-2627", "Sumatra Battery Retrofit — Wave 2", "Power resilience", "power", "Sumatra", D("JMB", "Muaro Jambi", "Batang Hari", "Tebo", "Bungo"), "BOQ", "late", 20, "legacy", "V03", "2026-12-21", 28, {"boq_variance": True}),
    ("PRG-2628", "Sulawesi Utara Coverage Infill", "New site", "new_site", "Sulawesi", D("SLU", "Minahasa Utara", "Bolaang Mongondow", "Minahasa Selatan"), "RFS", "late", 6, "legacy", "V05", "2026-08-17", 42, {}),
    ("PRG-2629", "Maluku Transport Resilience", "Transport", "transport", "Papua Maluku", D("MAL", "Maluku Tengah", "Seram Bagian Barat", "Kota Ambon"), "Decision", "at_risk", 5, "nicc", "V06", "2027-01-11", 0, {"capex_class": "capex_minor"}),
    ("PRG-2630", "Bandung Raya Capacity — Wave 2", "Capacity", "sector_add", "Java", D("JBR", "Kota Bandung"), "Material dispatch", "at_risk", 10, "legacy", "V01", "2026-11-16", 7, {"gb": True}),
]
assert len(PROGRAM_SPECS) == 30
PER_SITE_COST = {"sector_add": 350e6, "carrier_add": 40e6, "5g_add": 380e6, "power": 185e6, "solar": 210e6,
                 "transport": 180e6, "fibre": 420e6, "satellite": 260e6, "new_site": 1.2e9,
                 "small_cell": 160e6, "ran_swap": 420e6, "flood": 160e6, "refarm": 12e6}

site_program = {}                      # site index -> program id (one program per site)
cap_cov = CFG["capacity_coverage"]


def pool(sel, cond=lambda s: True):
    prov, names = sel
    ids = [dist_id(prov, n) for n in names]
    out = [i for i, s in enumerate(sites) if s["district_id"] in ids and i not in site_program
           and not s["story"] and i not in used and cond(s) and s["site_class"] in ("macro", "small_cell")]
    rng.shuffle(out)
    return out


programs = []
for (pid, name, ptype, tmpl, region, sel, stage, health, n, managed, vendor, target, delay, extra) in PROGRAM_SPECS:
    if extra.get("story") == "surabaya_cnx":
        members = list(story_idx["surabaya_cnx"])
    elif extra.get("story") == "cjava_power":
        members = list(story_idx["cjava_power"])
        extra_sites = [i for i, s in enumerate(sites) if s["province_id"] == "JTG" and s["power_type"] != "grid"
                       and i not in site_program and i not in used and not s["story"]
                       and s["district_id"] in {dist_id("JTG", x) for x in ("Grobogan", "Demak", "Semarang", "Kendal")}]
        members += extra_sites[: n - len(members)]
    elif extra.get("story") == "sulsel_transport":
        members = list(story_idx["sulsel_transport"])
    else:
        members = []
        ncap = cap_cov.get(pid, 0)
        cand = pool(sel)
        if ptype == "5G capacity" and pid == "PRG-2601":
            cand = pool(sel)
        members = cand[:n]
        if len(members) < n:  # widen to the region if a district is thin
            more = [i for i, s in enumerate(sites) if s["region"] == region and i not in site_program
                    and i not in used and not s["story"] and i not in members]
            rng.shuffle(more)
            members += more[: n - len(members)]
        # Capacity reds covered by this program.
        target_d = dt.date.fromisoformat(target) + days(delay)
        rfs_week = (target_d - TODAY).days / 7
        for j, i in enumerate(members[:ncap]):
            used.add(i)
            if pid in ("PRG-2610", "PRG-2630"):
                # gap flag: some sites predicted to breach before the program's RFS date
                cw = int(clamp(math.floor(rfs_week) - 1 - (j % 3), 3, 8))
            else:
                cw = int(clamp(math.ceil(rfs_week) + 1 + (j % 2), 1, 8))
            prb[i] = np.clip(prb[i] + np.linspace(0, 14, T), 5, 97)
            set_red(i, "capacity", cw, rng.uniform(0.72, 0.9))
    for i in members:
        site_program[i] = pid
    if pid == "PRG-2601":
        for i in members:
            if "5G" not in sites[i]["technologies"]:
                sites[i]["technologies"].append("5G")
            sites[i]["cluster"] = "SBY-5G-C01" if sites[i]["lon"] < 112.74 else "SBY-5G-C02"

    target_d = dt.date.fromisoformat(target)
    forecast_d = target_d + days(delay)
    per_site = PER_SITE_COST[tmpl]
    budget = extra.get("budget") or per_site * len(members) * rng.uniform(1.02, 1.08)
    # Stage history (legacy ~20 weeks, NICC ~4-6 weeks)
    if managed == "legacy":
        dur = {"Decision": 24, "BOQ": 17, "PO": 24, "Vendor allocation": 10, "Material dispatch": 14,
               "Installation": 30, "Integration": 12, "RFS": 10}
        overlap = False
    else:
        dur = {"Decision": 2, "BOQ": 1, "PO": 3, "Vendor allocation": 1, "Material dispatch": 4,
               "Installation": 15, "Integration": 4, "RFS": 2}
        overlap = True
    jitter = {k: max(1, int(round(v * rng.uniform(0.85, 1.2)))) for k, v in dur.items()}
    if managed == "legacy":
        total = sum(jitter.values())
    else:
        total = jitter["Decision"] + max(jitter["BOQ"], jitter["PO"], jitter["Vendor allocation"]) + \
                jitter["Material dispatch"] + jitter["Installation"] + jitter["Integration"] + jitter["RFS"]
    start_d = forecast_d - days(total) if stage in ("RFS", "Validation") else None
    # For in-flight programs, anchor on the current stage.
    si = STAGES.index(stage)
    history = []
    if start_d is None:
        # time already spent in the current stage
        spent_before = sum(jitter[s] for s in STAGES[:si] if s in jitter)
        if overlap and si > 1:
            spent_before = jitter["Decision"] + (max(jitter["BOQ"], jitter["PO"], jitter["Vendor allocation"]) if si >= 4 else 0) + \
                sum(jitter[s] for s in STAGES[4:si] if s in jitter)
        in_stage = int(rng.integers(1, max(2, jitter.get(stage, 3))))
        if stage == "Installation" and health == "late":
            in_stage = jitter["Installation"] + 21
        start_d = TODAY - days(spent_before + in_stage)
    cursor = start_d
    for s_name in STAGES:
        idx = STAGES.index(s_name)
        if s_name == "Validation":
            if si >= idx:
                history.append({"stage": s_name, "start": iso(forecast_d), "end": None})
            break
        dur_s = jitter[s_name]
        if overlap and s_name in ("PO", "Vendor allocation"):
            st_d = history[1]["start"] if len(history) > 1 else iso(cursor)
            st_date = dt.date.fromisoformat(st_d)
            en = st_date + days(dur_s)
        else:
            st_date = cursor
            en = cursor + days(dur_s)
        if idx < si:
            history.append({"stage": s_name, "start": iso(st_date), "end": iso(en)})
        elif idx == si:
            history.append({"stage": s_name, "start": iso(st_date), "end": None})
        else:
            break
        if not (overlap and s_name in ("BOQ", "PO")):
            cursor = max(cursor, en) if not overlap else (en if s_name not in ("Vendor allocation",) else
                                                          max(en, dt.date.fromisoformat(history[1]["end"] or iso(en)) if len(history) > 1 else en))
    if overlap and si >= 4:
        # parallel lanes BOQ / PO / vendor end together before dispatch
        pass

    if stage in ("RFS", "Validation"):
        sites_rfs = len(members) if stage == "Validation" else int(len(members) * rng.uniform(0.55, 0.8))
    elif stage == "Integration":
        sites_rfs = int(len(members) * rng.uniform(0.1, 0.3))
    else:
        sites_rfs = 0
    progress = (si + (0.5 if si < 8 else 1)) / 9
    spent = budget * clamp(progress * rng.uniform(0.85, 1.12), 0, 1.0 if health != "late" else 1.09)
    if stage == "Decision":
        spent = 0

    capex_class = extra.get("capex_class") or ("capex_major" if tmpl in ("new_site", "fibre") and budget > 2e9
                                                  else "noncapex_opex" if tmpl == "refarm" else "capex_minor")
    prog = {
        "program_id": pid, "name": name, "type": ptype, "intervention": tmpl, "region": region,
        "province_ids": sorted({sites[i]["province_id"] for i in members}),
        "budget_idr": int(round(budget, -6)), "spent_idr": int(round(spent, -6)),
        "stage": stage, "health": health, "sites_planned": len(members), "sites_rfs": sites_rfs,
        "site_ids": [sites[i]["site_id"] for i in members],
        "start": iso(start_d), "target_rfs": iso(target_d), "forecast_rfs": iso(forecast_d),
        "managed_by": managed, "vendor_id": vendor, "capex_class": capex_class,
        "gb_factory": bool(extra.get("gb")), "owner_role": "DEPLOY" if si >= 1 else "PLAN",
        "stage_history": history, "blockers": [], "gap_flags": [], "documents": [],
        "tower_company_clock": None, "vendor_sla_risk": bool(extra.get("vendor_sla_risk")),
        "pending_approval": None, "complete": bool(extra.get("complete")),
        "as_of": iso(AS_OF), "freshness": "D-1",
    }
    programs.append(prog)

PROG = {p["program_id"]: p for p in programs}

# Blockers, approvals, tower company clocks, documents.
for p in programs:
    pid = p["program_id"]
    if p["vendor_sla_risk"]:
        v = next(x for x in VENDORS if x["vendor_id"] == p["vendor_id"])
        p["blockers"].append({"type": "vendor_sla", "text": f"{v['short']} installation crews at "
                              f"{int(rng.uniform(112, 131))}% of committed capacity; SLA clock breaches in "
                              f"{int(rng.uniform(4, 9))} days", "since": iso(TODAY - days(int(rng.integers(5, 15))))})
    if pid in ("PRG-2614", "PRG-2620"):
        tc = "Mitratel" if pid == "PRG-2614" else "Protelindo"
        req = TODAY - days(int(rng.integers(16, 24)))
        p["tower_company_clock"] = {"tower_company": tc, "requested": iso(req), "sla_days": 14,
                                    "due": iso(req + days(14)), "status": "overdue",
                                    "items": "Loading feasibility and site access" if pid == "PRG-2614" else
                                    "Street-furniture access and pole loading permits"}
        p["blockers"].append({"type": "tower_company", "text": f"Waiting on {tc}: {p['tower_company_clock']['items'].lower()} "
                              f"({(TODAY - req).days} days, SLA 14)", "since": iso(req)})
    elif p["intervention"] in ("sector_add", "5g_add", "transport", "new_site") and STAGES.index(p["stage"]) in range(1, 7):
        req = TODAY - days(int(rng.integers(3, 10)))
        p["tower_company_clock"] = {"tower_company": pick(["Mitratel", "Protelindo", "Tower Bersama"]),
                                    "requested": iso(req), "sla_days": 14, "due": iso(req + days(14)),
                                    "status": "approved" if STAGES.index(p["stage"]) >= 4 else "pending",
                                    "items": "Loading feasibility and site access"}
    if pid == "PRG-2609":
        p["blockers"].append({"type": "installation", "text": "AAU delivery slipped 3 weeks (vendor import clearance); "
                              "6 of 12 sites predicted to saturate before revised RFS", "since": iso(TODAY - days(24))})
    if pid == "PRG-2627":
        p["blockers"].append({"type": "boq_variance", "text": "BOQ variance +14% versus price book (battery unit cost); "
                              "awaiting Deployment lead review", "since": iso(TODAY - days(19))})
    if pid == "PRG-2616":
        p["blockers"].append({"type": "logistics", "text": "VSAT terminals held at Wamena airstrip; air freight slot "
                              "rebooked", "since": iso(TODAY - days(26))})
    if pid == "PRG-2624":
        p["blockers"].append({"type": "permit", "text": "Two sites need landlord consent for cabinet raise",
                              "since": iso(TODAY - days(9))})
    if p["stage"] == "Decision":
        if p["capex_class"] == "capex_major":
            p["pending_approval"] = {"role": "EXEC", "cosign": "CFO" if p["budget_idr"] > POLICY["cfo_cosign_above_idr"] else None,
                                     "since": iso(TODAY - days(int(rng.integers(3, 9)))), "gate": "Decision"}
        else:
            p["pending_approval"] = {"role": "PLAN", "cosign": None,
                                     "since": iso(TODAY - days(int(rng.integers(2, 14)))), "gate": "Decision"}
    p["documents"] = [
        {"name": f"{pid} business case v{int(rng.integers(2, 5))}.pdf", "type": "business_case"},
        {"name": f"{pid} BOQ export.xlsx", "type": "boq"},
    ] + ([{"name": f"{pid} RFS acceptance pack.pdf", "type": "rfs"}] if STAGES.index(p["stage"]) >= 7 else [])

# PO-release approvals pending for PROC (two).
PROG["PRG-2613"]["pending_approval"] = {"role": "PROC", "cosign": None, "since": iso(TODAY - days(2)), "gate": "PO"}
PROG["PRG-2620"]["pending_approval"] = {"role": "PROC", "cosign": None, "since": iso(TODAY - days(3)), "gate": "PO"}
PROG["PRG-2627"]["pending_approval"] = {"role": "DEPLOY", "cosign": None, "since": iso(TODAY - days(19)), "gate": "BOQ variance"}

# Gap flags: executing programs with sites predicted to fail before the forecast RFS.
for p in programs:
    if p["stage"] in ("Decision", "Validation") or p["complete"]:
        continue
    frfs = dt.date.fromisoformat(p["forecast_rfs"])
    bad_sites = []
    for sid in p["site_ids"]:
        i = IDX[sid]
        if fc_cross[i] and week_date(fc_cross[i]) < frfs:
            bad_sites.append(sid)
    if bad_sites:
        p["gap_flags"].append({"type": "predicted_failure_before_rfs", "site_ids": bad_sites,
                               "text": f"{len(bad_sites)} site(s) predicted to breach before forecast RFS {p['forecast_rfs']}",
                               "suggested_action": "Pull forward: interim refarming on affected sites and expedite dispatch"})

# ----------------------------------------------------------------------------------------
# 6. Revenue and customer cohorts
# ----------------------------------------------------------------------------------------
ARPU = {"consumer_4g": 38_000, "consumer_5g": 74_000, "postpaid": 168_000, "enterprise": 315_000}
COMPLAINTS = ["Slow data at peak hours", "Video buffering", "Call drops", "No signal indoors",
              "Gaming latency", "SMS OTP delay", "5G icon but slow speed", "Intermittent data at night"]
cohorts = []
site_revenue = np.zeros(N)
site_postpaid_share = np.zeros(N)
site_enterprise = np.zeros(N, int)
site_churn_subs = np.zeros(N)
site_complaints = [None] * N
for i, s in enumerate(sites):
    subs = s["subscribers"]
    metro = DISTS[s["district_id"]]["metro"]
    post = clamp(rng.normal(0.17 if metro else (0.1 if s["urban"] else 0.05), 0.03), 0.02, 0.32)
    if s["story"] == "surabaya_cnx":
        post = rng.uniform(0.22, 0.26)
    ent_accts = int(rng.poisson(40 if s["story"] == "bekasi_capacity" else (9 if metro else 2)))
    ent_lines = ent_accts * int(rng.integers(8, 30))
    has5g = "5G" in s["technologies"]
    c5 = rng.uniform(0.12, 0.24) if has5g else 0.0
    segs = {"consumer_4g": max(0.0, 1 - post - c5), "postpaid": post}
    if has5g:
        segs["consumer_5g"] = c5
    cnx_now = float(cnx[i, -1])
    cnx_28 = float(cnx[i, -29])
    base_churn = clamp(0.035 + np.clip(72 - cnx_now, 0, None) * 0.006 + rng.normal(0, 0.01), 0.01, 0.2)
    rev = 0.0
    tops = rng.permutation(len(COMPLAINTS))
    for k, (seg, share) in enumerate(list(segs.items()) + ([("enterprise", 0)] if ent_accts else [])):
        n_subs = ent_lines if seg == "enterprise" else int(subs * share)
        if n_subs <= 0:
            continue
        off = {"consumer_4g": 0, "consumer_5g": 2.5, "postpaid": -0.8, "enterprise": 1.5}[seg]
        c_now = cnx_now + off + rng.normal(0, 0.8)
        c_delta = (cnx_now - cnx_28) + rng.normal(0, 0.4)
        churn = base_churn * (0.6 if seg == "enterprise" else 1.0)
        cohorts.append({
            "cohort_id": f"{s['site_id']}-{seg}", "site_id": s["site_id"], "segment": seg,
            "subs": n_subs, "arpu": int(ARPU[seg] * rng.uniform(0.85, 1.15) * (1.2 if metro else 1.0)),
            "churn_risk": r2(churn, 3), "churn_risk_subs": int(n_subs * churn),
            "cnx": r2(c_now, 1), "cnx_delta_28d": r2(c_delta, 1),
            "top_complaint": COMPLAINTS[int(tops[k % len(COMPLAINTS)])],
        })
        rev += n_subs * cohorts[-1]["arpu"]
    site_revenue[i] = rev * 1.12  # + digital/VAS
    site_postpaid_share[i] = post
    site_enterprise[i] = ent_accts

# Surabaya story: postpaid cohorts on the 12 sites, CNX -4.0 (subs weighted), 6,200 churn-risk subs.
sc = STORIES["surabaya_cnx"]
sby_post = [c for c in cohorts if c["segment"] == "postpaid" and sites[IDX[c["site_id"]]]["story"] == "surabaya_cnx"]
wsub = np.array([c["subs"] for c in sby_post], float)
deltas = rng.uniform(-4.8, -3.2, len(sby_post))
deltas += (-sc["cnx_drop_pts"] - (deltas * wsub).sum() / wsub.sum())
target_churn = sc["churn_risk_subs"]
shares = rng.dirichlet(np.ones(len(sby_post)) * 6) * target_churn
alloc_c = np.floor(shares).astype(int)
alloc_c[0] += target_churn - alloc_c.sum()
for c, dlt, ch in zip(sby_post, deltas, alloc_c):
    c["cnx_delta_28d"] = r2(dlt, 2)
    c["churn_risk_subs"] = int(ch)
    c["churn_risk"] = r2(ch / c["subs"], 3)
    c["cnx"] = r2(float(cnx[IDX[c["site_id"]], -1]) - 1.2, 1)
    c["top_complaint"] = "5G icon but slow speed"

for c in cohorts:
    site_churn_subs[IDX[c["site_id"]]] += c["churn_risk_subs"]

# Monthly revenue (6 months), trending with traffic.
rev_monthly = np.zeros((N, len(MONTHS)))
for m in range(len(MONTHS)):
    rev_monthly[:, m] = site_revenue * (1 - 0.012 * (len(MONTHS) - 1 - m)) * rng.normal(1, 0.025, N)
rev_monthly = np.round(rev_monthly, -4)

# ----------------------------------------------------------------------------------------
# 7. Backbone links and CDN peers
# ----------------------------------------------------------------------------------------
links = []
link_n = 1
hubs_by_prov = defaultdict(list)
for pid_, p in PROVS.items():
    cands = sorted([i for i, s in enumerate(sites) if s["province_id"] == pid_ and s["site_class"] == "macro"],
                   key=lambda i: -site_revenue[i])
    k = 4 if p["population_m"] > 20 else (3 if p["population_m"] > 5 else 2)
    chosen = []
    for i in cands:
        if all(math.dist((sites[i]["lon"], sites[i]["lat"]), (sites[j]["lon"], sites[j]["lat"])) > 0.35 for j in chosen):
            chosen.append(i)
        if len(chosen) >= k:
            break
    hubs_by_prov[pid_] = chosen
hub_set = {i for v in hubs_by_prov.values() for i in v}
sulsel_hub_i = IDX[sulsel_hub["site_id"]]
hub_set.add(sulsel_hub_i)
hubs_by_prov["SLS"] = [sulsel_hub_i] + [h for h in hubs_by_prov["SLS"] if h != sulsel_hub_i][:2]


def add_link(a, b, typ, cap, util=None, fault="ok", name=None, lid=None):
    global link_n
    util = util if util is not None else clamp(rng.beta(3, 3.2) * 100, 12, 92)
    L = {"link_id": lid or f"BB-{sites[a]['province_id']}-{link_n:04d}", "name": name or f"{sites[a]['name']} – {sites[b]['name']}",
         "from_site": sites[a]["site_id"], "to_site": sites[b]["site_id"], "type": typ,
         "capacity_gbps": cap, "util_pct": r2(util, 1), "fault_state": fault, "dependent_sites": 0,
         "protected": typ != "microwave" or rng.random() < 0.3, "as_of": iso(AS_OF), "freshness": "D-1"}
    link_n += 1
    links.append(L)
    return L


# Story trunk first so it takes a well-known id.
st_link = STORIES["sulsel_transport"]["link"]
chain = story_idx["sulsel_transport"]
L0 = add_link(sulsel_hub_i, chain[0], "microwave", st_link["capacity_gbps"], float(st_link["util_pct"]), "degraded",
              st_link["name"], st_link["id"])
L0["protected"] = False
L0["dependent_sites"] = len(chain)
for a, b in zip(chain[:-1], chain[1:]):
    add_link(a, b, "microwave", 4 if b != chain[-1] else 2, rng.uniform(62, 78), "ok")

# Intra-province fibre between hubs, inter-province backbone.
ISLAND_CHAIN = [["ACH", "SMU", "RIA", "SMB", "JMB", "BKL", "SMS", "LPG"], ["KPR", "RIA"], ["BBL", "SMS"],
                ["LPG", "BTN", "JKT", "JBR", "JTG", "DIY", "JTM", "BAL", "NTB", "NTT"],
                ["KBR", "KTG", "KSL", "KTM", "KTU"], ["JTM", "KSL"], ["KTM", "SLT"],
                ["SLS", "SLB", "SLT", "GTO", "SLU"], ["SLS", "SLG"], ["SLU", "MLU", "MAL"],
                ["MAL", "PBD", "PPB", "PPT", "PPA", "PPG", "PPS"], ["JBR", "JKT"], ["JTG", "JTM"]]
for pid_, hs in hubs_by_prov.items():
    for a, b in zip(hs[:-1], hs[1:]):
        add_link(a, b, "fibre", pick([40, 100, 100, 200]))
for chain_ in ISLAND_CHAIN:
    for pa, pb in zip(chain_[:-1], chain_[1:]):
        a, b = hubs_by_prov[pa][0], hubs_by_prov[pb][0]
        sea = PROVS[pa]["region"] != PROVS[pb]["region"] or pa in ("KPR", "BBL", "BAL", "NTB", "NTT", "MLU", "MAL")
        add_link(a, b, "submarine" if sea else "fibre", pick([100, 200, 400]))

# Access links: nearest hub (or nearest already-linked site) for a spread of sites.
hub_coords = {h: (sites[h]["lon"], sites[h]["lat"]) for h in hub_set}
access_pool = [i for i in range(N) if i not in hub_set and i not in story_idx["sulsel_transport"]]
rng.shuffle(access_pool)
target_links = 800 - len(links)
linked_by_prov = defaultdict(list)
for i in access_pool:
    if target_links <= 0:
        break
    s = sites[i]
    if s["backhaul"] == "fibre" and rng.random() < 0.55:
        continue
    cands = hubs_by_prov[s["province_id"]] + linked_by_prov[s["province_id"]][-25:]
    j = min(cands, key=lambda h: math.dist((sites[h]["lon"], sites[h]["lat"]), (s["lon"], s["lat"])))
    typ = "satellite" if s["backhaul"] == "satellite" else ("microwave" if s["backhaul"] == "microwave" else "fibre")
    util = None
    fault = "ok"
    if fc_class[i] == "transport" and fc_cross[i]:
        util = rng.uniform(86, 95)
        fault = "degraded"
    elif rng.random() < 0.02:
        fault = pick(["degraded", "down"], [0.7, 0.3])
    add_link(j, i, typ, 1 if typ == "satellite" else pick([2, 4, 10]), util, fault)
    linked_by_prov[s["province_id"]].append(i)
    target_links -= 1

# dependent sites: count descendants on access trees
children = defaultdict(list)
for L in links:
    children[L["from_site"]].append(L["to_site"])


def descendants(sid, seen=None):
    seen = seen or set()
    for c in children.get(sid, []):
        if c not in seen and IDX[c] not in hub_set:
            seen.add(c)
            descendants(c, seen)
    return seen


for L in links:
    if L["link_id"] == st_link["id"]:
        continue
    if L["type"] in ("fibre", "submarine") and IDX[L["to_site"]] in hub_set:
        L["dependent_sites"] = int(rng.integers(40, 260))
    else:
        L["dependent_sites"] = 1 + len(descendants(L["to_site"]))

CDN = [
    ("CDN-JKT-01", "Jakarta", "Google Global Cache", 106.822, -6.200, 96.2, 410),
    ("CDN-JKT-02", "Jakarta", "Meta FNA", 106.830, -6.215, 94.8, 265),
    ("CDN-JKT-03", "Jakarta", "Akamai", 106.805, -6.190, 91.5, 150),
    ("CDN-JKT-04", "Jakarta", "Netflix Open Connect", 106.845, -6.228, 97.1, 185),
    ("CDN-SBY-01", "Surabaya", "Google Global Cache", 112.740, -7.260, 95.4, 138),
    ("CDN-MDN-01", "Medan", "Google Global Cache", 98.670, 3.595, 93.9, 72),
    ("CDN-BTM-01", "Batam", "Singapore IX transit", 104.030, 1.120, 78.4, 118),
    ("CDN-BDG-01", "Bandung", "Meta FNA", 107.610, -6.915, 93.2, 64),
    ("CDN-SMG-01", "Semarang", "TikTok / ByteDance", 110.420, -6.990, 89.1, 58),
    ("CDN-MKS-01", "Makassar", "Google Global Cache", 119.420, -5.150, 92.7, 41),
    ("CDN-DPS-01", "Denpasar", "Akamai", 115.220, -8.660, 90.6, 37),
    ("CDN-BPN-01", "Balikpapan", "Cloudflare", 116.850, -1.250, 88.3, 22),
]
cdn_peers = []
for pop, city, partner, lon, lat, hit, egress in CDN:
    degraded = pop in ("CDN-BTM-01", "CDN-SMG-01")
    cdn_peers.append({
        "pop_id": pop, "city": city, "partner": partner, "lon": lon, "lat": lat,
        "cache_hit_pct": hit, "cache_hit_delta_7d": r2(-6.8 if pop == "CDN-BTM-01" else (-2.4 if pop == "CDN-SMG-01" else rng.normal(0.2, 0.6)), 1),
        "egress_gbps": egress, "latency_ms": int(rng.uniform(4, 9) if city == "Jakarta" else rng.uniform(8, 24)),
        "egress_cost_idr_month": int(round(egress * (1_450_000 if "transit" in partner else 180_000) * (1.6 if degraded else 1.0), -5)),
        "status": "degraded" if degraded else "healthy", "as_of": iso(AS_OF), "freshness": "D-1",
    })

# ----------------------------------------------------------------------------------------
# 8. Warehouses and stock
# ----------------------------------------------------------------------------------------
warehouse_stock = []
for wid, wname, wreg, lon, lat in WAREHOUSES:
    for sku, desc, cat, cost, lead in SKUS:
        if cat == "Service":
            continue
        base = {"RAN": 14, "Power": 22, "Transport": 16, "Civil": 18}[cat]
        size = {"WH-CKR": 1.6, "WH-SBY": 1.3, "WH-SMG": 1.0, "WH-MDN": 1.0, "WH-PLB": 0.7, "WH-BPN": 0.6,
                "WH-MKS": 0.8, "WH-JYP": 0.35}[wid]
        on_hand = int(rng.poisson(base * size))
        reserved = int(min(on_hand, rng.poisson(on_hand * 0.35)))
        rop = max(2, int(base * size * 0.35))
        warehouse_stock.append({"warehouse_id": wid, "warehouse": wname, "sku": sku, "description": desc,
                                "category": cat, "on_hand": on_hand, "reserved": reserved, "reorder_point": rop,
                                "lead_days": lead, "unit_cost_idr": cost, "as_of": iso(AS_OF), "freshness": "D-1"})
WS = {(w["warehouse_id"], w["sku"]): w for w in warehouse_stock}
# Story: Bekasi sector add needs 14 multi-band antennas; Cikarang has none free, Semarang has 9.
WS[("WH-CKR", "ANT-MB-4T4R")].update(on_hand=6, reserved=6)
WS[("WH-SMG", "ANT-MB-4T4R")].update(on_hand=12, reserved=3)
WS[("WH-SBY", "ANT-MB-4T4R")].update(on_hand=4, reserved=4)
for wid in ("WH-MDN", "WH-PLB", "WH-BPN", "WH-MKS", "WH-JYP"):
    WS[(wid, "ANT-MB-4T4R")].update(on_hand=min(WS[(wid, "ANT-MB-4T4R")]["on_hand"], 2),
                                     reserved=min(WS[(wid, "ANT-MB-4T4R")]["on_hand"], 2))
for sku, need in (("RRU-4T-L18", 14), ("RRU-4T-L21", 14), ("BBU-CAP-BRD", 14), ("MNT-KIT", 14),
                  ("CPRI-KIT", 14), ("DC-CBL-KIT", 14)):
    WS[("WH-CKR", sku)].update(on_hand=need + int(rng.integers(3, 12)), reserved=int(rng.integers(0, 3)))
# Central Java power: stock pre-positioned (reserved) in Semarang.
WS[("WH-SMG", "BAT-LI-200")].update(on_hand=16, reserved=14)
WS[("WH-SMG", "RECT-MOD-3K")].update(on_hand=30, reserved=28)
WS[("WH-SMG", "ATS-PNL")].update(on_hand=15, reserved=14)
# Exactly three SKUs below reorder point in Semarang (available = on_hand - reserved).
for w in warehouse_stock:
    if w["warehouse_id"] == "WH-SMG":
        avail_ = w["on_hand"] - w["reserved"]
        if avail_ < w["reorder_point"] and w["sku"] not in ("BAT-LI-200", "RECT-MOD-3K", "ATS-PNL"):
            w["on_hand"] = w["reserved"] + w["reorder_point"] + int(rng.integers(1, 6))
for sku in ("BAT-LI-200", "RECT-MOD-3K", "ATS-PNL"):
    w = WS[("WH-SMG", sku)]
    assert w["on_hand"] - w["reserved"] < w["reorder_point"]
w = WS[("WH-SMG", "ANT-MB-4T4R")]
w["reorder_point"] = 4

# ----------------------------------------------------------------------------------------
# 9. BOQ lines and purchase orders
# ----------------------------------------------------------------------------------------
boq_lines = []
purchase_orders = []
po_n = 4101
for p in programs:
    si = STAGES.index(p["stage"])
    if p["complete"] or p["stage"] == "Validation":
        continue
    tmpl = BOQ_TEMPLATES[p["intervention"]]
    for sid in p["site_ids"]:
        for sku, qty in tmpl:
            if qty == 0:
                qty = 1 if rng.random() < 0.5 else 0
            if qty == 0:
                continue
            desc, cost = SKU[sku][1], SKU[sku][3]
            price = cost * (1.14 if p["program_id"] == "PRG-2627" and sku.startswith("BAT") else rng.uniform(0.97, 1.04))
            boq_lines.append({"program_id": p["program_id"], "site_id": sid, "sku": sku, "description": desc,
                              "qty": qty, "unit_cost_idr": int(round(price, -3)), "price_book_idr": cost,
                              "vendor": p["vendor_id"]})
    if si >= 2 or p["program_id"] in ("PRG-2613", "PRG-2620"):
        lines = [b for b in boq_lines if b["program_id"] == p["program_id"]]
        hw = sum(b["qty"] * b["unit_cost_idr"] for b in lines if not b["sku"].startswith("SVC"))
        svc = sum(b["qty"] * b["unit_cost_idr"] for b in lines if b["sku"].startswith("SVC"))
        groups = [("Hardware", hw), ("Services", svc)] if svc else [("Hardware", hw)]
        for gname, amt in groups:
            if amt <= 0:
                continue
            if p["program_id"] in ("PRG-2613", "PRG-2620") and gname == "Hardware":
                status = "pending_release"
            elif si == 2:
                status = pick(["draft", "released"])
            elif si <= 4:
                status = pick(["released", "acknowledged"])
            else:
                status = pick(["delivered", "invoiced"], [0.6, 0.4])
            issued = dt.date.fromisoformat(p["start"]) + days(int(rng.integers(3, 20)))
            purchase_orders.append({"po_id": f"PO-26-{po_n}", "program_id": p["program_id"], "vendor": p["vendor_id"],
                                    "category": gname, "amount_idr": int(round(amt, -5)), "status": status,
                                    "issued": iso(min(issued, TODAY - days(1))) if status != "pending_release" else None,
                                    "due": iso(dt.date.fromisoformat(p["forecast_rfs"]) - days(int(rng.integers(14, 35)))),
                                    "contract": f"FA-{p['vendor_id']}-2025-{int(rng.integers(10, 99))}"})
            po_n += 1
# pad to ~60 POs with historical invoiced POs for validated programs
for p in programs:
    if p["stage"] in ("Validation", "RFS") and len(purchase_orders) < 60:
        for gname, share in (("Hardware", 0.62), ("Services", 0.26), ("Logistics", 0.12)):
            purchase_orders.append({"po_id": f"PO-26-{po_n}", "program_id": p["program_id"], "vendor": p["vendor_id"],
                                    "category": gname, "amount_idr": int(round(p["spent_idr"] * share, -5)),
                                    "status": "invoiced", "issued": iso(dt.date.fromisoformat(p["start"]) + days(30)),
                                    "due": iso(dt.date.fromisoformat(p["forecast_rfs"]) - days(20)),
                                    "contract": f"FA-{p['vendor_id']}-2025-{int(rng.integers(10, 99))}"})
            po_n += 1

# ----------------------------------------------------------------------------------------
# 10. Incidents, action options, approvals
# ----------------------------------------------------------------------------------------
incidents, options, approvals = [], [], []
inc_n = [10400]
OWNER = {"capacity": "PLAN", "power": "OPS", "transport": "OPS", "ran_hardware": "OPS", "environmental": "OPS",
         "cnx": "CX", "availability": "OPS", "bad_session": "OPS", "cdn": "OPS", "energy": "OPS", "complaints": "CX"}
FUNCS = {"capacity": ["Planning", "Deployment"], "power": ["Operations", "Procurement"],
         "transport": ["Operations", "Planning"], "ran_hardware": ["Operations"], "environmental": ["Operations"],
         "cnx": ["CX", "Planning", "Deployment"], "availability": ["Operations"], "bad_session": ["Operations", "Planning"],
         "cdn": ["Operations"], "energy": ["Operations", "Procurement"], "complaints": ["CX", "Operations"]}
AT_RISK_SHARE = {"capacity": 0.28, "power": 0.33, "transport": 0.42, "ran_hardware": 0.3, "environmental": 0.36,
                 "availability": 0.2, "bad_session": 0.12, "cnx": 0.1, "cdn": 0.05, "energy": 0.0, "complaints": 0.08}
CLASS_LABEL = {"capacity": "Capacity exhaustion", "power": "Power failure risk", "transport": "Transport degradation",
               "ran_hardware": "RAN hardware failure risk", "environmental": "Flood / storm exposure",
               "availability": "Availability breach", "bad_session": "Bad-session surge", "cdn": "CDN peering degradation",
               "energy": "Energy OpEx anomaly", "cnx": "CNX drop", "complaints": "Complaint cluster"}


def option_set(cls, n_sites, inc_id, tz_sites):
    """Action ladder templates (cheapest, fastest first)."""
    n = n_sites
    O = []
    if cls == "capacity":
        O = [("Parameter optimisation (load balancing, tilt)", "noncapex_zero", 0, 2, "PRB −4 pts; buys ~1 wk", 0.72),
             ("Refarm 2G/4G spectrum to the loaded band", "noncapex_zero", 0, 7, "PRB −8 pts; buys ~3 wks", 0.66),
             ("Carrier add on existing hardware", "capex_minor", 40e6 * n, 14, "PRB −15 pts; buys ~8 wks", 0.7),
             ("Sector add", "capex_minor", 350e6 * n, 35, "PRB −28 pts; headroom 12+ months", 0.81),
             ("New site", "capex_major", 1.2e9 * n, 112, "PRB −35 pts; coverage and capacity", 0.77)]
    elif cls == "power":
        O = [("Generator service and fuel top-up", "noncapex_opex", 4.5e6 * n, 3, "Outage risk −20%", 0.62),
             ("Battery swap from pre-positioned stock", "noncapex_opex", 32e6 * n, 7, "Outage risk −70%", 0.8),
             ("Solar / Li-ion retrofit", "capex_minor", 185e6 * n, 28, "Outage risk −85%; energy OpEx −35%", 0.78)]
    elif cls == "transport":
        O = [("QoS re-prioritisation on the trunk", "noncapex_zero", 0, 1, "Peak util −5 pts", 0.6),
             ("Transport reroute via alternate path + dispatch", "noncapex_opex", 45e6, 3, "Peak util −22 pts; restores protection", 0.79),
             ("Microwave capacity upgrade (E-band 2+0)", "capex_minor", 180e6 * max(1, n // 3), 21, "Capacity ×2.5", 0.83),
             ("Fibre build", "capex_major", 18.5e9 if n >= 9 else 1.6e9 * n, 140, "Permanent, protected path", 0.9)]
    elif cls == "ran_hardware":
        O = [("Remote reset and parameter fallback", "noncapex_zero", 0, 1, "Alarm clearance ~40%", 0.45),
             ("Site visit and unit swap from spares", "noncapex_opex", 18e6 * n, 5, "Failure risk −75%", 0.78),
             ("RAN modernisation swap", "capex_minor", 420e6 * n, 42, "Failure risk −95%; +12% throughput", 0.86)]
    elif cls == "environmental":
        O = [("Pre-emptive visit: drainage, sandbags, fuel", "noncapex_opex", 8e6 * n, 3, "Outage risk −30%", 0.6),
             ("Portable genset on standby", "noncapex_opex", 12e6 * n, 2, "Outage duration −60%", 0.68),
             ("Site hardening (raise cabinet, grounding)", "capex_minor", 160e6 * n, 30, "Outage risk −80%", 0.8)]
    elif cls in ("availability", "bad_session"):
        O = [("Remote reset and neighbour offload", "noncapex_zero", 0, 1, "Availability +0.4 pts", 0.55),
             ("Dispatch field engineer", "noncapex_opex", 3.5e6 * n, 2, "Availability +1.1 pts", 0.74),
             ("Replace faulty module", "noncapex_opex", 14e6 * n, 5, "Availability +1.5 pts", 0.8)]
    elif cls == "cdn":
        O = [("Rebalance traffic to alternate PoP", "noncapex_zero", 0, 1, "Cache hit +4 pts", 0.66),
             ("Request cache fill / capacity from partner", "noncapex_zero", 0, 7, "Cache hit +7 pts", 0.6),
             ("Add peering port (100G)", "capex_minor", 220e6, 30, "Egress cost −30%", 0.75)]
    elif cls == "energy":
        O = [("Genset schedule optimisation", "noncapex_zero", 0, 2, "Genset hours −18%", 0.65),
             ("Grid connection upgrade request (PLN)", "noncapex_opex", 15e6 * n, 30, "Genset hours −60%", 0.58),
             ("Solar hybrid retrofit", "capex_minor", 210e6 * n, 35, "Energy OpEx −40%", 0.77)]
    elif cls in ("cnx", "complaints"):
        O = [("Proactive SMS with RFS date", "customer_action", 150 * tz_sites, 1, "Churn intent −8%", 0.62),
             ("Service credit (5 GB data)", "customer_action", 15_000 * tz_sites, 2, "Churn −18%", 0.7),
             ("Retention offer to high-ARPU postpaid", "customer_action", 50_000 * tz_sites, 3, "Churn −30%", 0.66)]
    rows = []
    for rank, (name, klass, cost, lead, uplift, conf) in enumerate(O, 1):
        rows.append({"incident_id": inc_id, "rank": rank, "name": name, "class": klass,
                     "cost_idr": int(round(cost, -4)), "lead_days": lead, "predicted_uplift": uplift,
                     "confidence": r2(conf + rng.normal(0, 0.03))})
    return rows


def new_incident(cls, site_idx, *, source, status, title=None, prob=None, week=None, exposure=None,
                 program=None, verdict=None, detected_days=None, extra=None):
    inc_n[0] += int(rng.integers(1, 9))
    iid = f"INC-{inc_n[0]}"
    s0 = sites[site_idx[0]]
    pids = sorted({sites[i]["province_id"] for i in site_idx})
    rev = float(sum(site_revenue[i] for i in site_idx))
    exposure = exposure if exposure is not None else rev * AT_RISK_SHARE[cls] * rng.uniform(0.8, 1.2)
    if prob is None:
        prob = float(max(fc_prob[i, -1] for i in site_idx)) if source == "prediction" else rng.uniform(0.82, 0.99)
    wk = week if week is not None else (min(int(fc_cross[i]) for i in site_idx if fc_cross[i]) if source == "prediction" else 0)
    urgency = clamp(1.6 - 0.1 * wk, 0.8, 1.6)
    dname = DISTS[s0["district_id"]]["name"]
    title = title or f"{CLASS_LABEL[cls]} — {len(site_idx)} site{'s' if len(site_idx) > 1 else ''} in {dname}"
    sla_h = {"transport": 24, "availability": 8, "power": 48, "capacity": 72, "cnx": 48, "complaints": 48}.get(cls, 72)
    if detected_days is not None:
        det = detected_days
    elif status in ("Detected", "Enriched", "Pending_approval"):
        # decision still open: mostly inside the SLA window, about one in ten overdue
        det = float(rng.uniform(1.05, 1.5) if rng.random() < 0.1 else rng.uniform(0.04, 0.85)) * sla_h / 24
    else:
        det = float(rng.uniform(0.2, 9))
    detected_at = NOW - dt.timedelta(days=det)
    inc = {
        "incident_id": iid, "title": title, "class": cls, "source": source,
        "site_ids": [sites[i]["site_id"] for i in site_idx], "province_id": s0["province_id"],
        "province_ids": pids, "district_id": s0["district_id"], "region": s0["region"],
        "probability": r2(prob), "predicted_week": wk, "exposure_idr": int(round(exposure, -6)),
        "urgency": r2(urgency), "status": status, "owner_role": OWNER[cls], "functions": FUNCS[cls],
        "detected_at": ts(detected_at), "sla_due": ts(detected_at + dt.timedelta(hours=sla_h)),
        "owner_assigned_at": ts(detected_at + dt.timedelta(hours=float(rng.uniform(0.3, 3.8)))) if status != "Detected" else None,
        "program_id": program, "program_match": verdict or {"verdict": "not_covered"},
        "customers": int(sum(sites[i]["subscribers"] for i in site_idx)),
        "churn_risk_subs": int(sum(site_churn_subs[i] for i in site_idx)),
        "recommended_rank": None, "flags": [], "insight_ids": [], "confidence": r2(clamp(prob * rng.uniform(0.9, 1.05), 0.3, 0.98)),
        "as_of": iso(AS_OF), "freshness": "D-1",
    }
    if extra:
        inc.update(extra)
    opts = option_set(cls, len(site_idx), iid, inc["churn_risk_subs"] or inc["customers"])
    inc["recommended_rank"] = recommend(cls, opts, wk, inc)
    incidents.append(inc)
    options.extend(opts)
    return inc


def recommend(cls, opts, wk, inc):
    if cls == "capacity":
        return 4 if wk <= 5 else 3
    if cls == "transport":
        return 2
    if cls == "power":
        return 2
    if cls == "ran_hardware":
        return 2
    if cls == "environmental":
        return 1
    if cls in ("cnx", "complaints"):
        return 1 if inc["churn_risk_subs"] < 3000 else 3
    return 2 if len(opts) > 1 else 1


def verdict_for(site_idx, cross_week):
    pids = {site_program.get(i) for i in site_idx} - {None}
    if not pids:
        return {"verdict": "not_covered"}
    pid = sorted(pids)[0]
    p = PROG[pid]
    covered_all = all(site_program.get(i) == pid for i in site_idx)
    frfs = dt.date.fromisoformat(p["forecast_rfs"])
    on_time = cross_week == 0 or frfs <= week_date(cross_week)
    v = "covered" if covered_all and on_time and p["stage"] != "Decision" else "partial"
    return {"verdict": v, "program_id": pid, "eta": p["forecast_rfs"], "stage": p["stage"],
            "reason": None if v == "covered" else ("Program RFS after predicted breach" if not on_time else
                                                     ("Program awaiting approval" if p["stage"] == "Decision" else "Some sites outside the program"))}


# Story incidents ---------------------------------------------------------------
bk = story_idx["bekasi_capacity"]
inc_bekasi = new_incident("capacity", bk, source="prediction", status="Pending_approval",
                          title="Capacity exhaustion — 14 sites in Bekasi (Cikarang corridor)",
                          exposure=STORIES["bekasi_capacity"]["exposure_idr_month"],
                          prob=float(np.mean([fc_prob[i, 2] for i in bk])), week=3,
                          verdict={"verdict": "not_covered"}, detected_days=0.6,
                          extra={"story": "bekasi_capacity", "days_to_breach": 23})
sl = story_idx["sulsel_transport"]
inc_sulsel = new_incident("transport", sl, source="prediction", status="Pending_approval",
                          title="Transport chain at 94% — Makassar–Mandai trunk, 9 dependent sites",
                          exposure=STORIES["sulsel_transport"]["exposure_idr_month"],
                          prob=float(np.mean([fc_prob[i, 1] for i in sl])), week=2,
                          verdict={"verdict": "partial", "program_id": "PRG-2621", "eta": PROG["PRG-2621"]["forecast_rfs"],
                                   "stage": "Decision", "reason": "Fibre ring awaiting approval; RFS after predicted breach"},
                          program="PRG-2621", detected_days=0.3,
                          extra={"story": "sulsel_transport", "link_id": st_link["id"]})
sb = story_idx["surabaya_cnx"]
inc_sby = new_incident("cnx", sb, source="cx", status="In_program",
                       title="Postpaid 5G CNX −4.0 pts — Surabaya cluster SBY-5G-C03 (12 sites)",
                       exposure=1_100_000_000, prob=0.87, week=5,
                       verdict={"verdict": "partial", "program_id": "PRG-2609", "eta": PROG["PRG-2609"]["forecast_rfs"],
                                "stage": "Installation", "reason": "Program 3 weeks late; RFS after predicted saturation"},
                       program="PRG-2609", detected_days=1.4,
                       extra={"story": "surabaya_cnx", "segment": "postpaid", "technology": "5G",
                              "cnx_delta": -STORIES["surabaya_cnx"]["cnx_drop_pts"]})
inc_sby["churn_risk_subs"] = STORIES["surabaya_cnx"]["churn_risk_subs"]
# regenerate CX options with the exact cohort
options[:] = [o for o in options if o["incident_id"] != inc_sby["incident_id"]]
options.extend(option_set("cnx", 12, inc_sby["incident_id"], inc_sby["churn_risk_subs"]))
inc_sby["recommended_rank"] = 1
inc_sby["pending_customer_action"] = True
cj = story_idx["cjava_power"]
inc_cj = new_incident("power", cj, source="prediction", status="In_program",
                      title="Power failure risk — 11 sites in Central Java (battery and rectifier)",
                      verdict=verdict_for(cj, 6), program="PRG-2611", week=6, detected_days=6.5,
                      extra={"story": "cjava_power", "stock_prepositioned": "WH-SMG"})

# Predicted incidents from remaining reds -----------------------------------------
story_all = set(bk + sl + sb + cj)
reds = [i for i in range(N) if fc_cross[i] and i not in story_all]
groups = defaultdict(list)
for i in reds:
    key = (fc_class[i], site_program.get(i) or sites[i]["district_id"])
    groups[key].append(i)
status_cycle = ["Enriched", "Pending_approval", "Enriched", "Pending_approval", "Detected", "Deferred", "Approved"]
for n, ((cls, key), idxs) in enumerate(sorted(groups.items())):
    for chunk_start in range(0, len(idxs), 5):
        chunk = idxs[chunk_start: chunk_start + 5]
        cw = min(int(fc_cross[i]) for i in chunk)
        v = verdict_for(chunk, cw)
        if v["verdict"] == "covered":
            status = "In_program"
        else:
            status = status_cycle[n % len(status_cycle)]
        new_incident(cls, chunk, source="prediction", status=status, verdict=v, program=v.get("program_id"))

# Sense incidents (current state) ------------------------------------------------
def worst(metric_arr, cond, k, reverse=False):
    cand = [i for i in range(N) if i not in used and i not in story_all and cond(sites[i])]
    cand.sort(key=lambda i: metric_arr[i] if not reverse else -metric_arr[i])
    return cand[:k]


avail_7 = avail[:, -7:].mean(1)
for i in worst(avail_7, lambda s: True, 18):
    avail[i, -3:] = np.minimum(avail[i, -3:], rng.uniform(96.2, 98.7, 3))
    used.add(i)
    new_incident("availability", [i], source="alarm",
                 status=pick(["Enriched", "Pending_approval", "Approved", "Detected"], [0.35, 0.3, 0.2, 0.15]))
bad_7 = bad[:, -7:].mean(1)
for i in worst(bad_7, lambda s: s["urban"], 8, reverse=True):
    bad[i, -10:] += rng.uniform(4, 7)
    used.add(i)
    new_incident("bad_session", [i], source="alarm", status=pick(["Enriched", "Pending_approval", "Deferred"]))
en_idx = sorted(range(N), key=lambda i: -sites[i]["energy"]["energy_opex_idr_month"])
for i in [j for j in en_idx if j not in used][:5]:
    used.add(i)
    new_incident("energy", [i], source="prediction", status=pick(["Enriched", "Pending_approval"]), prob=rng.uniform(0.7, 0.9),
                 week=0, exposure=0,
                 extra={"opex_saving_idr_month": int(sites[i]["energy"]["energy_opex_idr_month"] * 0.38)})
for pop in ("CDN-BTM-01", "CDN-SMG-01"):
    c = next(x for x in cdn_peers if x["pop_id"] == pop)
    city_sites = [i for i in range(N) if sites[i]["province_id"] == ("KPR" if pop == "CDN-BTM-01" else "JTG")][:1]
    new_incident("cdn", city_sites, source="alarm", status="Enriched",
                 title=f"CDN peering degradation — {c['partner']} {c['city']} (cache hit {c['cache_hit_pct']}%)",
                 exposure=c["egress_cost_idr_month"] * 0.38,
                 extra={"pop_id": pop})
# CX complaint clusters
for prov, dname in (("SMU", "Kota Medan"), ("JBR", "Kota Depok"), ("KTM", "Kota Samarinda"), ("BAL", "Badung"),
                    ("SLS", "Kota Makassar")):
    ds = [i for i in by_district_idx] if False else [IDX[s["site_id"]] for s in by_district[dist_id(prov, dname)]
                                                      if IDX[s["site_id"]] not in used][:3]
    for i in ds:
        used.add(i)
    new_incident("complaints", ds, source="cx", status=pick(["Enriched", "Pending_approval", "Detected"]),
                 title=f"Complaint cluster: {pick(COMPLAINTS[:5])} — {dname}")

# Historical: closed, rejected, validating
for k in range(12):
    i = int(rng.integers(N))
    cls = pick(["capacity", "power", "transport", "ran_hardware", "availability"])
    status = pick(["Closed", "Rejected", "Validating", "RFS"], [0.5, 0.2, 0.2, 0.1])
    prog_ = site_program.get(i) if status in ("Validating", "RFS") else None
    new_incident(cls, [i], source=pick(["prediction", "alarm"]), status=status, program=prog_,
                 verdict={"verdict": "covered", "program_id": prog_, "eta": PROG[prog_]["forecast_rfs"], "stage": PROG[prog_]["stage"]} if prog_ else None,
                 detected_days=float(rng.uniform(20, 120)), prob=rng.uniform(0.6, 0.9), week=0,
                 extra={"closed_reason": pick(["Resolved by intervention", "False positive", "Duplicate", "Superseded by program"]) if status in ("Closed", "Rejected") else None})

OPEN = {"Detected", "Enriched", "Pending_approval", "Approved", "Deferred", "In_program", "RFS"}


def is_open(inc):
    return inc["status"] in OPEN


# Enforce the Regional Manager Monday count (open incidents in scope region).
REG = CFG["monday"]["region_manager_scope"]
target_open = CFG["monday"]["region_open_incidents"]
reg_open = [x for x in incidents if x["region"] == REG and is_open(x)]
reg_open.sort(key=lambda x: (x.get("story") is not None, x["exposure_idr"]), reverse=True)
while len(reg_open) > target_open:
    victim = reg_open.pop()
    victim["status"] = "Closed"
    victim["closed_reason"] = "Resolved by intervention"
sl_sites = [i for i in range(N) if sites[i]["region"] == REG and i not in used]
while len(reg_open) < target_open:
    i = sl_sites.pop()
    used.add(i)
    reg_open.append(new_incident("availability", [i], source="alarm", status="Enriched"))
# Two escalation candidates and two false-positive candidates among them.
cand = [x for x in reg_open if not x.get("story") and x["status"] not in ("In_program",)]
for x in cand[:2]:
    x["flags"].append("escalate_candidate")
    x["escalation_note"] = "Non-CapEx options tried twice in 60 days; recurring. Action Ladder recommends CapEx."
    x["status"] = "Pending_approval"
for x in cand[2:4]:
    x["flags"].append("false_positive_candidate")
    x["confidence"] = r2(rng.uniform(0.31, 0.44))
    x["fp_note"] = pick(["Signal coincided with a local festival that has ended; KPIs back within threshold",
                         "BMKG outlook revised; alarm pattern matches a known sensor fault"])
    x["status"] = "Enriched"

# Priority score
for x in incidents:
    x["priority_score"] = r2((x["exposure_idr"] / 1e9) * x["probability"] * x["urgency"] * 100, 1)

# Approval history per incident
AUTH = {"PLAN": "Maya Kartika", "OPS": "Rudi Hartono", "CX": "Nadia Rahmawati", "EXEC": "Adrian Wibisono",
        "REGION": "Andi Makkasau", "DEPLOY": "Bayu Prasetyo", "PROC": "Lina Susanti"}
REASONS = ["Covered by upcoming program", "Cost exceeds exposure", "Prediction confidence too low",
           "Duplicate of existing incident", "Awaiting tower company feasibility"]
for x in incidents:
    t0 = dt.datetime.fromisoformat(x["detected_at"])
    seq = [("Detect", "system", "Incident Orchestrator", "detected", 0)]
    if x["status"] != "Detected":
        seq.append(("Enrich", "system", "Action Ladder Agent", "recommended", 0.4))
    if x["status"] in ("Pending_approval", "Approved", "Rejected", "Deferred", "In_program", "RFS", "Validating", "Closed"):
        seq.append(("Review", x["owner_role"], AUTH.get(x["owner_role"], "—"), "reviewed", 2.5))
    if x["status"] in ("Approved", "In_program", "RFS", "Validating", "Closed"):
        seq.append(("Approve", x["owner_role"], AUTH.get(x["owner_role"], "—"), "approved", 6))
    if x["status"] == "Rejected":
        seq.append(("Approve", x["owner_role"], AUTH.get(x["owner_role"], "—"), "rejected", 6))
    if x["status"] == "Deferred":
        seq.append(("Approve", x["owner_role"], AUTH.get(x["owner_role"], "—"), "deferred", 6))
    for step, role, actor, decision, h in seq:
        approvals.append({"incident_id": x["incident_id"], "step": step, "role": role, "actor": actor,
                          "decision": decision,
                          "reason_code": pick(REASONS) if decision in ("rejected", "deferred") else None,
                          "timestamp": ts(t0 + dt.timedelta(hours=h))})

# ----------------------------------------------------------------------------------------
# 11. Insights (~400)
# ----------------------------------------------------------------------------------------
insights = []
ins_n = [88000]


def fmt_idr(v):
    if v >= 1e9:
        return f"IDR {v / 1e9:.1f}bn"
    return f"IDR {v / 1e6:.0f}m"


def add_insight(agent, when, inc, message, magnitude, confidence, fn, action, what, sites_=None):
    ins_n[0] += int(rng.integers(1, 5))
    iid = f"INS-{ins_n[0]}"
    s_ids = sites_ if sites_ is not None else (inc["site_ids"] if inc else [])
    ins = {"insight_id": iid, "agent": agent, "timestamp": ts(when), "scope": {
        "site_ids": s_ids[:30], "province_id": inc["province_id"] if inc else (sites[IDX[s_ids[0]]]["province_id"] if s_ids else None),
        "district_id": inc["district_id"] if inc else (sites[IDX[s_ids[0]]]["district_id"] if s_ids else None),
        "label": (DISTS[inc["district_id"]]["name"] if inc else (DISTS[sites[IDX[s_ids[0]]]["district_id"]]["name"] if s_ids else "National"))},
        "what_changed": what, "message": message, "magnitude": magnitude, "confidence": r2(confidence),
        "exposure_idr": inc["exposure_idr"] if inc else 0, "suggested_function": fn, "suggested_action": action,
        "incident_id": inc["incident_id"] if inc else None, "as_of": iso(AS_OF), "freshness": "D-1"}
    insights.append(ins)
    if inc:
        inc["insight_ids"].append(iid)
    return ins


AGENT_FOR = {"capacity": "Capacity Exhaustion Agent", "power": "Site Failure Prediction Agent",
             "transport": "Backbone and Transport Agent", "ran_hardware": "Site Failure Prediction Agent",
             "environmental": "Site Failure Prediction Agent", "availability": "Site Health Agent",
             "bad_session": "Bad Session Agent", "cdn": "CDN Peering Agent", "energy": "Energy and Power Agent",
             "cnx": "CNX Agent", "complaints": "CX Agent"}

# Hand-written story insights (PRD examples).
t_b = dt.datetime.fromisoformat(inc_bekasi["detected_at"])
add_insight("Capacity Exhaustion Agent", t_b, inc_bekasi,
            "PRB utilisation at 14 sites in Bekasi trending to breach in 23 days. Revenue exposure IDR 1.8bn/month. Suggested: Planning review for sector add",
            "PRB 86% peak → 90% by W+3", 0.86, "Planning", "Planning review for sector add", "PRB trend +1.3 pts/wk across Cikarang corridor")
add_insight("Revenue Exposure Agent", t_b + dt.timedelta(minutes=12), inc_bekasi,
            "IDR 1.8bn/month at risk across 14 Bekasi sites: 41 enterprise accounts in Jababeka and MM2100 estates, 116k subscribers in catchment",
            "IDR 1.8bn / month", 0.78, "Planning", "Attach exposure to incident", "Exposure computed")
add_insight("Program Match Agent", t_b + dt.timedelta(minutes=20), inc_bekasi,
            "No active or planned program covers the 14 Bekasi sites. Nearest program PRG-2610 (Jakarta CBD) is out of scope",
            "Not covered", 0.97, "Planning", "Create program", "Coverage check")
add_insight("Smart CapEx Agent", t_b + dt.timedelta(minutes=31), inc_bekasi,
            "Classified CapEx (minor): sector add ranks #3 nationally on D-5 features; carrier add insufficient beyond W+8",
            "Rank #3 of 412", 0.81, "Planning", "Approve sector add", "CapEx classification")
t_s = dt.datetime.fromisoformat(inc_sulsel["detected_at"])
add_insight("Backbone and Transport Agent", t_s, inc_sulsel,
            "Makassar–Mandai MW trunk at 94% peak utilisation with no protection path; 9 dependent sites from Maros to Parepare",
            "94% peak, +11 pts in 21 d", 0.91, "Operations", "Approve transport reroute and dispatch", "Link utilisation breach")
add_insight("Site Failure Prediction Agent", t_s + dt.timedelta(minutes=8), inc_sulsel,
            "Transport-class failure probability 66% by W+2 on 9 dependent sites (MW fade events ×23 in 14 days, rain season onset)",
            "66% by W+2", 0.84, "Operations", "Interim reroute; escalate fibre ring", "Prediction")
add_insight("Program Match Agent", t_s + dt.timedelta(minutes=15), inc_sulsel,
            "Partially covered: PRG-2621 fibre ring (Makassar–Parepare) awaits Head of Network approval; ETA Feb 2027 is after predicted breach",
            "Partial", 0.95, "Planning", "Interim non-CapEx action required", "Coverage check")
t_c = dt.datetime.fromisoformat(inc_sby["detected_at"])
add_insight("CNX Agent", t_c, inc_sby,
            "Postpaid CNX on 5G cluster SBY-5G-C03 in Surabaya down 4.0 points in 28 days; churn-risk cohort 6,200 subscribers",
            "−4.0 pts (28 d)", 0.88, "CX", "Approve proactive outreach ahead of RFS", "CNX drop by segment")
add_insight("CX Agent", t_c + dt.timedelta(hours=2), inc_sby,
            "Complaint cluster '5G icon but slow speed' up 2.6× week on week across Gubeng, Genteng and Tegalsari",
            "2.6× WoW", 0.8, "CX", "Link to network action", "Complaint theme spike")
add_insight("Program Orchestrator", t_c + dt.timedelta(hours=3), inc_sby,
            "PRG-2609 Surabaya 5G Phase 2 is 3 weeks late (AAU import clearance); 6 of 12 sites predicted to saturate at W+5, before revised RFS 09 Nov",
            "3 weeks late", 0.93, "Deployment", "Pull forward interim refarming", "Program slip")
t_j = dt.datetime.fromisoformat(inc_cj["detected_at"])
add_insight("Site Failure Prediction Agent", t_j, inc_cj,
            "Power-class failure probability crosses 60% at W+6 on 11 Central Java sites (battery health < 65%, rectifier alarms rising)",
            "62% by W+6", 0.79, "Operations", "Battery swap from pre-positioned stock", "Prediction")
add_insight("Warehouse Readiness Agent", t_j + dt.timedelta(hours=5), inc_cj,
            "14 Li-ion 200Ah batteries and 28 rectifier modules reserved in Semarang for PRG-2611; readiness green, 6 weeks ahead of predicted failure",
            "Readiness green", 0.95, "Procurement", "Confirm pre-positioning", "Stock reserved")

for x in incidents:
    if x.get("story"):
        continue
    t0 = dt.datetime.fromisoformat(x["detected_at"])
    agent = AGENT_FOR[x["class"]]
    dname = DISTS[x["district_id"]]["name"]
    n = len(x["site_ids"])
    cls = x["class"]
    if cls == "capacity":
        msg = f"PRB utilisation at {n} site{'s' if n > 1 else ''} in {dname} trending to breach in {x['predicted_week'] * 7 - int(rng.integers(0, 5))} days. Revenue exposure {fmt_idr(x['exposure_idr'])}/month"
        what = "PRB trend"
    elif cls in ("power", "ran_hardware", "environmental", "transport"):
        msg = f"{CLASS_LABEL[cls]}: {int(x['probability'] * 100)}% probability by W+{x['predicted_week']} on {n} site{'s' if n > 1 else ''} in {dname}"
        what = "8-week prediction"
    elif cls == "availability":
        msg = f"Availability on {x['site_ids'][0]} down to {avail[IDX[x['site_ids'][0]], -1]:.2f}% (24 h); {int(alarms[IDX[x['site_ids'][0]], -1])} alarms"
        what = "Availability breach"
    elif cls == "bad_session":
        msg = f"Bad-session share on {x['site_ids'][0]} at {bad[IDX[x['site_ids'][0]], -1]:.1f}% (threshold 10%)"
        what = "Bad sessions"
    elif cls == "energy":
        msg = f"Generator dependence rising on {x['site_ids'][0]} — energy OpEx {fmt_idr(sites[IDX[x['site_ids'][0]]]['energy']['energy_opex_idr_month'])}/month, saving pool {fmt_idr(x.get('opex_saving_idr_month', 0))}/month"
        what = "Energy OpEx"
    elif cls == "cdn":
        msg = x["title"].replace("CDN peering degradation — ", "Cache hit ratio drop at ") + "; international transit egress up"
        what = "Peering degradation"
    else:
        msg = f"{x['title']}; churn-risk cohort {x['churn_risk_subs']:,} subscribers"
        what = "Complaint cluster"
    opt = next(o for o in options if o["incident_id"] == x["incident_id"] and o["rank"] == x["recommended_rank"])
    add_insight(agent, t0, x, msg, f"{int(x['probability'] * 100)}%", x["confidence"],
                {"PLAN": "Planning", "OPS": "Operations", "CX": "CX"}[x["owner_role"]], opt["name"], what)
    if rng.random() < 0.7:
        add_insight("Revenue Exposure Agent", t0 + dt.timedelta(minutes=int(rng.integers(5, 40))), x,
                    f"{fmt_idr(x['exposure_idr'])}/month exposure; {x['customers']:,} subscribers in catchment",
                    fmt_idr(x["exposure_idr"]), rng.uniform(0.7, 0.85), "Planning", "Attach exposure", "Exposure")
    if rng.random() < 0.6 and x["source"] == "prediction":
        pm = x["program_match"]
        add_insight("Program Match Agent", t0 + dt.timedelta(minutes=int(rng.integers(10, 60))), x,
                    {"covered": f"Covered by {pm.get('program_id')} (ETA {pm.get('eta')})",
                     "partial": f"Partially covered by {pm.get('program_id')}: {pm.get('reason')}",
                     "not_covered": "Not covered by any active program"}[pm["verdict"]],
                    pm["verdict"].replace("_", " ").title(), rng.uniform(0.88, 0.98), "Planning",
                    "Create program" if pm["verdict"] == "not_covered" else "Monitor", "Coverage check")

# Standalone low-signal insights (not grouped into incidents)
STANDALONE = [
    ("Capacity Exhaustion Agent", "PRB trend flattening after refarming on {n} sites in {d}", "Operations", "None — monitor", "PRB trend"),
    ("Site Health Agent", "Health score recovered above 80 on {n} sites in {d} after dispatch", "Operations", "Close work orders", "Health recovery"),
    ("Bad Session Agent", "Evening bad-session share rising 1.2 pts/wk on {n} sites in {d} (below threshold)", "Operations", "Watch", "Bad sessions"),
    ("Churn Exposure Agent", "Churn propensity up 0.4 pts in {d} prepaid 4G catchment", "CX", "Review cohort", "Churn"),
    ("Energy and Power Agent", "Battery end-of-life predicted inside 90 days on {n} sites in {d}", "Operations", "Plan battery swaps", "Battery EOL"),
    ("Spectrum and Refarming Agent", "L900 utilisation below 20% on {n} sites in {d}: refarming candidate for L1800 relief", "Planning", "Add to action ladder", "Band utilisation"),
    ("Tower Company Coordination Agent", "Loading feasibility returned for {n} sites in {d}; 1 needs structural review", "Deployment", "Review feasibility", "Tower company response"),
    ("Site Access and Permit Agent", "Permit renewal due within 45 days on {n} sites in {d}", "Deployment", "Start renewal", "Permit risk"),
    ("Model Drift Agent", "Capacity-class calibration within tolerance (PSI 0.06) for {d}", "Admin", "None", "Drift check"),
    ("Warehouse Readiness Agent", "Stock of {sku} below reorder point at {w}", "Procurement", "Release PO", "Reorder point"),
    ("Customer Outreach Agent", "Outreach completed for {n} sites in {d}; 7-day churn intent −6%", "CX", "None", "Outreach result"),
    ("Post-RFS Validation Agent", "30-day validation complete for {n} sites in {d}: CNX +{u} pts vs control", "Planning", "Review in Value Ledger", "Validation"),
    ("Narrative Agent", "Weekly network narrative drafted for {d} region review", "All", "Review summary", "Narrative"),
    ("CDN Peering Agent", "Cache hit ratio stable at {w2}; egress cost within budget", "Operations", "None", "Peering health"),
]
low_ws = [w for w in warehouse_stock if w["on_hand"] - w["reserved"] < w["reorder_point"]]
while len(insights) < 400:
    agent, tmpl, fn, act, what = STANDALONE[int(rng.integers(len(STANDALONE)))]
    i = int(rng.integers(N))
    s = sites[i]
    ws_ = low_ws[int(rng.integers(len(low_ws)))] if low_ws else warehouse_stock[0]
    msg = tmpl.format(n=int(rng.integers(2, 12)), d=DISTS[s["district_id"]]["name"], sku=ws_["description"],
                      w=ws_["warehouse"], u=r2(rng.uniform(1.5, 6.5), 1), w2=pick([c["city"] for c in cdn_peers]))
    when = NOW - dt.timedelta(hours=float(rng.uniform(1, 14 * 24)))
    add_insight(agent, when, None, msg, "—", rng.uniform(0.55, 0.9), fn, act, what, sites_=[s["site_id"]])
insights.sort(key=lambda x: x["timestamp"], reverse=True)

# ----------------------------------------------------------------------------------------
# 12. Engineers and work orders (~300)
# ----------------------------------------------------------------------------------------
engineers = []
eng_by_region = defaultdict(list)
pi = 0
for reg, n_eng in (("Jabodetabek", 10), ("Java", 14), ("Sumatra", 10), ("Kalimantan", 6), ("Sulawesi", 7),
                   ("Bali Nusra", 6), ("Papua Maluku", 4)):
    provs = [p for p, v in PROVS.items() if v["region"] == reg] or ["JKT"]
    for k in range(n_eng):
        prov = provs[k % len(provs)]
        eid = f"ENG-{prov}-{k + 1:02d}"
        name = PEOPLE[pi % len(PEOPLE)]
        pi += 1
        engineers.append({"engineer_id": eid, "name": name, "region": reg, "province_id": prov})
        eng_by_region[reg].append(eid)
FIELD_ROLE = next(r for r in ROLES["roles"] if r["role_code"] == "FIELD")
engineers.append({"engineer_id": FIELD_ROLE["engineer_id"], "name": FIELD_ROLE["user"], "region": "Jabodetabek", "province_id": "JBR"})
eng_by_region["Jabodetabek"].append(FIELD_ROLE["engineer_id"])

CHECKLISTS = {
    "Preventive maintenance": ["Visual inspection of tower and antennas", "Clean cabinet filters", "Check grounding resistance", "Photo evidence: cabinet interior", "Record alarm log"],
    "Battery check": ["Measure string voltage under load", "Record discharge curve (30 min)", "Inspect terminals and cabling", "Photo evidence: battery bank label", "Upload rectifier alarm export"],
    "Battery swap": ["Confirm replacement units on site", "Isolate DC bus and swap strings", "Commission BMS and verify float voltage", "Photo evidence: before / after", "Return old units to warehouse"],
    "Fault repair": ["Confirm alarm on arrival", "Replace faulty module", "Verify KPI recovery with NOC", "Photo evidence: replaced part serial", "Close alarm in NMS"],
    "Site survey": ["Measure mounting space and azimuths", "Check tower loading plate", "Power budget check", "Photo evidence: 360° rooftop / tower", "Upload survey form"],
    "Installation": ["Mount antennas and RRUs", "Terminate CPRI and DC cabling", "Weatherproof connectors", "Photo evidence: installed equipment", "Handover to integration"],
    "Integration support": ["Verify alarms clear after integration", "Run call and throughput test", "Photo evidence: test results", "Sign integration checklist"],
    "Transport reroute": ["Reconfigure MW path on alternate link", "Verify protection switching", "Coordinate with NOC on traffic shift", "Photo evidence: IDU configuration"],
}
work_orders = []
wo_n = [55000]


def add_wo(i, typ, status, due, eng=None, program=None, incident=None, parts=None, priority="normal"):
    wo_n[0] += int(rng.integers(1, 4))
    s = sites[i]
    eng = eng or pick([e for e in eng_by_region[s["region"]] if e != FIELD_ROLE["engineer_id"]])
    created = due - days(int(rng.integers(3, 12)))
    evidence = []
    if status in ("completed", "evidence_submitted"):
        evidence = [{"name": f"{s['site_id']}_{k}.jpg", "type": "photo"} for k in range(int(rng.integers(2, 5)))]
    work_orders.append({"wo_id": f"WO-{wo_n[0]}", "site_id": s["site_id"], "program_id": program, "incident_id": incident,
                        "engineer_id": eng, "type": typ, "status": status, "priority": priority,
                        "created": iso(created), "due": iso(due), "evidence": evidence,
                        "checklist": [{"step": c, "done": status in ("completed", "evidence_submitted") or (status == "in_progress" and k < 2)}
                                      for k, c in enumerate(CHECKLISTS[typ])],
                        "parts": parts or []})


week_end = TODAY + days(6)
# FIELD persona: 6 work orders due this week in Bekasi, assigned to the persona engineer.
bekasi_id = dist_id("JBR", CFG["monday"]["field_engineer_district"])
bekasi_generic = [IDX[s["site_id"]] for s in by_district[bekasi_id] if not s["story"]]
field_types = [("Preventive maintenance", "open", []), ("Battery check", "open", [{"sku": "BAT-LI-100", "qty": 1, "status": "Ready at WH-CKR"}]),
               ("Fault repair", "in_progress", [{"sku": "RRU-4T-L18", "qty": 1, "status": "Ready at WH-CKR"}]),
               ("Preventive maintenance", "open", []), ("Fault repair", "open", [{"sku": "CPRI-KIT", "qty": 1, "status": "In transit"}]),
               ("Battery check", "open", [])]
for k, (typ, status, parts) in enumerate(field_types):
    add_wo(bekasi_generic[k], typ, status, TODAY + days(k % 5), eng=FIELD_ROLE["engineer_id"], parts=parts,
           priority="high" if k in (2, 4) else "normal")
for k in range(4):  # last week's completed for the persona
    add_wo(bekasi_generic[6 + k], pick(["Preventive maintenance", "Fault repair"]), "completed", TODAY - days(int(rng.integers(2, 7))),
           eng=FIELD_ROLE["engineer_id"])

# Sulawesi: exactly 4 overdue.
sul_sites = [i for i in range(N) if sites[i]["region"] == REG]
for k in range(4):
    add_wo(sul_sites[k * 7], pick(["Fault repair", "Battery check", "Preventive maintenance"]), "overdue",
           TODAY - days(int(rng.integers(1, 6))), priority="high")
# Program installation work orders
for p in programs:
    si = STAGES.index(p["stage"])
    if si < 4 or p["stage"] == "Validation":
        continue
    for sid in p["site_ids"][:12]:
        i = IDX[sid]
        typ = "Installation" if si <= 5 else "Integration support"
        status = pick(["open", "in_progress", "completed", "evidence_submitted"], [0.3, 0.3, 0.2, 0.2])
        due = TODAY + days(int(rng.integers(-3, 21)))
        if status == "open" and due < TODAY:
            due = TODAY + days(int(rng.integers(1, 10)))
        if sites[i]["region"] == REG and status not in ("completed", "evidence_submitted") and due < TODAY:
            due = TODAY + days(3)
        add_wo(i, typ, status, due, program=p["program_id"],
               parts=[{"sku": sku, "qty": q or 1, "status": pick(["Delivered to site", "Ready at warehouse", "In transit"])}
                      for sku, q in BOQ_TEMPLATES[p["intervention"]][:3] if not sku.startswith("SVC")])
# Incident-driven dispatch work orders
for x in incidents:
    if x["class"] in ("availability", "power", "ran_hardware", "bad_session") and x["status"] in ("Approved", "In_program", "Pending_approval") \
            and len(work_orders) < 300:
        i = IDX[x["site_ids"][0]]
        due = TODAY + days(int(rng.integers(0, 6)))
        status = pick(["open", "in_progress"])
        add_wo(i, {"availability": "Fault repair", "power": "Battery swap", "ran_hardware": "Fault repair",
                   "bad_session": "Fault repair"}[x["class"]], status, due, incident=x["incident_id"],
               priority="high" if x["priority_score"] > 40 else "normal")
# Fill to ~300 with historical / routine work orders (never overdue outside the Sulawesi quota)
while len(work_orders) < 300:
    i = int(rng.integers(N))
    if sites[i]["region"] == REG or sites[i]["district_id"] == bekasi_id:
        continue
    status = pick(["completed", "evidence_submitted", "open", "in_progress"], [0.45, 0.15, 0.25, 0.15])
    due = TODAY - days(int(rng.integers(1, 30))) if status in ("completed", "evidence_submitted") else TODAY + days(int(rng.integers(1, 20)))
    add_wo(i, pick(["Preventive maintenance", "Battery check", "Fault repair"]), status, due)

# ----------------------------------------------------------------------------------------
# 13. Post-RFS validation (200 sites x 7 KPIs), difference-in-differences
# ----------------------------------------------------------------------------------------
V = CFG["validation"]
val_sites = []
for p in programs:
    if p["stage"] in ("Validation", "RFS") and not p["complete"]:
        k = len(p["site_ids"]) if p["stage"] == "Validation" else p["sites_rfs"]
        for sid in p["site_ids"][:k]:
            val_sites.append((sid, p["program_id"]))
val_sites = val_sites[: V["sites"]]
if len(val_sites) < V["sites"]:
    extra_p = PROG["PRG-2608"]
    for sid in extra_p["site_ids"]:
        if len(val_sites) >= V["sites"]:
            break
        if (sid, "PRG-2608") not in val_sites:
            val_sites.append((sid, "PRG-2608"))
assert len(val_sites) == V["sites"], len(val_sites)
outcome = ["uplift"] * V["uplift"] + ["flat"] * V["flat"] + ["worse"] * V["worse"]
outcome = list(rng.permutation(outcome))
# Surabaya Phase 1 (the demo comparable) is solidly positive.
sby1 = [n for n, (sid, pid) in enumerate(val_sites) if pid == "PRG-2601"]
others_up = [n for n, o in enumerate(outcome) if o == "uplift" and n not in sby1]
for n in sby1:
    if outcome[n] != "uplift":
        swap = others_up.pop()
        outcome[n], outcome[swap] = outcome[swap], outcome[n]
        sby1_flag = True
validation = []
KPI_DEF = {  # kpi: (pre mean, unit, good direction, uplift magnitude)
    "availability": (99.4, "%", 1, 0.35), "cnx": (71.0, "pts", 1, 5.5), "bad_session": (8.4, "%", -1, 3.2),
    "throughput": (14.0, "Mbps", 1, 5.0), "traffic_gb": (410.0, "GB/day", 1, 0.22), "churn": (2.6, "%/mo", -1, 0.55),
    "revenue": (0.0, "IDR/mo", 1, 0.06),
}
for n, (sid, pid) in enumerate(val_sites):
    i = IDX[sid]
    p = PROG[pid]
    base_rfs = dt.date.fromisoformat(p["forecast_rfs"])
    spread = 70 if pid in ("PRG-2602", "PRG-2605", "PRG-2606") else 21
    rfs = base_rfs - days(int(rng.integers(0, spread)))
    rfs = min(rfs, TODAY - days(31))
    rfs = max(rfs, TODAY - days(179))
    age = (TODAY - rfs).days
    o = outcome[n]
    eff = {"uplift": rng.uniform(0.7, 1.4), "flat": rng.uniform(-0.15, 0.2), "worse": rng.uniform(-0.8, -0.35)}[o]
    if pid == "PRG-2601":
        eff = rng.uniform(1.0, 1.35)
    for kpi, (pre_mu, unit, good, mag) in KPI_DEF.items():
        if kpi == "revenue":
            pre = float(site_revenue[i])
        elif kpi == "traffic_gb":
            pre = pre_mu * rng.lognormal(0, 0.35) * (1.5 if sites[i]["urban"] else 1)
        else:
            pre = pre_mu + rng.normal(0, {"availability": 0.2, "cnx": 2.5, "bad_session": 1.5, "throughput": 3,
                                          "churn": 0.4}[kpi])
        rel = kpi in ("traffic_gb", "revenue")
        ctrl_pre = pre * rng.uniform(0.97, 1.03) if rel else pre + rng.normal(0, 0.3 * (mag if kpi != "availability" else 0.3))
        drift = rng.normal(0, 0.15) * mag if not rel else rng.normal(0.01, 0.01)
        row = {"site_id": sid, "program_id": pid, "rfs_date": iso(rfs), "kpi": kpi, "unit": unit, "direction": good,
               "outcome": o, "pre": None, "control_pre": None}
        for h in (30, 60, 90):
            if age < h:
                row[f"post_{h}"] = None
                row[f"control_post_{h}"] = None
                continue
            ramp_h = {30: 0.75, 60: 0.92, 90: 1.0}[h]
            if rel:
                treated = pre * (1 + good * mag * eff * ramp_h + drift)
                control = ctrl_pre * (1 + drift)
            else:
                treated = pre + good * mag * eff * ramp_h + drift + rng.normal(0, 0.05 * mag)
                control = ctrl_pre + drift + rng.normal(0, 0.05 * mag)
            if kpi == "availability":
                treated, control = min(treated, 99.99), min(control, 99.99)
            row[f"post_{h}"] = r2(treated, 3)
            row[f"control_post_{h}"] = r2(control, 3)
        row["pre"] = r2(pre, 3)
        row["control_pre"] = r2(ctrl_pre, 3)
        row["predicted_uplift"] = r2(good * mag * (1.0 if not rel else pre), 3)
        validation.append(row)

# Avoided outages (proactive interventions that would otherwise have become outages)
avoided = []
for k in range(26):
    cls = pick(["power", "transport", "ran_hardware", "environmental", "capacity"], [0.35, 0.2, 0.2, 0.1, 0.15])
    i = int(rng.integers(N))
    hours = float(rng.uniform(4, 60))
    rev_h = site_revenue[i] / (30 * 24)
    cost_outage = rev_h * hours * rng.uniform(1.4, 2.4) + rng.uniform(8e6, 40e6)  # revenue + emergency logistics + SLA
    avoided.append({"site_id": sites[i]["site_id"], "class": cls, "date": iso(TODAY - days(int(rng.integers(10, 170)))),
                    "predicted_outage_hours": r2(hours, 1), "outage_cost_idr": int(round(cost_outage, -5)),
                    "intervention_cost_idr": int(round({"power": 32e6, "transport": 45e6, "ran_hardware": 18e6,
                                                        "environmental": 12e6, "capacity": 0}[cls] * rng.uniform(0.8, 1.2), -5)),
                    "intervention": {"power": "Battery swap", "transport": "Transport reroute", "ran_hardware": "Unit swap from spares",
                                     "environmental": "Portable genset standby", "capacity": "Spectrum refarming"}[cls]})

# ----------------------------------------------------------------------------------------
# 14. Agents, runs, model scorecard
# ----------------------------------------------------------------------------------------
AGENTS = [
    ("Sense", "Site Health Agent", "OPS", "KPIs, alarms, availability", "Composite health score per site", "Partial", "daily 02:00", "D-1", "Network Operations"),
    ("Sense", "CNX Agent", "CX, OPS", "Network KPIs, tickets, location", "CNX per customer, per site, per segment", "Yes", "daily 03:00", "D-1", "CX Analytics"),
    ("Sense", "CX Agent", "CX", "Complaints, NPS, tickets", "Complaint clusters, churn-risk cohorts", "Yes (Huawei)", "daily 04:00", "D-1", "Customer Experience"),
    ("Sense", "Bad Session Agent", "OPS", "Session records, throughput", "Sites with rising bad-session share", "Partial", "daily 02:30", "D-1", "Network Operations"),
    ("Sense", "Backbone and Transport Agent", "OPS", "Link utilisation, faults", "Transport bottlenecks and single points of failure", "No", "hourly", "D-1", "Transport Engineering"),
    ("Sense", "CDN Peering Agent", "OPS", "Peering stats, cache ratios", "Peering degradation, egress cost anomalies", "No", "hourly", "D-1", "IP Core"),
    ("Predict", "Site Failure Prediction Agent", "OPS, PLAN", "Health history, alarms, weather, power, age", "8-week failure probability by class", "To build on Netra", "daily 05:00", "D-1", "Network Operations (DevX delivery)"),
    ("Predict", "Capacity Exhaustion Agent", "PLAN", "PRB load, traffic growth, events", "Weeks-to-saturation per cell", "Partial", "daily 05:00", "D-1", "Network Planning"),
    ("Predict", "Churn Exposure Agent", "CX", "CNX, tenure, ARPU, complaints", "Churn probability per catchment", "Partial", "daily 05:30", "D-1", "CX Analytics"),
    ("Predict", "Revenue Exposure Agent", "PLAN, EXEC", "Revenue per site, predicted impact", "IDR at risk per incident", "No", "on incident", "D-1", "Finance BI"),
    ("Decide", "Smart CapEx Agent", "PLAN", "Site ranking features", "CapEx versus non-CapEx classification, ranking", "Yes", "daily 06:00", "D-5", "Network Planning"),
    ("Decide", "Action Ladder Agent", "OPS, PLAN", "Incident class, site profile", "Ordered intervention options with cost and uplift", "No", "on incident", "D-1", "NICC Platform"),
    ("Decide", "Program Match Agent", "PLAN, DEPLOY", "Incident, active plans", "Covered / partial / not covered verdict", "No", "on incident", "live", "NICC Platform"),
    ("Decide", "Priority Scoring Agent", "All", "Exposure, probability, urgency", "Incident priority score", "No", "on incident", "live", "NICC Platform"),
    ("Decide", "Approval Routing Agent", "All", "Scope, threshold, org chart", "Named approver and ladder", "No", "on incident", "live", "NICC Platform"),
    ("Execute", "BOQ Agent", "DEPLOY", "Intervention, site class, vendor catalogue", "BOQ lines with unit cost", "No", "on approval", "live", "Deployment PMO"),
    ("Execute", "Procurement Agent", "PROC", "BOQ, contracts, price book", "PO draft, contract check", "No", "on approval", "live", "Procurement"),
    ("Execute", "Warehouse Readiness Agent", "PROC", "Stock by warehouse, lead times", "Readiness flag, pre-positioning suggestion", "No", "daily 06:30", "D-1", "Supply Chain"),
    ("Execute", "Vendor Allocation Agent", "DEPLOY", "Vendor capacity, SLA history, region", "Vendor assignment per site", "No", "on approval", "live", "Deployment PMO"),
    ("Execute", "Work Order Agent", "OPS, FIELD", "Approved action", "Work order with checklist and evidence spec", "No", "on approval", "live", "Field Operations"),
    ("Execute", "Dispatch Agent", "FIELD", "Work orders, engineer roster, geography", "Weekly priority list per engineer", "No", "daily 06:00", "live", "Field Operations"),
    ("Execute", "RFS Acceptance Agent", "DEPLOY", "Integration KPIs, evidence", "RFS pass/fail with defects", "No", "on state change", "live", "Deployment PMO"),
    ("Execute", "Customer Outreach Agent", "CX", "Affected cohorts, RFS date", "Proactive notification and retention trigger", "No", "on approval", "live", "Customer Experience"),
    ("Validate", "Post-RFS Validation Agent", "PLAN, EXEC", "Pre/post KPIs, control group", "30/60/90-day uplift per site", "No", "daily 07:00", "D-1", "Network Planning"),
    ("Validate", "ROI Attribution Agent", "EXEC", "CapEx, revenue, churn", "Program ROI, payback, CLV impact", "No", "weekly Mon", "D-1", "Finance BI"),
    ("Validate", "Model Drift Agent", "Admin", "Predictions vs outcomes", "Precision, recall, drift alerts", "No", "weekly Mon", "D-1", "Netra Model Ops"),
    ("Validate", "Override Learning Agent", "Admin", "Rejections, reason codes", "Labelled feedback to Netra", "No", "daily 23:00", "live", "Netra Model Ops"),
    ("Orchestrate", "Incident Orchestrator", "Platform", "All Sense and Predict outputs", "Incident creation, grouping, dedupe", "No", "after each batch", "live", "NICC Platform"),
    ("Orchestrate", "Program Orchestrator", "Platform", "Approved plans", "Stage transitions, SLA clocks, escalations", "No", "on state change", "live", "NICC Platform"),
    ("Orchestrate", "Narrative Agent", "All", "Any incident or program", "Plain-language summary per role", "No", "on demand", "live", "NICC Platform"),
    ("DevX proposed", "Energy and Power Agent", "OPS, PROC", "Grid vs generator hours, fuel logs, battery health, rectifier alarms", "Energy OpEx outliers, generator dependence, battery EOL", "Proposed", "daily 05:00", "D-1", "Network Operations"),
    ("DevX proposed", "Tower Company Coordination Agent", "DEPLOY", "Tower company lease terms, access SLAs, loading limits", "Access request drafts, loading feasibility, lease cost", "Proposed", "on approval", "live", "Deployment PMO"),
    ("DevX proposed", "Spectrum and Refarming Agent", "PLAN, OPS", "Band utilisation, device mix, traffic split", "Refarming and carrier-move options (zero-CapEx rungs)", "Proposed", "daily 05:30", "D-1", "Network Planning"),
    ("DevX proposed", "Site Access and Permit Agent", "DEPLOY, FIELD", "Permit status, landlord contacts, regulations", "Access lead time and permit risk per site", "Proposed", "daily 06:00", "D-1", "Deployment PMO"),
]
agents = []
agent_runs = []
run_n = [700000]
for n, (fam, name, fn, inp, out, exists, sched, fresh, owner) in enumerate(AGENTS, 1):
    aid = f"AG-{n:02d}"
    proposed = fam == "DevX proposed"
    hours_ago = float(rng.uniform(0.2, 6)) if fresh != "D-5" else float(rng.uniform(20, 30))
    produced = sum(1 for x in insights if x["agent"] == name)
    acc = rng.uniform(0.62, 0.9)
    ovr = rng.uniform(0.04, 0.18)
    agents.append({"agent_id": aid, "name": name, "family": fam, "function": fn, "inputs": inp, "outputs": out,
                   "exists_today": exists, "schedule": sched, "last_run": ts(NOW - dt.timedelta(hours=hours_ago)),
                   "freshness": fresh, "owner": owner, "status": "proposed" if proposed else ("live" if exists.startswith("Yes") else "prototype"),
                   "insights_14d": produced, "acceptance_rate": r2(acc), "override_rate": r2(ovr),
                   "as_of": iso(AS_OF_D5 if fresh == "D-5" else AS_OF)})
# ~2,000 runs over 14 days
per_agent_runs = 64
OVERRIDE_REASONS = ["Local knowledge: event already mitigated", "Cost exceeds exposure", "Tower company constraint",
                    "Covered by upcoming program", "Prediction confidence too low", "Vendor capacity unavailable"]
for a in agents:
    for k in range(per_agent_runs if a["status"] != "proposed" else 20):
        run_n[0] += 1
        when = NOW - dt.timedelta(hours=float(rng.uniform(0, 14 * 24)))
        outputs = int(rng.integers(1, 60))
        accepted = int(outputs * rng.uniform(0.5, 0.9))
        overridden = int((outputs - accepted) * rng.uniform(0.2, 0.6))
        agent_runs.append({"run_id": f"RUN-{run_n[0]}", "agent_id": a["agent_id"], "timestamp": ts(when),
                           "outputs": outputs, "accepted": accepted, "overridden": overridden,
                           "ignored": outputs - accepted - overridden,
                           "override_reason": pick(OVERRIDE_REASONS) if overridden else None,
                           "duration_s": int(rng.uniform(8, 900))})
agent_runs.sort(key=lambda r: r["timestamp"], reverse=True)

model_scorecard = [
    {"failure_class": "capacity", "wave": 1, "horizon": "8–12 weeks", "precision_top_decile": 0.78, "recall": 0.64, "false_positive_rate": 0.061, "override_rate": 0.09, "drift_psi": 0.06, "status": "Driving approvals", "backtest_months": 24},
    {"failure_class": "power", "wave": 1, "horizon": "4–6 weeks", "precision_top_decile": 0.74, "recall": 0.58, "false_positive_rate": 0.072, "override_rate": 0.12, "drift_psi": 0.08, "status": "Driving approvals", "backtest_months": 24},
    {"failure_class": "transport", "wave": 2, "horizon": "4–8 weeks", "precision_top_decile": 0.69, "recall": 0.55, "false_positive_rate": 0.084, "override_rate": 0.14, "drift_psi": 0.11, "status": "Advisory (below 70%)", "backtest_months": 24},
    {"failure_class": "ran_hardware", "wave": 2, "horizon": "6–8 weeks", "precision_top_decile": 0.66, "recall": 0.49, "false_positive_rate": 0.093, "override_rate": 0.17, "drift_psi": 0.09, "status": "Advisory (below 70%)", "backtest_months": 24},
    {"failure_class": "environmental", "wave": 3, "horizon": "2–4 weeks", "precision_top_decile": 0.52, "recall": 0.41, "false_positive_rate": 0.14, "override_rate": 0.22, "drift_psi": 0.19, "status": "Shadow mode (weather feed pending)", "backtest_months": 12},
]

# ----------------------------------------------------------------------------------------
# 15. Serialise
# ----------------------------------------------------------------------------------------
for i, s in enumerate(sites):
    s["as_of"] = iso(AS_OF)
    s["freshness"] = "D-1"
    s["program_id"] = site_program.get(i)


def b64_u8(arr, scale, offset):
    q = np.clip(np.round((arr - offset) / scale), 0, 255).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode()


kpi_daily = {
    "as_of": iso(AS_OF), "freshness": "D-1", "dates": [iso(d) for d in DATES],
    "site_ids": [s["site_id"] for s in sites], "layout": "row-major site x day, uint8, value = offset + q * scale",
    "metrics": {
        "availability": {"offset": 75.0, "scale": 0.1, "unit": "%", "data": b64_u8(avail, 0.1, 75.0)},
        "prb_util": {"offset": 0.0, "scale": 0.4, "unit": "%", "data": b64_u8(np.clip(prb, 0, 100), 0.4, 0.0)},
        "throughput_mbps": {"offset": 0.0, "scale": 0.5, "unit": "Mbps", "data": b64_u8(thr, 0.5, 0.0)},
        "bad_session_pct": {"offset": 0.0, "scale": 0.1, "unit": "%", "data": b64_u8(bad, 0.1, 0.0)},
        "alarms": {"offset": 0.0, "scale": 1.0, "unit": "count", "data": b64_u8(alarms, 1, 0)},
        "tickets": {"offset": 0.0, "scale": 1.0, "unit": "count", "data": b64_u8(tickets, 1, 0)},
        "cnx": {"offset": 0.0, "scale": 0.4, "unit": "score", "data": b64_u8(cnx, 0.4, 0.0)},
    },
}
forecast = {
    "as_of": iso(AS_OF), "freshness": "D-1", "weeks": [f"W+{k}" for k in range(1, 9)],
    "week_end_dates": [iso(week_date(k)) for k in range(1, 9)],
    "rows": [{"site_id": sites[i]["site_id"], "failure_class": fc_class[i],
              "failure_prob": [r2(x, 3) for x in fc_prob[i]],
              "top_factors": factors_for(i),
              "capacity_weeks_to_saturation": r2(wts[i], 1) if fc_class[i] != "capacity" or not fc_cross[i] else r2(fc_cross[i] - rng.uniform(0.2, 0.8), 1)}
             for i in range(N)],
}
for i in story_idx["bekasi_capacity"]:
    forecast["rows"][i]["capacity_weeks_to_saturation"] = r2(23 / 7 + rng.uniform(-0.3, 0.3), 1)
revenue = {"as_of": iso(AS_OF), "freshness": "D-1", "months": MONTHS, "site_ids": [s["site_id"] for s in sites],
           "revenue_idr": rev_monthly.astype(np.int64).tolist(),
           "postpaid_share": [r2(x, 3) for x in site_postpaid_share], "enterprise_accounts": site_enterprise.tolist()}

roles_out = []
for r in ROLES["roles"]:
    roles_out.append({k: v for k, v in r.items()})

meta = {
    "generated_by": "generate.py", "seed": SEED, "now": CFG["now"], "as_of": iso(AS_OF), "as_of_d5": iso(AS_OF_D5),
    "freshness": CFG["freshness"], "stages": STAGES, "failure_classes": CLASSES,
    "sample_note": "6,000 synthetic sites sampled from a ~60,000-site target estate",
    "warehouses": [{"warehouse_id": w[0], "name": w[1], "region": w[2], "lon": w[3], "lat": w[4]} for w in WAREHOUSES],
    "skus": [{"sku": s[0], "description": s[1], "category": s[2], "unit_cost_idr": s[3], "lead_days": s[4]} for s in SKUS],
    "boq_templates": BOQ_TEMPLATES, "per_site_cost_idr": PER_SITE_COST,
    "story_link_id": st_link["id"], "story_incidents": {
        "bekasi_capacity": inc_bekasi["incident_id"], "sulsel_transport": inc_sulsel["incident_id"],
        "surabaya_cnx": inc_sby["incident_id"], "cjava_power": inc_cj["incident_id"]},
    "surabaya_comparable_program": "PRG-2601",
    "legacy_stage_weeks": {"Incident": 1.5, "Decision": 3.5, "BOQ": 2.5, "PO and stock": 3.5, "Vendor allocation": 1.5,
                           "Build and integrate": 7.0, "RFS acceptance": 1.5},
    "target_stage_days": {"Incident": 0, "Decision": 2, "BOQ": 1, "PO and stock": 3, "Vendor allocation": 1,
                          "Build and integrate": 21, "RFS acceptance": 2},
    "counts": {},
}

OUT = {
    "sites": sites, "cells": cells, "site_kpi_daily": kpi_daily, "site_forecast": forecast,
    "customer_cohort": cohorts, "revenue_site_monthly": revenue, "backbone_link": links, "cdn_peer": cdn_peers,
    "insight": insights, "incident": incidents, "action_option": options, "approval": approvals,
    "program": programs, "boq_line": boq_lines, "purchase_order": purchase_orders, "warehouse_stock": warehouse_stock,
    "vendor": VENDORS, "work_order": work_orders, "engineer": engineers, "validation": validation,
    "avoided_outage": avoided, "agent": agents, "agent_run": agent_runs, "model_scorecard": model_scorecard,
    "user_role": {"roles": roles_out, "policy": POLICY, "intervention_classes": ROLES["intervention_classes"]},
}
for k, v in OUT.items():
    meta["counts"][k] = len(v) if isinstance(v, list) else (len(v.get("rows", v.get("site_ids", []))))
OUT["meta"] = meta

DATA.mkdir(exist_ok=True)
for name, obj in OUT.items():
    (DATA / f"{name}.json").write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))

# ----------------------------------------------------------------------------------------
# 16. Story check (PRD §4 Monday numbers, §10 generation rules)
# ----------------------------------------------------------------------------------------
red_by_class = Counter(fc_class[i] for i in range(N) if fc_cross[i])
cap_red = [i for i in range(N) if fc_cross[i] and fc_class[i] == "capacity"]
cap_cov_n = sum(1 for i in cap_red if site_program.get(i))
pipeline = [p for p in programs if p["stage"] in ("PO", "Vendor allocation", "Material dispatch", "Installation", "Integration")]
health = Counter(p["health"] for p in programs)
reg_open_n = sum(1 for x in incidents if x["region"] == REG and is_open(x))
sul_overdue = sum(1 for w in work_orders if w["status"] == "overdue" and sites[IDX[w["site_id"]]]["region"] == REG)
field_week = sum(1 for w in work_orders if w["engineer_id"] == FIELD_ROLE["engineer_id"] and w["status"] in ("open", "in_progress")
                 and TODAY <= dt.date.fromisoformat(w["due"]) <= week_end)
smg_low = sum(1 for w in warehouse_stock if w["warehouse_id"] == "WH-SMG" and w["on_hand"] - w["reserved"] < w["reorder_point"])
po_pending = sum(1 for p in purchase_orders if p["status"] == "pending_release")
gap = [p["program_id"] for p in programs if p["gap_flags"]]
exec_pending = [p["program_id"] for p in programs if p["pending_approval"] and p["pending_approval"]["role"] == "EXEC"]
ops_top = sorted([x for x in incidents if is_open(x)], key=lambda x: -x["exposure_idr"])[0]
val_out = Counter(r["outcome"] for r in validation if r["kpi"] == "cnx")
w4_red = [sites[i]["district_id"] for i in range(N) if fc_prob[i, 3] >= 0.6]

checks = [
    ("Sites", N, 6000),
    ("Provinces / districts", f"{len(PROVS)} / {len(DISTS)}", "38 / 514"),
    ("Capacity sites predicted to saturate inside 8 weeks", len(cap_red), 41),
    ("  of which covered by a program", cap_cov_n, 27),
    ("  of which not covered (Bekasi)", len(cap_red) - cap_cov_n, 14),
    ("Predicted failures (>=60%) inside 8 weeks, all classes", sum(red_by_class.values()), sum(PF.values())),
    ("Programs on track / at risk / late", f"{health['on_track']}/{health['at_risk']}/{health['late']}", "10/12/8"),
    ("Programs in deployment pipeline (PO..Integration)", len(pipeline), 12),
    ("  at risk on vendor SLA", sum(p["vendor_sla_risk"] for p in pipeline), 3),
    ("  waiting on tower company access", sum(1 for p in pipeline if p["tower_company_clock"] and p["tower_company_clock"]["status"] == "overdue"), 2),
    ("Programs with gap flag (RFS after predicted failure)", len(gap), 3),
    ("CapEx programs awaiting Head of Network approval", len(exec_pending), 2),
    ("OPS top incident by exposure", ops_top["incident_id"], inc_sulsel["incident_id"]),
    ("South Sulawesi trunk utilisation", L0["util_pct"], float(st_link["util_pct"])),
    ("Surabaya postpaid 5G churn-risk cohort", sum(c["churn_risk_subs"] for c in sby_post), 6200),
    ("Surabaya postpaid CNX delta (subs weighted)", r2(sum(c["cnx_delta_28d"] * c["subs"] for c in sby_post) / sum(c["subs"] for c in sby_post), 1), -4.0),
    (f"Open incidents in {REG}", reg_open_n, target_open),
    (f"Overdue work orders in {REG}", sul_overdue, CFG["monday"]["region_overdue_work_orders"]),
    ("Field engineer work orders this week (Bekasi)", field_week, CFG["monday"]["field_work_orders_this_week"]),
    ("SKUs below reorder point in Semarang", smg_low, CFG["monday"]["proc_skus_below_reorder"]),
    ("POs pending release", po_pending, CFG["monday"]["proc_pos_pending_release"]),
    ("Semarang free multi-band antennas", WS[("WH-SMG", "ANT-MB-4T4R")]["on_hand"] - WS[("WH-SMG", "ANT-MB-4T4R")]["reserved"], 9),
    ("Validation sites uplift / flat / worse", f"{val_out['uplift']}/{val_out['flat']}/{val_out['worse']}", "140/40/20"),
    ("Incidents / insights / options", f"{len(incidents)} / {len(insights)} / {len(options)}", "~120 / ~400 / 3-5 each"),
    ("Backbone links / CDN PoPs", f"{len(links)} / {len(cdn_peers)}", "~800 / 12"),
    ("BOQ lines / POs / work orders", f"{len(boq_lines)} / {len(purchase_orders)} / {len(work_orders)}", "~1500 / ~60 / ~300"),
    ("Agents / runs", f"{len(agents)} / {len(agent_runs)}", "30 (+4 proposed) / ~2000"),
]
print("\nNICC story check")
print("-" * 96)
ok_all = True
for label, got, want in checks:
    ok = str(got) == str(want) or (isinstance(want, str) and want.startswith("~")) or "~" in str(want)
    ok_all &= ok
    print(f"{'OK ' if ok else '!! '} {label:<62} {str(got):<18} (want {want})")
print("-" * 96)
print("W+4 red sites by district:", Counter(DISTS[d]["name"] for d in w4_red).most_common(8))
print("All checks passed" if ok_all else "SOME CHECKS FAILED")
sizes = {p.name: p.stat().st_size // 1024 for p in DATA.glob("*.json")}
print("sizes KB:", dict(sorted(sizes.items(), key=lambda kv: -kv[1])))
